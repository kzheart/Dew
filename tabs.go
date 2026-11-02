package main

import (
	"context"
	"errors"

	"github.com/egoist/mygo"
)

// FileTab is one document of a window's tab group, as that group's dock
// shows it.
type FileTab struct {
	// ID is the ID of the document's window.
	ID     int    `json:"id"`
	Name   string `json:"name"`
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
type filesService struct{ docs *mygo.Documents[string] }

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
		if d == nil {
			continue
		}
		st := d.State()
		tabs = append(tabs, FileTab{ID: w.ID(), Name: st.Name, Edited: st.Edited, Untitled: st.Path == "", Current: w == win})
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
// group's docks up to date. Its first list goes out once mygo attached
// doc to win and told its state.
func (s *filesService) adopt(win, host *mygo.Window, doc *mygo.Document[string]) {
	joinTabGroup(win, host)
	doc.OnStateChange(func(mygo.DocumentState) { s.refresh() })
	win.OnClosed(s.refresh)
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
