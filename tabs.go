package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/egoist/mygo"
)

// FileTab is one document of a window's tab group, as that group's dock
// shows it.
type FileTab struct {
	// ID is the ID of the document's window.
	ID   int    `json:"id"`
	Name string `json:"name"`
	// Path is the document's file, "" while it is untitled.
	Path   string `json:"path"`
	Edited bool   `json:"edited"`
	// Untitled reports that the document has no file yet.
	Untitled bool `json:"untitled"`
	// Current reports that the tab is the one the receiving page shows.
	Current bool `json:"current"`
}

// Files tells each page of a tab group what the group's dock shows, as it
// changes.
var Files = mygo.NewEvent[[]FileTab]("files")

// filesService lets a page list, switch to, open and close the documents
// of its window's tab group. Document windows are tabs of one native
// window, whose own tab bar is hidden: the page draws the dock instead.
type filesService struct {
	docs   *mygo.Documents[string]
	recent *recentService

	mu sync.Mutex
	// unlisted holds the tabs the rest of their group does not list: one
	// joining, created hidden until its page drew, and one leaving, whose
	// page goes up as vapor before it closes. The tab shown in a leaving
	// one's place learns of it while still in the background.
	unlisted map[*mygo.Window]listing
}

type listing int

const (
	joining listing = iota + 1
	leaving
)

// List returns the documents of the calling window's tab group, in tab
// order.
func (s *filesService) List(ctx context.Context) []FileTab {
	return s.tabs(mygo.CallerWindow(ctx))
}

// Select shows the document of the tab group's window id.
func (s *filesService) Select(ctx context.Context, id int) error {
	w, err := s.member(ctx, id)
	if err == nil {
		selectTab(w)
	}
	return err
}

// Close closes the document of the tab group's window id, which asks to
// save it first when it must: on its own tab, where the sheet shows.
func (s *filesService) Close(ctx context.Context, id int) error {
	w, err := s.member(ctx, id)
	if err != nil {
		return err
	}
	if d := s.docs.ForWindow(w); d != nil && d.IsEdited() {
		selectTab(w)
	}
	w.Close()
	return nil
}

// Shown shows the calling window once its page drew: a tab that joins a
// group waits for it, so it never shows a page still loading.
func (s *filesService) Shown(ctx context.Context) {
	s.show(mygo.CallerWindow(ctx))
}

// show shows win as the selected tab of its group, once, if it waits to.
func (s *filesService) show(win *mygo.Window) {
	if !s.joined(win) {
		return
	}
	hideTabBar(win)
	selectTab(win)
	s.refresh()
}

// Leave takes the calling window's tab off its group's list, as its page
// starts to close it.
func (s *filesService) Leave(ctx context.Context) {
	s.setListing(mygo.CallerWindow(ctx), leaving)
	s.refresh()
}

// joined ends win's wait to join its group, reporting whether it waited.
func (s *filesService) joined(win *mygo.Window) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	waited := s.unlisted[win] == joining
	if waited {
		delete(s.unlisted, win)
	}
	return waited
}

func (s *filesService) setListing(win *mygo.Window, l listing) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.unlisted == nil {
		s.unlisted = map[*mygo.Window]listing{}
	}
	if l == 0 {
		delete(s.unlisted, win)
	} else {
		s.unlisted[win] = l
	}
}

func (s *filesService) listed(win *mygo.Window) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.unlisted[win] == 0
}

// New opens an untitled document, as a tab of the focused group.
func (s *filesService) New() {
	s.docs.New()
}

// Content returns the text of the document of the tab group's window id.
func (s *filesService) Content(ctx context.Context, id int) (string, error) {
	w, err := s.member(ctx, id)
	if err != nil {
		return "", err
	}
	d := s.docs.ForWindow(w)
	if d == nil {
		return "", errNoFile
	}
	return d.Content(), nil
}

var errNoFile = errors.New("the window's tab group has no such file")

func (s *filesService) member(ctx context.Context, id int) (*mygo.Window, error) {
	for _, w := range tabGroup(mygo.CallerWindow(ctx)) {
		if w.ID() == id {
			return w, nil
		}
	}
	return nil, errNoFile
}

func (s *filesService) tabs(win *mygo.Window) []FileTab {
	tabs := []FileTab{}
	for _, w := range tabGroup(win) {
		d := s.docs.ForWindow(w)
		if d == nil || w != win && !s.listed(w) {
			continue
		}
		st := d.State()
		tabs = append(tabs, FileTab{ID: w.ID(), Name: st.Name, Edited: st.Edited, Path: st.Path, Untitled: st.Path == "", Current: w == win})
	}
	return tabs
}

