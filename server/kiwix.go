package main

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// Kiwix runs kiwix-serve (from the kiwix-tools package) on a local port with
// every .zim file in the zim folder, and proxies /kiwix/... to it.
type Kiwix struct {
	bin, dir string
	port     int

	mu      sync.Mutex
	cmd     *exec.Cmd
	done    chan struct{} // closed when cmd exits
	running bool
	lastErr string
	files   []string

	proxy  *httputil.ReverseProxy
	client *http.Client
}

func NewKiwix(bin string, port int, dir string) *Kiwix {
	target, _ := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", port))
	k := &Kiwix{bin: bin, dir: dir, port: port, client: &http.Client{Timeout: 8 * time.Second}}
	k.proxy = httputil.NewSingleHostReverseProxy(target)
	k.proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusBadGateway)
		fmt.Fprint(w, `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:2rem;color:#555">
<h3>The library isn't running</h3><p>No ZIM files were found, or kiwix-serve isn't installed.
Add .zim files to the <code>zim</code> folder and press <b>Rescan</b> on the Library page.</p>`)
	}
	return k
}

func (k *Kiwix) ServeHTTP(w http.ResponseWriter, r *http.Request) { k.proxy.ServeHTTP(w, r) }

func (k *Kiwix) zimFiles() []string {
	m, _ := filepath.Glob(filepath.Join(k.dir, "*.zim"))
	sort.Strings(m)
	return m
}

func (k *Kiwix) Stop() {
	k.mu.Lock()
	defer k.mu.Unlock()
	k.stopLocked()
}

func (k *Kiwix) stopLocked() {
	if k.cmd != nil && k.cmd.Process != nil {
		_ = k.cmd.Process.Signal(os.Interrupt)
		select {
		case <-k.done:
		case <-time.After(3 * time.Second):
			_ = k.cmd.Process.Kill()
			<-k.done
		}
	}
	k.cmd, k.running = nil, false
}

// Restart (re)starts kiwix-serve with the current set of ZIM files.
func (k *Kiwix) Restart() error {
	k.mu.Lock()
	defer k.mu.Unlock()
	k.stopLocked()
	k.files = k.zimFiles()
	if len(k.files) == 0 {
		k.lastErr = "no .zim files in " + k.dir
		return nil
	}
	if _, err := exec.LookPath(k.bin); err != nil {
		k.lastErr = "kiwix-serve not found (sudo apt install kiwix-tools)"
		return fmt.Errorf("%s", k.lastErr)
	}
	if !portFree(k.port) {
		if p, err := freePort(); err == nil {
			log.Printf("kiwix: port %d is busy, using %d", k.port, p)
			k.port = p
			target, _ := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", p))
			k.proxy.Director = httputil.NewSingleHostReverseProxy(target).Director
		}
	}
	args := []string{"--address=127.0.0.1", fmt.Sprintf("--port=%d", k.port), "--urlRootLocation=/kiwix"}
	args = append(args, k.files...)
	cmd := exec.Command(k.bin, args...)
	out := &tailBuf{}
	cmd.Stdout = io.MultiWriter(prefixWriter("kiwix: "), out)
	cmd.Stderr = io.MultiWriter(prefixWriter("kiwix: "), out)
	if err := cmd.Start(); err != nil {
		k.lastErr = err.Error()
		return err
	}
	done := make(chan struct{})
	var exitErr error
	k.cmd, k.done, k.lastErr = cmd, done, ""
	go func() {
		exitErr = cmd.Wait()
		close(done) // first, so stopLocked (which holds the lock) can finish
		k.mu.Lock()
		if k.cmd == cmd {
			k.running = false
			k.lastErr = "kiwix-serve stopped: " + lastLine(out.String(), exitErr)
		}
		k.mu.Unlock()
	}()

	// wait until it accepts connections (opening big libraries can take a while)
	addr := fmt.Sprintf("127.0.0.1:%d", k.port)
	deadline := time.Now().Add(90 * time.Second)
	for time.Now().Before(deadline) {
		if c, err := net.DialTimeout("tcp", addr, 200*time.Millisecond); err == nil {
			c.Close()
			k.running = true
			log.Printf("kiwix: serving %d file(s)", len(k.files))
			return nil
		}
		k.mu.Unlock()
		select {
		case <-done:
			k.mu.Lock()
			k.lastErr = "kiwix-serve stopped: " + lastLine(out.String(), exitErr)
			return fmt.Errorf("%s", k.lastErr)
		case <-time.After(150 * time.Millisecond):
		}
		k.mu.Lock()
	}
	k.lastErr = "kiwix-serve did not start within 90 seconds: " + lastLine(out.String(), nil)
	return fmt.Errorf("%s", k.lastErr)
}

