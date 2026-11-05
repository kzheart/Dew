//go:build e2e

package main

import (
	"fmt"
	"strings"
	"unsafe"

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
	// Debug lists the title bar's accessories and views, to tell what
	// stands where on another macOS.
	Debug string `json:"debug,omitempty"`
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
			Debug:         titleBarDump(nw, btn),
		}
	})
	return t
}

func goString(ns objc.ID) string {
	if ns == 0 {
		return ""
	}
	p := objc.Send[*byte](ns, selector("UTF8String"))
	if p == nil {
		return ""
	}
	var b []byte
	for ; *p != 0; p = (*byte)(unsafe.Add(unsafe.Pointer(p), 1)) {
		b = append(b, *p)
	}
	return string(b)
}

func className(o objc.ID) string { return goString(o.Send(selector("className"))) }

func titleBarDump(nw, btn objc.ID) string {
	var b strings.Builder
	vcs := nw.Send(selector("titlebarAccessoryViewControllers"))
	fmt.Fprintf(&b, "accessories=%d;", count(vcs))
	for i := range count(vcs) {
		vc := at(vcs, i)
		v := vc.Send(selector("view"))
		fmt.Fprintf(&b, " [%s hidden=%v attr=%d view=%s %v];", className(vc), objc.Send[bool](vc, selector("isHidden")),
			objc.Send[int](vc, selector("layoutAttribute")), className(v), objc.Send[nsRect](v, selector("frame")))
	}
	root := btn.Send(selector("superview")).Send(selector("superview"))
	var walk func(v objc.ID, depth int)
	walk = func(v objc.ID, depth int) {
		fmt.Fprintf(&b, " %s%s hidden=%v %v;", strings.Repeat(">", depth), className(v), objc.Send[bool](v, selector("isHidden")), objc.Send[nsRect](v, selector("frame")))
		if depth == 4 {
			return
		}
		subs := v.Send(selector("subviews"))
		for i := range count(subs) {
			walk(at(subs, i), depth+1)
		}
	}
	walk(root, 0)
	return b.String()
}

func init() {
	mygo.BindAs("TabsProbe", tabsProbe{})
}
