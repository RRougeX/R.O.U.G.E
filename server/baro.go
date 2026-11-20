package main

import (
	"bufio"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"sync"
	"syscall"
	"time"
)

// Barometer: Bosch BME280 (pressure, temperature, humidity) or BMP280
// (pressure, temperature) on the Pi's I2C bus, at address 0x76 or 0x77.
// Compensation formulas are the floating-point versions from the Bosch datasheets.

type bmeCal struct {
	T1          uint16
	T2, T3      int16
	P1          uint16
	P2, P3, P4  int16
	P5, P6, P7  int16
	P8, P9      int16
	H1, H3      uint8
	H2, H4, H5  int16
	H6          int8
	hasHumidity bool
}

// compensate returns °C, pascals and %RH (humidity is NaN without a BME280).
func (c *bmeCal) compensate(adcT, adcP, adcH int32) (float64, float64, float64) {
	v1 := (float64(adcT)/16384.0 - float64(c.T1)/1024.0) * float64(c.T2)
	v2 := (float64(adcT)/131072.0 - float64(c.T1)/8192.0)
	v2 = v2 * v2 * float64(c.T3)
	tFine := v1 + v2
	temp := tFine / 5120.0

	var p float64
	v1 = tFine/2.0 - 64000.0
	v2 = v1 * v1 * float64(c.P6) / 32768.0
	v2 = v2 + v1*float64(c.P5)*2.0
	v2 = v2/4.0 + float64(c.P4)*65536.0
	v1 = (float64(c.P3)*v1*v1/524288.0 + float64(c.P2)*v1) / 524288.0
	v1 = (1.0 + v1/32768.0) * float64(c.P1)
	if v1 != 0 {
		p = 1048576.0 - float64(adcP)
		p = (p - v2/4096.0) * 6250.0 / v1
		v1 = float64(c.P9) * p * p / 2147483648.0
		v2 = p * float64(c.P8) / 32768.0
		p = p + (v1+v2+float64(c.P7))/16.0
	}

	hum := math.NaN()
	if c.hasHumidity {
		h := tFine - 76800.0
		h = (float64(adcH) - (float64(c.H4)*64.0 + float64(c.H5)/16384.0*h)) *
			(float64(c.H2) / 65536.0 * (1.0 + float64(c.H6)/67108864.0*h*(1.0+float64(c.H3)/67108864.0*h)))
		h = h * (1.0 - float64(c.H1)*h/524288.0)
		hum = math.Max(0, math.Min(100, h))
	}
	return temp, p, hum
}

func parseCal(a []byte, h []byte, h1 byte, humidity bool) bmeCal {
	le16 := func(i int) uint16 { return binary.LittleEndian.Uint16(a[i:]) }
	c := bmeCal{
		T1: le16(0), T2: int16(le16(2)), T3: int16(le16(4)),
		P1: le16(6), P2: int16(le16(8)), P3: int16(le16(10)), P4: int16(le16(12)),
		P5: int16(le16(14)), P6: int16(le16(16)), P7: int16(le16(18)), P8: int16(le16(20)), P9: int16(le16(22)),
		hasHumidity: humidity,
	}
	if humidity && len(h) >= 7 {
		c.H1 = h1
		c.H2 = int16(binary.LittleEndian.Uint16(h[0:]))
		c.H3 = h[2]
		c.H4 = int16(int8(h[3]))<<4 | int16(h[4]&0x0F)
		c.H5 = int16(int8(h[5]))<<4 | int16(h[4]>>4)
		c.H6 = int8(h[6])
	}
	return c
}

// ---------- I2C ----------

const i2cSlave = 0x0703

type i2cDev struct{ f *os.File }

func openI2C(bus string, addr int) (*i2cDev, error) {
	f, err := os.OpenFile(bus, os.O_RDWR, 0)
	if err != nil {
		return nil, err
	}
	if _, _, e := syscall.Syscall(syscall.SYS_IOCTL, f.Fd(), i2cSlave, uintptr(addr)); e != 0 {
		f.Close()
		return nil, e
	}
	return &i2cDev{f}, nil
}

func (d *i2cDev) read(reg byte, n int) ([]byte, error) {
	if _, err := d.f.Write([]byte{reg}); err != nil {
		return nil, err
	}
	b := make([]byte, n)
	_, err := d.f.Read(b)
	return b, err
}

