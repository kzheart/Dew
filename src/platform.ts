import { isMyGo, onDocumentReload, onDocumentState } from "mygo-runtime";
import * as go from "./mygo";
import type { Command, DocumentState, Prefs, ViewState } from "./mygo";

export type { Command, DocumentState, Prefs };

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
  prefs: { get(): Promise<Prefs>; set(p: Prefs): Promise<void> };
  exports: {
    pdf(html: string, name: string): Promise<string>;
    html(html: string, name: string): Promise<string>;
    richText(html: string, text: string): Promise<void>;
    shareCard(pngBase64: string, name: string): Promise<string>;
  };
  onCommand(fn: (c: Command) => void): () => void;
  syncView(s: ViewState): void;
}

export const defaultPrefs: Prefs = {
  mw: 720, fs: 16, lh: 1.75, pg: 1, ff: "sans", bg: "white",
  base: "live", source: "off", inline: false, showLn: true,
};

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
    prefs: go.Prefs,
    exports: go.Export,
    onCommand: (fn) => go.events.command.on(fn),
    syncView: (s) => void go.View.sync(s).catch(() => {}),
  };
}

/** A browser tab edits the sample in memory and exports nothing. */
async function browserHost(): Promise<Host> {
  let text = (await import("../samples/版本说明.md?raw")).default;
  let state: DocumentState = { name: "版本说明.md", path: "", edited: false, readOnly: false, conflict: false, deleted: false };
  const listeners = new Set<(s: DocumentState) => void>();
  const setState = (s: DocumentState) => {
    state = s;
    listeners.forEach((fn) => fn(s));
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
    prefs: { get: async () => defaultPrefs, set: async () => {} },
    exports: {
      pdf: async () => "",
      html: async () => "",
      richText: async () => {},
      shareCard: async () => "",
    },
    onCommand: () => () => {},
    syncView: () => {},
  };
}

export const host: Host = isMyGo() ? appHost() : await browserHost();
