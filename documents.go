package main

import (
	"context"
	"errors"

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
