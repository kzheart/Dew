package main

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sync"

	"github.com/egoist/mygo"
)

// Font is the typeface family of the rendered document.
type Font string

const (
	FontSerif Font = "serif"
	FontSans  Font = "sans"
	FontMono  Font = "mono"
)

// Background is the paper the rendered document sits on.
type Background string

const (
	BackgroundWhite Background = "white"
	BackgroundPaper Background = "paper"
	BackgroundNight Background = "night"
)

// BaseMode is the rendered view the segmented control picks.
type BaseMode string

const (
	BaseLive    BaseMode = "live"
	BasePreview BaseMode = "preview"
)

// SourceLayout is how the Markdown source shows, if at all.
type SourceLayout string

const (
	SourceOff   SourceLayout = "off"
	SourceFull  SourceLayout = "full"
	SourceSplit SourceLayout = "split"
)

// CardBackground is what a share card's window sits on.
type CardBackground string

const (
	CardBlue   CardBackground = "blue"
	CardOrange CardBackground = "orange"
	CardGreen  CardBackground = "green"
	CardGray   CardBackground = "gray"
)

// PageGuard names the blocks a PDF moves whole to the next page when they
// don't fit; the others may split across pages.
type PageGuard struct {
	Code  bool `json:"code"`
	Table bool `json:"table"`
	Chart bool `json:"chart"`
	Image bool `json:"image"`
}

// Prefs are the reading and view preferences new windows start with.
type Prefs struct {
	Width           int            `json:"mw"`
	FontSize        int            `json:"fs"`
	LineHeight      float64        `json:"lh"`
	ParagraphGap    float64        `json:"pg"`
	Font            Font           `json:"ff"`
	Background      Background     `json:"bg"`
	Base            BaseMode       `json:"base"`
	Source          SourceLayout   `json:"source"`
	Inline          bool           `json:"inline"`
	ShowLineNumbers bool           `json:"showLn"`
	CardBackground  CardBackground `json:"cardBg"`
	Watermark       string         `json:"watermark"`
	PageGuard       PageGuard      `json:"pageGuard"`
}

func defaultPrefs() Prefs {
	return Prefs{
		Width: 720, FontSize: 16, LineHeight: 1.75, ParagraphGap: 1,
		Font: FontSans, Background: BackgroundWhite,
		Base: BaseLive, Source: SourceOff, ShowLineNumbers: true,
		CardBackground: CardBlue,
		PageGuard:      PageGuard{Code: true, Table: true, Chart: true},
	}
}

// maxWatermark is the most characters a share card's watermark keeps.
const maxWatermark = 40

// normalized clamps the values a hand-edited or older file may hold to
// the ranges the page offers.
func (p Prefs) normalized() Prefs {
	d := defaultPrefs()
	p.Width = clamp(p.Width, 560, 1000)
	p.FontSize = clamp(p.FontSize, 13, 22)
	p.LineHeight = clamp(p.LineHeight, 1.4, 2.2)
	p.ParagraphGap = clamp(p.ParagraphGap, 0.6, 1.8)
	if p.Font != FontSerif && p.Font != FontSans && p.Font != FontMono {
		p.Font = d.Font
	}
	if p.Background != BackgroundWhite && p.Background != BackgroundPaper && p.Background != BackgroundNight {
		p.Background = d.Background
	}
	if p.Base != BaseLive && p.Base != BasePreview {
		p.Base = d.Base
	}
	if p.Source != SourceOff && p.Source != SourceFull && p.Source != SourceSplit {
		p.Source = d.Source
	}
	if p.CardBackground != CardBlue && p.CardBackground != CardOrange && p.CardBackground != CardGreen && p.CardBackground != CardGray {
		p.CardBackground = d.CardBackground
	}
	if r := []rune(p.Watermark); len(r) > maxWatermark {
		p.Watermark = string(r[:maxWatermark])
	}
	return p
}

func clamp[T int | float64](v, lo, hi T) T {
	return min(max(v, lo), hi)
}

// prefsStore keeps Prefs in prefs.json of the user data directory, shared
// by the dev server's origin and the built app's.
type prefsStore struct {
	mu     sync.Mutex
	loaded bool
	prefs  Prefs
}

func prefsPath() (string, error) {
	dir, err := mygo.App.Path(mygo.PathUserData)
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "prefs.json"), nil
}

// Get returns the saved preferences, or the defaults.
func (s *prefsStore) Get() (Prefs, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.loaded {
		return s.prefs, nil
	}
	p := defaultPrefs()
	path, err := prefsPath()
	if err != nil {
		return p, err
	}
	b, err := os.ReadFile(path)
	switch {
	case errors.Is(err, fs.ErrNotExist):
	case err != nil:
		return p, err
	default:
		if err := json.Unmarshal(b, &p); err != nil {
			p = defaultPrefs()
		}
	}
	s.prefs, s.loaded = p.normalized(), true
	return s.prefs, nil
}

// Set saves the preferences.
func (s *prefsStore) Set(p Prefs) error {
	p = p.normalized()
	path, err := prefsPath()
	if err != nil {
		return err
	}
	b, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		return err
	}
	s.prefs, s.loaded = p, true
	return nil
}
