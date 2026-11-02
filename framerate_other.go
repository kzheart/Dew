//go:build !darwin

package main

import "github.com/egoist/mygo"

func unlockFrameRate(*mygo.Window) {}
