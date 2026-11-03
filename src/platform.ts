import { isMyGo, onDocumentReload, onDocumentState } from "mygo-runtime";
import { docFileURL } from "./app/docFile";
import { defaultPrefs } from "./defaultPrefs";
import * as go from "./mygo";
import type { CardBackground, Command, DocumentState, FileTab, FolderFile, Handoff, PageGuard, Prefs, PrefsChange, RecentFile, ViewState } from "./mygo";
import { changedKeys } from "./state/prefs";

export type { CardBackground, Command, DocumentState, FileTab, FolderFile, Handoff, PageGuard, Prefs, RecentFile };

/** What the page needs from its host: the app's Go services, or stand-ins in a browser tab. */
export interface Host {
  inApp: boolean;
  doc: {
    content(): Promise<string>;
    setContent(text: string): Promise<void>;
    state(): Promise<DocumentState>;
    save(): Promise<void>;
    revert(): Promise<void>;
    keepMine(): Promise<void>;
    /** The document's state now and as it changes. */
    followState(fn: (s: DocumentState) => void): () => void;
    onReload(fn: () => void): () => void;
  };
  /** The documents of the window's tab group, which the dock shows. */
  files: {
    list(): Promise<FileTab[]>;
    select(id: number): Promise<void>;
    close(id: number): Promise<void>;
    "new"(): Promise<void>;
    /** The page's part in a swap of windows under way as it loads. */
    part(): Promise<Handoff>;
    /** The page, leaving in a swap, is under the mist. */
    covered(): Promise<void>;
    /** The page drew, under the mist when it arrives in a swap. */
    ready(): Promise<void>;
    onHandoff(fn: (h: Handoff) => void): () => void;
    content(id: number): Promise<string>;
    /** Opens a Markdown file as a tab of the focused group. */
    open(path: string): Promise<void>;
    /** The Markdown files beside the window's document. */
    folder(): Promise<FolderFile[]>;
    /** Opens a new, empty file of that name beside the window's document. */
    create(name: string): Promise<void>;
    /** What the dock shows now and as it changes. */
    follow(fn: (tabs: FileTab[]) => void): () => void;
  };
  /** The files windows closed, with how far they were read. */
  recent: {
    list(): Promise<RecentFile[]>;
    pin(path: string, pinned: boolean): Promise<void>;
    clear(): Promise<void>;
    head(path: string): Promise<string>;
    /** Tells how far the window's document is read, from 0 to 1. */
    report(progress: number): Promise<void>;
    /** How far the window's document was read when it last closed. */
    resume(): Promise<number>;
    /** The recent files now and as they change. */
    follow(fn: (files: RecentFile[]) => void): () => void;
  };
  /** The preferences new windows start with; update saves only the named keys. */
  prefs: {
    get(): Promise<Prefs>;
    update(p: Prefs, keys: (keyof Prefs)[]): Promise<void>;
    /** What changed of the preferences since the page read since, and what other windows change. */
    follow(since: Prefs, fn: (p: Prefs, keys: (keyof Prefs)[]) => void): () => void;
  };
  exports: {
    pdf(html: string, name: string): Promise<string>;
    html(html: string, name: string): Promise<string>;
    richText(html: string, text: string): Promise<void>;
    copyImage(pngBase64: string): Promise<void>;
    saveImage(pngBase64: string, name: string): Promise<string>;
    svg(svg: string, name: string): Promise<string>;
  };
  assets: {
    /** Saves a pasted image beside the document; resolves to its relative path, or "" when the user would not save the document. */
    saveImage(base64: string, ext: string): Promise<string>;
    reveal(path: string): Promise<void>;
  };
  /** Where the page loads an image the document names by a path relative to itself. */
  imageURL(src: string): string;
  onCommand(fn: (c: Command) => void): () => void;
  syncView(s: ViewState): void;
}

function appHost(): Host {
  return {
    inApp: true,
    doc: {
      content: go.Doc.content,
      setContent: go.Doc.setContent,
      state: go.Doc.state,
      save: go.Doc.save,
      revert: go.Doc.revert,
      keepMine: go.Conflict.keepMine,
      followState: (fn) => follow(onDocumentState, go.Doc.state, fn),
      onReload: onDocumentReload,
    },
    files: { ...go.Files, follow: (fn) => follow((f) => go.events.files.on(f), go.Files.list, fn), onHandoff: (fn) => go.events.handoff.on(fn) },
    recent: { ...go.Recent, follow: (fn) => follow((f) => go.events.recent.on(f), go.Recent.list, fn) },
    prefs: {
      ...go.Prefs,
      follow: (since, fn) =>
        follow<PrefsChange>(
          (f) => go.events.prefs.on(f),
          () => go.Prefs.get().then((p) => ({ prefs: p, keys: changedKeys(since, p) })),
          (c) => fn(c.prefs, c.keys as (keyof Prefs)[]),
        ),
    },
    exports: go.Export,
    assets: go.Assets,
    imageURL: (src) => docFileURL(src) ?? src,
    onCommand: (fn) => go.events.command.on(fn),
    syncView: (s) => void go.View.sync(s).catch(() => {}),
  };
}