// lastLine picks the most useful line of kiwix-serve's output for the Library page.
func lastLine(out string, err error) string {
	lines := strings.Split(strings.TrimSpace(out), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if l := strings.TrimSpace(lines[i]); l != "" {
			if len(l) > 200 {
				l = l[:200]
			}
			return l
		}
	}
	if err != nil {
		return err.Error()
	}
	return "no output"
}

func (k *Kiwix) State() (bool, string, int) {
	k.mu.Lock()
	defer k.mu.Unlock()
	return k.running, k.lastErr, len(k.files)
}

// ---------- library (OPDS catalog) ----------

type Book struct {
	Name     string `json:"name"`
	Title    string `json:"title"`
	Summary  string `json:"summary"`
	Language string `json:"language"`
	Articles int64  `json:"articles"`
	Size     int64  `json:"size"`
	File     string `json:"file"`
	URL      string `json:"url"`
	Icon     string `json:"icon,omitempty"`
}

type opdsFeed struct {
	Entries []struct {
		Title    string `xml:"title"`
		Name     string `xml:"name"`
		Summary  string `xml:"summary"`
		Language string `xml:"language"`
		Articles int64  `xml:"articleCount"`
		Links    []struct {
			Rel  string `xml:"rel,attr"`
			Type string `xml:"type,attr"`
			Href string `xml:"href,attr"`
		} `xml:"link"`
	} `xml:"entry"`
}

func (k *Kiwix) Books() []Book {
	files := k.zimFiles()
	books := make([]Book, 0, len(files))
	byName := map[string]int{}
	for _, f := range files {
		stem := strings.TrimSuffix(filepath.Base(f), ".zim")
		var size int64
		if st, err := os.Stat(f); err == nil {
			size = st.Size()
		}
		byName[stem] = len(books)
		books = append(books, Book{Name: stem, Title: prettyName(stem), File: filepath.Base(f), Size: size,
			URL: "/kiwix/content/" + url.PathEscape(stem) + "/"})
	}
	running, _, _ := k.State()
	if !running {
		return books
	}
	resp, err := k.client.Get(fmt.Sprintf("http://127.0.0.1:%d/kiwix/catalog/v2/entries?count=1000", k.port))
	if err != nil {
		return books
	}
	defer resp.Body.Close()
	var feed opdsFeed
	if err := xml.NewDecoder(resp.Body).Decode(&feed); err != nil {
		return books
	}
	for _, e := range feed.Entries {
		b := Book{Name: e.Name, Title: e.Title, Summary: e.Summary, Language: e.Language, Articles: e.Articles}
		for _, l := range e.Links {
			switch {
			case strings.HasPrefix(l.Type, "text/html") && strings.Contains(l.Href, "/content/"):
				b.URL = l.Href
			case strings.Contains(l.Rel, "image") || strings.Contains(l.Href, "illustration"):
				if b.Icon == "" {
					b.Icon = l.Href
				}
			}
		}
		// match the entry to a file by name, or by the content link
		idx, ok := byName[e.Name]
		if !ok && b.URL != "" {
			seg := strings.Trim(strings.TrimPrefix(b.URL, "/kiwix/content/"), "/")
			idx, ok = byName[seg]
			if ok && b.Name == "" {
				b.Name = seg
			}
		}
		if !ok {
			continue
		}
		cur := &books[idx]
		if b.Title != "" {
			cur.Title = b.Title
		}
		cur.Summary, cur.Language, cur.Articles, cur.Icon = b.Summary, b.Language, b.Articles, b.Icon
		if b.URL != "" {
			cur.URL = strings.TrimRight(b.URL, "/") + "/"
			cur.Name = strings.Trim(strings.TrimPrefix(b.URL, "/kiwix/content/"), "/")
		}
	}
	return books
}