func (d *i2cDev) write(reg, val byte) error { _, err := d.f.Write([]byte{reg, val}); return err }

type Sensor struct {
	dev   *i2cDev
	cal   bmeCal
	model string
}

func findSensor() (*Sensor, error) {
	var lastErr error = fmt.Errorf("no sensor found at 0x76 or 0x77")
	for _, addr := range []int{0x76, 0x77} {
		d, err := openI2C("/dev/i2c-1", addr)
		if err != nil {
			return nil, fmt.Errorf("I2C not available: %v", err)
		}
		id, err := d.read(0xD0, 1)
		if err != nil || (id[0] != 0x60 && id[0] != 0x58) {
			d.f.Close()
			if err != nil {
				lastErr = fmt.Errorf("no sensor found at 0x76 or 0x77")
			}
			continue
		}
		hum := id[0] == 0x60
		a, err := d.read(0x88, 24)
		if err != nil {
			d.f.Close()
			return nil, err
		}
		var h []byte
		var h1 byte
		if hum {
			b, e1 := d.read(0xA1, 1)
			h, err = d.read(0xE1, 7)
			if e1 != nil || err != nil {
				d.f.Close()
				return nil, fmt.Errorf("reading calibration failed")
			}
			h1 = b[0]
		}
		model := "BMP280"
		if hum {
			model = "BME280"
		}
		return &Sensor{dev: d, cal: parseCal(a, h, h1, hum), model: model}, nil
	}
	return nil, lastErr
}

// Read takes one measurement in forced mode (the sensor sleeps in between).
func (s *Sensor) Read() (Reading, error) {
	if s.cal.hasHumidity {
		if err := s.dev.write(0xF2, 0x01); err != nil { // humidity x1
			return Reading{}, err
		}
	}
	if err := s.dev.write(0xF4, 0x25); err != nil { // temp x1, pressure x1, forced
		return Reading{}, err
	}
	time.Sleep(50 * time.Millisecond)
	n := 6
	if s.cal.hasHumidity {
		n = 8
	}
	b, err := s.dev.read(0xF7, n)
	if err != nil {
		return Reading{}, err
	}
	adcP := int32(b[0])<<12 | int32(b[1])<<4 | int32(b[2])>>4
	adcT := int32(b[3])<<12 | int32(b[4])<<4 | int32(b[5])>>4
	var adcH int32
	if n == 8 {
		adcH = int32(b[6])<<8 | int32(b[7])
	}
	t, p, h := s.cal.compensate(adcT, adcP, adcH)
	rd := Reading{Time: time.Now().UTC().Format(time.RFC3339), TempC: round1(t), HPa: round2(p / 100)}
	if !math.IsNaN(h) {
		v := round1(h)
		rd.Humidity = &v
	}
	return rd, nil
}

func round1(f float64) float64 { return math.Round(f*10) / 10 }
func round2(f float64) float64 { return math.Round(f*100) / 100 }

// ---------- logging and trend ----------

type Reading struct {
	Time     string   `json:"t"`
	TempC    float64  `json:"tempC"`
	HPa      float64  `json:"hPa"`
	Humidity *float64 `json:"hum,omitempty"`
}

type Weather struct {
	path   string
	mu     sync.Mutex
	model  string
	err    string
	now    *Reading
	log    []Reading
	cancel context.CancelFunc
}

func NewWeather(path string) *Weather {
	w := &Weather{path: path}
	if f, err := os.Open(path); err == nil {
		sc := bufio.NewScanner(f)
		for sc.Scan() {
			var r Reading
			if json.Unmarshal(sc.Bytes(), &r) == nil {
				w.log = append(w.log, r)
			}
		}
		f.Close()
	}
	return w
}

func (w *Weather) Start() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.cancel != nil {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	w.cancel = cancel
	go w.loop(ctx)
}

func (w *Weather) Stop() {
	w.mu.Lock()
	if w.cancel != nil {
		w.cancel()
		w.cancel = nil
	}
	w.mu.Unlock()
}

