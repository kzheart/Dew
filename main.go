package main

import (
	"io"
	"log"

	"github.com/egoist/mygo"

	_ "dew/locales"
)

func main() {
	prefs := &prefsStore{}
	files := &filesService{}
	welcome := &welcome{}
	docs := mygo.NewDocuments(mygo.DocumentsOptions[string]{
		Types: []mygo.DocumentType{{Name: "Markdown 文稿", Extensions: []string{"md", "markdown"}}},
		Read: func(r io.Reader) (string, error) {
			b, err := io.ReadAll(r)
			return string(b), err
		},
		Write: func(w io.Writer, text string) error {
			_, err := io.WriteString(w, text)
			return err
		},
		Equal:  func(a, b string) bool { return a == b },
		Window: func(doc *mygo.Document[string]) *mygo.Window { return newDocumentWindow(files, welcome, prefs, doc) },
		// The welcome window stands in for the untitled document mygo would
		// open at launch and on a click on the Dock icon.
		NoUntitled: true,
	})
	files.docs = docs
	files.welcome = welcome
	welcome.docs = docs
	welcome.prefs = prefs
	welcome.wire()
	files.recent = &recentService{docs: docs, prefs: prefs}

	mygo.BindAs("Doc", docs.Service())
	mygo.BindAs("Files", files)
	mygo.BindAs("Conflict", &conflictService{docs: docs})
	mygo.BindAs("Prefs", prefs)
	mygo.BindAs("Recent", files.recent)
	for _, bind := range bindE2E {
		bind(files)
	}
	mygo.BindAs("Export", exportService{})
	mygo.BindAs("View", &viewService{})
	mygo.BindAs("Assets", &assetService{docs: docs})
	serveDocumentFiles(docs)

	mygo.App.WhenReady(func() { mygo.App.SetMenu(newMenuBar()) })
	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
}

// bindE2E binds the probes an e2e build adds.
var bindE2E []func(*filesService)

func newDocumentWindow(files *filesService, welcome *welcome, prefs *prefsStore, doc *mygo.Document[string]) *mygo.Window {
	// Before the window exists, which takes the focus as it shows.
	host := files.host()
	// A window that takes another's place, a tab in its group or the
	// welcome window, shows once both pages are under the same mist: shown
	// first, it flashes a blank page, and a tab the native tab bar.
	from := host
	if from == nil {
		from = welcome.win
	}
	// Until its page draws, which may wait for the window to show, it
	// shows its background: the blank sheet it arrives on.
	background := paperColor(prefs)
	win := mygo.NewWindow(mygo.WindowOptions{
		URL:                  "/",
		Width:                1280,
		Height:               820,
		MinWidth:             600,
		MinHeight:            420,
		TitleBarStyle:        mygo.TitleBarHiddenInset,
		TrafficLightPosition: &mygo.Point{X: 20, Y: 24},
		BackgroundColor:      background,
		StateKey:             "document",
		Hidden:               from != nil,
	})
	unlockFrameRate(win)
	shareCardOnContextMenu(win)
	files.adopt(win, from, doc)
	if host == nil {
		welcome.replaceWith(win)
	}
	return win
}

// paperColor is the page's paper (.th-paper, .th-night in
// src/styles/app.css), for the background a window starts with.
func paperColor(prefs *prefsStore) string {
	p, _ := prefs.Get()
	switch p.Background {
	case BackgroundPaper:
		return "#F4ECDA"
	case BackgroundNight:
		return "#1E1E20"
	}
	return "#FFFFFF"
}
