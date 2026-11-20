package main

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"
)

// Meshtastic radios are handled by a small Python bridge (rouge-mesh.py,
// using the official meshtastic library) running as its own service on
// 127.0.0.1:8096. This proxies the web app's requests to it.

const (
	meshPython = "/opt/rouge-mesh/venv/bin/python"
	meshAddr   = "127.0.0.1:8096"
)

func (a *App) meshProxy() http.Handler {
	target, _ := url.Parse("http://" + meshAddr)
	p := httputil.NewSingleHostReverseProxy(target)
	p.Transport = &http.Transport{ResponseHeaderTimeout: 20 * time.Second}
	p.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		msg := "The mesh radio service isn't running. Run rouge-setup and select Mesh Radio, or: sudo systemctl start rouge-mesh"
		if strings.HasSuffix(r.URL.Path, "/status") {
			writeJSON(w, http.StatusOK, map[string]any{"bridge": false, "error": msg})
			return
		}
		writeErr(w, http.StatusServiceUnavailable, msg)
	}
	return http.StripPrefix("/api/mesh", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/") {
			r.URL.Path = "/" + r.URL.Path
		}
		r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
		p.ServeHTTP(w, r)
	}))
}
