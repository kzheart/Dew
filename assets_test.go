package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestInDocumentFolder(t *testing.T) {
	doc := filepath.FromSlash("/notes/week/report.md")
	for rel, want := range map[string]string{
		"assets/paste.png":   "/notes/week/assets/paste.png",
		"/assets/paste.png":  "/notes/week/assets/paste.png",
		"./a/../b.png":       "/notes/week/b.png",
		"../secret.png":      "",
		"/../../etc/x.png":   "",
		"assets/../../x.png": "",
		"":                   "",
	} {
		got, ok := inDocumentFolder(doc, rel)
		if want == "" {
			if ok {
				t.Errorf("inDocumentFolder(%q) = %q, want refused", rel, got)
			}
		} else if !ok || got != filepath.FromSlash(want) {
			t.Errorf("inDocumentFolder(%q) = %q, %v, want %q", rel, got, ok, want)
		}
	}
	if _, ok := inDocumentFolder("", "a.png"); ok {
		t.Error("an untitled document has no folder")
	}
}

func TestWriteNewNeverOverwrites(t *testing.T) {
	dir := t.TempDir()
	for i, want := range []string{"paste-1.png", "paste-1-2.png", "paste-1-3.png"} {
		name, err := writeNew(dir, "paste-1", ".png", []byte{byte(i)})
		if err != nil || name != want {
			t.Fatalf("write %d: %q, %v, want %q", i, name, err, want)
		}
	}
	first, _ := os.ReadFile(filepath.Join(dir, "paste-1.png"))
	if len(first) != 1 || first[0] != 0 {
		t.Errorf("the first file was overwritten: %v", first)
	}
}
