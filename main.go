package main

import (
	"io"
	"log"

	"github.com/egoist/mygo"

	_ "dew/locales"
)

func main() {
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
		Window: newDocumentWindow,
	})

	mygo.BindAs("Doc", docs.Service())
	mygo.BindAs("Conflict", &conflictService{docs: docs})
	mygo.BindAs("Prefs", &prefsStore{})
	mygo.BindAs("Export", exportService{})
	mygo.BindAs("View", &viewService{})
	mygo.BindAs("Assets", &assetService{docs: docs})
	serveDocumentFiles(docs)

	mygo.App.WhenReady(func() { mygo.App.SetMenu(newMenuBar()) })
	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
}

func newDocumentWindow(doc *mygo.Document[string]) *mygo.Window {
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
	shareCardOnContextMenu(win)
	return win
}
