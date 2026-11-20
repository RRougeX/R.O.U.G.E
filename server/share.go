package main

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// The hotspot is made by NetworkManager; the Pi's address on it is 10.42.0.1.
const hotspotIP = "10.42.0.1"

type Share struct {
	mu       sync.Mutex
	srv      *http.Server
	handler  http.Handler
	port     string
	mainAddr string
}

func hotspotActive() bool {
	out, err := exec.Command("nmcli", "-t", "-f", "NAME,TYPE", "connection", "show", "--active").Output()
	if err != nil {
		return false
	}
	for _, l := range strings.Split(string(out), "\n") {
		if strings.HasPrefix(l, "Hotspot:") {
			return true
		}
	}
	return false
}

func hasIP(ip string) bool {
	addrs, _ := net.InterfaceAddrs()
	for _, a := range addrs {
		if n, ok := a.(*net.IPNet); ok && n.IP.String() == ip {
			return true
		}
	}
	return false
}

// listening on 127.0.0.1 only? Then phones need an extra listener on the hotspot address.
func (s *Share) needsExtraListener() bool {
	host, _, _ := net.SplitHostPort(s.mainAddr)
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (s *Share) startListener() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.srv != nil || !s.needsExtraListener() {
		return
	}
	for i := 0; i < 30 && !hasIP(hotspotIP); i++ {
		time.Sleep(500 * time.Millisecond)
	}
	ln, err := net.Listen("tcp", net.JoinHostPort(hotspotIP, s.port))
	if err != nil {
		return
	}
	s.srv = &http.Server{Handler: s.handler, ReadHeaderTimeout: 10 * time.Second}
	go func(srv *http.Server) { _ = srv.Serve(ln) }(s.srv)
}

func (s *Share) stopListener() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.srv != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_ = s.srv.Shutdown(ctx)
		cancel()
		s.srv = nil
	}
}

// Watch keeps the extra listener in step with the hotspot, including after a reboot.
func (s *Share) Watch(ctx context.Context, enabled func() bool) {
	for {
		if enabled() && hotspotActive() {
			s.startListener()
		} else {
			s.stopListener()
		}
		select {
		case <-ctx.Done():
			s.stopListener()
			return
		case <-time.After(20 * time.Second):
		}
	}
}

func (a *App) handleShareGet(w http.ResponseWriter, r *http.Request) {
	c := a.cfg.Get()
	on := hotspotActive()
	url := ""
	if on {
		url = "http://" + hotspotIP + ":" + a.share.port
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"active": on, "ssid": c.HotspotSSID, "password": c.HotspotPass, "url": url,
		"ready": hasCmd("nmcli") && fileExists(helperPath), "lanURLs": a.lanURLs(),
	})
}

func (a *App) lanURLs() []string {
	if a.share.needsExtraListener() {
		return nil
	}
	out := []string{}
	for _, ip := range localIPs() {
		out = append(out, "http://"+ip+":"+a.share.port)
	}
	return out
}

func (a *App) handleSharePost(w http.ResponseWriter, r *http.Request) {
	var in struct {
		On bool `json:"on"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	c := a.cfg.Get()
	if in.On {
		if _, err := runHelper("hotspot", "on", c.HotspotSSID, c.HotspotPass); err != nil {
			writeErr(w, http.StatusInternalServerError, "Could not start the hotspot: "+err.Error())
			return
		}
		a.share.startListener()
	} else {
		_, _ = runHelper("hotspot", "off")
		a.share.stopListener()
	}
	a.handleShareGet(w, r)
}

// ---------- message board ----------

type Board struct {
	store *Store
	mu    sync.Mutex
	last  map[string]time.Time
}

func (b *Board) handleList(w http.ResponseWriter, r *http.Request) {
	b.store.mu.Lock()
	list := b.store.list()
	b.store.mu.Unlock()
	if len(list) > 200 {
		list = list[:200]
	}
	writeJSON(w, http.StatusOK, list)
}

func (b *Board) handlePost(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name string `json:"name"`
		Text string `json:"text"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	in.Name, in.Text = strings.TrimSpace(in.Name), strings.TrimSpace(in.Text)
	if in.Text == "" || utf8.RuneCountInString(in.Text) > 500 || utf8.RuneCountInString(in.Name) > 40 {
		writeErr(w, http.StatusBadRequest, "message must be 1 to 500 characters, name up to 40")
		return
	}
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	b.mu.Lock()
	if t, ok := b.last[host]; ok && time.Since(t) < 3*time.Second {
		b.mu.Unlock()
		writeErr(w, http.StatusTooManyRequests, "slow down a little")
		return
	}
	b.last[host] = time.Now()
	b.mu.Unlock()
	if in.Name == "" {
		in.Name = "Anonymous"
	}
	now := time.Now().UTC().Format(time.RFC3339)
	doc := map[string]any{"id": newID(), "name": in.Name, "text": in.Text, "created": now, "updated": now, "fromDevice": isLocal(r)}
	b.store.mu.Lock()
	err := b.store.save(doc)
	b.prune()
	b.store.mu.Unlock()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, doc)
}

// keep the newest 500 messages
func (b *Board) prune() {
	files, _ := filepath.Glob(filepath.Join(b.store.dir, "*.json"))
	if len(files) <= 500 {
		return
	}
	// ids start with a timestamp, so name order is age order
	for _, f := range files[:len(files)-500] {
		_ = os.Remove(f)
	}
}
