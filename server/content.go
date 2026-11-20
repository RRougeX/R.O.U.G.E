package main

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// Content downloads books (Kiwix ZIM files), maps (Protomaps extracts) and
// place names from inside the app, so nothing needs a terminal.

type CatalogItem struct {
	ID     string  `json:"id"`
	Group  string  `json:"group"`
	Name   string  `json:"name"`
	Desc   string  `json:"desc"`
	GB     float64 `json:"gb"` // rough size, for planning; the real size is checked before download
	Folder string  `json:"-"`
	Prefix string  `json:"prefix"`
}

var kiwixBase = "https://download.kiwix.org/zim/"

var catalog = []CatalogItem{
	{"wp-maxi", "Wikipedia", "Wikipedia, full with pictures", "Every article with images. The best, and the biggest.", 110, "wikipedia", "wikipedia_en_all_maxi"},
	{"wp-nopic", "Wikipedia", "Wikipedia, full without pictures", "Every article, text only. Recommended if you have room.", 55, "wikipedia", "wikipedia_en_all_nopic"},
	{"wp-mini", "Wikipedia", "Wikipedia, intro of every article", "The opening section of every article. Great for small cards.", 12, "wikipedia", "wikipedia_en_all_mini"},
	{"wp-top", "Wikipedia", "Wikipedia, top 50,000 articles", "The most-read articles, with pictures.", 7, "wikipedia", "wikipedia_en_top_maxi"},
	{"wp-test", "Wikipedia", "Wikipedia, tiny test (100 articles)", "A few hundred MB, to check everything works.", 0.35, "wikipedia", "wikipedia_en_100"},
	{"wikimed", "Books", "WikiMed", "Medical encyclopedia: conditions, drugs, anatomy, first aid.", 2, "other", "mdwiki_en_all_maxi"},
	{"post-disaster", "Books", "Post-disaster library", "Survival and recovery manuals.", 0.6, "other", "zimgit-post-disaster_en"},
	{"water", "Books", "Water manuals", "Finding, purifying and storing water.", 0.05, "other", "zimgit-water_en"},
	{"medicine", "Books", "Medicine manuals", "Field medicine and first-aid manuals.", 0.1, "other", "zimgit-medicine_en"},
	{"food", "Books", "Food manuals", "Preparing and preserving food.", 0.1, "other", "zimgit-food-preparation_en"},
	{"appropedia", "Books", "Appropedia", "Off-grid living: water, energy, building, farming.", 1, "other", "appropedia_en_all_maxi"},
	{"ifixit", "Books", "iFixit", "Repair guides for electronics, cars and appliances.", 3, "ifixit", "ifixit_en_all"},
	{"wikivoyage", "Books", "Wikivoyage", "Travel guide: regions, towns, routes.", 1, "wikivoyage", "wikivoyage_en_all_maxi"},
	{"wiktionary", "Books", "Wiktionary", "English dictionary.", 8, "wiktionary", "wiktionary_en_all_nopic"},
	{"wikibooks", "Books", "Wikibooks", "Open textbooks.", 3, "wikibooks", "wikibooks_en_all_nopic"},
	{"gutenberg", "Books", "Project Gutenberg", "60,000+ classic books. Very large.", 70, "gutenberg", "gutenberg_en_all"},
}

func catalogByID(id string) (CatalogItem, bool) {
	for _, c := range catalog {
		if c.ID == id {
			return c, true
		}
	}
	return CatalogItem{}, false
}

type Job struct {
	ID      string    `json:"id"`
	Title   string    `json:"title"`
	State   string    `json:"state"` // queued, running, done, failed, cancelled
	Done    int64     `json:"done"`
	Total   int64     `json:"total"` // 0 = unknown
	Error   string    `json:"error,omitempty"`
	Started time.Time `json:"started"`
	run     func(ctx context.Context, j *Job) error
	cancel  context.CancelFunc
}

type Content struct {
	app    *App
	mu     sync.Mutex
	jobs   []*Job
	wake   chan struct{}
	client *http.Client

	onlineAt time.Time
	online   bool
}

