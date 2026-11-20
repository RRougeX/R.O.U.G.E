package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// The map engine (MapLibre GL JS, the PMTiles plugin and label fonts) is
// downloaded once into data/assets. The installer does it, and R.O.U.G.E
// also does it by itself whenever it's missing and there's internet, so a
// setup done offline heals on its own.

var engineFonts = []string{"Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"}

func (a *App) engineMissing() bool {
	as := filepath.Join(a.dataDir, "assets")
	for _, f := range []string{"maplibre-gl.js", "maplibre-gl.css", "pmtiles.js"} {
		if st, err := os.Stat(filepath.Join(as, f)); err != nil || st.Size() < 1000 {
			return true
		}
	}
	for _, f := range engineFonts {
		if !fileExists(filepath.Join(as, "fonts", f, "0-255.pbf")) {
			return true
		}
	}
	return false
}

func (c *Content) getText(ctx context.Context, u, mustContain string) ([]byte, error) {
	req, _ := http.NewRequestWithContext(ctx, "GET", u, nil)
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("%s", resp.Status)
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, 20<<20))
	if err != nil {
		return nil, err
	}
	if mustContain != "" && !strings.Contains(string(b), mustContain) {
		return nil, fmt.Errorf("unexpected file")
	}
	return b, nil
}

func (c *Content) firstOf(ctx context.Context, dest, mustContain string, urls ...string) error {
	if st, err := os.Stat(dest); err == nil && st.Size() > 1000 {
		return nil
	}
	var last error
	for _, u := range urls {
		b, err := c.getText(ctx, u, mustContain)
		if err == nil {
			return writeAtomic(dest, b)
		}
		last = err
		if ctx.Err() != nil {
			return ctx.Err()
		}
	}
	return fmt.Errorf("couldn't download %s: %v", filepath.Base(dest), last)
}

func (c *Content) queueEngine() *Job {
	c.mu.Lock()
	for _, j := range c.jobs {
		if j.Title == "Map engine and fonts" && (j.State == "queued" || j.State == "running") {
			c.mu.Unlock()
			return j
		}
	}
	c.mu.Unlock()
	return c.add("Map engine and fonts", func(ctx context.Context, j *Job) error {
		as := filepath.Join(c.app.dataDir, "assets")
		_ = os.MkdirAll(filepath.Join(as, "fonts"), 0o755)
		var ml, mlcss, pm []string
		for _, v := range []string{"4.7.1", "4.5.0"} {
			ml = append(ml, "https://unpkg.com/maplibre-gl@"+v+"/dist/maplibre-gl.js", "https://cdn.jsdelivr.net/npm/maplibre-gl@"+v+"/dist/maplibre-gl.js")
			mlcss = append(mlcss, "https://unpkg.com/maplibre-gl@"+v+"/dist/maplibre-gl.css", "https://cdn.jsdelivr.net/npm/maplibre-gl@"+v+"/dist/maplibre-gl.css")
		}
		for _, v := range []string{"3.2.1", "3.2.0", "3.0.7"} {
			for _, f := range []string{"dist/pmtiles.js", "dist/index.js"} {
				pm = append(pm, "https://unpkg.com/pmtiles@"+v+"/"+f, "https://cdn.jsdelivr.net/npm/pmtiles@"+v+"/"+f)
			}
		}
		steps := 3 + len(engineFonts)*256
		done := 0
		tick := func() { done++; c.progress(j, int64(done), int64(steps)) }
		if err := c.firstOf(ctx, filepath.Join(as, "maplibre-gl.js"), "maplibregl", ml...); err != nil {
			return err
		}
		tick()
		if err := c.firstOf(ctx, filepath.Join(as, "maplibre-gl.css"), "maplibregl", mlcss...); err != nil {
			return err
		}
		tick()
		if err := c.firstOf(ctx, filepath.Join(as, "pmtiles.js"), "Protocol", pm...); err != nil {
			return err
		}
		tick()
		// fonts: one small file per block of 256 characters
		for _, font := range engineFonts {
			dir := filepath.Join(as, "fonts", font)
			_ = os.MkdirAll(dir, 0o755)
			ranges := make(chan int)
			var wg sync.WaitGroup
			var mu sync.Mutex
			got := 0
			for w := 0; w < 8; w++ {
				wg.Add(1)
				go func() {
					defer wg.Done()
					for start := range ranges {
						name := fmt.Sprintf("%d-%d.pbf", start, start+255)
						dest := filepath.Join(dir, name)
						ok := fileExists(dest)
						for _, base := range []string{"https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts/", "https://cdn.jsdelivr.net/gh/protomaps/basemaps-assets@main/fonts/"} {
							if ok || ctx.Err() != nil {
								break
							}
							if b, err := c.getText(ctx, base+url.PathEscape(font)+"/"+name, ""); err == nil {
								ok = writeAtomic(dest, b) == nil
							}
						}
						mu.Lock()
						if ok {
							got++
						}
						tick()
						mu.Unlock()
					}
				}()
			}
			for s := 0; s < 65536; s += 256 {
				if ctx.Err() != nil {
					break
				}
				ranges <- s
			}
			close(ranges)
			wg.Wait()
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if got == 0 && font != "Noto Sans Regular" {
				// use the regular font if a style isn't available
				reg := filepath.Join(as, "fonts", "Noto Sans Regular")
				files, _ := filepath.Glob(filepath.Join(reg, "*.pbf"))
				for _, f := range files {
					if b, err := os.ReadFile(f); err == nil {
						_ = os.WriteFile(filepath.Join(dir, filepath.Base(f)), b, 0o644)
					}
				}
			}
		}
		if !fileExists(filepath.Join(as, "fonts", "Noto Sans Regular", "0-255.pbf")) {
			return fmt.Errorf("couldn't download the map fonts")
		}
		return nil
	})
}

// healEngine downloads the map engine when it's missing, as soon as there's internet.
func (a *App) healEngine(ctx context.Context) {
	for {
		if a.engineMissing() && a.content.isOnline() {
			a.content.queueEngine()
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(10 * time.Minute):
		}
	}
}