var dateRe = regexp.MustCompile(`_(\d{4})-(\d{2})$`)

// prettyName turns "wikipedia_en_all_nopic_2024-06" into "Wikipedia (en, all, nopic) · 2024-06".
func prettyName(stem string) string {
	date := ""
	if m := dateRe.FindStringSubmatch(stem); m != nil {
		date = m[1] + "-" + m[2]
		stem = strings.TrimSuffix(stem, m[0])
	}
	parts := strings.Split(stem, "_")
	if len(parts) == 0 {
		return stem
	}
	t := strings.ToUpper(parts[0][:1]) + parts[0][1:]
	if len(parts) > 1 {
		t += " (" + strings.Join(parts[1:], ", ") + ")"
	}
	if date != "" {
		t += " · " + date
	}
	return t
}

// ---------- handlers ----------

func (a *App) handleLibrary(w http.ResponseWriter, r *http.Request) {
	running, lastErr, _ := a.kiwix.State()
	writeJSON(w, http.StatusOK, map[string]any{"running": running, "error": lastErr, "books": a.kiwix.Books()})
}

type Suggestion struct {
	Title string `json:"title"`
	URL   string `json:"url"`
	Book  string `json:"book"`
}

var tagRe = regexp.MustCompile(`<[^>]+>`)

// handleSuggest asks kiwix-serve for title suggestions in one book or all books.
func (a *App) handleSuggest(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		writeJSON(w, http.StatusOK, []Suggestion{})
		return
	}
	books := a.kiwix.Books()
	if only := r.URL.Query().Get("book"); only != "" {
		var keep []Book
		for _, b := range books {
			if b.Name == only {
				keep = append(keep, b)
			}
		}
		books = keep
	}
	per := 8
	if len(books) > 1 {
		per = 5
	}
	results := make([][]Suggestion, len(books))
	var wg sync.WaitGroup
	for i, b := range books {
		wg.Add(1)
		go func(i int, b Book) {
			defer wg.Done()
			u := fmt.Sprintf("http://127.0.0.1:%d/kiwix/suggest?content=%s&term=%s&count=%d",
				a.kiwix.port, url.QueryEscape(b.Name), url.QueryEscape(q), per)
			resp, err := a.kiwix.client.Get(u)
			if err != nil {
				return
			}
			defer resp.Body.Close()
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
			var items []struct {
				Value, Label, Kind, Path string
			}
			if json.Unmarshal(body, &items) != nil {
				return
			}
			for _, it := range items {
				if it.Kind == "pattern" || it.Path == "" {
					continue
				}
				title := strings.TrimSpace(tagRe.ReplaceAllString(it.Label, ""))
				if title == "" {
					title = it.Value
				}
				results[i] = append(results[i], Suggestion{Title: title, Book: b.Title,
					URL: b.URL + strings.TrimPrefix(it.Path, "/")})
			}
		}(i, b)
	}
	wg.Wait()
	out := []Suggestion{}
	for _, r := range results {
		out = append(out, r...)
	}
	writeJSON(w, http.StatusOK, out)
}

// prefixWriter sends a child process's output to the log, one line at a time.
type lineLogger struct{ prefix string }

func prefixWriter(p string) io.Writer { return &lineLogger{p} }
func (l *lineLogger) Write(b []byte) (int, error) {
	for _, line := range strings.Split(strings.TrimRight(string(b), "\n"), "\n") {
		if line != "" {
			log.Print(l.prefix + line)
		}
	}
	return len(b), nil
}

func portFree(p int) bool {
	l, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p))
	if err != nil {
		return false
	}
	l.Close()
	return true
}

func freePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}
