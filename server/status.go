package main

import (
	"context"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type Status struct {
	Version   string   `json:"version"`
	Hostname  string   `json:"hostname"`
	Model     string   `json:"model"`
	Uptime    float64  `json:"uptime"`
	Load      float64  `json:"load"`
	CPUs      int      `json:"cpus"`
	TempC     *float64 `json:"tempC"`
	MemTotal  int64    `json:"memTotal"`
	MemAvail  int64    `json:"memAvail"`
	DiskTotal int64    `json:"diskTotal"`
	DiskFree  int64    `json:"diskFree"`
	DataDir   string   `json:"dataDir"`
	IPs       []string `json:"ips"`
	Power     *Power   `json:"power"`
	Library   int      `json:"library"`
	Kiwix     bool     `json:"kiwix"`
	Maps      int      `json:"maps"`
	Places    int      `json:"places"`
	Notes     int      `json:"notes"`
	Pins      int      `json:"pins"`
	Guest     bool     `json:"guest"`
	ClockOff  bool     `json:"clockSuspect"`
	NTPSynced *bool    `json:"ntpSynced"`
	Now       string   `json:"now"`
}

// Power reports the Pi firmware's under-voltage and throttling flags, which
// show whether the power bank is keeping up.
type Power struct {
	UnderVoltageNow  bool `json:"underVoltageNow"`
	ThrottledNow     bool `json:"throttledNow"`
	UnderVoltageEver bool `json:"underVoltageEver"`
	ThrottledEver    bool `json:"throttledEver"`
}

func readFirst(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(strings.TrimRight(string(b), "\x00"))
}

func meminfo() (total, avail int64) {
	b, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(b), "\n") {
		f := strings.Fields(line)
		if len(f) < 2 {
			continue
		}
		v, _ := strconv.ParseInt(f[1], 10, 64)
		switch f[0] {
		case "MemTotal:":
			total = v * 1024
		case "MemAvailable:":
			avail = v * 1024
		}
	}
	return
}

func localIPs() []string {
	out := []string{}
	addrs, _ := net.InterfaceAddrs()
	for _, a := range addrs {
		if n, ok := a.(*net.IPNet); ok && !n.IP.IsLoopback() && n.IP.To4() != nil {
			out = append(out, n.IP.String())
		}
	}
	return out
}

func powerState() *Power {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	b, err := exec.CommandContext(ctx, "vcgencmd", "get_throttled").Output()
	if err != nil {
		return nil
	}
	s := strings.TrimSpace(string(b)) // "throttled=0x50005"
	i := strings.Index(s, "0x")
	if i < 0 {
		return nil
	}
	v, err := strconv.ParseUint(s[i+2:], 16, 32)
	if err != nil {
		return nil
	}
	return &Power{UnderVoltageNow: v&0x1 != 0, ThrottledNow: v&0x4 != 0,
		UnderVoltageEver: v&0x10000 != 0, ThrottledEver: v&0x40000 != 0}
}

func countFiles(pattern string) int {
	m, _ := filepath.Glob(pattern)
	return len(m)
}

func (a *App) handleStatus(w http.ResponseWriter, r *http.Request) {
	s := Status{Version: version, DataDir: tildePath(a.dataDir), IPs: localIPs(), Power: powerState(), Guest: !isLocal(r)}
	s.ClockOff, s.NTPSynced = a.clockSuspect()
	s.Now = time.Now().Format(time.RFC3339)
	s.Hostname, _ = os.Hostname()
	s.Model = readFirst("/proc/device-tree/model")
	if f := strings.Fields(readFirst("/proc/uptime")); len(f) > 0 {
		s.Uptime, _ = strconv.ParseFloat(f[0], 64)
	}
	if f := strings.Fields(readFirst("/proc/loadavg")); len(f) > 0 {
		s.Load, _ = strconv.ParseFloat(f[0], 64)
	}
	s.CPUs = countFiles("/sys/devices/system/cpu/cpu[0-9]*")
	if t, err := strconv.ParseFloat(readFirst("/sys/class/thermal/thermal_zone0/temp"), 64); err == nil {
		c := t / 1000
		s.TempC = &c
	}
	s.MemTotal, s.MemAvail = meminfo()
	var fs syscall.Statfs_t
	if syscall.Statfs(a.dataDir, &fs) == nil {
		s.DiskTotal = int64(fs.Blocks) * int64(fs.Bsize)
		s.DiskFree = int64(fs.Bavail) * int64(fs.Bsize)
	}
	running, _, n := a.kiwix.State()
	s.Kiwix, s.Library = running, n
	if n == 0 {
		s.Library = countFiles(filepath.Join(a.dataDir, "zim", "*.zim"))
	}
	s.Maps = countFiles(filepath.Join(a.dataDir, "maps", "*.pmtiles"))
	s.Places = a.places.Count()
	s.Notes = countFiles(filepath.Join(a.dataDir, "notes", "*.json"))
	s.Pins = countFiles(filepath.Join(a.dataDir, "pins", "*.json"))
	writeJSON(w, http.StatusOK, s)
}

// tildePath shows the data folder as ~/rouge rather than /home/pi/rouge.
func tildePath(p string) string {
	if home, err := os.UserHomeDir(); err == nil && home != "/" && strings.HasPrefix(p, home+"/") {
		return "~" + strings.TrimPrefix(p, home)
	}
	return p
}
