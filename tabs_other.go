//go:build !darwin

package main

import "github.com/egoist/mygo"

// tabGroup is win alone: only macOS groups document windows as tabs.
func tabGroup(win *mygo.Window) []*mygo.Window {
	if win == nil || win.IsDestroyed() {
		return nil
	}
	return []*mygo.Window{win}
}

func joinTabGroup(win, host *mygo.Window) {}

func selectTab(win *mygo.Window) {
	win.Show()
	win.Focus()
}

func hideTabBar(win *mygo.Window) {}
