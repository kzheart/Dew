import type { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { flashLine, locateLine } from "../editor/render";
import { SourceEditor, type Cursor } from "../editor/SourceEditor";
import { exportDocument } from "../export/actions";
import { selectedPassage } from "../export/selection";
import { useLive } from "../live/useLive";
import { parseDocument } from "../markdown/parse";
import { toggleTask } from "../markdown/source";
import { Article } from "../preview/Article";
import type { BlockActions, LightboxTarget } from "../preview/actions";
import { host, type Command, type DocumentState, type Prefs } from "../platform";
import { modeOf, viewReducer, type ViewState } from "../state/view";
import { Divider, StatusBar, Toc } from "./Chrome";
import { Header, type ExportAction, type Popover } from "./Header";
import { useDebouncedEffect, usePresence } from "./hooks";
import { Lightbox } from "./Lightbox";
import { useDocument } from "./useDocument";
import { useScrollSync } from "./useScrollSync";

export interface Initial {
  text: string;
  state: DocumentState;
  prefs: Prefs;
}

export function App({ initial }: { initial: Initial }) {
  const doc = useDocument(initial);
  const [prefs, setPrefs] = useState(initial.prefs);
  const [view, dispatch] = useReducer(viewReducer, {
    base: initial.prefs.base,
    source: initial.prefs.source === "off" ? null : initial.prefs.source,
  } satisfies ViewState);
  const mode = modeOf(view);
  const [focus, setFocus] = useState(false);
  const [popover, setPopover] = useState<Popover | null>(null);
  const [compact, setCompact] = useState(false);
  const [toc, setToc] = useState<{ line: number | null; pct: number }>({ line: null, pct: 0 });
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [split, setSplit] = useState(50);
  const edView = useRef<EditorView | null>(null);
  const [zoomed, setZoomed] = useState<LightboxTarget | null>(null);
  const lightbox = usePresence(zoomed !== null, 200);
  const lastZoomed = useRef<LightboxTarget | null>(null);
  if (zoomed) lastZoomed.current = zoomed;
  const closeLightbox = useCallback(() => setZoomed(null), []);

  const dir = doc.state.path ? doc.state.path.slice(0, doc.state.path.lastIndexOf("/")) : "";
  const parsed = useMemo(() => parseDocument(doc.text, { resolveImage: (src) => resolveImage(src, dir) }), [doc.text, dir]);

  const showEd = mode === "edit" || mode === "split";
  const showPv = mode !== "edit";
  const isLive = mode === "live";
  const isSplit = mode === "split";

  const updatePrefs = useCallback((p: Partial<Prefs>) => setPrefs((old) => ({ ...old, ...p })), []);
  const sourcePref: Prefs["source"] = view.source ?? "off";
  useDebouncedEffect({ ...prefs, base: view.base, source: sourcePref }, 300, (p) => void host.prefs.set(p).catch(() => {}));

  const pvRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const sync = useScrollSync(edView, pvRef, isSplit);
  // Entering split, the pane that was already on screen keeps its place and the new one follows it.
  const prevMode = useRef(mode);
  useEffect(() => {
    const from = prevMode.current;
    prevMode.current = mode;
    if (mode !== "split" || from === "split") return;
    const id = requestAnimationFrame(() => (from === "edit" ? sync.fromEditor() : sync.fromPreview()));
    return () => cancelAnimationFrame(id);
  }, [mode]);
  const lastY = useRef<Record<string, number>>({});
  const trackScroll = (el: HTMLElement, key: string) => {
    const y = el.scrollTop;
    const last = lastY.current[key] ?? 0;
    lastY.current[key] = y;
    if (popover) return;
    let c = compact;
    if (y < 40) c = false;
    else if (y - last > 6) c = true;
    else if (last - y > 6) c = false;
    if (c !== compact) setCompact(c);
  };

  const updateToc = useCallback(() => {
    const pv = pvRef.current;
    if (!pv) return;
    const max = pv.scrollHeight - pv.clientHeight;
    const pct = max > 0 ? Math.round((pv.scrollTop / max) * 100) : 0;
    let line: number | null = parsed.headings[0]?.line ?? null;
    for (const h of pv.querySelectorAll<HTMLElement>("[data-sec]")) {
      if (h.offsetTop - 180 <= pv.scrollTop) line = Number(h.dataset.src);
    }
    setToc((t) => (t.line === line && t.pct === pct ? t : { line, pct }));
  }, [parsed.headings]);
  useEffect(updateToc, [updateToc, mode]);

  const jump = (line: number) => {
    const pv = pvRef.current;
    const h = pv?.querySelector<HTMLElement>(`[data-sec="h-${line}"]`);
    if (pv && h) pv.scrollTo({ top: Math.max(0, h.offsetTop - 100), behavior: "smooth" });
  };

  const pendingLocate = useRef<number | null>(null);
  const locate = useCallback((line: number) => {
    pendingLocate.current = line;
    dispatch({ type: "locate" });
  }, []);
  useEffect(() => {
    const v = edView.current;
    const line = pendingLocate.current;
    if (!v || line === null) return;
    pendingLocate.current = null;
    locateLine(v, line);
    v.focus();
  });

  const { edit } = doc;
  const actions: BlockActions = useMemo(
    () => ({
      interactive: true,
      showLineNumbers: prefs.showLn,
      onToggleLineNumbers: () => setPrefs((p) => ({ ...p, showLn: !p.showLn })),
      onToggleTask: (line) => {
        edit((t) => toggleTask(t, line));
        if (edView.current) flashLine(edView.current, line, 1200);
      },
      onZoom: setZoomed,
    }),
    [prefs.showLn, edit],
  );

  const { live, label: liveLabel } = useLive({
    enabled: isLive,
    doc: parsed,
    text: doc.text,
    edit,
    revision: doc.revision,
    showLineNumbers: prefs.showLn,
    article: articleRef,
    onCaret: setCursor,
  });

  const runExport = (action: ExportAction) => {
    const selection = action === "shareCard" ? selectedPassage(edView.current) : "";
    const source = { text: doc.text, fileName: doc.state.name, prefs, resolveImage: (src: string) => resolveImage(src, dir), selection };
    void doc.flush().then(() => exportDocument(action, source)).catch((e) => console.error("export failed", e));
  };

  const onCommand = useRef<(c: Command) => void>(() => {});
  onCommand.current = (c) => {
    switch (c) {
      case "save":
        void doc.save();
        break;
      case "live":
      case "preview":
        dispatch({ type: "base", base: c });
        break;
      case "source":
        dispatch({ type: "toggleLayout", layout: "full" });
        break;
      case "split":
        dispatch({ type: "toggleLayout", layout: "split" });
        break;
      case "focus":
        setFocus((f) => !f);
        break;
      case "inline":
        updatePrefs({ inline: !prefs.inline });
        break;
      case "exportPDF":
        runExport("pdf");
        break;
      case "exportHTML":
        runExport("html");
        break;
      case "copyRichText":
        runExport("richText");
        break;
      case "shareCard":
        runExport("shareCard");
        break;
    }
  };
  useEffect(() => host.onCommand((c) => onCommand.current(c)), []);

  useEffect(() => {
    const sync = () => host.syncView({ mode, focus, inline: prefs.inline });
    sync();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, [mode, focus, prefs.inline]);

  const theme = showEd && !isSplit ? "" : prefs.bg === "night" ? " th-night" : prefs.bg === "paper" ? " th-paper" : "";

  return (
    <div className={`app${theme}${isSplit ? " is-split" : ""}${compact ? " compact" : ""}`}>
      <main className="main">
        {showEd && (
          <section className="pane-ed" aria-label="源码编辑" style={{ flex: isSplit ? `0 0 ${split}%` : "1 1 auto" }}>
            <SourceEditor
              text={doc.text}
              inline={prefs.inline}
              focus={focus}
              wide={!isSplit}
              initialCursor={cursor}
              viewRef={edView}
              onChange={edit}
              onCursor={setCursor}
              onScroll={() => {
                if (edView.current) trackScroll(edView.current.scrollDOM, "e");
                sync.fromEditor();
              }}
            />
          </section>
        )}
        {isSplit && <Divider split={split} onSplit={setSplit} />}
        {showPv && (
          <section className={`pv pane-pv bg-${prefs.bg}`} aria-label={isLive ? "实时编辑" : "预览"}>
            <div
              className="pv-scroll"
              ref={pvRef}
              onScroll={(e) => {
                trackScroll(e.currentTarget, "p");
                updateToc();
                sync.fromPreview();
              }}
            >
              <Article doc={parsed} typography={prefs} focus={focus} actions={actions} live={live} onLocate={locate} articleRef={articleRef} />
            </div>
            <Toc headings={parsed.headings} active={toc.line} pct={toc.pct} onJump={jump} />
          </section>
        )}
      </main>
      <div className="edge" aria-hidden="true" />
      <Header
        doc={doc.state}
        view={view}
        focus={focus}
        inline={prefs.inline}
        popover={popover}
        prefs={prefs}
        onBase={(base) => dispatch({ type: "base", base })}
        onToggleSource={() => dispatch({ type: "toggleSource" })}
        onLayout={(layout) => dispatch({ type: "layout", layout })}
        onToggleInline={() => updatePrefs({ inline: !prefs.inline })}
        onToggleFocus={() => setFocus(!focus)}
        onPopover={setPopover}
        onPrefs={updatePrefs}
        onExport={runExport}
        onKeepMine={() => void host.doc.keepMine().catch(() => {})}
        onRevert={() => void host.doc.revert().catch(() => {})}
      />
      {lightbox.mounted && lastZoomed.current?.kind === "code" && (
        <Lightbox
          block={lastZoomed.current.block}
          section={parsed.headings.filter((h) => h.line < lastZoomed.current!.block.start).at(-1)?.text ?? null}
          showLineNumbers={prefs.showLn}
          leaving={lightbox.leaving}
          onClose={closeLightbox}
        />
      )}
      <StatusBar chars={parsed.stats.chars} minutes={parsed.stats.minutes} mode={mode} cursor={cursor} blockLabel={liveLabel} />
    </div>
  );
}

/** Relative image paths name files next to the document, which Go serves. */
function resolveImage(src: string, dir: string): string {
  if (!dir || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//")) return src;
  const path = src.startsWith("/") ? src : new URL(src, `file://${dir}/`).pathname;
  return `docfile://localhost${path}`;
}
