//go:build e2e

package main

import (
	"embed"
	"io/fs"
	"os"

	"github.com/egoist/mygo"
	_ "github.com/egoist/mygo/plugins/automation"
)

// An e2e build is a plain `go build`, which embeds no frontend of its own.
//
//go:embed all:dist
var dist embed.FS

func init() {
	web, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err)
	}
	mygo.SetFrontend(web)
	e2eSaveDir = os.Getenv("DEW_E2E_SAVE_DIR")
}
