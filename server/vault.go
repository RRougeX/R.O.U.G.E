package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Vault keeps documents encrypted with AES-256-GCM. A random master key
// encrypts the files; the password only unlocks (wraps) that key, so
// changing the password doesn't rewrite every file. Forgetting the password
// means the files cannot be recovered; that is the point.

const (
	vaultIter     = 600_000
	vaultMaxBytes = 60 << 20
	vaultIdle     = 15 * time.Minute
)

type vaultHeader struct {
	Salt    []byte `json:"salt"`
	Iter    int    `json:"iter"`
	Wrapped []byte `json:"wrapped"` // nonce + sealed master key
}

type VaultDoc struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Type  string `json:"type"`
	Size  int64  `json:"size"`
	Added string `json:"added"`
	Note  string `json:"note"`
}

type Vault struct {
	dir     string
	mu      sync.Mutex
	key     []byte
	touched time.Time
}

func NewVault(dir string) *Vault { return &Vault{dir: dir} }

func (v *Vault) headerPath() string { return filepath.Join(v.dir, "vault.json") }
func (v *Vault) isSet() bool        { return fileExists(v.headerPath()) }

func seal(key, plain []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, plain, nil), nil
}

func open(key, data []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(data) < gcm.NonceSize() {
		return nil, errors.New("damaged file")
	}
	return gcm.Open(nil, data[:gcm.NonceSize()], data[gcm.NonceSize():], nil)
}

func writeAtomic(path string, b []byte) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func deriveKEK(password string, salt []byte, iter int) ([]byte, error) {
	return pbkdf2.Key(sha256.New, password, salt, iter, 32)
}

func (v *Vault) Setup(password string) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.isSet() {
		return errors.New("the vault already has a password")
	}
	if len(password) < 6 {
		return errors.New("use at least 6 characters")
	}
	master := make([]byte, 32)
	salt := make([]byte, 16)
	_, _ = rand.Read(master)
	_, _ = rand.Read(salt)
	if err := v.writeHeader(password, salt, master); err != nil {
		return err
	}
	v.key, v.touched = master, time.Now()
	return v.saveIndex([]VaultDoc{})
}

func (v *Vault) writeHeader(password string, salt, master []byte) error {
	kek, err := deriveKEK(password, salt, vaultIter)
	if err != nil {
		return err
	}
	wrapped, err := seal(kek, master)
	if err != nil {
		return err
	}
	b, _ := json.Marshal(vaultHeader{Salt: salt, Iter: vaultIter, Wrapped: wrapped})
	return writeAtomic(v.headerPath(), b)
}

func (v *Vault) unwrap(password string) ([]byte, error) {
	b, err := os.ReadFile(v.headerPath())
	if err != nil {
		return nil, errors.New("no vault yet")
	}
	var h vaultHeader
	if err := json.Unmarshal(b, &h); err != nil {
		return nil, err
	}
	kek, err := deriveKEK(password, h.Salt, h.Iter)
	if err != nil {
		return nil, err
	}
	master, err := open(kek, h.Wrapped)
	if err != nil {
		return nil, errors.New("wrong password")
	}
	return master, nil
}

func (v *Vault) Unlock(password string) error {
	master, err := v.unwrap(password)
	if err != nil {
		return err
	}
	v.mu.Lock()
	v.key, v.touched = master, time.Now()
	v.mu.Unlock()
	return nil
}

func (v *Vault) ChangePassword(old, nw string) error {
	if len(nw) < 6 {
		return errors.New("use at least 6 characters")
	}
	master, err := v.unwrap(old)
	if err != nil {
		return err
	}
	salt := make([]byte, 16)
	_, _ = rand.Read(salt)
	v.mu.Lock()
	defer v.mu.Unlock()
	return v.writeHeader(nw, salt, master)
}

func (v *Vault) Lock() {
	v.mu.Lock()
	for i := range v.key {
		v.key[i] = 0
	}
	v.key = nil
	v.mu.Unlock()
}

// keyLocked returns the key if unlocked and not idle too long. Caller holds mu.
func (v *Vault) keyLocked() []byte {
	if v.key != nil && time.Since(v.touched) > vaultIdle {
		for i := range v.key {
			v.key[i] = 0
		}
		v.key = nil
	}
	if v.key != nil {
		v.touched = time.Now()
	}
	return v.key
}

func (v *Vault) loadIndex(key []byte) ([]VaultDoc, error) {
	b, err := os.ReadFile(filepath.Join(v.dir, "index.bin"))
	if errors.Is(err, os.ErrNotExist) {
		return []VaultDoc{}, nil
	}
	if err != nil {
		return nil, err
	}
	plain, err := open(key, b)
	if err != nil {
		return nil, err
	}
	var docs []VaultDoc
	err = json.Unmarshal(plain, &docs)
	return docs, err
}

func (v *Vault) saveIndex(docs []VaultDoc) error {
	plain, _ := json.Marshal(docs)
	sealed, err := seal(v.key, plain)
	if err != nil {
		return err
	}
	return writeAtomic(filepath.Join(v.dir, "index.bin"), sealed)
}