const samples = import.meta.glob<string>("../samples/*.md", { query: "?raw", import: "default" });

/**
 * A browser tab edits a sample in memory (?doc=<name> picks it) and exports
 * nothing. Its dock lists every sample, and picking one loads it in the tab.
 */
async function browserHost(): Promise<Host> {
  const wanted = `../samples/${new URLSearchParams(location.search).get("doc")}.md`;
  const path = wanted in samples ? wanted : "../samples/版本说明.md";
  const name = path.slice("../samples/".length);
  let text = await samples[path]!();
  let state: DocumentState = { name, path: "", edited: false, readOnly: false, conflict: false, deleted: false };
  const listeners = new Set<(s: DocumentState) => void>();
  const fileListeners = new Set<(tabs: FileTab[]) => void>();
  const pastedImages = new Map<string, string>();
  const paths = Object.keys(samples);
  const tabs = (): FileTab[] =>
    paths.map((p, i) => ({ id: i + 1, name: p.slice("../samples/".length), path: p, edited: p === path && state.edited, untitled: false, current: p === path }));
  const setState = (s: DocumentState) => {
    state = s;
    listeners.forEach((fn) => fn(s));
    fileListeners.forEach((fn) => fn(tabs()));
  };
  return {
    inApp: false,
    doc: {
      content: async () => text,
      setContent: async (t) => {
        text = t;
        if (!state.edited) setState({ ...state, edited: true });
      },
      state: async () => state,
      save: async () => setState({ ...state, edited: false }),
      revert: async () => {},
      keepMine: async () => {},
      followState: (fn) => {
        listeners.add(fn);
        fn(state);
        return () => listeners.delete(fn);
      },
      onReload: () => () => {},
    },
    files: {
      list: async () => tabs(),
      select: async (id) => {
        const p = paths[id - 1];
        if (p && p !== path) location.search = `?doc=${encodeURIComponent(p.slice("../samples/".length, -".md".length))}`;
      },
      close: async () => {},
      new: async () => {},
      part: async () => ({ kind: "", role: "" }),
      covered: async () => {},
      ready: async () => {},
      onHandoff: () => () => {},
      content: async (id) => {
        const p = paths[id - 1];
        return p === path ? text : p ? samples[p]!() : "";
      },
      open: async () => {},
      folder: async () => [],
      create: async () => {},
      follow: (fn) => {
        fileListeners.add(fn);
        fn(tabs());
        return () => fileListeners.delete(fn);
      },
    },
    recent: {
      list: async () => [],
      pin: async () => {},
      clear: async () => {},
      head: async () => "",
      report: async () => {},
      resume: async () => 0,
      follow: () => () => {},
    },
    prefs: { get: async () => defaultPrefs, update: async () => {}, follow: () => () => {} },
    exports: {
      pdf: async () => "",
      html: async () => "",
      richText: async () => {},
      copyImage: async () => {},
      saveImage: async () => "",
      svg: async () => "",
    },
    // Pasted images stay in memory, under the path the app would have saved them at.
    assets: {
      saveImage: async (base64, ext) => {
        const path = `./assets/paste-${pastedImages.size + 1}.${ext}`;
        pastedImages.set(path, `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${base64}`);
        return path;
      },
      reveal: async () => {},
    },
    imageURL: (src) => pastedImages.get(src) ?? src,
    onCommand: () => () => {},
    syncView: () => {},
  };
}

export const host: Host = isMyGo() ? appHost() : await browserHost();

/**
 * Takes what the Go side sends as it changes, and what read returns unless a change came first:
 * a reply can arrive after a change it doesn't hold. Returns the unsubscribe.
 */
function follow<T>(onChange: (fn: (v: T) => void) => () => void, read: () => Promise<T>, take: (v: T) => void): () => void {
  let changed = false;
  const off = onChange((v) => {
    changed = true;
    take(v);
  });
  void read().then((v) => !changed && take(v), () => {});
  return off;
}
