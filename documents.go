package main

import (
	"context"
	"errors"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/egoist/mygo"
)

// conflictService resolves a document whose file another app changed while
// it had unsaved changes. Reverting is Doc.revert.
type conflictService struct{ docs *mygo.Documents[string] }

// KeepMine writes the window's document over the file another app changed.
func (s *conflictService) KeepMine(ctx context.Context) error {
	d := s.docs.ForWindow(mygo.CallerWindow(ctx))
	if d == nil {
		return errors.New("the window shows no document")
	}
	return d.SaveAnyway()
}

var imageTypes = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true,
	".svg": true, ".avif": true, ".bmp": true, ".ico": true,
}

// serveDocumentFiles serves the images a document references by relative
// path: the page asks for docfile://localhost/<absolute path>.
func serveDocumentFiles() {
	mygo.Protocol.HandleFunc("docfile", func(w http.ResponseWriter, r *http.Request) {
		path := filepath.Clean(r.URL.Path)
		if !filepath.IsAbs(path) || !imageTypes[strings.ToLower(filepath.Ext(path))] {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, path)
	})
}