func NewContent(a *App) *Content {
	c := &Content{app: a, wake: make(chan struct{}, 1),
		client: &http.Client{Timeout: 0, Transport: &http.Transport{Proxy: http.ProxyFromEnvironment, ResponseHeaderTimeout: 30 * time.Second}}}
	go c.worker()
	return c
}

func freeSpace(dir string) int64 {
	var fs syscall.Statfs_t
	if syscall.Statfs(dir, &fs) != nil {
		return -1
	}
	return int64(fs.Bavail) * int64(fs.Bsize)
}

func (c *Content) isOnline() bool {
	c.mu.Lock()
	if time.Since(c.onlineAt) < 20*time.Second {
		v := c.online
		c.mu.Unlock()
		return v
	}
	c.mu.Unlock()
	cl := &http.Client{Timeout: 6 * time.Second}
	ok := false
	for _, u := range []string{"https://download.kiwix.org/", "https://github.com/"} {
		if resp, err := cl.Head(u); err == nil {
			resp.Body.Close()
			ok = true
			break
		}
	}
	c.mu.Lock()
	c.online, c.onlineAt = ok, time.Now()
	c.mu.Unlock()
	return ok
}

// ---------- resolving the newest Kiwix file ----------

func (c *Content) latestZim(it CatalogItem) (name, url string, size int64, err error) {
	base := kiwixBase + it.Folder + "/"
	resp, err := c.client.Get(base)
	if err != nil {
		return "", "", 0, fmt.Errorf("can't reach the Kiwix server: %v", err)
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 20<<20))
	resp.Body.Close()
	re := regexp.MustCompile(regexp.QuoteMeta(it.Prefix) + `_(\d{4}-\d{2})\.zim`)
	best := ""
	for _, m := range re.FindAllStringSubmatch(string(body), -1) {
		if m[1] > best {
			best = m[1]
		}
	}
	if best == "" {
		return "", "", 0, fmt.Errorf("%s isn't on the Kiwix server right now", it.Name)
	}
	name = it.Prefix + "_" + best + ".zim"
	url = base + name
	if h, err := c.client.Head(url); err == nil {
		size = h.ContentLength
		h.Body.Close()
	}
	return name, url, size, nil
}

// ---------- jobs ----------

func (c *Content) add(title string, run func(ctx context.Context, j *Job) error) *Job {
	j := &Job{ID: newID(), Title: title, State: "queued", Started: time.Now(), run: run}
	c.mu.Lock()
	c.jobs = append(c.jobs, j)
	// forget old finished jobs
	if len(c.jobs) > 30 {
		c.jobs = c.jobs[len(c.jobs)-30:]
	}
	c.mu.Unlock()
	select {
	case c.wake <- struct{}{}:
	default:
	}
	return j
}

// worker runs one download at a time, so they don't fight over a slow connection.
func (c *Content) worker() {
	for {
		var next *Job
		c.mu.Lock()
		for _, j := range c.jobs {
			if j.State == "queued" {
				next = j
				break
			}
		}
		if next != nil {
			next.State = "running"
			ctx, cancel := context.WithCancel(context.Background())
			next.cancel = cancel
			c.mu.Unlock()
			err := next.run(ctx, next)
			cancel()
			c.mu.Lock()
			switch {
			case errors.Is(err, context.Canceled):
				next.State = "cancelled"
			case err != nil:
				next.State, next.Error = "failed", err.Error()
			default:
				next.State = "done"
			}
			c.mu.Unlock()
			continue
		}
		c.mu.Unlock()
		<-c.wake
	}
}

func (c *Content) progress(j *Job, done, total int64) {
	c.mu.Lock()
	j.Done, j.Total = done, total
	c.mu.Unlock()
}

type countingWriter struct {
	w    io.Writer
	n    int64
	tick func(int64)
	last time.Time
}

func (cw *countingWriter) Write(p []byte) (int, error) {
	n, err := cw.w.Write(p)
	cw.n += int64(n)
	if time.Since(cw.last) > 500*time.Millisecond {
		cw.last = time.Now()
		cw.tick(cw.n)
	}
	return n, err
}

