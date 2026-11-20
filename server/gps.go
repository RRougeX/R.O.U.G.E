package main

import (
	"bufio"
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"math"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// GPS reads positions from gpsd (localhost:2947), which handles the USB receiver.

type Fix struct {
	Connected bool      `json:"connected"` // talking to gpsd
	Device    bool      `json:"device"`    // a receiver is attached
	Mode      int       `json:"mode"`      // 0/1 no fix, 2 = 2D, 3 = 3D
	Lat       float64   `json:"lat"`
	Lon       float64   `json:"lon"`
	Alt       float64   `json:"alt"`
	Speed     float64   `json:"speed"` // m/s
	Track     float64   `json:"track"` // degrees
	Time      string    `json:"time"`
	Sats      int       `json:"sats"`
	SatsSeen  int       `json:"satsSeen"`
	Updated   time.Time `json:"updated"`
	Recording string    `json:"recording"`
}

type TrackPoint struct {
	Lat  float64 `json:"lat"`
	Lon  float64 `json:"lon"`
	Alt  float64 `json:"alt"`
	Time string  `json:"time"`
}

type Track struct {
	ID      string       `json:"id"`
	Name    string       `json:"name"`
	Started string       `json:"started"`
	Points  []TrackPoint `json:"points"`
}

type GPS struct {
	dir    string
	mu     sync.Mutex
	fix    Fix
	rec    *Track
	cancel context.CancelFunc
}

func NewGPS(dir string) *GPS { return &GPS{dir: dir} }

func (g *GPS) Start() {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.cancel != nil {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	g.cancel = cancel
	go g.loop(ctx)
}

func (g *GPS) Stop() {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.cancel != nil {
		g.cancel()
		g.cancel = nil
	}
	g.fix = Fix{}
}

func (g *GPS) loop(ctx context.Context) {
	for ctx.Err() == nil {
		g.session(ctx)
		g.mu.Lock()
		g.fix.Connected, g.fix.Device, g.fix.Mode = false, false, 0
		g.mu.Unlock()
		select {
		case <-ctx.Done():
		case <-time.After(5 * time.Second):
		}
	}
}

func (g *GPS) session(ctx context.Context) {
	conn, err := net.DialTimeout("tcp", "127.0.0.1:2947", 3*time.Second)
	if err != nil {
		return
	}
	defer conn.Close()
	go func() { <-ctx.Done(); conn.Close() }()
	_, _ = conn.Write([]byte(`?WATCH={"enable":true,"json":true};` + "\n"))
	g.mu.Lock()
	g.fix.Connected = true
	g.mu.Unlock()
	sc := bufio.NewScanner(conn)
	sc.Buffer(make([]byte, 64<<10), 1<<20)
	for sc.Scan() {
		var msg struct {
			Class   string  `json:"class"`
			Mode    int     `json:"mode"`
			Lat     float64 `json:"lat"`
			Lon     float64 `json:"lon"`
			Alt     float64 `json:"alt"`
			AltMSL  float64 `json:"altMSL"`
			Speed   float64 `json:"speed"`
			Track   float64 `json:"track"`
			Time    string  `json:"time"`
			USat    int     `json:"uSat"`
			NSat    int     `json:"nSat"`
			Devices []any   `json:"devices"`
			Sats    []struct {
				Used bool `json:"used"`
			} `json:"satellites"`
		}
		if json.Unmarshal(sc.Bytes(), &msg) != nil {
			continue
		}
		g.mu.Lock()
		switch msg.Class {
		case "DEVICES":
			g.fix.Device = len(msg.Devices) > 0
		case "DEVICE":
			g.fix.Device = true
		case "TPV":
			g.fix.Device = true
			g.fix.Mode = msg.Mode
			if msg.Mode >= 2 {
				g.fix.Lat, g.fix.Lon, g.fix.Speed, g.fix.Track = msg.Lat, msg.Lon, msg.Speed, msg.Track
				g.fix.Alt = msg.AltMSL
				if g.fix.Alt == 0 {
					g.fix.Alt = msg.Alt
				}
				g.fix.Time = msg.Time
				g.fix.Updated = time.Now()
				g.recordLocked()
			}
		case "SKY":
			used := msg.USat
			if used == 0 {
				for _, s := range msg.Sats {
					if s.Used {
						used++
					}
				}
			}
			g.fix.Sats = used
			g.fix.SatsSeen = len(msg.Sats)
			if msg.NSat > 0 {
				g.fix.SatsSeen = msg.NSat
			}
		}
		g.mu.Unlock()
	}
}

func haversine(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371000.0
	p1, p2 := lat1*math.Pi/180, lat2*math.Pi/180
	dp, dl := (lat2-lat1)*math.Pi/180, (lon2-lon1)*math.Pi/180
	h := math.Sin(dp/2)*math.Sin(dp/2) + math.Cos(p1)*math.Cos(p2)*math.Sin(dl/2)*math.Sin(dl/2)
	return 2 * R * math.Asin(math.Sqrt(h))
}

// recordLocked adds a point when recording and we've moved 10 m or 60 s passed.
func (g *GPS) recordLocked() {
	t := g.rec
	if t == nil {
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if n := len(t.Points); n > 0 {
		last := t.Points[n-1]
		lt, _ := time.Parse(time.RFC3339, last.Time)
		if haversine(last.Lat, last.Lon, g.fix.Lat, g.fix.Lon) < 10 && time.Since(lt) < time.Minute {
			return
		}
	}
	t.Points = append(t.Points, TrackPoint{g.fix.Lat, g.fix.Lon, g.fix.Alt, now})
	if len(t.Points)%10 == 1 {
		_ = g.saveTrack(t)
	}
}

func (g *GPS) saveTrack(t *Track) error {
	b, _ := json.Marshal(t)
	return writeAtomic(filepath.Join(g.dir, t.ID+".json"), b)
}

func (g *GPS) Fix() Fix {
	g.mu.Lock()
	defer g.mu.Unlock()
	f := g.fix
	if g.rec != nil {
		f.Recording = g.rec.ID
	}
	return f
}

func (a *App) handleGPS(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, a.gps.Fix())
}

func (a *App) handleGPSRecord(w http.ResponseWriter, r *http.Request) {
	var in struct {
		On   bool   `json:"on"`
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	g := a.gps
	g.mu.Lock()
	defer g.mu.Unlock()
	if in.On && g.rec == nil {
		name := strings.TrimSpace(in.Name)
		if name == "" {
			name = "Trail " + time.Now().Format("Jan 2, 3:04 PM")
		}
		g.rec = &Track{ID: newID(), Name: name, Started: time.Now().UTC().Format(time.RFC3339), Points: []TrackPoint{}}
		if g.fix.Mode >= 2 {
			g.recordLocked()
		}
		_ = g.saveTrack(g.rec)
	} else if !in.On && g.rec != nil {
		_ = g.saveTrack(g.rec)
		g.rec = nil
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (g *GPS) loadTrack(id string) (*Track, error) {
	g.mu.Lock()
	if g.rec != nil && g.rec.ID == id {
		c := *g.rec
		c.Points = append([]TrackPoint(nil), g.rec.Points...)
		g.mu.Unlock()
		return &c, nil
	}
	g.mu.Unlock()
	b, err := os.ReadFile(filepath.Join(g.dir, id+".json"))
	if err != nil {
		return nil, err
	}
	var t Track
	return &t, json.Unmarshal(b, &t)
}

func trackLength(pts []TrackPoint) float64 {
	d := 0.0
	for i := 1; i < len(pts); i++ {
		d += haversine(pts[i-1].Lat, pts[i-1].Lon, pts[i].Lat, pts[i].Lon)
	}
	return d
}

func (a *App) handleTracks(w http.ResponseWriter, r *http.Request) {
	files, _ := filepath.Glob(filepath.Join(a.gps.dir, "*.json"))
	type item struct {
		ID      string  `json:"id"`
		Name    string  `json:"name"`
		Started string  `json:"started"`
		Points  int     `json:"points"`
		Meters  float64 `json:"meters"`
	}
	out := []item{}
	for _, f := range files {
		t, err := a.gps.loadTrack(strings.TrimSuffix(filepath.Base(f), ".json"))
		if err != nil {
			continue
		}
		out = append(out, item{t.ID, t.Name, t.Started, len(t.Points), trackLength(t.Points)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Started > out[j].Started })
	writeJSON(w, http.StatusOK, out)
}

func (a *App) handleTrack(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	gpx := strings.HasSuffix(id, ".gpx")
	id = strings.TrimSuffix(id, ".gpx")
	if !idRe.MatchString(id) {
		writeErr(w, http.StatusBadRequest, "bad id")
		return
	}
	if r.Method == http.MethodDelete {
		if !isLocal(r) {
			writeErr(w, http.StatusForbidden, "only on the device")
			return
		}
		_ = os.Remove(filepath.Join(a.gps.dir, id+".json"))
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}
	t, err := a.gps.loadTrack(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if !gpx {
		writeJSON(w, http.StatusOK, t)
		return
	}
	w.Header().Set("Content-Type", "application/gpx+xml")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", t.ID+".gpx"))
	var name strings.Builder
	_ = xml.EscapeText(&name, []byte(t.Name))
	fmt.Fprintf(w, `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="R.O.U.G.E" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>%s</name><trkseg>
`, name.String())
	for _, p := range t.Points {
		fmt.Fprintf(w, "<trkpt lat=\"%.7f\" lon=\"%.7f\"><ele>%.1f</ele><time>%s</time></trkpt>\n", p.Lat, p.Lon, p.Alt, p.Time)
	}
	fmt.Fprint(w, "</trkseg></trk></gpx>\n")
}
