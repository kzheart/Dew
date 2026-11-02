import { isMyGo, onDocumentReload, onDocumentState } from "mygo-runtime";
import { docFileURL } from "./app/docFile";
import { defaultPrefs } from "./defaultPrefs";
import * as go from "./mygo";
import type { CardBackground, Command, DocumentState, FileTab, PageGuard, Prefs, ViewState } from "./mygo";

export type { CardBackground, Command, DocumentState, FileTab, PageGuard, Prefs };

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
    onState(fn: (s: DocumentState) => void): () => void;
    onReload(fn: () => void): () => void;
  };
  /** The documents of the window's tab group, which the dock shows. */
  files: {
    list(): Promise<FileTab[]>;
    select(id: number): Promise<void>;
    close(id: number): Promise<void>;
    "new"(): Promise<void>;
    content(id: number): Promise<string>;
    onChange(fn: (tabs: FileTab[]) => void): () => void;
  };
  prefs: { get(): Promise<Prefs>; set(p: Prefs): Promise<void> };
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
      onState: onDocumentState,
      onReload: onDocumentReload,
    },
    files: { ...go.Files, onChange: (fn) => go.events.files.on(fn) },
    prefs: go.Prefs,
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
    paths.map((p, i) => ({ id: i + 1, name: p.slice("../samples/".length), edited: p === path && state.edited, untitled: false, current: p === path }));
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
      onState: (fn) => {
        listeners.add(fn);
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
      content: async (id) => {
        const p = paths[id - 1];
        return p === path ? text : p ? samples[p]!() : "";
      },
      onChange: (fn) => {
        fileListeners.add(fn);
        return () => fileListeners.delete(fn);
      },
    },
    prefs: { get: async () => defaultPrefs, set: async () => {} },
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
