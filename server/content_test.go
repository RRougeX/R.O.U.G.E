package main

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestDownloadResumeAndLatest(t *testing.T) {
	payload := bytes.Repeat([]byte("ZIMDATA-"), 50000) // 400 KB
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/wikipedia/" {
			fmt.Fprint(w, `<a href="wikipedia_en_100_2026-07.zim">x</a> <a href="wikipedia_en_100_2026-08.zim">x</a> <a href="wikipedia_en_100_mini_2026-09.zim">x</a>`)
			return
		}
		if strings.HasSuffix(r.URL.Path, ".zim") {
			http.ServeContent(w, r, "f.zim", time.Now(), bytes.NewReader(payload))
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()
	old := kiwixBase
	kiwixBase = srv.URL + "/"
	defer func() { kiwixBase = old }()

	dir := t.TempDir()
	for _, d := range []string{"zim", "places", "maps"} {
		_ = os.MkdirAll(filepath.Join(dir, d), 0o755)
	}
	app := &App{dataDir: dir, kiwix: NewKiwix("/nonexistent", 0, filepath.Join(dir, "zim")), places: NewPlaces(filepath.Join(dir, "places"), filepath.Join(dir, "maps"))}
	c := &Content{app: app, wake: make(chan struct{}, 1), client: http.DefaultClient}
	app.content = c

	it, _ := catalogByID("wp-test")
	name, url, size, err := c.latestZim(it)
	if err != nil || name != "wikipedia_en_100_2026-08.zim" || size != int64(len(payload)) {
		t.Fatalf("latest: %q %d %v", name, size, err)
	}
	// a half-finished earlier download must be resumed, not restarted
	dest := filepath.Join(dir, "zim", name)
	if err := os.WriteFile(dest+".part", payload[:123456], 0o644); err != nil {
		t.Fatal(err)
	}
	j := &Job{}
	if err := c.fetch(context.Background(), j, url, dest, size); err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(dest)
	if !bytes.Equal(got, payload) || fileExists(dest+".part") {
		t.Fatalf("resumed file wrong: %d bytes", len(got))
	}
	if j.Done != int64(len(payload)) {
		t.Fatalf("progress %d", j.Done)
	}
	// queueing it again says it's already there
	if _, err := c.queueZim(it); err == nil || !strings.Contains(err.Error(), "already") {
		t.Fatalf("expected already-have error, got %v", err)
	}
}

func TestParseSizeAndNames(t *testing.T) {
	if n := parseSize("fetching 1234 tiles, archive size: 512.5 MB"); n != 512500000 {
		t.Fatalf("parseSize %d", n)
	}
	if s := safeName("New York / City!"); s != "New-York-City" {
		t.Fatalf("safeName %q", s)
	}
	if !deletableRe.MatchString("zim/a_2026-01.zim") || deletableRe.MatchString("zim/../config.json") || deletableRe.MatchString("notes/x.json") {
		t.Fatal("delete rules")
	}
	_ = strconv.Itoa
}
