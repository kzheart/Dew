package main

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/egoist/mygo"
)

// assetService keeps the images pasted into a document in the assets
// folder beside its file, and shows them in Finder.
type assetService struct{ docs *mygo.Documents[string] }

var pastedImageTypes = map[string]bool{"png": true, "jpg": true, "gif": true, "webp": true}

// SaveImage writes an image pasted into the window's document to the
// assets folder beside the document's file, never over another file, and
// returns its path relative to the document, as Markdown links it. An
// untitled document is saved first; "" means the user canceled that.
func (s *assetService) SaveImage(ctx context.Context, data []byte, ext string) (string, error) {
	if !pastedImageTypes[ext] {
		return "", fmt.Errorf("unsupported image type %q", ext)
	}
	d := s.docs.ForWindow(mygo.CallerWindow(ctx))
	if d == nil {
		return "", errors.New("the window shows no document")
	}
	if d.Path() == "" {
		if err := d.Save(); errors.Is(err, mygo.ErrCanceled) {
			return "", nil
		} else if err != nil {
			return "", err
		}
	}
	if d.Path() == "" {
		return "", nil
	}
	dir := filepath.Join(filepath.Dir(d.Path()), "assets")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	name, err := writeNew(dir, "paste-"+time.Now().Format("20060102-150405"), "."+ext, data)
	if err != nil {
		return "", err
	}
	return "./assets/" + name, nil
}

// Reveal shows a file of the window's document's folder in Finder.
func (s *assetService) Reveal(ctx context.Context, rel string) error {
	d := s.docs.ForWindow(mygo.CallerWindow(ctx))
	if d == nil {
		return errors.New("the window shows no document")
	}
	path, ok := inDocumentFolder(d.Path(), rel)
	if !ok {
		return fmt.Errorf("%q is not in the document's folder", rel)
	}
	mygo.Shell.ShowItemInFolder(path)
	return nil
}

// writeNew writes data to base+ext in dir, or to base-2+ext, base-3+ext…
// when that name is taken, and returns the name it wrote.
func writeNew(dir, base, ext string, data []byte) (string, error) {
	for i := 1; ; i++ {
		name := base + ext
		if i > 1 {
			name = fmt.Sprintf("%s-%d%s", base, i, ext)
		}
		f, err := os.OpenFile(filepath.Join(dir, name), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if errors.Is(err, fs.ErrExist) {
			continue
		}
		if err != nil {
			return "", err
		}
		_, err = f.Write(data)
		if cerr := f.Close(); err == nil {
			err = cerr
		}
		return name, err
	}
}

// inDocumentFolder resolves rel, a slash-separated path, against the folder
// of the document's file. It refuses a path outside that folder, and any
// path while the document is untitled.
func inDocumentFolder(docPath, rel string) (string, bool) {
	if docPath == "" {
		return "", false
	}
	dir := filepath.Dir(docPath)
	path := filepath.Join(dir, filepath.FromSlash(rel))
	r, err := filepath.Rel(dir, path)
	if err != nil || r == "." || r == ".." || strings.HasPrefix(r, ".."+string(filepath.Separator)) {
		return "", false
	}
	return path, true
}

var imageTypes = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true,
	".svg": true, ".avif": true, ".bmp": true, ".ico": true,
}

// serveDocumentFiles serves the images a document references by relative
// path: the page asks for docfile://localhost/<path in the document's
// folder>, and gets the file beside the document its window shows.
func serveDocumentFiles(docs *mygo.Documents[string]) {
	mygo.Protocol.HandleFunc("docfile", func(w http.ResponseWriter, r *http.Request) {
		d := docs.ForWindow(mygo.CallerWindow(r.Context()))
		if d == nil {
			http.NotFound(w, r)
			return
		}
		path, ok := inDocumentFolder(d.Path(), r.URL.Path)
		if !ok || !imageTypes[strings.ToLower(filepath.Ext(path))] {
			http.NotFound(w, r)
			return
		}
		// The page reads images with fetch to embed them in a PDF, and it is
		// served from another scheme.
		w.Header().Set("Access-Control-Allow-Origin", "*")
		http.ServeFile(w, r, path)
	})
}