// fetch downloads url to dest, resuming a previous .part file.
func (c *Content) fetch(ctx context.Context, j *Job, url, dest string, total int64) error {
	part := dest + ".part"
	var have int64
	if st, err := os.Stat(part); err == nil {
		have = st.Size()
	}
	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	if have > 0 {
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-", have))
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("download failed: %v", err)
	}
	defer resp.Body.Close()
	flags := os.O_CREATE | os.O_WRONLY
	switch resp.StatusCode {
	case http.StatusPartialContent:
		flags |= os.O_APPEND
	case http.StatusOK:
		have = 0
		flags |= os.O_TRUNC
		if total <= 0 {
			total = resp.ContentLength
		}
	case http.StatusRequestedRangeNotSatisfiable:
		return os.Rename(part, dest) // already complete
	default:
		return fmt.Errorf("download failed: server said %s", resp.Status)
	}
	f, err := os.OpenFile(part, flags, 0o644)
	if err != nil {
		return err
	}
	cw := &countingWriter{w: f, n: have, tick: func(n int64) { c.progress(j, n, total) }}
	_, err = io.Copy(cw, resp.Body)
	f.Close()
	c.progress(j, cw.n, total)
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return fmt.Errorf("download stopped (%v). Press download again to continue where it left off", err)
	}
	return os.Rename(part, dest)
}

func (c *Content) needSpace(size int64) error {
	free := freeSpace(c.app.dataDir)
	if size > 0 && free >= 0 && size > free-500<<20 {
		return fmt.Errorf("not enough space: needs %s, only %s free", human(size), human(free))
	}
	return nil
}

func human(n int64) string {
	f := float64(n)
	for _, u := range []string{"B", "KB", "MB", "GB", "TB"} {
		if f < 1000 || u == "TB" {
			if u == "GB" || u == "TB" {
				return fmt.Sprintf("%.1f %s", f, u)
			}
			return fmt.Sprintf("%.0f %s", f, u)
		}
		f /= 1000
	}
	return ""
}

func (c *Content) queueZim(it CatalogItem) (*Job, error) {
	name, url, size, err := c.latestZim(it)
	if err != nil {
		return nil, err
	}
	dest := filepath.Join(c.app.dataDir, "zim", name)
	if fileExists(dest) {
		return nil, fmt.Errorf("you already have the newest %s", it.Name)
	}
	if err := c.needSpace(size); err != nil {
		return nil, err
	}
	return c.add(it.Name, func(ctx context.Context, j *Job) error {
		c.progress(j, 0, size)
		if err := c.fetch(ctx, j, url, dest, size); err != nil {
			return err
		}
		// remove older versions of the same book
		old, _ := filepath.Glob(filepath.Join(c.app.dataDir, "zim", it.Prefix+"_*.zim"))
		for _, o := range old {
			if o != dest && regexp.MustCompile(regexp.QuoteMeta(it.Prefix)+`_\d{4}-\d{2}\.zim$`).MatchString(filepath.Base(o)) {
				_ = os.Remove(o)
			}
		}
		go c.app.kiwix.Restart()
		return nil
	}), nil
}

func (c *Content) queuePlaces() *Job {
	return c.add("Place names (GeoNames)", func(ctx context.Context, j *Job) error {
		dir := filepath.Join(c.app.dataDir, "places")
		zipPath := filepath.Join(dir, "cities500.zip")
		if err := c.fetch(ctx, j, "https://download.geonames.org/export/dump/cities500.zip", zipPath, 0); err != nil {
			return err
		}
		zr, err := zip.OpenReader(zipPath)
		if err != nil {
			return err
		}
		for _, f := range zr.File {
			if f.Name != "cities500.txt" {
				continue
			}
			rc, err := f.Open()
			if err != nil {
				zr.Close()
				return err
			}
			out, err := os.Create(filepath.Join(dir, "cities500.txt.tmp"))
			if err == nil {
				_, err = io.Copy(out, rc)
				out.Close()
			}
			rc.Close()
			if err != nil {
				zr.Close()
				return err
			}
			_ = os.Rename(filepath.Join(dir, "cities500.txt.tmp"), filepath.Join(dir, "cities500.txt"))
		}
		zr.Close()
		_ = os.Remove(zipPath)
		for _, f := range []string{"admin1CodesASCII.txt", "countryInfo.txt"} {
			if err := c.fetch(ctx, j, "https://download.geonames.org/export/dump/"+f, filepath.Join(dir, f), 0); err != nil {
				return err
			}
		}
		go c.app.places.Load()
		return nil
	})
}

