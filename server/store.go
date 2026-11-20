package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"sync"
	"time"
)

// Store keeps a collection of small JSON documents, one file each, so a
// power cut can only ever lose the document being written.
type Store struct {
	dir string
	mu  sync.Mutex
}

func NewStore(dir string) *Store { return &Store{dir: dir} }

var idRe = regexp.MustCompile(`^[a-z0-9]{6,40}$`)

func newID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return time.Now().UTC().Format("20060102150405") + hex.EncodeToString(b)
}

func (s *Store) list() []map[string]any {
	files, _ := filepath.Glob(filepath.Join(s.dir, "*.json"))
	out := []map[string]any{}
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		var doc map[string]any
		if json.Unmarshal(b, &doc) == nil {
			out = append(out, doc)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		a, _ := out[i]["updated"].(string)
		b, _ := out[j]["updated"].(string)
		return a > b
	})
	return out
}

func (s *Store) save(doc map[string]any) error {
	id, _ := doc["id"].(string)
	b, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	tmp := filepath.Join(s.dir, "."+id+".tmp")
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(s.dir, id+".json")) // atomic replace
}

func readDoc(r *http.Request) (map[string]any, error) {
	var doc map[string]any
	err := json.NewDecoder(io.LimitReader(r.Body, 2<<20)).Decode(&doc)
	if doc == nil && err == nil {
		doc = map[string]any{}
	}
	return doc, err
}

func (s *Store) Mount(mux *http.ServeMux, prefix string) {
	mux.HandleFunc("GET "+prefix, func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		defer s.mu.Unlock()
		writeJSON(w, http.StatusOK, s.list())
	})
	mux.HandleFunc("POST "+prefix, func(w http.ResponseWriter, r *http.Request) {
		doc, err := readDoc(r)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		now := time.Now().UTC().Format(time.RFC3339)
		doc["id"], doc["created"], doc["updated"] = newID(), now, now
		s.mu.Lock()
		defer s.mu.Unlock()
		if err := s.save(doc); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusCreated, doc)
	})
	mux.HandleFunc("PUT "+prefix+"/{id}", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if !idRe.MatchString(id) {
			writeErr(w, http.StatusBadRequest, "bad id")
			return
		}
		doc, err := readDoc(r)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		created := time.Now().UTC().Format(time.RFC3339)
		if b, err := os.ReadFile(filepath.Join(s.dir, id+".json")); err == nil {
			var old map[string]any
			if json.Unmarshal(b, &old) == nil {
				if c, ok := old["created"].(string); ok {
					created = c
				}
			}
		}
		doc["id"], doc["created"], doc["updated"] = id, created, time.Now().UTC().Format(time.RFC3339)
		if err := s.save(doc); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, doc)
	})
	mux.HandleFunc("DELETE "+prefix+"/{id}", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if !idRe.MatchString(id) {
			writeErr(w, http.StatusBadRequest, "bad id")
			return
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		_ = os.Remove(filepath.Join(s.dir, id+".json"))
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
}
