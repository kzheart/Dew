//go:build e2e

package main

import (
	"context"
	"os"
	"sync"
	"syscall"
	"time"

	"github.com/egoist/mygo"
)

// watchProbe watches a file beside the document's own watch and logs what
// it sees, to tell a change the watch missed from one the document dropped.
type watchProbe struct {
	mu     sync.Mutex
	start  time.Time
	log    []string
	cancel context.CancelFunc
}

type statInfo struct {
	MTime int64  `json:"mtime"`
	Size  int64  `json:"size"`
	Ino   uint64 `json:"ino"`
	At    int64  `json:"at"`
}

func (p *watchProbe) since() int64 { return time.Since(p.start).Milliseconds() }

func (p *watchProbe) Start(path string) error {
	p.mu.Lock()
	if p.cancel != nil {
		p.cancel()
	}
	ctx, cancel := context.WithCancel(context.Background())
	p.cancel, p.start, p.log = cancel, time.Now(), nil
	p.mu.Unlock()
	w, err := mygo.WatchFiles(ctx, path, mygo.FileWatchOptions{Debounce: 100 * time.Millisecond})
	if err != nil {
		return err
	}
	go func() {
		defer w.Close()
		for {
			events, err := w.Next(ctx)
			p.mu.Lock()
			if err != nil {
				p.log = append(p.log, "err "+err.Error())
				p.mu.Unlock()
				return
			}
			for _, e := range events {
				p.log = append(p.log, time.Duration(p.since()*int64(time.Millisecond)).String()+" "+string(e.Op)+" "+e.Path)
			}
			p.mu.Unlock()
		}
	}()
	return nil
}

func (p *watchProbe) Mark(what string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.log = append(p.log, time.Duration(p.since()*int64(time.Millisecond)).String()+" mark "+what)
}

func (p *watchProbe) Log() []string {
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([]string(nil), p.log...)
}

func (p *watchProbe) Stat(path string) statInfo {
	info, err := os.Stat(path)
	if err != nil {
		return statInfo{}
	}
	s := statInfo{MTime: info.ModTime().UnixNano(), Size: info.Size(), At: p.since()}
	if st, ok := info.Sys().(*syscall.Stat_t); ok {
		s.Ino = st.Ino
	}
	return s
}

func init() {
	mygo.BindAs("WatchProbe", &watchProbe{})
}
