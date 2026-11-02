//go:build e2e

package main

import (
	"github.com/ebitengine/purego/objc"
	"github.com/egoist/mygo"
)

// tabsProbe lets the e2e script see the native title bar of a window.
type tabsProbe struct{}

type nsRect struct{ X, Y, W, H float64 }

type titleBar struct {
	// CloseX and CloseY are the close button's top-left corner, from the
	// window's top-left corner.
	CloseX float64 `json:"closeX"`
	CloseY float64 `json:"closeY"`
	// ContentHeight is the height of the window below its title bar and
	// the title bar's accessories, which the tab bar is one of.
	ContentHeight float64 `json:"contentHeight"`
	Height        float64 `json:"height"`
	TabBarVisible bool    `json:"tabBarVisible"`
	Selected      bool    `json:"selected"`
}

// TitleBar describes the title bar of window id.
func (tabsProbe) TitleBar(id int) titleBar {
	var t titleBar
	w := mygo.WindowByID(id)
	if w == nil {
		return t
	}
	mygo.RunOnMain(func() {
		nw := objc.ID(w.NativeHandle())
		frame := objc.Send[nsRect](nw, selector("frame"))
		btn := nw.Send(selector("standardWindowButton:"), 0)
		r := objc.Send[nsRect](btn, selector("convertRect:toView:"), objc.Send[nsRect](btn, selector("bounds")), objc.ID(0))
		group := nw.Send(selector("tabGroup"))
		t = titleBar{
			CloseX:        r.X,
			CloseY:        frame.H - r.Y - r.H,
			ContentHeight: objc.Send[nsRect](nw, selector("contentLayoutRect")).H,
			Height:        frame.H,
			TabBarVisible: objc.Send[bool](group, selector("isTabBarVisible")),
			Selected:      group.Send(selector("selectedWindow")) == nw,
		}
	})
	return t
}

func init() {
	mygo.BindAs("TabsProbe", tabsProbe{})
}