// ---------- maps ----------

func (c *Content) pmtilesBin(ctx context.Context) (string, error) {
	if p, err := exec.LookPath("pmtiles"); err == nil {
		return p, nil
	}
	local := filepath.Join(c.app.dataDir, "bin", "pmtiles")
	if fileExists(local) {
		return local, nil
	}
	pat := map[string]string{"arm64": `(?i)linux.*(arm64|aarch64)`, "arm": `(?i)linux.*(armv6|armv7|_arm[._])`, "amd64": `(?i)linux.*(x86_64|amd64)`}[runtime.GOARCH]
	req, _ := http.NewRequestWithContext(ctx, "GET", "https://api.github.com/repos/protomaps/go-pmtiles/releases/latest", nil)
	resp, err := c.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("can't reach GitHub to get the map tool: %v", err)
	}
	var rel struct {
		Assets []struct {
			Name string `json:"name"`
			URL  string `json:"browser_download_url"`
		} `json:"assets"`
	}
	err = json.NewDecoder(resp.Body).Decode(&rel)
	resp.Body.Close()
	if err != nil {
		return "", err
	}
	var url string
	for _, a := range rel.Assets {
		if regexp.MustCompile(pat).MatchString(a.Name) && (strings.HasSuffix(a.Name, ".tar.gz") || strings.HasSuffix(a.Name, ".zip")) {
			url = a.URL
			break
		}
	}
	if url == "" {
		return "", fmt.Errorf("no map tool download for this processor")
	}
	req, _ = http.NewRequestWithContext(ctx, "GET", url, nil)
	resp, err = c.client.Do(req)
	if err != nil {
		return "", err
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 100<<20))
	resp.Body.Close()
	if err != nil {
		return "", err
	}
	var bin []byte
	if strings.HasSuffix(url, ".zip") {
		zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
		if err != nil {
			return "", err
		}
		for _, f := range zr.File {
			if filepath.Base(f.Name) == "pmtiles" {
				rc, _ := f.Open()
				bin, _ = io.ReadAll(rc)
				rc.Close()
			}
		}
	} else {
		gz, err := gzip.NewReader(bytes.NewReader(data))
		if err != nil {
			return "", err
		}
		tr := tar.NewReader(gz)
		for {
			h, err := tr.Next()
			if err != nil {
				break
			}
			if filepath.Base(h.Name) == "pmtiles" {
				bin, _ = io.ReadAll(tr)
			}
		}
	}
	if len(bin) == 0 {
		return "", fmt.Errorf("map tool not found in the download")
	}
	if err := os.WriteFile(local, bin, 0o755); err != nil {
		return "", err
	}
	return local, nil
}

func (c *Content) latestBuild(ctx context.Context) (string, error) {
	cl := &http.Client{Timeout: 15 * time.Second}
	for i := 0; i < 21; i++ {
		u := "https://build.protomaps.com/" + time.Now().UTC().AddDate(0, 0, -i).Format("20060102") + ".pmtiles"
		req, _ := http.NewRequestWithContext(ctx, "HEAD", u, nil)
		if resp, err := cl.Do(req); err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				return u, nil
			}
		}
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
	}
	return "", fmt.Errorf("couldn't find a recent world map build at build.protomaps.com")
}

var sizeRe = regexp.MustCompile(`(?i)([\d.]+)\s*(KB|MB|GB|kB|B)\b`)