func (w *Weather) loop(ctx context.Context) {
	var s *Sensor
	lastLog := time.Time{}
	for {
		if s == nil {
			var err error
			s, err = findSensor()
			w.mu.Lock()
			if err != nil {
				w.err, w.model, w.now = err.Error(), "", nil
			} else {
				w.err, w.model = "", s.model
			}
			w.mu.Unlock()
		}
		if s != nil {
			rd, err := s.Read()
			w.mu.Lock()
			if err != nil {
				w.err = "sensor stopped responding: " + err.Error()
				s.dev.f.Close()
				s = nil
			} else {
				w.now = &rd
				if time.Since(lastLog) >= 10*time.Minute {
					lastLog = time.Now()
					w.appendLocked(rd)
				}
			}
			w.mu.Unlock()
		}
		select {
		case <-ctx.Done():
			if s != nil {
				s.dev.f.Close()
			}
			return
		case <-time.After(time.Minute):
		}
	}
}

// appendLocked keeps 7 days of 10-minute readings.
func (w *Weather) appendLocked(r Reading) {
	w.log = append(w.log, r)
	cut := time.Now().Add(-7 * 24 * time.Hour)
	i := 0
	for i < len(w.log) {
		if t, err := time.Parse(time.RFC3339, w.log[i].Time); err == nil && t.After(cut) {
			break
		}
		i++
	}
	rewrite := i > 0
	w.log = w.log[i:]
	if rewrite {
		f, err := os.Create(w.path + ".tmp")
		if err == nil {
			enc := json.NewEncoder(f)
			for _, r := range w.log {
				_ = enc.Encode(r)
			}
			f.Close()
			_ = os.Rename(w.path+".tmp", w.path)
		}
		return
	}
	if f, err := os.OpenFile(w.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644); err == nil {
		_ = json.NewEncoder(f).Encode(r)
		f.Close()
	}
}

// pressureTrend: change in hPa over the last 3 hours, and a plain-language outlook.
// Rules of thumb used by weather observers: a fall of 3+ hPa in 3 h means
// worsening weather; 6+ hPa means a storm is likely.
func pressureTrend(log []Reading, now Reading) (float64, string, bool) {
	nt, err := time.Parse(time.RFC3339, now.Time)
	if err != nil {
		return 0, "", false
	}
	var ref *Reading
	for i := len(log) - 1; i >= 0; i-- {
		t, err := time.Parse(time.RFC3339, log[i].Time)
		if err != nil {
			continue
		}
		age := nt.Sub(t)
		if age >= 170*time.Minute && age <= 200*time.Minute {
			ref = &log[i]
			break
		}
		if age > 200*time.Minute {
			break
		}
	}
	if ref == nil {
		return 0, "Collecting readings: the 3-hour trend appears after about 3 hours.", false
	}
	d := round1(now.HPa - ref.HPa)
	switch {
	case d <= -6:
		return d, "Pressure is falling fast. A storm or strong wind is likely within hours.", true
	case d <= -3:
		return d, "Pressure is falling. Weather is likely to get worse.", true
	case d <= -1:
		return d, "Pressure is falling slowly. Clouds or rain may be on the way.", true
	case d >= 3:
		return d, "Pressure is rising quickly. Clearing, but it may be windy.", true
	case d >= 1:
		return d, "Pressure is rising. Weather is likely to improve.", true
	default:
		return d, "Pressure is steady. No big change expected soon.", true
	}
}

func seaLevel(hPa, tempC, altM float64) float64 {
	if altM == 0 {
		return hPa
	}
	return round1(hPa * math.Pow(1-0.0065*altM/(tempC+0.0065*altM+273.15), -5.257))
}

func (a *App) handleWeather(w http.ResponseWriter, r *http.Request) {
	wx := a.weather
	wx.mu.Lock()
	defer wx.mu.Unlock()
	errText := wx.err
	if wx.now == nil && errText == "" && !fileExists("/dev/i2c-1") {
		errText = "I2C is turned off on this Pi. Run rouge-setup and select Barometer (it turns I2C on), then restart."
	}
	out := map[string]any{"sensor": wx.model, "error": errText, "now": wx.now}
	if wx.now != nil {
		d, text, ok := pressureTrend(wx.log, *wx.now)
		out["trend"], out["outlook"], out["trendReady"] = d, text, ok
		out["seaLevel"] = seaLevel(wx.now.HPa, wx.now.TempC, a.cfg.Get().AltitudeM)
	}
	cut := time.Now().Add(-48 * time.Hour)
	hist := []Reading{}
	for _, rd := range wx.log {
		if t, err := time.Parse(time.RFC3339, rd.Time); err == nil && t.After(cut) {
			hist = append(hist, rd)
		}
	}
	out["history"] = hist
	writeJSON(w, http.StatusOK, out)
}
