//go:build e2e

package main

import "github.com/egoist/mygo"

// recentProbe lets the e2e script fill the recent files with files closed
// at chosen times, as weeks of use would.
type recentProbe struct{ r *recentService }

// Seed adds files to the recent files.
func (p recentProbe) Seed(files []RecentFile) error {
	err := p.r.store.edit(200, func(all map[string]RecentFile) {
		for _, f := range files {
			all[f.Path] = f
		}
	})
	p.r.publish(nil)
	return err
}

func init() {
	bindE2E = append(bindE2E, func(files *filesService) { mygo.BindAs("RecentProbe", recentProbe{files.recent}) })
}
