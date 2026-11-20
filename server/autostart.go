package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
)

// Open R.O.U.G.E full screen when the desktop starts. This is the standard
// freedesktop autostart file, which Raspberry Pi OS's desktop runs at login.

const autostartEntry = `[Desktop Entry]
Type=Application
Name=R.O.U.G.E
Comment=Open R.O.U.G.E when the desktop starts
Exec=/usr/local/bin/rouge-open --fullscreen
Icon=accessories-dictionary
Terminal=false
X-GNOME-Autostart-enabled=true
`

func autostartPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".config", "autostart", "rouge.desktop")
}

func (a *App) handleAutostartGet(w http.ResponseWriter, r *http.Request) {
	p := autostartPath()
	writeJSON(w, http.StatusOK, map[string]any{"on": p != "" && fileExists(p), "launcher": fileExists("/usr/local/bin/rouge-open")})
}

func (a *App) handleAutostartPut(w http.ResponseWriter, r *http.Request) {
	var in struct {
		On bool `json:"on"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	p := autostartPath()
	if p == "" {
		writeErr(w, http.StatusInternalServerError, "no home folder")
		return
	}
	var err error
	if in.On {
		if err = os.MkdirAll(filepath.Dir(p), 0o755); err == nil {
			err = os.WriteFile(p, []byte(autostartEntry), 0o644)
		}
	} else if fileExists(p) {
		err = os.Remove(p)
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.handleAutostartGet(w, r)
}
