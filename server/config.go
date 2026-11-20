package main

import (
	"encoding/json"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
)

// ModuleDef describes a built-in, optional module. Core pages (Home, Library,
// Maps, Notes, Tools, Settings) are always on and are not listed here.
type ModuleDef struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Desc     string `json:"desc"`
	Icon     string `json:"icon"`
	Group    string `json:"group"`    // "main" (sidebar), "tool" (Tools page), "hardware" (Tools page)
	Hardware string `json:"hardware"` // what to plug in, for hardware modules
	Guest    bool   `json:"guest"`    // usable by phones on the hotspot
}

var builtinModules = []ModuleDef{
	{ID: "guide", Name: "Field Guide", Icon: "cross", Group: "main", Guest: true,
		Desc: "First aid, water, fire, shelter and signals: quick cards you can reach in two taps."},
	{ID: "supplies", Name: "Supplies", Icon: "box", Group: "main",
		Desc: "Track water, food, medicine and batteries. Shows how many days you can last and what expires soon."},
	{ID: "vault", Name: "Documents", Icon: "lock", Group: "main",
		Desc: "Password-protected copies of IDs, insurance, prescriptions and records, encrypted on this device."},
	{ID: "power", Name: "Power", Icon: "zap", Group: "tool",
		Desc: "One-tap power saver, Wi-Fi and Bluetooth switches, and a log of how long each battery run lasted."},
	{ID: "share", Name: "Share & Board", Icon: "wifi", Group: "tool", Guest: true,
		Desc: "Turn the Pi into a Wi-Fi hotspot so nearby phones can use R.O.U.G.E, with a local message board."},
	{ID: "sky", Name: "Sun & Moon", Icon: "sunrise", Group: "tool", Guest: true,
		Desc: "Sunrise, sunset, daylight left and moon phase, worked out offline. Warns when the clock is wrong."},
	{ID: "sos", Name: "SOS Light", Icon: "siren", Group: "tool", Guest: true,
		Desc: "Full-screen flashlight, red night light, SOS strobe, Morse code flasher and a signal whistle."},
	{ID: "gps", Name: "GPS", Icon: "crosshair", Group: "hardware", Hardware: "USB GPS receiver",
		Desc: "Shows where you are on the map, records route trails and sets the clock from satellites."},
	{ID: "mesh", Name: "Mesh Radio", Icon: "radio-tower", Group: "hardware", Hardware: "Meshtastic LoRa radio (USB)",
		Desc: "Text messages with other Meshtastic radios miles away. No cell towers or internet."},
	{ID: "radio", Name: "Weather Radio", Icon: "radio", Group: "hardware", Hardware: "RTL-SDR USB dongle and an antenna",
		Desc: "Listen to NOAA weather radio, FM news, FRS/GMRS, CB and other channels through the Pi's speakers."},
	{ID: "weather", Name: "Barometer", Icon: "gauge", Group: "hardware", Hardware: "BME280 or BMP280 sensor on I2C",
		Desc: "Air pressure, temperature and humidity, with a warning when pressure falls fast before a storm."},
}

func builtinByID(id string) (ModuleDef, bool) {
	for _, m := range builtinModules {
		if m.ID == id {
			return m, true
		}
	}
	return ModuleDef{}, false
}

// Config is stored in data/config.json.
type Config struct {
	Modules     map[string]bool `json:"modules"`
	Household   int             `json:"household"`
	Units       string          `json:"units"`
	Home        *LatLon         `json:"home,omitempty"`
	AltitudeM   float64         `json:"altitudeM"`
	HotspotSSID string          `json:"hotspotSSID"`
	HotspotPass string          `json:"hotspotPass"`
}

type LatLon struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

type ConfigStore struct {
	path string
	mu   sync.Mutex
	c    Config
}

func NewConfigStore(path string) *ConfigStore {
	cs := &ConfigStore{path: path}
	cs.c = Config{Modules: map[string]bool{}, Household: 2, Units: "imperial"}
	if b, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(b, &cs.c)
	}
	if cs.c.Modules == nil {
		cs.c.Modules = map[string]bool{}
	}
	if cs.c.Household < 1 {
		cs.c.Household = 1
	}
	if cs.c.Units == "" {
		cs.c.Units = "imperial"
	}
	if cs.c.HotspotSSID == "" {
		cs.c.HotspotSSID = "ROUGE"
	}
	if cs.c.HotspotPass == "" {
		cs.c.HotspotPass = "rouge-" + newID()[14:20]
	}
	return cs
}

