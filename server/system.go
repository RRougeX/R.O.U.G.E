package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Root-only actions (power saver, radios, hotspot, clock, shutdown) go
// through a small helper script that sudo allows without a password. The
// helper accepts only a fixed list of actions with checked arguments.
func runHelper(args ...string) (string, error) {
	if !fileExists(helperPath) {
		return "", fmt.Errorf("system helper not installed; run rouge-setup")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "sudo", append([]string{"-n", helperPath}, args...)...)
	var out bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &out
	err := cmd.Run()
	s := strings.TrimSpace(out.String())
	if err != nil {
		if s == "" {
			s = err.Error()
		}
		return s, fmt.Errorf("%s", s)
	}
	return s, nil
}

var (
	ssidRe = regexp.MustCompile(`^[A-Za-z0-9 _.-]{1,32}$`)
	passRe = regexp.MustCompile(`^[A-Za-z0-9 _.!@#%^*+=-]{8,63}$`)
)

// ---------- power state (read without root) ----------

type PowerState struct {
	Governor    string `json:"governor"`
	PowerSave   bool   `json:"powerSave"`
	Wifi        *bool  `json:"wifi"`
	Bluetooth   *bool  `json:"bluetooth"`
	Brightness  *int   `json:"brightness"` // percent, nil when the screen has no backlight control
	HelperReady bool   `json:"helperReady"`
}

func readTrim(p string) string { b, _ := os.ReadFile(p); return strings.TrimSpace(string(b)) }

// rfkillOn reports whether any radio of the given type is unblocked.
func rfkillOn(kind string) *bool {
	dirs, _ := filepath.Glob("/sys/class/rfkill/rfkill*")
	var found, on bool
	for _, d := range dirs {
		if readTrim(filepath.Join(d, "type")) != kind {
			continue
		}
		found = true
		if readTrim(filepath.Join(d, "soft")) == "0" && readTrim(filepath.Join(d, "hard")) == "0" {
			on = true
		}
	}
	if !found {
		return nil
	}
	return &on
}

func backlightPercent() *int {
	dirs, _ := filepath.Glob("/sys/class/backlight/*")
	for _, d := range dirs {
		cur, e1 := strconv.Atoi(readTrim(filepath.Join(d, "brightness")))
		max, e2 := strconv.Atoi(readTrim(filepath.Join(d, "max_brightness")))
		if e1 == nil && e2 == nil && max > 0 {
			p := cur * 100 / max
			return &p
		}
	}
	return nil
}

func (a *App) powerState() PowerState {
	g := readTrim("/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor")
	return PowerState{
		Governor: g, PowerSave: g == "powersave",
		Wifi: rfkillOn("wlan"), Bluetooth: rfkillOn("bluetooth"),
		Brightness: backlightPercent(), HelperReady: fileExists(helperPath),
	}
}

// ---------- battery runs: how long each power-on lasted ----------

type Session struct {
	Start      time.Time `json:"start"`
	Last       time.Time `json:"last"`
	LowVoltage bool      `json:"lowVoltage"`
}

type Sessions struct {
	path string
	mu   sync.Mutex
	list []Session
}

func NewSessions(path string) *Sessions {
	s := &Sessions{path: path}
	if b, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(b, &s.list)
	}
	// a session starts at boot, not when this program restarts
	boot := bootTime()
	if n := len(s.list); n > 0 && boot.Sub(s.list[n-1].Start).Abs() < 2*time.Minute {
		return s
	}
	s.list = append(s.list, Session{Start: boot, Last: time.Now()})
	if len(s.list) > 60 {
		s.list = s.list[len(s.list)-60:]
	}
	s.save()
	return s
}

func bootTime() time.Time {
	f := strings.Fields(readTrim("/proc/uptime"))
	if len(f) > 0 {
		if up, err := strconv.ParseFloat(f[0], 64); err == nil {
			return time.Now().Add(-time.Duration(up * float64(time.Second))).Truncate(time.Second)
		}
	}
	return time.Now()
}

func (s *Sessions) save() {
	b, _ := json.MarshalIndent(s.list, "", " ")
	tmp := s.path + ".tmp"
	if os.WriteFile(tmp, b, 0o644) == nil {
		_ = os.Rename(tmp, s.path)
	}
}

