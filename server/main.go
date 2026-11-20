// R.O.U.G.E: an offline knowledge and survival server for a Raspberry Pi.
//
// One binary, standard library only. It serves the web interface, runs
// kiwix-serve for Wikipedia and other ZIM files, serves offline vector maps
// (PMTiles), searches an offline place-name index, stores notes, pins and
// supplies, keeps an encrypted documents vault, and talks to optional
// hardware: GPS (gpsd), Meshtastic radios, RTL-SDR and a BME280 barometer.
package main

import (
	"context"
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"
)

//go:embed web
var webFS embed.FS

var version = "2.1.0"

type App struct {
	dataDir  string
	cfg      *ConfigStore
	kiwix    *Kiwix
	places   *Places
	notes    *Store
	pins     *Store
	supplies *Store
	board    *Board
	sessions *Sessions
	share    *Share
	vault    *Vault
	gps      *GPS
	radio    *Radio
	weather  *Weather
	content  *Content
	started  time.Time
	modMu    sync.Mutex
}

func defaultDataDir() string {
	if v := os.Getenv("ROUGE_DATA"); v != "" {
		return v
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "./rouge-data"
	}
	return filepath.Join(home, "rouge")
}

var dataFolders = []string{"zim", "maps", "places", "assets", "notes", "pins", "supplies", "board", "vault", "tracks", "weather", "mesh", "guide", "modules"}

