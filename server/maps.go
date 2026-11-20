package main

import (
	"encoding/binary"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// MapFile describes one offline map (a PMTiles v3 archive) in the maps folder.
type MapFile struct {
	Name     string     `json:"name"`
	File     string     `json:"file"`
	URL      string     `json:"url"`
	Size     int64      `json:"size"`
	Valid    bool       `json:"valid"`
	TileType string     `json:"tileType,omitempty"`
	MinZoom  int        `json:"minZoom"`
	MaxZoom  int        `json:"maxZoom"`
	Bounds   [4]float64 `json:"bounds"` // west, south, east, north
	Center   [3]float64 `json:"center"` // lon, lat, zoom
}

var safeFile = regexp.MustCompile(`^[A-Za-z0-9._ -]+\.pmtiles$`)

func readPMTilesHeader(path string, m *MapFile) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	h := make([]byte, 127)
	if n, _ := f.ReadAt(h, 0); n < 127 || string(h[:7]) != "PMTiles" || h[7] != 3 {
		return
	}
	e7 := func(off int) float64 { return float64(int32(binary.LittleEndian.Uint32(h[off:]))) / 1e7 }
	types := map[byte]string{1: "mvt", 2: "png", 3: "jpeg", 4: "webp", 5: "avif"}
	m.Valid = true
	m.TileType = types[h[99]]
	m.MinZoom, m.MaxZoom = int(h[100]), int(h[101])
	m.Bounds = [4]float64{e7(102), e7(106), e7(110), e7(114)}
	m.Center = [3]float64{e7(119), e7(123), float64(h[118])}
}

func listMaps(dir string) []MapFile {
	files, _ := filepath.Glob(filepath.Join(dir, "*.pmtiles"))
	sort.Strings(files)
	out := []MapFile{}
	for _, f := range files {
		base := filepath.Base(f)
		st, err := os.Stat(f)
		if err != nil {
			continue
		}
		m := MapFile{Name: strings.TrimSuffix(base, ".pmtiles"), File: base, URL: "/maps/" + base, Size: st.Size()}
		readPMTilesHeader(f, &m)
		out = append(out, m)
	}
	return out
}

func (a *App) handleMaps(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, listMaps(filepath.Join(a.dataDir, "maps")))
}

// handleMapFile serves a .pmtiles file; ServeContent handles the HTTP range
// requests the map library uses to read individual tiles.
func (a *App) handleMapFile(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("file")
	if !safeFile.MatchString(name) {
		http.NotFound(w, r)
		return
	}
	path := filepath.Join(a.dataDir, "maps", name)
	f, err := os.Open(path)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "no-cache")
	http.ServeContent(w, r, name, st.ModTime(), f)
}