func parseSize(s string) int64 {
	m := sizeRe.FindAllStringSubmatch(s, -1)
	if len(m) == 0 {
		return 0
	}
	last := m[len(m)-1]
	f, _ := strconv.ParseFloat(last[1], 64)
	mult := map[string]float64{"b": 1, "kb": 1e3, "mb": 1e6, "gb": 1e9}[strings.ToLower(last[2])]
	return int64(f * mult)
}

func safeName(s string) string {
	s = regexp.MustCompile(`[^A-Za-z0-9._-]+`).ReplaceAllString(strings.TrimSpace(s), "-")
	s = strings.Trim(s, "-.")
	if s == "" {
		s = "map"
	}
	if len(s) > 60 {
		s = s[:60]
	}
	return s
}

func (c *Content) queueMap(name string, bbox [4]float64, maxzoom int) (*Job, error) {
	if maxzoom < 4 || maxzoom > 15 {
		return nil, fmt.Errorf("detail must be zoom 4 to 15")
	}
	if bbox[0] >= bbox[2] || bbox[1] >= bbox[3] || bbox[0] < -180 || bbox[2] > 180 || bbox[1] < -85.1 || bbox[3] > 85.1 {
		return nil, fmt.Errorf("that area doesn't look right")
	}
	file := safeName(name) + ".pmtiles"
	dest := filepath.Join(c.app.dataDir, "maps", file)
	box := fmt.Sprintf("%.4f,%.4f,%.4f,%.4f", bbox[0], bbox[1], bbox[2], bbox[3])
	return c.add("Map: "+name, func(ctx context.Context, j *Job) error {
		bin, err := c.pmtilesBin(ctx)
		if err != nil {
			return err
		}
		src, err := c.latestBuild(ctx)
		if err != nil {
			return err
		}
		// estimate the size first
		est, _ := exec.CommandContext(ctx, bin, "extract", src, dest+".part", "--bbox="+box, fmt.Sprintf("--maxzoom=%d", maxzoom), "--dry-run").CombinedOutput()
		total := parseSize(string(est))
		if err := c.needSpace(total); err != nil {
			return err
		}
		c.progress(j, 0, total)
		_ = os.Remove(dest + ".part")
		cmd := exec.CommandContext(ctx, bin, "extract", src, dest+".part", "--bbox="+box, fmt.Sprintf("--maxzoom=%d", maxzoom), "--download-threads=4")
		out := &tailBuf{}
		cmd.Stdout, cmd.Stderr = out, out
		if err := cmd.Start(); err != nil {
			return err
		}
		done := make(chan error, 1)
		go func() { done <- cmd.Wait() }()
		for {
			select {
			case err := <-done:
				if ctx.Err() != nil {
					_ = os.Remove(dest + ".part")
					return ctx.Err()
				}
				if err != nil {
					return fmt.Errorf("map download failed: %s", lastLine(out.String(), err))
				}
				st, err := os.Stat(dest + ".part")
				if err != nil {
					return fmt.Errorf("map download produced no file")
				}
				c.progress(j, st.Size(), st.Size())
				if err := os.Rename(dest+".part", dest); err != nil {
					return err
				}
				go c.app.places.Load()
				return nil
			case <-time.After(time.Second):
				if st, err := os.Stat(dest + ".part"); err == nil {
					c.progress(j, st.Size(), int64(math.Max(float64(total), float64(st.Size()))))
				}
			}
		}
	}), nil
}

// ---------- HTTP ----------

type fileInfo struct {
	Path string `json:"path"`
	Name string `json:"name"`
	Size int64  `json:"size"`
}

func listFiles(dir, folder, pattern string) []fileInfo {
	m, _ := filepath.Glob(filepath.Join(dir, folder, pattern))
	sort.Strings(m)
	out := []fileInfo{}
	for _, f := range m {
		if st, err := os.Stat(f); err == nil {
			out = append(out, fileInfo{Path: folder + "/" + filepath.Base(f), Name: filepath.Base(f), Size: st.Size()})
		}
	}
	return out
}

