package main

import (
	"context"
	"strings"
	"sync"

	"github.com/egoist/mygo"
)

// Command is a menu command that the focused window's page carries out.
type Command string

const (
	CommandSave         Command = "save"
	CommandLive         Command = "live"
	CommandPreview      Command = "preview"
	CommandSource       Command = "source"
	CommandSplit        Command = "split"
	CommandFocus        Command = "focus"
	CommandInline       Command = "inline"
	CommandExportPDF    Command = "exportPDF"
	CommandExportHTML   Command = "exportHTML"
	CommandCopyRichText Command = "copyRichText"
	CommandShareCard    Command = "shareCard"
)

// Commands carries menu commands to the page of the focused window.
var Commands = mygo.NewEvent[Command]("command")

// Mode is the view a window shows.
type Mode string

const (
	ModeLive    Mode = "live"
	ModePreview Mode = "preview"
	ModeEdit    Mode = "edit"
	ModeSplit   Mode = "split"
)

// ViewState is what the View menu's check marks show for a window.
type ViewState struct {
	Mode   Mode `json:"mode"`
	Focus  bool `json:"focus"`
	Inline bool `json:"inline"`
}

func send(c Command) func(*mygo.MenuItem, *mygo.Window) {
	return func(_ *mygo.MenuItem, win *mygo.Window) {
		if win = commandTarget(win); win != nil {
			Commands.Emit(win, c)
		}
	}
}

// commandTarget is the window a menu command acts on: the focused one, or,
// while the app is not active (a menu chosen by automation, or right after
// launch), the newest visible window.
func commandTarget(win *mygo.Window) *mygo.Window {
	if win != nil {
		return win
	}
	if win = mygo.FocusedWindow(); win != nil {
		return win
	}
	all := mygo.Windows()
	for i := len(all) - 1; i >= 0; i-- {
		if all[i].IsVisible() {
			return all[i]
		}
	}
	return nil
}

var menuBar *mygo.Menu

func newMenuBar() *mygo.Menu {
	menuBar = mygo.NewMenu([]*mygo.MenuItem{
		{Role: mygo.RoleAppMenu},
		{Role: mygo.RoleFileMenu, Submenu: []*mygo.MenuItem{
			{Role: mygo.RoleNew},
			{Role: mygo.RoleOpen},
			{Role: mygo.RoleOpenRecent},
			mygo.Separator(),
			{Role: mygo.RoleClose},
			// Not RoleSave: the page holds the latest text and saves after
			// sending it.
			{Label: "保存", Accelerator: "CmdOrCtrl+S", Click: send(CommandSave)},
			{Role: mygo.RoleDuplicate},
			{Role: mygo.RoleRename},
			{Role: mygo.RoleMoveTo},
			{Role: mygo.RoleRevert},
			mygo.Separator(),
			{Label: "导出为 PDF…", Accelerator: "CmdOrCtrl+P", Click: send(CommandExportPDF)},
			{Label: "导出为 HTML…", Click: send(CommandExportHTML)},
			{Label: "拷贝为富文本", Accelerator: "Alt+CmdOrCtrl+C", Click: send(CommandCopyRichText)},
			{Label: "将选区生成分享卡片…", Click: send(CommandShareCard)},
		}},
		{Role: mygo.RoleEditMenu},
		{Label: "视图", Submenu: []*mygo.MenuItem{
			{ID: string(ModeLive), Label: "实时", Type: mygo.MenuItemRadio, Accelerator: "CmdOrCtrl+1", Click: send(CommandLive)},
			{ID: string(ModePreview), Label: "预览", Type: mygo.MenuItemRadio, Accelerator: "CmdOrCtrl+2", Click: send(CommandPreview)},
			{ID: string(ModeEdit), Label: "源码", Type: mygo.MenuItemRadio, Accelerator: "CmdOrCtrl+/", Click: send(CommandSource)},
			{ID: string(ModeSplit), Label: "源码分栏", Type: mygo.MenuItemRadio, Accelerator: "Alt+CmdOrCtrl+/", Click: send(CommandSplit)},
			mygo.Separator(),
			{ID: "focus", Label: "聚光灯模式", Type: mygo.MenuItemCheckbox, Accelerator: "Shift+CmdOrCtrl+F", Click: send(CommandFocus)},
			{ID: "inline", Label: "行内渲染", Type: mygo.MenuItemCheckbox, Click: send(CommandInline)},
			mygo.Separator(),
			{Role: mygo.RoleToggleFullScreen},
		}},
		{Role: mygo.RoleWindowMenu},
	})
	return menuBar
}

// viewService lets pages put their view state into the View menu.
type viewService struct{ mu sync.Mutex }

// Sync shows the calling window's view state in the View menu while that
// window is focused.
func (v *viewService) Sync(ctx context.Context, s ViewState) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if menuBar == nil || mygo.CallerWindow(ctx) != mygo.FocusedWindow() {
		return
	}
	for _, m := range []Mode{ModeLive, ModePreview, ModeEdit, ModeSplit} {
		menuBar.ItemByID(string(m)).SetChecked(m == s.Mode)
	}
	menuBar.ItemByID("focus").SetChecked(s.Focus)
	menuBar.ItemByID("inline").SetChecked(s.Inline)
}

// shareCardOnContextMenu puts 生成分享卡片 first in the page's context menu
// over a selection, above the webview's own items.
func shareCardOnContextMenu(win *mygo.Window) {
	win.Page().OnContextMenu(func(e *mygo.ContextMenuEvent) {
		if strings.TrimSpace(e.SelectionText) == "" {
			return
		}
		e.Menu.Insert(0, &mygo.MenuItem{Label: "生成分享卡片", Click: func(*mygo.MenuItem, *mygo.Window) { Commands.Emit(win, CommandShareCard) }})
		e.Menu.Insert(1, mygo.Separator())
	})
}
