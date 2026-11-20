package main

import (
	"math"
	"net/http/httptest"
	"testing"
	"time"
)

// Worked example from the Bosch BMP280 datasheet (section 3.12).
func TestCompensateDatasheet(t *testing.T) {
	c := bmeCal{T1: 27504, T2: 26435, T3: -1000,
		P1: 36477, P2: -10685, P3: 3024, P4: 2855, P5: 140, P6: -7, P7: 15500, P8: -14600, P9: 6000}
	temp, p, h := c.compensate(519888, 415148, 0)
	if math.Abs(temp-25.08) > 0.01 {
		t.Fatalf("temperature %.3f, want 25.08", temp)
	}
	if math.Abs(p-100653.27) > 0.5 {
		t.Fatalf("pressure %.2f Pa, want 100653.27", p)
	}
	if !math.IsNaN(h) {
		t.Fatalf("BMP280 has no humidity, got %v", h)
	}
}

func TestPressureTrend(t *testing.T) {
	now := time.Date(2026, 11, 19, 12, 0, 0, 0, time.UTC)
	log := []Reading{}
	for i := 24; i >= 1; i-- { // every 10 minutes for 4 hours, falling 0.25 hPa each step
		log = append(log, Reading{Time: now.Add(-time.Duration(i) * 10 * time.Minute).Format(time.RFC3339), HPa: 1010 - float64(24-i)*0.25})
	}
	cur := Reading{Time: now.Format(time.RFC3339), HPa: 1010 - 24*0.25}
	d, text, ok := pressureTrend(log, cur)
	if !ok || d > -4 || d < -5 {
		t.Fatalf("trend %v %q", d, text)
	}
	if _, _, ok := pressureTrend(log[20:], cur); ok {
		t.Fatal("should need 3 hours of readings")
	}
}

func TestHaversine(t *testing.T) {
	// New York City Hall to Philadelphia City Hall is about 130 km
	d := haversine(40.7128, -74.0060, 39.9526, -75.1652)
	if d < 125000 || d > 135000 {
		t.Fatalf("distance %.0f m", d)
	}
}

func TestVaultRoundTrip(t *testing.T) {
	v := NewVault(t.TempDir())
	if err := v.Setup("correct horse"); err != nil {
		t.Fatal(err)
	}
	v.mu.Lock()
	docs := []VaultDoc{{ID: "abc123def", Name: "id.pdf"}}
	if err := v.saveIndex(docs); err != nil {
		t.Fatal(err)
	}
	v.mu.Unlock()
	v.Lock()
	if err := v.Unlock("wrong password"); err == nil {
		t.Fatal("wrong password accepted")
	}
	if err := v.ChangePassword("correct horse", "battery staple"); err != nil {
		t.Fatal(err)
	}
	if err := v.Unlock("battery staple"); err != nil {
		t.Fatal(err)
	}
	got, err := v.loadIndex(v.key)
	if err != nil || len(got) != 1 || got[0].Name != "id.pdf" {
		t.Fatalf("index after password change: %v %v", got, err)
	}
}

func TestIsLocal(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "127.0.0.1:5555"
	if !isLocal(r) {
		t.Fatal("loopback should be local")
	}
	r.RemoteAddr = "10.42.0.23:5555"
	if isLocal(r) {
		t.Fatal("hotspot phone must be a guest")
	}
	r.RemoteAddr = "[::1]:5555"
	if !isLocal(r) {
		t.Fatal("ipv6 loopback should be local")
	}
}
