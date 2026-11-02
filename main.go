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
		Window: func(doc *mygo.Document[string]) *mygo.Window { return newDocumentWindow(files, welcome, doc) },
		// The welcome window stands in for the untitled document mygo would
		// open at launch and on a click on the Dock icon.
		NoUntitled: true,
	})
	files.docs = docs
	welcome.docs = docs
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

func newDocumentWindow(files *filesService, welcome *welcome, doc *mygo.Document[string]) *mygo.Window {
	// Before the window exists, which takes the focus as it shows.
	host := files.host()
	win := mygo.NewWindow(mygo.WindowOptions{
		URL:                  "/",
		Width:                1280,
		Height:               820,
		MinWidth:             600,
		MinHeight:            420,
		TitleBarStyle:        mygo.TitleBarHiddenInset,
		TrafficLightPosition: &mygo.Point{X: 20, Y: 24},
		BackgroundColor:      "#FFFFFF",
		StateKey:             "document",
	})
	unlockFrameRate(win)
	shareCardOnContextMenu(win)
	files.adopt(win, host, doc)
	if host == nil {
		welcome.replaceWith(win)
	}
	return win
}