// refresh sends every document window the list of its tab group.
func (s *filesService) refresh() {
	for _, w := range mygo.Windows() {
		if s.docs.ForWindow(w) != nil {
			Files.Emit(w, s.tabs(w))
		}
	}
}

// host is the document window whose tab group a new document window
// joins: the focused one, or else the newest visible one.
func (s *filesService) host() *mygo.Window {
	if w := mygo.FocusedWindow(); w != nil && s.docs.ForWindow(w) != nil {
		return w
	}
	all := mygo.Windows()
	for i := len(all) - 1; i >= 0; i-- {
		if all[i].IsVisible() && s.docs.ForWindow(all[i]) != nil {
			return all[i]
		}
	}
	return nil
}

// adopt makes win, which shows doc, a tab of host's group, and keeps the
// group's docks and the recent files up to date. A win that waits to show
// stays off the group's list until its page drew. Its first list goes out
// once mygo attached doc to win and told its state.
func (s *filesService) adopt(win, host *mygo.Window, doc *mygo.Document[string], waits bool) {
	if waits {
		s.setListing(win, joining)
		// A page that fails before it draws still shows, for the user to close.
		time.AfterFunc(2*time.Second, func() { s.show(win) })
	}
	joinTabGroup(win, host)
	// The window outlives the document's state: mygo detaches it first.
	path := ""
	doc.OnStateChange(func(st mygo.DocumentState) {
		if st.Path != path {
			path = st.Path
			s.recent.publish(nil)
		}
		s.refresh()
	})
	win.OnClosed(func() {
		s.setListing(win, 0)
		s.recent.closedWindow(win, path)
		s.refresh()
	})
}

// Open opens the Markdown file at path as a tab of the focused group, or
// shows it where it is open already.
func (s *filesService) Open(path string) error {
	if !isMarkdown(path) {
		return errNotMarkdown
	}
	if _, err := s.docs.Open(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			_ = s.recent.Forget(path)
		}
		return err
	}
	return nil
}

// FolderFile is a Markdown file beside the calling window's document.
type FolderFile struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

// Folder lists the Markdown files in the folder of the calling window's
// document, but that document, by name; none for an untitled one.
func (s *filesService) Folder(ctx context.Context) []FolderFile {
	files := []FolderFile{}
	d := s.docs.ForWindow(mygo.CallerWindow(ctx))
	if d == nil || d.State().Path == "" {
		return files
	}
	self := d.State().Path
	entries, err := os.ReadDir(filepath.Dir(self))
	if err != nil {
		return files
	}
	for _, e := range entries {
		p := filepath.Join(filepath.Dir(self), e.Name())
		if e.Type().IsRegular() && isMarkdown(p) && p != self && !strings.HasPrefix(e.Name(), ".") {
			files = append(files, FolderFile{Name: e.Name(), Path: p})
		}
	}
	return files
}

// Create writes an empty Markdown file named name in the folder of the
// calling window's document and opens it. An untitled document has no
// folder: the new file is untitled as well, and the user names it when
// saving.
func (s *filesService) Create(ctx context.Context, name string) error {
	d := s.docs.ForWindow(mygo.CallerWindow(ctx))
	if d == nil || d.State().Path == "" {
		s.docs.New()
		return nil
	}
	name = strings.TrimSpace(name)
	if name == "" || strings.ContainsAny(name, `/\:`) || strings.HasPrefix(name, ".") {
		return errors.New("not a file name")
	}
	if !isMarkdown(name) {
		name += ".md"
	}
	path := filepath.Join(filepath.Dir(d.State().Path), name)
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return s.Open(path)
}

func isMarkdown(path string) bool {
	return slices.Contains([]string{".md", ".markdown"}, strings.ToLower(filepath.Ext(path)))
}

// showNeighbor shows the file step tabs away from the focused one in its
// group, wrapping around.
func showNeighbor(step int) func(*mygo.MenuItem, *mygo.Window) {
	return func(_ *mygo.MenuItem, win *mygo.Window) {
		if win = commandTarget(win); win == nil {
			return
		}
		group := tabGroup(win)
		for i, w := range group {
			if w == win {
				selectTab(group[(i+step+len(group))%len(group)])
				return
			}
		}
	}
}
