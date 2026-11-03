package main

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/egoist/mygo"
)

// RecentFile is a file that was open in a window and closed, as the light
// table's 水汽 and the quick open palette show it.
type RecentFile struct {
	Path string `json:"path"`
	// ClosedAt is when its window last closed, in Unix milliseconds.
	ClosedAt int64 `json:"closedAt"`
	// Progress is how far it was read when it closed, from 0 to 1.
	Progress float64 `json:"progress"`
	Pinned   bool    `json:"pinned"`
}

// RecentFiles tells every window the recent files, newest first,
// as they change. Files open in some window are left out.
var RecentFiles = mygo.NewEvent[[]RecentFile]("recent")

// recentStore keeps the RecentFiles table, keyed by path, in recent.json
// of the user data directory.
type recentStore struct {
	mu     sync.Mutex
	loaded bool
	files  map[string]RecentFile
}

func recentPath() (string, error) {
	dir, err := mygo.App.Path(mygo.PathUserData)
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "recent.json"), nil
}

// load reads the table once. The caller holds mu.
func (s *recentStore) load() {
	if s.loaded {
		return
	}
	s.loaded, s.files = true, map[string]RecentFile{}
	path, err := recentPath()
	if err != nil {
		return
	}
	if b, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(b, &s.files)
	}
	for p, f := range s.files {
		f.Path = p
		s.files[p] = f
	}
}

// save writes the table. The caller holds mu.
func (s *recentStore) save() error {
	path, err := recentPath()
	if err != nil {
		return err
	}
	b, err := json.MarshalIndent(s.files, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// sorted returns the table newest first, with at most keep unpinned files.
// The caller holds mu.
func (s *recentStore) sorted(keep int) []RecentFile {
	all := make([]RecentFile, 0, len(s.files))
	for _, f := range s.files {
		all = append(all, f)
	}
	slices.SortFunc(all, func(a, b RecentFile) int {
		return cmp.Or(cmp.Compare(b.ClosedAt, a.ClosedAt), strings.Compare(a.Path, b.Path))
	})
	n := 0
	return slices.DeleteFunc(all, func(f RecentFile) bool {
		if f.Pinned {
			return false
		}
		n++
		return n > keep
	})
}

// edit changes the table and saves it, dropping the unpinned files beyond
// keep.
func (s *recentStore) edit(keep int, fn func(files map[string]RecentFile)) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.load()
	fn(s.files)
	kept := map[string]RecentFile{}
	for _, f := range s.sorted(keep) {
		kept[f.Path] = f
	}
	s.files = kept
	return s.save()
}

func (s *recentStore) get(path string) (RecentFile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.load()
	f, ok := s.files[path]
	return f, ok
}

func (s *recentStore) list(keep int) []RecentFile {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.load()
	return s.sorted(keep)
}

// recentService records the files windows close with how far they were
// read, and lets pages list, pin and forget them.
type recentService struct {
	docs  *mygo.Documents[string]
	prefs *prefsStore
	store recentStore
	mu    sync.Mutex
	// read is how far each window's page has read its document.
	read map[int]float64
}

func (r *recentService) keep() int {
	p, _ := r.prefs.Get()
	return p.Keep
}

// List returns the recent files that no window shows, newest first.
func (r *recentService) List() []RecentFile {
	return r.closed(nil)
}

// closed lists the recent files that no window but gone shows.
func (r *recentService) closed(gone *mygo.Window) []RecentFile {
	open := map[string]bool{}
	for _, w := range mygo.Windows() {
		if d := r.docs.ForWindow(w); d != nil && w != gone {
			open[d.State().Path] = true
		}
	}
	return slices.DeleteFunc(r.store.list(r.keep()), func(f RecentFile) bool { return open[f.Path] })
}

// publish tells every window the recent files, as they are once gone has
// closed: the document windows and the welcome window list them.
func (r *recentService) publish(gone *mygo.Window) {
	files := r.closed(gone)
	for _, w := range mygo.Windows() {
		if w != gone {
			RecentFiles.Emit(w, files)
		}
	}
}

// Report keeps how far the calling window's page has read its document,
// from 0 to 1, for when the window closes.
func (r *recentService) Report(ctx context.Context, progress float64) {
	w := mygo.CallerWindow(ctx)
	if w == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.read == nil {
		r.read = map[int]float64{}
	}
	r.read[w.ID()] = clamp(progress, 0, 1)
}

// Resume returns how far the calling window's document was read when it
// last closed, 0 for a file it never showed.
func (r *recentService) Resume(ctx context.Context) float64 {
	d := r.docs.ForWindow(mygo.CallerWindow(ctx))
	if d == nil {
		return 0
	}
	f, _ := r.store.get(d.State().Path)
	return f.Progress
}

// closedWindow records the file win showed at path, which is "" for an
// untitled document, as closed now.
func (r *recentService) closedWindow(win *mygo.Window, path string) {
	r.mu.Lock()
	progress := r.read[win.ID()]
	delete(r.read, win.ID())
	r.mu.Unlock()
	if path == "" {
		return
	}
	now := time.Now().UnixMilli()
	_ = r.change(win, func(files map[string]RecentFile) {
		f := files[path]
		files[path] = RecentFile{Path: path, ClosedAt: now, Progress: progress, Pinned: f.Pinned}
	})
}

// change edits the recent files and tells the windows, as they are once
// gone has closed.
func (r *recentService) change(gone *mygo.Window, fn func(files map[string]RecentFile)) error {
	err := r.store.edit(r.keep(), fn)
	r.publish(gone)
	return err
}

// Pin keeps the recent file at path above the others, and past the limit
// of recent files, or lets it go back among them.
func (r *recentService) Pin(path string, pinned bool) error {
	return r.change(nil, func(files map[string]RecentFile) {
		if f, ok := files[path]; ok {
			f.Pinned = pinned
			files[path] = f
		}
	})
}

// Forget drops the file at path from the recent files.
func (r *recentService) Forget(path string) error {
	return r.change(nil, func(files map[string]RecentFile) { delete(files, path) })
}

// Clear forgets every recent file, the pinned ones too.
func (r *recentService) Clear() error {
	return r.change(nil, func(files map[string]RecentFile) { clear(files) })
}

// headBytes is how much of a closed file its sketch reads.
const headBytes = 3000

// Head returns the start of the recent file at path, for its sketch.
func (r *recentService) Head(path string) (string, error) {
	if _, ok := r.store.get(path); !ok {
		return "", fs.ErrNotExist
	}
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	b, err := io.ReadAll(io.LimitReader(f, headBytes))
	if err != nil {
		return "", err
	}
	for len(b) > 0 && !utf8.Valid(b) {
		b = b[:len(b)-1]
	}
	return string(b), nil
}

var errNotMarkdown = errors.New("not a Markdown file")
