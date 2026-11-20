package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"path/filepath"
	"strconv"
	"sync"
	"time"
)

// Radio plays an RTL-SDR channel through the Pi's speakers:
//   rtl_fm (tune + demodulate) | aplay (sound out)

type Radio struct {
	mu      sync.Mutex
	tuner   *exec.Cmd
	player  *exec.Cmd
	FreqMHz float64 `json:"freq"`
	Mode    string  `json:"mode"`
	Since   time.Time
	lastErr string
}

// demodulation settings: rtl_fm mode, sample rate, output rate
var radioModes = map[string][3]string{
	"nfm":  {"fm", "24000", "24000"}, // NOAA weather, FRS/GMRS, ham, marine
	"wbfm": {"wbfm", "", "32000"},    // FM broadcast stations
	"am":   {"am", "12000", "12000"}, // CB, aircraft
}

// dongleConnected looks for common RTL2832U USB ids without touching the device.
func dongleConnected() bool {
	ids := map[string]bool{"0bda:2838": true, "0bda:2832": true, "0bda:2834": true}
	devs, _ := filepath.Glob("/sys/bus/usb/devices/*")
	for _, d := range devs {
		if ids[readTrim(filepath.Join(d, "idVendor"))+":"+readTrim(filepath.Join(d, "idProduct"))] {
			return true
		}
	}
	return false
}

func (rd *Radio) stopLocked() {
	for _, c := range []*exec.Cmd{rd.tuner, rd.player} {
		if c != nil && c.Process != nil {
			_ = c.Process.Kill()
		}
	}
	rd.tuner, rd.player = nil, nil
}

func (rd *Radio) Stop() {
	rd.mu.Lock()
	rd.stopLocked()
	rd.mu.Unlock()
}

func (rd *Radio) Play(freq float64, mode string, gain string) error {
	m, ok := radioModes[mode]
	if !ok {
		return fmt.Errorf("unknown mode")
	}
	if freq < 24 || freq > 1766 {
		return fmt.Errorf("frequency must be 24 to 1766 MHz")
	}
	rd.mu.Lock()
	defer rd.mu.Unlock()
	rd.stopLocked()
	args := []string{"-f", strconv.FormatFloat(freq, 'f', 4, 64) + "M", "-M", m[0]}
	if m[1] != "" {
		args = append(args, "-s", m[1])
	}
	if mode == "wbfm" {
		args = append(args, "-r", m[2])
	} else {
		args = append(args, "-E", "deemp")
	}
	if g, err := strconv.ParseFloat(gain, 64); err == nil && g >= 0 && g <= 50 {
		args = append(args, "-g", strconv.FormatFloat(g, 'f', 1, 64))
	}
	args = append(args, "-")
	tuner := exec.Command("rtl_fm", args...)
	player := exec.Command("aplay", "-q", "-r", m[2], "-f", "S16_LE", "-t", "raw", "-c", "1")
	pipe, err := tuner.StdoutPipe()
	if err != nil {
		return err
	}
	player.Stdin = pipe
	errOut := &tailBuf{}
	tuner.Stderr = errOut
	if err := player.Start(); err != nil {
		return fmt.Errorf("aplay: %v", err)
	}
	if err := tuner.Start(); err != nil {
		_ = player.Process.Kill()
		return fmt.Errorf("rtl_fm: %v", err)
	}
	rd.tuner, rd.player, rd.FreqMHz, rd.Mode, rd.Since, rd.lastErr = tuner, player, freq, mode, time.Now(), ""
	go func(t, p *exec.Cmd) {
		_ = t.Wait()
		rd.mu.Lock()
		if rd.tuner == t { // stopped by itself, not by us
			rd.lastErr = errOut.String()
			if p.Process != nil {
				_ = p.Process.Kill()
			}
			rd.tuner, rd.player = nil, nil
		}
		rd.mu.Unlock()
		_ = p.Wait()
	}(tuner, player)
	return nil
}

type tailBuf struct {
	mu sync.Mutex
	b  []byte
}

func (t *tailBuf) Write(p []byte) (int, error) {
	t.mu.Lock()
	t.b = append(t.b, p...)
	if len(t.b) > 2000 {
		t.b = t.b[len(t.b)-2000:]
	}
	t.mu.Unlock()
	return len(p), nil
}
func (t *tailBuf) String() string { t.mu.Lock(); defer t.mu.Unlock(); return string(t.b) }

var _ io.Writer = (*tailBuf)(nil)

func (a *App) handleRadioGet(w http.ResponseWriter, r *http.Request) {
	rd := a.radio
	rd.mu.Lock()
	playing := rd.tuner != nil
	out := map[string]any{"installed": hasCmd("rtl_fm"), "dongle": dongleConnected(), "playing": playing,
		"freq": rd.FreqMHz, "mode": rd.Mode, "error": rd.lastErr}
	rd.mu.Unlock()
	writeJSON(w, http.StatusOK, out)
}

func (a *App) handleRadioPost(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Action string  `json:"action"`
		Freq   float64 `json:"freq"`
		Mode   string  `json:"mode"`
		Gain   string  `json:"gain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if in.Action == "stop" {
		a.radio.Stop()
	} else if err := a.radio.Play(in.Freq, in.Mode, in.Gain); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	a.handleRadioGet(w, r)
}
