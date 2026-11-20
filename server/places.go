package main

import (
	"bufio"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"unicode"
)

// Places is an in-memory place-name index built from GeoNames files
// (cities500.txt, admin1CodesASCII.txt, countryInfo.txt) in the places folder.
type Places struct {
	dir, mapsDir string
	mu           sync.RWMutex
	items        []place
	ready        bool
	source       string
}

type place struct {
	name, key, admin, country string
	lat, lon                  float64
	pop                       int64
}

type PlaceResult struct {
	Name       string  `json:"name"`
	Detail     string  `json:"detail"`
	Lat        float64 `json:"lat"`
	Lon        float64 `json:"lon"`
	Population int64   `json:"population"`
}

func NewPlaces(dir, mapsDir string) *Places { return &Places{dir: dir, mapsDir: mapsDir} }

func fold(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if r < 128 && (unicode.IsLetter(r) || unicode.IsDigit(r) || r == ' ') {
			b.WriteRune(r)
		} else if r == '-' || r == '\'' || r == '.' || r == ',' {
			b.WriteRune(' ')
		}
	}
	return strings.Join(strings.Fields(b.String()), " ")
}

func readTSV(path string, fn func([]string)) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1<<20), 1<<24)
	for sc.Scan() {
		line := sc.Text()
		if line == "" || line[0] == '#' {
			continue
		}
		fn(strings.Split(line, "\t"))
	}
	return sc.Err()
}

func (p *Places) Load() {
	admin1 := map[string]string{}
	_ = readTSV(filepath.Join(p.dir, "admin1CodesASCII.txt"), func(c []string) {
		if len(c) >= 2 {
			admin1[c[0]] = c[1]
		}
	})
	countries := map[string]string{}
	_ = readTSV(filepath.Join(p.dir, "countryInfo.txt"), func(c []string) {
		if len(c) >= 5 {
			countries[c[0]] = c[4]
		}
	})

	// Keep places inside installed maps (plus a margin) and large cities anywhere.
	var boxes [][4]float64
	for _, m := range listMaps(p.mapsDir) {
		if m.Valid {
			b := m.Bounds
			boxes = append(boxes, [4]float64{b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1})
		}
	}
	keep := func(lat, lon float64, pop int64) bool {
		if len(boxes) == 0 || pop >= 100000 {
			return true
		}
		for _, b := range boxes {
			if lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3] {
				return true
			}
		}
		return false
	}

	src := ""
	for _, name := range []string{"cities500.txt", "cities1000.txt", "cities5000.txt", "cities15000.txt"} {
		if _, err := os.Stat(filepath.Join(p.dir, name)); err == nil {
			src = name
			break
		}
	}
	var items []place
	if src != "" {
		err := readTSV(filepath.Join(p.dir, src), func(c []string) {
			if len(c) < 15 {
				return
			}
			lat, e1 := strconv.ParseFloat(c[4], 64)
			lon, e2 := strconv.ParseFloat(c[5], 64)
			if e1 != nil || e2 != nil {
				return
			}
			pop, _ := strconv.ParseInt(c[14], 10, 64)
			if !keep(lat, lon, pop) {
				return
			}
			country := countries[c[8]]
			if country == "" {
				country = c[8]
			}
			items = append(items, place{name: c[1], key: fold(c[2]), admin: admin1[c[8]+"."+c[10]],
				country: country, lat: lat, lon: lon, pop: pop})
		})
		if err != nil {
			log.Printf("places: %v", err)
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].pop > items[j].pop })
	p.mu.Lock()
	p.items, p.ready, p.source = items, true, src
	p.mu.Unlock()
	log.Printf("places: %d loaded from %q", len(items), src)
}

func (p *Places) Count() int {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return len(p.items)
}

// Search ranks exact name > starts with > a word starts with > contains,
// then by population (items are already sorted by population).
func (p *Places) Search(q string, limit int) []PlaceResult {
	out := []PlaceResult{}
	if lat, lon, ok := parseCoords(q); ok {
		out = append(out, PlaceResult{Name: strconv.FormatFloat(lat, 'f', 5, 64) + ", " + strconv.FormatFloat(lon, 'f', 5, 64),
			Detail: "Coordinates", Lat: lat, Lon: lon})
	}
	key := fold(q)
	if key == "" {
		return out
	}
	p.mu.RLock()
	defer p.mu.RUnlock()
	var tiers [4][]int
	for i, it := range p.items {
		switch {
		case it.key == key:
			tiers[0] = append(tiers[0], i)
		case strings.HasPrefix(it.key, key):
			tiers[1] = append(tiers[1], i)
		case strings.Contains(it.key, " "+key):
			tiers[2] = append(tiers[2], i)
		case len(key) >= 3 && strings.Contains(it.key, key):
			tiers[3] = append(tiers[3], i)
		}
		if len(tiers[0])+len(tiers[1]) >= limit*4 {
			break
		}
	}
	for _, t := range tiers {
		for _, i := range t {
			if len(out) >= limit {
				return out
			}
			it := p.items[i]
			detail := it.country
			if it.admin != "" {
				detail = it.admin + ", " + it.country
			}
			out = append(out, PlaceResult{Name: it.name, Detail: detail, Lat: it.lat, Lon: it.lon, Population: it.pop})
		}
	}
	return out
}

func parseCoords(s string) (float64, float64, bool) {
	s = strings.NewReplacer(";", ",", "  ", " ").Replace(strings.TrimSpace(s))
	parts := strings.FieldsFunc(s, func(r rune) bool { return r == ',' || r == ' ' })
	if len(parts) != 2 {
		return 0, 0, false
	}
	lat, e1 := strconv.ParseFloat(parts[0], 64)
	lon, e2 := strconv.ParseFloat(parts[1], 64)
	if e1 != nil || e2 != nil || math.Abs(lat) > 90 || math.Abs(lon) > 180 {
		return 0, 0, false
	}
	return lat, lon, true
}

func (a *App) handlePlaces(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, a.places.Search(r.URL.Query().Get("q"), 12))
}
