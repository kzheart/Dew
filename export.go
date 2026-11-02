package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/transfer"
)

// exportService writes what the page renders of its document to other
// files and to the clipboard.
type exportService struct{}

// PDF prints a standalone HTML document on A4 pages and saves the PDF where
// the user chooses. It returns the path, or "" when the user canceled.
func (exportService) PDF(ctx context.Context, html, name string) (string, error) {
	type result struct {
		pdf []byte
		err error
	}
	printed := make(chan result, 1)
	go func() {
		pdf, err := printPDF(html)
		printed <- result{pdf, err}
	}()
	path, err := askSavePath(ctx, name+".pdf", mygo.FileFilter{Name: "PDF", Extensions: []string{"pdf"}})
	if err != nil || path == "" {
		return "", err
	}
	r := <-printed
	if r.err != nil {
		return "", r.err
	}
	return path, os.WriteFile(path, r.pdf, 0o644)
}

// HTML saves a standalone HTML document where the user chooses.
func (exportService) HTML(ctx context.Context, html, name string) (string, error) {
	path, err := askSavePath(ctx, name+".html", mygo.FileFilter{Name: "HTML", Extensions: []string{"html"}})
	if err != nil || path == "" {
		return "", err
	}
	return path, os.WriteFile(path, []byte(html), 0o644)
}

// SVG saves a diagram's SVG where the user chooses.
func (exportService) SVG(ctx context.Context, svg, name string) (string, error) {
	path, err := askSavePath(ctx, name+".svg", mygo.FileFilter{Name: "SVG", Extensions: []string{"svg"}})
	if err != nil || path == "" {
		return "", err
	}
	return path, os.WriteFile(path, []byte(svg), 0o644)
}

// RichText puts styled HTML on the clipboard, with its plain text for
// apps that take no HTML.
func (exportService) RichText(html, text string) error {
	return mygo.Clipboard.Write(transfer.New(transfer.NewItem(
		transfer.Bytes(transfer.HTML, []byte(html)),
		transfer.Bytes(transfer.Text, []byte(text)),
	)))
}

// ShareCard copies a PNG image to the clipboard and saves it where the
// user chooses.
func (exportService) ShareCard(ctx context.Context, png []byte, name string) (string, error) {
	if err := mygo.Clipboard.Write(transfer.New(transfer.NewItem(transfer.Bytes(transfer.PNG, png)))); err != nil {
		return "", err
	}
	path, err := askSavePath(ctx, name+".png", mygo.FileFilter{Name: "PNG", Extensions: []string{"png"}})
	if err != nil || path == "" {
		return "", err
	}
	return path, os.WriteFile(path, png, 0o644)
}

// e2eSaveDir, set only by e2e builds, saves exports there without asking.
var e2eSaveDir string

func askSavePath(ctx context.Context, defaultPath string, filter mygo.FileFilter) (string, error) {
	if e2eSaveDir != "" {
		return filepath.Join(e2eSaveDir, defaultPath), nil
	}
	return mygo.Dialog.Save(mygo.SaveDialogOptions{
		Parent:            mygo.CallerWindow(ctx),
		DefaultPath:       defaultPath,
		Filters:           []mygo.FileFilter{filter},
		CreateDirectories: true,
	})
}

// printPDF lays html out in a window that never shows and prints it.
func printPDF(html string) ([]byte, error) {
	win := mygo.NewWindow(mygo.WindowOptions{Hidden: true, Width: 800, Height: 1100})
	defer win.Destroy()
	page := win.Page()
	page.LoadHTML(html, "")
	// The blank page a new window starts with finishes loading too, so wait
	// for the export's own marker instead of the first load.
	deadline := time.Now().Add(20 * time.Second)
	for {
		ready, err := mygo.EvalAs[bool](page, `if (!document.querySelector("[data-dew-export]")) return false; await document.fonts.ready; return true`)
		if err == nil && ready {
			break
		}
		if time.Now().After(deadline) {
			return nil, errors.New("the PDF page did not load")
		}
		time.Sleep(50 * time.Millisecond)
	}
	return page.PrintToPDF(mygo.PDFOptions{
		PageSize:   mygo.PageA4,
		Background: true,
		Margins:    &mygo.Margins{Top: 0.7, Right: 0.7, Bottom: 0.7, Left: 0.7},
	})
}
