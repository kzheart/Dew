package main

import (
	"context"

	"github.com/egoist/mygo"
)

// Inspector is the 设置 inspector of a tab group, which every tab of the
// group shows alike.
type Inspector struct {
	Open bool `json:"open"`
	// Group is the group of settings it shows: look, edit, file, export
	// or keys.
	Group string `json:"group"`
}

// Inspectors tells the other tabs of a group what one changed of the
// group's inspector.
var Inspectors = mygo.NewEvent[Inspector]("inspector")

var closedInspector = Inspector{Group: "look"}

// Inspector returns the inspector of the calling window's tab group.
func (s *filesService) Inspector(ctx context.Context) Inspector {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.inspectorOf(mygo.CallerWindow(ctx))
}

// SetInspector sets the inspector of the calling window's tab group, and
// tells the group's other tabs.
func (s *filesService) SetInspector(ctx context.Context, in Inspector) {
	caller := mygo.CallerWindow(ctx)
	group := tabGroup(caller)
	s.mu.Lock()
	if s.inspectors == nil {
		s.inspectors = map[int]Inspector{}
	}
	for _, w := range group {
		s.inspectors[w.ID()] = in
	}
	s.mu.Unlock()
	for _, w := range group {
		if w != caller {
			Inspectors.Emit(w, in)
		}
	}
}

func (s *filesService) inspectorOf(w *mygo.Window) Inspector {
	if w == nil {
		return closedInspector
	}
	if in, ok := s.inspectors[w.ID()]; ok {
		return in
	}
	return closedInspector
}

// inheritInspector gives win, joining from's group, the group's inspector.
func (s *filesService) inheritInspector(win, from *mygo.Window) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if in := s.inspectorOf(from); in != closedInspector {
		if s.inspectors == nil {
			s.inspectors = map[int]Inspector{}
		}
		s.inspectors[win.ID()] = in
	}
}

func (s *filesService) forgetInspector(win *mygo.Window) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.inspectors, win.ID())
}