func (s *Sessions) Run(ctx context.Context) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.mu.Lock()
			if n := len(s.list); n > 0 {
				s.list[n-1].Last = time.Now()
				if p := powerState(); p != nil && p.UnderVoltageNow {
					s.list[n-1].LowVoltage = true
				}
				s.save()
			}
			s.mu.Unlock()
		}
	}
}

func (s *Sessions) List() []Session {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := append([]Session(nil), s.list...)
	sort.Slice(out, func(i, j int) bool { return out[i].Start.After(out[j].Start) })
	return out
}

// ---------- handlers ----------

func (a *App) handlePowerGet(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"state": a.powerState(), "sessions": a.sessions.List(), "now": time.Now()})
}

func (a *App) handlePowerPost(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Action string `json:"action"` // powersave, wifi, bluetooth, brightness
		On     bool   `json:"on"`
		Value  int    `json:"value"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	onoff := map[bool]string{true: "on", false: "off"}[in.On]
	var err error
	switch in.Action {
	case "powersave", "wifi", "bluetooth":
		_, err = runHelper(in.Action, onoff)
	case "brightness":
		if in.Value < 5 || in.Value > 100 {
			writeErr(w, http.StatusBadRequest, "brightness must be 5 to 100")
			return
		}
		_, err = runHelper("brightness", strconv.Itoa(in.Value))
	default:
		writeErr(w, http.StatusBadRequest, "unknown action")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, a.powerState())
}

func (a *App) handleSystemAction(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Action string `json:"action"` // settime, shutdown, reboot
		Time   string `json:"time"`   // "2026-11-19 22:30:00" local time
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	var err error
	switch in.Action {
	case "settime":
		if _, perr := time.ParseInLocation("2006-01-02 15:04:05", in.Time, time.Local); perr != nil {
			writeErr(w, http.StatusBadRequest, "time must look like 2026-11-19 22:30:00")
			return
		}
		_, err = runHelper("settime", in.Time)
	case "shutdown", "reboot":
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		go func() { time.Sleep(time.Second); _, _ = runHelper(in.Action) }()
		return
	default:
		writeErr(w, http.StatusBadRequest, "unknown action")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "now": time.Now()})
}

// ---------- clock sanity ----------

var buildTime = "" // set at build time: -ldflags "-X main.buildTime=2026-11-19T00:00:00Z"

type clockCache struct {
	mu      sync.Mutex
	checked time.Time
	synced  *bool
}

var clockInfo clockCache

// clockSuspect is true when the clock is obviously behind: earlier than this
// program was built, or earlier than the newest note or pin. A Raspberry Pi 4
// has no clock battery, so with no internet the time resets after power loss.
func (a *App) clockSuspect() (bool, *bool) {
	now := time.Now()
	if t, err := time.Parse(time.RFC3339, buildTime); err == nil && now.Before(t.Add(-24*time.Hour)) {
		return true, a.ntpSynced()
	}
	var newest time.Time
	for _, d := range []string{"notes", "pins", "supplies"} {
		files, _ := filepath.Glob(filepath.Join(a.dataDir, d, "*.json"))
		for _, f := range files {
			if st, err := os.Stat(f); err == nil && st.ModTime().After(newest) {
				newest = st.ModTime()
			}
		}
	}
	if s := a.sessions.List(); len(s) > 1 && s[1].Last.After(newest) {
		newest = s[1].Last
	}
	return !newest.IsZero() && now.Before(newest.Add(-time.Hour)), a.ntpSynced()
}

func (a *App) ntpSynced() *bool {
	clockInfo.mu.Lock()
	defer clockInfo.mu.Unlock()
	if time.Since(clockInfo.checked) < time.Minute {
		return clockInfo.synced
	}
	clockInfo.checked = time.Now()
	clockInfo.synced = nil
	if out, err := exec.Command("timedatectl", "show", "-p", "NTPSynchronized", "--value").Output(); err == nil {
		v := strings.TrimSpace(string(out)) == "yes"
		clockInfo.synced = &v
	}
	return clockInfo.synced
}
