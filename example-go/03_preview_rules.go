// ─── Ajánlott VSCode beállítások ehhez a fájlhoz ────────────────────────────
//
//  "goPreview.openByDefault": true,
//  "goPreview.rules.previewRules": {
//    "protect":   ["panic\\("],
//    "highlight": ["TODO|FIXME|HACK"],
//    "hide":      ["//\\s*nolint", "^\\s*//\\s*lint-disable"],
//    "fade":      ["(err != nil)", "(err)"]
//  }
//
// Mit néz az extension (prioritás-sorrendben):
//  1. protect  → a sor SOHA nem érinti más szabály (pl. panic sorai)
//  2. highlight→ TODO/FIXME/HACK sorok kiemelve (capture group → csak az egyezik)
//  3. hide     → nolint kommentek eltűnnek a preview-ból
//  4. fade     → az "(err)" capture group elhalványodik, látszik de nem zavar
//
// Változtasd a mintákat és nézd, hogyan reagál a preview élőben.
// ─────────────────────────────────────────────────────────────────────────────

package example

import (
	"errors"
	"fmt"
	"io"
	"os"
)

// FileProcessor reads, transforms, and writes files.
type FileProcessor struct {
	src  string
	dst  string
	size int64
}

// NewFileProcessor creates a FileProcessor for the given source/destination paths.
func NewFileProcessor(src, dst string) *FileProcessor {
	return &FileProcessor{src: src, dst: dst}
}

// Process copies src to dst, returning the number of bytes written.
// TODO: add checksum verification after copy
func (fp *FileProcessor) Process() (int64, error) {
	in, err := os.Open(fp.src)
	if err != nil {
		return 0, fmt.Errorf("open src: %w", err)
	}
	defer in.Close()

	out, err := os.Create(fp.dst)
	if err != nil { //nolint:errcheck
		return 0, fmt.Errorf("create dst: %w", err)
	}
	defer out.Close()

	n, err := io.Copy(out, in)
	if err != nil {
		return n, fmt.Errorf("copy: %w", err)
	}

	fp.size = n
	return n, nil
}

// Validate checks that src exists and dst's directory is writable.
// FIXME: does not handle symlinks correctly
func (fp *FileProcessor) Validate() error {
	if _, err := os.Stat(fp.src); err != nil {
		return fmt.Errorf("src not accessible: %w", err)
	}

	dir := fp.dst[:len(fp.dst)-len("/"+fp.dst)]
	if dir == "" {
		dir = "."
	}
	info, err := os.Stat(dir)
	if err != nil {
		return fmt.Errorf("dst dir not accessible: %w", err)
	}
	if !info.IsDir() {
		return errors.New("dst parent is not a directory")
	}
	return nil
}

// Size returns the number of bytes written in the last Process call.
// Returns 0 if Process has not been called yet.
func (fp *FileProcessor) Size() int64 {
	return fp.size
}

// safeRemove deletes path, ignoring "not found" errors.
// HACK: os.Remove is not atomic on all platforms; this may leave partial state.
func safeRemove(path string) error {
	err := os.Remove(path)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove %q: %w", path, err)
	}
	return nil
}

// mustCreateTemp panics if a temp file cannot be created.
// protect rule: a panic sorok mindig látszanak a preview-ban.
func mustCreateTemp(pattern string) *os.File {
	f, err := os.CreateTemp("", pattern)
	if err != nil {
		panic(fmt.Sprintf("mustCreateTemp: %v", err))
	}
	return f
}

// ErrPermission is returned when the caller lacks write access.
var ErrPermission = errors.New("permission denied")

// writeAtomic writes data to path using a temp file + rename for atomicity.
// lint-disable next-line
func writeAtomic(path string, data []byte) error {
	tmp := mustCreateTemp("atomic-*")
	_, err := tmp.Write(data)
	if err != nil {
		_ = safeRemove(tmp.Name())
		return fmt.Errorf("write temp: %w", err)
	}
	if err = tmp.Close(); err != nil {
		return fmt.Errorf("close temp: %w", err)
	}
	if err = os.Rename(tmp.Name(), path); err != nil {
		_ = safeRemove(tmp.Name())
		return fmt.Errorf("rename: %w", err)
	}
	return nil
}
