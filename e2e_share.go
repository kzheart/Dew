//go:build e2e

package main

import (
	"bytes"
	"encoding/hex"
	"image/png"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/transfer"
)

// clipboardProbe lets the e2e script see what the app put on the clipboard.
type clipboardProbe struct{}

type clipboardImage struct {
	Signature string `json:"signature"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	Bytes     int    `json:"bytes"`
}

// Clear empties the clipboard, so a later read shows only what the app wrote.
func (clipboardProbe) Clear() error {
	return mygo.Clipboard.Write(transfer.TextData(""))
}

// PNG describes the PNG image on the clipboard.
func (clipboardProbe) PNG() (clipboardImage, error) {
	b, err := mygo.Clipboard.ReadFormat(transfer.PNG)
	if err != nil {
		return clipboardImage{}, err
	}
	img := clipboardImage{Signature: hex.EncodeToString(b[:min(8, len(b))]), Bytes: len(b)}
	if cfg, err := png.DecodeConfig(bytes.NewReader(b)); err == nil {
		img.Width, img.Height = cfg.Width, cfg.Height
	}
	return img, nil
}

func init() {
	mygo.BindAs("ClipboardProbe", clipboardProbe{})
}