func main() {
	if len(os.Args) > 1 && !strings.HasPrefix(os.Args[1], "-") {
		os.Exit(subcommand(os.Args[1:]))
	}
	addr := flag.String("addr", "127.0.0.1:8080", "listen address; use 0.0.0.0:8080 to share with phones on your network")
	data := flag.String("data", defaultDataDir(), "data folder")
	kiwixBin := flag.String("kiwix", "kiwix-serve", "path to the kiwix-serve program")
	kiwixPort := flag.Int("kiwix-port", 8081, "local port for kiwix-serve")
	flag.Parse()

	for _, d := range dataFolders {
		if err := os.MkdirAll(filepath.Join(*data, d), 0o755); err != nil {
			log.Fatalf("cannot create data folder: %v", err)
		}
	}
	_ = os.Chmod(filepath.Join(*data, "vault"), 0o700)

	app := &App{
		dataDir:  *data,
		cfg:      NewConfigStore(filepath.Join(*data, "config.json")),
		kiwix:    NewKiwix(*kiwixBin, *kiwixPort, filepath.Join(*data, "zim")),
		places:   NewPlaces(filepath.Join(*data, "places"), filepath.Join(*data, "maps")),
		notes:    NewStore(filepath.Join(*data, "notes")),
		pins:     NewStore(filepath.Join(*data, "pins")),
		supplies: NewStore(filepath.Join(*data, "supplies")),
		board:    &Board{store: NewStore(filepath.Join(*data, "board")), last: map[string]time.Time{}},
		sessions: NewSessions(filepath.Join(*data, "power-sessions.json")),
		vault:    NewVault(filepath.Join(*data, "vault")),
		gps:      NewGPS(filepath.Join(*data, "tracks")),
		radio:    &Radio{},
		weather:  NewWeather(filepath.Join(*data, "weather", "log.jsonl")),
		started:  time.Now(),
	}
	app.content = NewContent(app)
	_, port, _ := net.SplitHostPort(*addr)
	handler := logRequests(app.guard(app.routes()))
	app.share = &Share{handler: handler, port: port, mainAddr: *addr}

	ctx, stopAll := context.WithCancel(context.Background())
	go func() {
		if err := app.kiwix.Restart(); err != nil {
			log.Printf("kiwix: %v", err)
		}
	}()
	go app.places.Load()
	go app.sessions.Run(ctx)
	go app.share.Watch(ctx, func() bool { return app.cfg.Enabled("share") })
	app.startModules()
	go func() { time.Sleep(15 * time.Second); app.healEngine(ctx) }()

	srv := &http.Server{Addr: *addr, Handler: handler, ReadHeaderTimeout: 10 * time.Second}
	go func() {
		log.Printf("R.O.U.G.E %s on http://%s  (data: %s)", version, *addr, *data)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	log.Print("shutting down")
	stopAll()
	app.kiwix.Stop()
	app.radio.Stop()
	app.gps.Stop()
	app.weather.Stop()
	sctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(sctx)
}

// startModules starts or stops background work to match the enabled modules.
func (a *App) startModules() {
	a.modMu.Lock()
	defer a.modMu.Unlock()
	if a.cfg.Enabled("gps") {
		a.gps.Start()
	} else {
		a.gps.Stop()
	}
	if a.cfg.Enabled("weather") && fileExists("/dev/i2c-1") {
		a.weather.Start()
	} else {
		a.weather.Stop()
	}
	if !a.cfg.Enabled("radio") {
		a.radio.Stop()
	}
}

func (a *App) routes() http.Handler {
	mux := http.NewServeMux()

	web, _ := fs.Sub(webFS, "web")
	mux.Handle("/", noCache(http.FileServerFS(web)))
	mux.Handle("GET /assets/", cacheLong(http.StripPrefix("/assets/", http.FileServer(http.Dir(filepath.Join(a.dataDir, "assets"))))))
	mux.Handle("/kiwix/", a.kiwix)
	mux.HandleFunc("GET /m/{id}/{path...}", a.handlePluginFile)

	// core
	mux.HandleFunc("GET /api/status", a.handleStatus)
	mux.HandleFunc("GET /api/library", a.handleLibrary)
	mux.HandleFunc("GET /api/suggest", a.handleSuggest)
	mux.HandleFunc("POST /api/rescan", a.handleRescan)
	mux.HandleFunc("GET /api/maps", a.handleMaps)
	mux.HandleFunc("GET /maps/{file}", a.handleMapFile)
	mux.HandleFunc("GET /api/places", a.handlePlaces)
	a.notes.Mount(mux, "/api/notes")
	a.pins.Mount(mux, "/api/pins")
	mux.HandleFunc("GET /api/modules", a.handleModules)
	mux.HandleFunc("PUT /api/modules/{id}", a.handleModuleToggle)
	mux.HandleFunc("GET /api/config", a.handleConfigGet)
	mux.HandleFunc("PUT /api/config", a.handleConfigPut)
	mux.HandleFunc("POST /api/system", a.handleSystemAction)
	mux.HandleFunc("GET /api/content", a.handleContent)
	mux.HandleFunc("POST /api/content/download", a.handleContentDownload)
	mux.HandleFunc("POST /api/content/cancel", a.handleContentCancel)
	mux.HandleFunc("DELETE /api/content/file", a.handleContentDelete)
	mux.HandleFunc("GET /api/autostart", a.handleAutostartGet)
	mux.HandleFunc("PUT /api/autostart", a.handleAutostartPut)

	// modules
	mod := a.requireModule
	mux.HandleFunc("GET /api/guide", mod("guide", a.handleGuide))
	a.supplies.Mount(mux, "/api/supplies") // turned-off modules simply aren't shown
	mux.HandleFunc("GET /api/vault", mod("vault", a.handleVaultState))
	mux.HandleFunc("POST /api/vault", mod("vault", a.handleVaultAuth))
	mux.HandleFunc("GET /api/vault/files", mod("vault", a.handleVaultList))
	mux.HandleFunc("POST /api/vault/files", mod("vault", a.handleVaultUpload))
	mux.HandleFunc("GET /api/vault/files/{id}", mod("vault", a.handleVaultFile))
	mux.HandleFunc("DELETE /api/vault/files/{id}", mod("vault", a.handleVaultFile))
	mux.HandleFunc("GET /api/power", mod("power", a.handlePowerGet))
	mux.HandleFunc("POST /api/power", mod("power", a.handlePowerPost))
	mux.HandleFunc("GET /api/share", mod("share", a.handleShareGet))
	mux.HandleFunc("POST /api/share", mod("share", a.handleSharePost))
	mux.HandleFunc("GET /api/board", mod("share", a.board.handleList))
	mux.HandleFunc("POST /api/board", mod("share", a.board.handlePost))
	mux.HandleFunc("DELETE /api/board/{id}", mod("share", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if idRe.MatchString(id) {
			_ = os.Remove(filepath.Join(a.board.store.dir, id+".json"))
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	}))
	mux.HandleFunc("GET /api/gps", mod("gps", a.handleGPS))
	mux.HandleFunc("POST /api/gps/record", mod("gps", a.handleGPSRecord))
	mux.HandleFunc("GET /api/gps/tracks", mod("gps", a.handleTracks))
	mux.HandleFunc("GET /api/gps/tracks/{id}", mod("gps", a.handleTrack))
	mux.HandleFunc("DELETE /api/gps/tracks/{id}", mod("gps", a.handleTrack))
	mux.Handle("/api/mesh/", a.requireModule("mesh", a.meshProxy().ServeHTTP))
	mux.HandleFunc("GET /api/radio", mod("radio", a.handleRadioGet))
	mux.HandleFunc("POST /api/radio", mod("radio", a.handleRadioPost))
	mux.HandleFunc("GET /api/weather", mod("weather", a.handleWeather))
	return mux
}

// handleGuide returns the built-in field guide plus any cards added in data/guide/*.json.
func (a *App) handleGuide(w http.ResponseWriter, r *http.Request) {
	var cards []map[string]any
	if b, err := webFS.ReadFile("web/guide.json"); err == nil {
		_ = json.Unmarshal(b, &cards)
	}
	extra, _ := filepath.Glob(filepath.Join(a.dataDir, "guide", "*.json"))
	sort.Strings(extra)
	for _, f := range extra {
		b, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		var more []map[string]any
		if json.Unmarshal(b, &more) != nil {
			log.Printf("guide: %s is not a JSON list of cards", f)
			continue
		}
		for _, c := range more {
			c["custom"] = true
		}
		cards = append(cards, more...)
	}
	writeJSON(w, http.StatusOK, cards)
}

func (a *App) handleRescan(w http.ResponseWriter, r *http.Request) {
	err := a.kiwix.Restart()
	go a.places.Load()
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---------- command line: rouge modules ... ----------

func subcommand(args []string) int {
	switch args[0] {
	case "version":
		fmt.Println(version)
		return 0
	case "modules":
	default:
		fmt.Fprintln(os.Stderr, "usage: rouge [flags] | rouge version | rouge modules [list|ids|set a,b,c|enable id|disable id] [-data DIR]")
		return 2
	}
	fl := flag.NewFlagSet("modules", flag.ExitOnError)
	data := fl.String("data", defaultDataDir(), "data folder")
	rest := args[1:]
	pos := []string{}
	for len(rest) > 0 {
		_ = fl.Parse(rest)
		if fl.NArg() == 0 {
			break
		}
		pos = append(pos, fl.Arg(0))
		rest = fl.Args()[1:]
	}
	_ = os.MkdirAll(*data, 0o755)
	cs := NewConfigStore(filepath.Join(*data, "config.json"))
	action := "list"
	if len(pos) > 0 {
		action = pos[0]
	}
	switch action {
	case "list":
		for _, m := range builtinModules {
			on := map[bool]string{true: "on ", false: "off"}[cs.Enabled(m.ID)]
			fmt.Printf("%s  %-9s %-14s %s\n", on, m.ID, m.Name, m.Desc)
		}
		app := &App{dataDir: *data, cfg: cs}
		for _, p := range app.plugins() {
			on := map[bool]string{true: "on ", false: "off"}[cs.Enabled(p.ID)]
			fmt.Printf("%s  %-9s %-14s %s (custom)\n", on, p.ID, p.Name, p.Desc)
		}
	case "ids":
		for _, m := range builtinModules {
			fmt.Printf("%s|%s|%s|%s|%v\n", m.ID, m.Name, m.Group, m.Desc, cs.Enabled(m.ID))
		}
	case "set", "enable", "disable":
		if len(pos) < 2 && action != "set" {
			fmt.Fprintln(os.Stderr, "which module?")
			return 2
		}
		list := ""
		if len(pos) > 1 {
			list = pos[1]
		}
		err := cs.Update(func(c *Config) {
			if action == "set" {
				want := map[string]bool{}
				for _, id := range strings.Split(list, ",") {
					want[strings.TrimSpace(id)] = true
				}
				for _, m := range builtinModules {
					c.Modules[m.ID] = want[m.ID]
				}
				return
			}
			c.Modules[list] = action == "enable"
		})
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
	default:
		fmt.Fprintln(os.Stderr, "unknown action", action)
		return 2
	}
	return 0
}

// ---------- small helpers ----------

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func noCache(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		h.ServeHTTP(w, r)
	})
}

func cacheLong(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=604800")
		h.ServeHTTP(w, r)
	})
}

func logRequests(h http.Handler) http.Handler {
	quiet := os.Getenv("ROUGE_QUIET") != ""
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !quiet && strings.HasPrefix(r.URL.Path, "/api/") {
			log.Printf("%s %s", r.Method, r.URL.RequestURI())
		}
		h.ServeHTTP(w, r)
	})
}
