import type { EditorView } from "@codemirror/view";
import { useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { editAssist } from "../assist/editAssist";
import { encodeImage } from "../assist/image";
import { flashLine, locateLine } from "../editor/render";
import { SourceEditor, type Cursor } from "../editor/SourceEditor";
import type { CardContent } from "../export/card";
import { selectedCard } from "../export/selection";
import { baseName } from "../export/names";
import { useLive } from "../live/useLive";
import { parseDocument, type ParsedDocument } from "../markdown/parse";
import { reuseUnchanged } from "../markdown/reuse";
import { toggleTask } from "../markdown/source";
import { Article } from "../preview/Article";
import type { BlockActions, LightboxTarget } from "../preview/actions";
import { host, type Command, type DocumentState, type FileTab, type Prefs } from "../platform";
import { modeOf, viewReducer, type ViewState } from "../state/view";
import { Divider, StatusBar, Toc } from "./Chrome";
import { Dock } from "./Dock";
import { Header, type ExportAction, type Popover } from "./Header";
import { useDebouncedEffect, usePresence } from "./hooks";
import { LightTable } from "./LightTable";
import { Lightbox } from "./Lightbox";
import { ShareCard } from "./ShareCard";
import { Toasts, useToasts } from "./Toasts";
import { useDocument } from "./useDocument";
import { useFiles } from "./useFiles";
import { useScrollSync } from "./useScrollSync";

export interface Initial {
  text: string;
  state: DocumentState;
  prefs: Prefs;
  files: FileTab[];
}

export function App({ initial }: { initial: Initial }) {
  const doc = useDocument(initial);
  const files = useFiles(initial.files);
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
  const [card, setCard] = useState<CardContent | null>(null);
  const sharing = usePresence(card !== null, 200);
  const lastCard = useRef<CardContent | null>(null);
  if (card) lastCard.current = card;
  const closeCard = useCallback(() => setCard(null), []);
  const [overview, setOverview] = useState(false);
  const lightTable = usePresence(overview, 240);
  const closeOverview = useCallback(() => setOverview(false), []);
  const openOverview = () => {
    setPopover(null);
    setOverview(true);
  };

  const showEd = mode === "edit" || mode === "split";
  const showPv = mode !== "edit";
  const isLive = mode === "live";
  const isSplit = mode === "split";

  // CodeMirror paints the keystroke itself, so outside live mode the preview may trail it by a render.
  // Live mode edits blocks by their line ranges and needs them current.
  const deferredText = useDeferredValue(doc.text);
  const parseText = isLive ? doc.text : deferredText;
  const lastParsed = useRef<ParsedDocument | null>(null);
  const parsed = useMemo(
    () => (lastParsed.current = reuseUnchanged(lastParsed.current, parseDocument(parseText, { resolveImage: host.imageURL }))),
    [parseText],
  );

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
  const docName = doc.state.name;
  const toasts = useToasts();
  const { notify } = toasts;
  const { flush } = doc;
  const assist = useMemo(
    () =>
      editAssist({
        notify,
        async saveImage(image) {
          // An untitled document is saved first, with the text the page holds.
          await flush();
          const { base64, ext } = await encodeImage(image);
          const path = await host.assets.saveImage(base64, ext);
          return path ? { path } : { reason: "文稿还没有保存，截图没有存放的位置" };
        },
        reveal: (path) => void host.assets.reveal(path).catch((e) => console.error("reveal failed", e)),
      }),
    [notify, flush],
  );

  const { live, label: liveLabel, editTable } = useLive({
    enabled: isLive,
    doc: parsed,
    text: doc.text,
    edit,
    revision: doc.revision,
    showLineNumbers: prefs.showLn,
    assist,
    article: articleRef,
    onCaret: setCursor,
  });
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
      theme: prefs.bg,
      onExportSvg: (svg, engine) => void host.exports.svg(svg, `${baseName(docName)}-${engine}`).catch((e) => console.error("SVG export failed", e)),
      onEditTable: isLive ? editTable : undefined,
    }),
    [prefs.showLn, prefs.bg, docName, edit, isLive, editTable],
  );

  const runExport = (action: ExportAction) => {
    if (action === "shareCard") {
      const current = parseText === doc.text ? parsed : parseDocument(doc.text, { resolveImage: host.imageURL });
      setCard(selectedCard({ doc: current, text: doc.text, fileName: docName, editor: edView.current }));
      return;
    }
    const source = { text: doc.text, fileName: docName, prefs, resolveImage: host.imageURL };
    void doc
      .flush()
      .then(() => import("../export/actions"))
      .then(({ exportDocument }) => exportDocument(action, source))
      .catch((e) => console.error("export failed", e));
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
      case "overview":
        if (overview) closeOverview();
        else openOverview();
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
    <div className={`app${theme}${isSplit ? " is-split" : ""}${compact ? " compact" : ""}${overview ? " lt-on" : ""}`}>
      <main className="main">
        {showEd && (
          <section className="pane-ed" aria-label="源码编辑" style={{ flex: isSplit ? `0 0 ${split}%` : "1 1 auto" }}>
            <SourceEditor
              text={doc.text}
              inline={prefs.inline}
              focus={focus}
              wide={!isSplit}
              initialCursor={cursor}
              assist={assist}
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
      {lightbox.mounted && lastZoomed.current && (
        <Lightbox
          key={`${lastZoomed.current.kind}-${lastZoomed.current.block.start}`}
          target={lastZoomed.current}
          section={parsed.headings.filter((h) => h.line < lastZoomed.current!.block.start).at(-1)?.text ?? null}
          showLineNumbers={prefs.showLn}
          theme={prefs.bg}
          leaving={lightbox.leaving}
          onClose={closeLightbox}
        />
      )}
      {sharing.mounted && lastCard.current && (
        <ShareCard content={lastCard.current} prefs={prefs} fileName={docName} leaving={sharing.leaving} onPrefs={updatePrefs} onClose={closeCard} />
      )}
      <Toasts toasts={toasts.toasts} onDismiss={toasts.dismiss} />
      <StatusBar chars={parsed.stats.chars} minutes={parsed.stats.minutes} mode={mode} cursor={cursor} blockLabel={liveLabel} />
      <Dock
        files={files}
        onSelect={(id) => void host.files.select(id).catch(() => {})}
        onClose={(id) => void host.files.close(id).catch(() => {})}
        onNew={() => void host.files.new().catch(() => {})}
        onOverview={openOverview}
      />
      {lightTable.mounted && (
        <LightTable
          files={files}
          text={doc.text}
          leaving={lightTable.leaving}
          onSelect={(id) => {
            closeOverview();
            if (!files.find((f) => f.id === id)?.current) void host.files.select(id).catch(() => {});
          }}
          onCloseFile={(id) => void host.files.close(id).catch(() => {})}
          onNew={() => {
            closeOverview();
            void host.files.new().catch(() => {});
          }}
          onClose={closeOverview}
        />
      )}
    </div>
  );
}
