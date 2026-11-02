package main

import (
	"context"
	"slices"
	"time"

	"github.com/egoist/mygo"
)

// Handoff tells a page its part in a swap of windows: the page leaving
// ("out") covers itself in mist, and the page arriving ("in") starts
// under the same mist. The windows swap once both are covered, so the
// frame the swap shows is the same on both sides, and the arriving page
// clears the mist once it is the one shown.
type Handoff struct {
	// Kind is "new" for a new file, "open" for a file opened in a window
	// of its own, "close" for the file of a closing tab; "" for none.
	Kind string `json:"kind"`
	Role string `json:"role"`
}

var Handoffs = mygo.NewEvent[Handoff]("handoff")

// handoff is one swap under way, from the window leaving to the one
// arriving, none when the last tab closes. then runs after the swap, as
// closing the window left.
type handoff struct {
	kind     string
	from, to *mygo.Window
	covered  bool
	ready    bool
	then     func()
}

// A page that never reports, one that failed to load, still swaps.
const handoffLimit = 1500 * time.Millisecond

// handOver starts h. A window new to its group stays off the group's
// list, and so out of every dock, until the swap. Its page learns its part
// as it loads, from Part, rather than from the event it does not hear yet.
func (s *filesService) handOver(h *handoff) {
	s.mu.Lock()
	h.ready = h.to == nil
	s.handoffs = append(s.handoffs, h)
	s.mu.Unlock()
	Handoffs.Emit(h.from, Handoff{Kind: h.kind, Role: "out"})
	if h.kind == "close" {
		if h.to != nil {
			Handoffs.Emit(h.to, Handoff{Kind: h.kind, Role: "in"})
		}
	} else {
		s.setListing(h.to, joining)
	}
	time.AfterFunc(handoffLimit, func() { s.swap(h) })
}

// Part is the calling page's part in a swap under way, for a page that
// loads in one: its first frame is already under the mist.
func (s *filesService) Part(ctx context.Context) Handoff {
	win := mygo.CallerWindow(ctx)
	if h := s.pending(func(h *handoff) bool { return h.to == win }); h != nil {
		return Handoff{Kind: h.kind, Role: "in"}
	}
	if h := s.pending(func(h *handoff) bool { return h.from == win }); h != nil {
		return Handoff{Kind: h.kind, Role: "out"}
	}
	return Handoff{}
}

// Covered reports that the calling page, leaving, is under the mist.
func (s *filesService) Covered(ctx context.Context) {
	s.report(func(h *handoff) bool { return h.from == mygo.CallerWindow(ctx) }, func(h *handoff) { h.covered = true })
}

// Ready reports that the calling page drew, under the mist when it
// arrives in a swap.
func (s *filesService) Ready(ctx context.Context) {
	s.report(func(h *handoff) bool { return h.to == mygo.CallerWindow(ctx) }, func(h *handoff) { h.ready = true })
}

func (s *filesService) report(match func(*handoff) bool, mark func(*handoff)) {
	s.mu.Lock()
	i := slices.IndexFunc(s.handoffs, match)
	var h *handoff
	if i >= 0 {
		h = s.handoffs[i]
		mark(h)
		if !h.covered || !h.ready {
			h = nil
		}
	}
	s.mu.Unlock()
	if h != nil {
		s.swap(h)
	}
}

func (s *filesService) pending(match func(*handoff) bool) *handoff {
	s.mu.Lock()
	defer s.mu.Unlock()
	if i := slices.IndexFunc(s.handoffs, match); i >= 0 {
		return s.handoffs[i]
	}
	return nil
}

// swap shows h's arriving window in the leaving one's place, once.
func (s *filesService) swap(h *handoff) {
	s.mu.Lock()
	i := slices.Index(s.handoffs, h)
	if i >= 0 {
		s.handoffs = slices.Delete(s.handoffs, i, i+1)
	}
	s.mu.Unlock()
	if i < 0 {
		return
	}
	if h.to != nil {
		s.setListing(h.to, 0)
		mygo.RunOnMain(func() {
			hideTabBar(h.to)
			selectTab(h.to)
		})
		// Its page drew over the mist it started on by now.
		time.AfterFunc(time.Second, func() { _ = h.to.SetBackgroundColor("#FFFFFF") })
	}
	if h.then != nil {
		h.then()
	}
	s.refresh()
}