var errLocked = errors.New("locked")

// ---------- HTTP ----------

func (a *App) handleVaultState(w http.ResponseWriter, r *http.Request) {
	v := a.vault
	v.mu.Lock()
	unlocked := v.key != nil && time.Since(v.touched) <= vaultIdle // checking doesn't count as use
	v.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"set": v.isSet(), "unlocked": unlocked})
}

func (a *App) handleVaultAuth(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Action   string `json:"action"` // setup, unlock, lock, change
		Password string `json:"password"`
		New      string `json:"new"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	var err error
	switch in.Action {
	case "setup":
		err = a.vault.Setup(in.Password)
	case "unlock":
		err = a.vault.Unlock(in.Password)
	case "lock":
		a.vault.Lock()
	case "change":
		err = a.vault.ChangePassword(in.Password, in.New)
	default:
		err = errors.New("unknown action")
	}
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	a.handleVaultState(w, r)
}

func (a *App) withVault(w http.ResponseWriter, fn func(key []byte) error) {
	v := a.vault
	v.mu.Lock()
	defer v.mu.Unlock()
	key := v.keyLocked()
	if key == nil {
		writeErr(w, http.StatusUnauthorized, "The documents vault is locked.")
		return
	}
	if err := fn(key); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
	}
}

func (a *App) handleVaultList(w http.ResponseWriter, r *http.Request) {
	a.withVault(w, func(key []byte) error {
		docs, err := a.vault.loadIndex(key)
		if err != nil {
			return err
		}
		sort.Slice(docs, func(i, j int) bool { return docs[i].Added > docs[j].Added })
		writeJSON(w, http.StatusOK, docs)
		return nil
	})
}

func (a *App) handleVaultUpload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, vaultMaxBytes+1<<20)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		writeErr(w, http.StatusBadRequest, "File too big (limit 60 MB) or upload failed.")
		return
	}
	defer r.MultipartForm.RemoveAll()
	f, hdr, err := r.FormFile("file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, "no file")
		return
	}
	defer f.Close()
	data, err := io.ReadAll(f)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	name := filepath.Base(strings.ReplaceAll(hdr.Filename, "\\", "/"))
	ctype := hdr.Header.Get("Content-Type")
	if t := mime.TypeByExtension(strings.ToLower(filepath.Ext(name))); t != "" {
		ctype = t
	}
	if ctype == "" {
		ctype = http.DetectContentType(data)
	}
	a.withVault(w, func(key []byte) error {
		docs, err := a.vault.loadIndex(key)
		if err != nil {
			return err
		}
		doc := VaultDoc{ID: newID(), Name: name, Type: ctype, Size: int64(len(data)),
			Added: time.Now().UTC().Format(time.RFC3339), Note: strings.TrimSpace(r.FormValue("note"))}
		sealed, err := seal(key, data)
		if err != nil {
			return err
		}
		if err := writeAtomic(filepath.Join(a.vault.dir, doc.ID+".bin"), sealed); err != nil {
			return err
		}
		if err := a.vault.saveIndex(append(docs, doc)); err != nil {
			return err
		}
		writeJSON(w, http.StatusCreated, doc)
		return nil
	})
}

func (a *App) handleVaultFile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !idRe.MatchString(id) {
		writeErr(w, http.StatusBadRequest, "bad id")
		return
	}
	a.withVault(w, func(key []byte) error {
		docs, err := a.vault.loadIndex(key)
		if err != nil {
			return err
		}
		for i, d := range docs {
			if d.ID != id {
				continue
			}
			if r.Method == http.MethodDelete {
				_ = os.Remove(filepath.Join(a.vault.dir, id+".bin"))
				if err := a.vault.saveIndex(append(docs[:i], docs[i+1:]...)); err != nil {
					return err
				}
				writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
				return nil
			}
			b, err := os.ReadFile(filepath.Join(a.vault.dir, id+".bin"))
			if err != nil {
				return err
			}
			plain, err := open(key, b)
			if err != nil {
				return fmt.Errorf("could not decrypt %s", d.Name)
			}
			w.Header().Set("Content-Type", d.Type)
			w.Header().Set("Cache-Control", "no-store")
			disp := "inline"
			if r.URL.Query().Get("download") != "" {
				disp = "attachment"
			}
			w.Header().Set("Content-Disposition", mime.FormatMediaType(disp, map[string]string{"filename": d.Name}))
			w.Header().Set("X-Content-Type-Options", "nosniff")
			if !strings.HasPrefix(d.Type, "image/") || strings.Contains(d.Type, "svg") {
				if d.Type != "application/pdf" {
					// never run scripts from an uploaded HTML or SVG file
					w.Header().Set("Content-Security-Policy", "sandbox")
				}
			}
			_, _ = w.Write(plain)
			return nil
		}
		writeErr(w, http.StatusNotFound, "not found")
		return nil
	})
}