func (cs *ConfigStore) Get() Config {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	c := cs.c
	c.Modules = map[string]bool{}
	for k, v := range cs.c.Modules {
		c.Modules[k] = v
	}
	return c
}

// Enabled: modules default to on unless the installer or user turned them off.
func (cs *ConfigStore) Enabled(id string) bool {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	v, ok := cs.c.Modules[id]
	return !ok || v
}

func (cs *ConfigStore) Update(fn func(c *Config)) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	fn(&cs.c)
	b, err := json.MarshalIndent(cs.c, "", "  ")
	if err != nil {
		return err
	}
	tmp := cs.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, cs.path)
}

// ---------- custom (plugin) modules: data/modules/<id>/module.json ----------

type Plugin struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Desc    string `json:"desc"`
	Icon    string `json:"icon"`
	Version string `json:"version"`
	Entry   string `json:"entry"`
	Guest   bool   `json:"guest"`
}

var pluginIDRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,39}$`)

func (a *App) plugins() []Plugin {
	dirs, _ := os.ReadDir(filepath.Join(a.dataDir, "modules"))
	out := []Plugin{}
	for _, d := range dirs {
		if !d.IsDir() || !pluginIDRe.MatchString(d.Name()) {
			continue
		}
		if _, clash := builtinByID(d.Name()); clash {
			continue
		}
		b, err := os.ReadFile(filepath.Join(a.dataDir, "modules", d.Name(), "module.json"))
		if err != nil {
			continue
		}
		var p Plugin
		if json.Unmarshal(b, &p) != nil {
			continue
		}
		p.ID = d.Name()
		if p.Name == "" {
			p.Name = d.Name()
		}
		if p.Entry == "" || strings.Contains(p.Entry, "..") || strings.HasPrefix(p.Entry, "/") {
			p.Entry = "index.html"
		}
		if p.Icon == "" {
			p.Icon = "puzzle"
		}
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func (a *App) handlePluginFile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !pluginIDRe.MatchString(id) || !a.cfg.Enabled(id) {
		http.NotFound(w, r)
		return
	}
	if !isLocal(r) {
		ok := false
		for _, p := range a.plugins() {
			if p.ID == id && p.Guest {
				ok = true
			}
		}
		if !ok {
			writeErr(w, http.StatusForbidden, "only available on the device itself")
			return
		}
	}
	root := http.Dir(filepath.Join(a.dataDir, "modules", id))
	http.StripPrefix("/m/"+id, http.FileServer(root)).ServeHTTP(w, r)
}

// ---------- module status ----------

type ModuleInfo struct {
	ModuleDef
	Enabled bool   `json:"enabled"`
	Ready   bool   `json:"ready"`
	Need    string `json:"need,omitempty"`
}

const helperPath = "/usr/local/lib/rouge/rouge-helper"

func fileExists(p string) bool { _, err := os.Stat(p); return err == nil }
func hasCmd(name string) bool  { _, err := exec.LookPath(name); return err == nil }

// moduleReady says whether the software a module depends on is installed.
func (a *App) moduleReady(id string) (bool, string) {
	setup := "Run rouge-setup with internet and select it, to install what it needs."
	switch id {
	case "power", "share":
		if !fileExists(helperPath) {
			return false, setup
		}
		if id == "share" && !hasCmd("nmcli") {
			return false, "Needs NetworkManager (standard on Raspberry Pi OS Bookworm)."
		}
	case "gps":
		if !hasCmd("gpsd") && !fileExists("/usr/sbin/gpsd") {
			return false, setup
		}
	case "mesh":
		if !fileExists(meshPython) {
			return false, setup
		}
	case "radio":
		if !hasCmd("rtl_fm") || !hasCmd("aplay") {
			return false, setup
		}
	case "weather":
		if !fileExists("/dev/i2c-1") {
			return false, "I2C is off. Run rouge-setup and select Barometer, or turn on I2C in raspi-config."
		}
	}
	return true, ""
}

func (a *App) handleModules(w http.ResponseWriter, r *http.Request) {
	local := isLocal(r)
	mods := []ModuleInfo{}
	for _, m := range builtinModules {
		if !local && !m.Guest {
			continue
		}
		ready, need := a.moduleReady(m.ID)
		mods = append(mods, ModuleInfo{ModuleDef: m, Enabled: a.cfg.Enabled(m.ID), Ready: ready, Need: need})
	}
	type pinfo struct {
		Plugin
		Enabled bool `json:"enabled"`
	}
	pl := []pinfo{}
	for _, p := range a.plugins() {
		if !local && !p.Guest {
			continue
		}
		pl = append(pl, pinfo{p, a.cfg.Enabled(p.ID)})
	}
	writeJSON(w, http.StatusOK, map[string]any{"modules": mods, "plugins": pl, "guest": !local, "version": version})
}

func (a *App) handleModuleToggle(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	_, builtin := builtinByID(id)
	isPlugin := false
	for _, p := range a.plugins() {
		if p.ID == id {
			isPlugin = true
		}
	}
	if !builtin && !isPlugin {
		writeErr(w, http.StatusNotFound, "no such module")
		return
	}
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := a.cfg.Update(func(c *Config) { c.Modules[id] = body.Enabled }); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.startModules()
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// publicConfig hides the hotspot password from guests.
func (a *App) handleConfigGet(w http.ResponseWriter, r *http.Request) {
	c := a.cfg.Get()
	if !isLocal(r) {
		c.HotspotPass = ""
		c.Modules = nil
	}
	writeJSON(w, http.StatusOK, c)
}

func (a *App) handleConfigPut(w http.ResponseWriter, r *http.Request) {
	var in map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	var bad string
	err := a.cfg.Update(func(c *Config) {
		for k, v := range in {
			switch k {
			case "household":
				var n int
				if json.Unmarshal(v, &n) == nil && n >= 1 && n <= 100 {
					c.Household = n
				}
			case "units":
				var s string
				if json.Unmarshal(v, &s) == nil && (s == "imperial" || s == "metric") {
					c.Units = s
				}
			case "home":
				var ll *LatLon
				if json.Unmarshal(v, &ll) == nil && (ll == nil || (ll.Lat >= -90 && ll.Lat <= 90 && ll.Lon >= -180 && ll.Lon <= 180)) {
					c.Home = ll
				}
			case "altitudeM":
				var f float64
				if json.Unmarshal(v, &f) == nil && f > -500 && f < 9000 {
					c.AltitudeM = f
				}
			case "hotspotSSID":
				var s string
				if json.Unmarshal(v, &s) == nil && ssidRe.MatchString(s) {
					c.HotspotSSID = s
				} else {
					bad = "Network name: 1 to 32 letters, numbers, spaces, dots, dashes or underscores."
				}
			case "hotspotPass":
				var s string
				if json.Unmarshal(v, &s) == nil && passRe.MatchString(s) {
					c.HotspotPass = s
				} else {
					bad = "Password: 8 to 63 letters, numbers or simple symbols."
				}
			}
		}
	})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if bad != "" {
		writeErr(w, http.StatusBadRequest, bad)
		return
	}
	writeJSON(w, http.StatusOK, a.cfg.Get())
}

// ---------- local vs guest access ----------

// isLocal is true for requests from the Pi itself. Phones on the hotspot or
// the home network are guests and only get read-only, shareable features.
func isLocal(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return false
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (a *App) guard(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isLocal(r) || a.guestAllowed(r) {
			h.ServeHTTP(w, r)
			return
		}
		writeErr(w, http.StatusForbidden, "This is only available on the R.O.U.G.E device itself.")
	})
}

func (a *App) guestAllowed(r *http.Request) bool {
	p := r.URL.Path
	if !strings.HasPrefix(p, "/api/") {
		return true // web app, assets, books, map files, plugin files (checked separately)
	}
	if r.Method == http.MethodGet {
		switch {
		case p == "/api/status", p == "/api/library", p == "/api/suggest", p == "/api/maps",
			p == "/api/places", p == "/api/modules", p == "/api/config", p == "/api/pins":
			return true
		case p == "/api/guide":
			return a.cfg.Enabled("guide")
		case p == "/api/gps" || strings.HasPrefix(p, "/api/gps/tracks"):
			return a.cfg.Enabled("gps")
		case p == "/api/weather":
			return a.cfg.Enabled("weather")
		}
	}
	if p == "/api/board" && (r.Method == http.MethodGet || r.Method == http.MethodPost) {
		return a.cfg.Enabled("share")
	}
	return false
}

// requireModule returns 404 for a turned-off module's API.
func (a *App) requireModule(id string, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !a.cfg.Enabled(id) {
			writeErr(w, http.StatusNotFound, "module "+id+" is turned off (Settings → Modules)")
			return
		}
		h(w, r)
	}
}
