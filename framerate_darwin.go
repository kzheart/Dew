package main

import (
	"github.com/ebitengine/purego/objc"
	"github.com/egoist/mygo"
)

// unlockFrameRate turns off WebKit's PreferPageRenderingUpdatesNear60FPSEnabled,
// which holds a page to 60 fps on a ProMotion or other high refresh display.
// The feature list and its setter are private; where WebKit lacks them this does nothing.
func unlockFrameRate(win *mygo.Window) {
	mygo.RunOnMain(func() {
		web := findWebView(objc.ID(win.NativeHandle()).Send(sel("contentView")))
		if web == 0 {
			return
		}
		prefs := web.Send(sel("configuration")).Send(sel("preferences"))
		class := objc.ID(objc.GetClass("WKPreferences"))
		if !responds(class, "_features") || !responds(prefs, "_setEnabled:forFeature:") {
			return
		}
		key := objc.ID(objc.GetClass("NSString")).Send(sel("stringWithUTF8String:"), "PreferPageRenderingUpdatesNear60FPSEnabled")
		features := class.Send(sel("_features"))
		for i, n := 0, objc.Send[int](features, sel("count")); i < n; i++ {
			f := features.Send(sel("objectAtIndex:"), i)
			if objc.Send[bool](f.Send(sel("key")), sel("isEqualToString:"), key) {
				prefs.Send(sel("_setEnabled:forFeature:"), false, f)
				return
			}
		}
	})
}

func findWebView(view objc.ID) objc.ID {
	if view == 0 {
		return 0
	}
	if objc.Send[bool](view, sel("isKindOfClass:"), objc.GetClass("WKWebView")) {
		return view
	}
	subviews := view.Send(sel("subviews"))
	for i, n := 0, objc.Send[int](subviews, sel("count")); i < n; i++ {
		if web := findWebView(subviews.Send(sel("objectAtIndex:"), i)); web != 0 {
			return web
		}
	}
	return 0
}

func responds(id objc.ID, name string) bool {
	return objc.Send[bool](id, sel("respondsToSelector:"), sel(name))
}

func sel(name string) objc.SEL { return objc.RegisterName(name) }
