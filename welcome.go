package main

import (
	"time"

	"github.com/egoist/mygo"
)

// welcomeURL is the page the welcome window shows, the same app as a
// document window's, routed to its welcome page.
const welcomeURL = "/?page=welcome"

// welcome keeps the one window the app shows while no document is open:
// after the last document window closes, when the Dock icon is clicked with
// no windows, and at a launch that opens no file. A document window that
// opens takes its place. Main thread only.
type welcome struct {
	docs *mygo.Documents[string]
	win  *mygo.Window
	// dismissed reports that the last window to close was the welcome
	// window itself, which leaves the app without windows on purpose.
	dismissed bool
}

func (w *welcome) wire() {
	launchedWithFile := false
	mygo.App.OnOpenFile(func(string) { launchedWithFile = true })
	mygo.App.WhenReady(func() {
		// mygo opens the files the app was asked to open, and the documents
		// it recovers, on a goroutine after the launch, and tells no one
		// when it is done; a document window that opens later still takes
		// the welcome window's place.
		go func() {
			time.Sleep(400 * time.Millisecond)
			mygo.RunOnMain(func() {
				if !launchedWithFile && len(w.docs.Documents()) == 0 {
					w.show()
				}
			})
		}()
	})
	mygo.App.OnWindowAllClosed(func() {
		if !w.dismissed {
			w.show()
		}
		w.dismissed = false
	})
	mygo.App.OnActivate(func(visible bool) {
		if !visible && len(w.docs.Documents()) == 0 {
			w.show()
		}
	})
}

// show brings the welcome window forward, opening it if there is none.
func (w *welcome) show() {
	if w.win != nil {
		w.win.Show()
		w.win.Focus()
		return
	}
	win := mygo.NewWindow(mygo.WindowOptions{
		URL:                  welcomeURL,
		Width:                1280,
		Height:               820,
		MinWidth:             600,
		MinHeight:            420,
		TitleBarStyle:        mygo.TitleBarHiddenInset,
		TrafficLightPosition: &mygo.Point{X: 20, Y: 24},
		BackgroundColor:      "#FFFFFF",
		// Where the last document window was, and where the next one opens.
		StateKey: "document",
		Title:    "Dew",
	})
	w.win = win
	win.OnClosed(func() {
		if w.win == win {
			w.win = nil
			w.dismissed = true
		}
	})
}

// replaceWith gives the welcome window's frame to doc, a document window
// that opened in no tab group, and closes the welcome window as doc shows.
func (w *welcome) replaceWith(doc *mygo.Window) {
	if w.win == nil {
		return
	}
	win := w.win
	w.win = nil
	doc.SetBounds(win.Bounds())
	if doc.IsVisible() {
		win.Close()
		return
	}
	var off func()
	off = doc.OnShow(func() {
		off()
		win.Close()
	})
}