func (a *App) handleContent(w http.ResponseWriter, r *http.Request) {
	c := a.content
	type item struct {
		CatalogItem
		Installed string `json:"installed"`
	}
	items := []item{}
	for _, it := range catalog {
		inst := ""
		if m, _ := filepath.Glob(filepath.Join(a.dataDir, "zim", it.Prefix+"_*.zim")); len(m) > 0 {
			for _, f := range m {
				if regexp.MustCompile(regexp.QuoteMeta(it.Prefix) + `_\d{4}-\d{2}\.zim$`).MatchString(filepath.Base(f)) {
					inst = filepath.Base(f)
				}
			}
		}
		items = append(items, item{it, inst})
	}
	c.mu.Lock()
	jobs := make([]Job, 0, len(c.jobs))
	for i := len(c.jobs) - 1; i >= 0; i-- {
		j := *c.jobs[i]
		j.run, j.cancel = nil, nil
		jobs = append(jobs, j)
	}
	c.mu.Unlock()
	states := []map[string]string{}
	for _, s := range usStates {
		states = append(states, map[string]string{"code": s[0], "name": s[1], "bbox": s[2]})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"engineMissing": a.engineMissing(),
		"online":        c.isOnline(), "free": freeSpace(a.dataDir), "items": items, "jobs": jobs, "states": states,
		"zims":   listFiles(a.dataDir, "zim", "*.zim"),
		"maps":   listFiles(a.dataDir, "maps", "*.pmtiles"),
		"places": fileExists(filepath.Join(a.dataDir, "places", "cities500.txt")),
	})
}

func (a *App) handleContentDownload(w http.ResponseWriter, r *http.Request) {
	var in struct {
		IDs []string `json:"ids"`
		Map *struct {
			Name    string     `json:"name"`
			BBox    [4]float64 `json:"bbox"`
			MaxZoom int        `json:"maxzoom"`
		} `json:"map"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if !a.content.isOnline() {
		writeErr(w, http.StatusServiceUnavailable, "No internet connection. Connect to Wi-Fi or Ethernet, then try again.")
		return
	}
	var msgs []string
	queued := 0
	for _, id := range in.IDs {
		if id == "engine" {
			a.content.queueEngine()
			queued++
			continue
		}
		if id == "places" {
			a.content.queuePlaces()
			queued++
			continue
		}
		it, ok := catalogByID(id)
		if !ok {
			continue
		}
		if _, err := a.content.queueZim(it); err != nil {
			msgs = append(msgs, err.Error())
		} else {
			queued++
		}
	}
	if in.Map != nil {
		if _, err := a.content.queueMap(in.Map.Name, in.Map.BBox, in.Map.MaxZoom); err != nil {
			msgs = append(msgs, err.Error())
		} else {
			queued++
		}
	}
	if queued == 0 && len(msgs) > 0 {
		writeErr(w, http.StatusBadRequest, strings.Join(msgs, " · "))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"queued": queued, "notes": msgs})
}

func (a *App) handleContentCancel(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ID string `json:"id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&in)
	c := a.content
	c.mu.Lock()
	for _, j := range c.jobs {
		if j.ID == in.ID {
			if j.State == "queued" {
				j.State = "cancelled"
			} else if j.State == "running" && j.cancel != nil {
				j.cancel()
			}
		}
	}
	c.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

var deletableRe = regexp.MustCompile(`^(zim/[^/]+\.zim|maps/[^/]+\.pmtiles)$`)

func (a *App) handleContentDelete(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Query().Get("path")
	if !deletableRe.MatchString(p) || strings.Contains(p, "..") {
		writeErr(w, http.StatusBadRequest, "can't delete that")
		return
	}
	full := filepath.Join(a.dataDir, filepath.FromSlash(p))
	if err := os.Remove(full); err != nil {
		writeErr(w, http.StatusNotFound, "file not found")
		return
	}
	if strings.HasPrefix(p, "zim/") {
		go a.kiwix.Restart()
	} else {
		go a.places.Load()
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
