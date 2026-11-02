package main

import (
	"github.com/ebitengine/purego/objc"
	"github.com/egoist/mygo"
)

func selector(name string) objc.SEL { return objc.RegisterName(name) }

func count(array objc.ID) int { return objc.Send[int](array, selector("count")) }

func at(array objc.ID, i int) objc.ID { return array.Send(selector("objectAtIndex:"), i) }

// tabGroup returns the windows of win's native tab group in tab order,
// win alone when it has none.
func tabGroup(win *mygo.Window) []*mygo.Window {
	var group []*mygo.Window
	if win == nil {
		return nil
	}
	mygo.RunOnMain(func() {
		h := win.NativeHandle()
		if h == 0 {
			return
		}
		tabs := objc.ID(h).Send(selector("tabGroup")).Send(selector("windows"))
		if tabs == 0 {
			group = []*mygo.Window{win}
			return
		}
		byHandle := map[uintptr]*mygo.Window{}
		for _, w := range mygo.Windows() {
			byHandle[w.NativeHandle()] = w
		}
		for i := range count(tabs) {
			if w := byHandle[uintptr(at(tabs, i))]; w != nil {
				group = append(group, w)
			}
		}
	})
	return group
}

// joinTabGroup makes win a tab of host's group, after host's selected tab,
// or the first window of a group when host is nil. mygo disallows tabbing
// for every window; the windows of a group allow it.
func joinTabGroup(win, host *mygo.Window) {
	const preferred, above = 1, 1
	mygo.RunOnMain(func() {
		w := objc.ID(win.NativeHandle())
		w.Send(selector("setTabbingMode:"), preferred)
		if host != nil {
			h := objc.ID(host.NativeHandle())
			h.Send(selector("setTabbingMode:"), preferred)
			h.Send(selector("addTabbedWindow:ordered:"), w, above)
		}
		hideTabBar(win)
	})
	// AppKit may add the tab bar after the join, and lays out the title
	// bar again when a tab is selected.
	win.OnShow(func() { hideTabBar(win) })
	win.OnFocus(func() { hideTabBar(win) })
}

// hideTabBar hides the native tab bar of win's group, which the dock
// stands in for: it is the title bar accessory of each tabbed window.
// toggleTabBar: leaves it showing. Hiding it moves the traffic lights 5px
// up, so mygo lays them out again, as it does after a new title.
func hideTabBar(win *mygo.Window) {
	for _, m := range tabGroup(win) {
		vcs := objc.ID(m.NativeHandle()).Send(selector("titlebarAccessoryViewControllers"))
		hid := false
		for i := range count(vcs) {
			if vc := at(vcs, i); !objc.Send[bool](vc, selector("isHidden")) {
				vc.Send(selector("setHidden:"), true)
				hid = true
			}
		}
		if hid {
			m.SetTitle(m.Title())
		}
	}
}

// selectTab shows win's tab of its group.
func selectTab(win *mygo.Window) {
	win.Show()
	win.Focus()
}
