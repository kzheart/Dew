import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState, Prec, StateField, type Extension } from "@codemirror/state";
import { Decoration, drawSelection, EditorView, keymap, lineNumbers, type DecorationSet } from "@codemirror/view";
import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { liveTokens, renderExtensions, tokenClasses } from "../editor/render";
import { external } from "../editor/SourceEditor";
import { liveSyntax } from "../editor/syntax";
import { languageLabel } from "../markdown/highlight";
import { highlightedLines, type Block } from "../markdown/parse";
import { diff } from "../markdown/source";
import { codeMeta } from "../preview/Blocks";
import type { Caret } from "./session";

interface Props {
  /** What the active lines currently parse as; null while they are blank. */
  block: Block | null;
  source: string;
  caret: Caret;
  showLineNumbers: boolean;
  tools?: ReactNode;
  onChange(src: string): void;
  /** -1 or 1 to move to the block above or below, 0 to leave. */
  onExit(dir: -1 | 0 | 1): void;
  onCursor(line: number, ch: number): void;
}

const FENCE = /^\s*(`{3,}|~{3,})/;

/** Whether the cursor sits on the first (dir -1) or last (dir 1) visual line. */
function atEdge(view: EditorView, dir: -1 | 1) {
  const sel = view.state.selection.main;
  if (!sel.empty) return false;
  const here = view.coordsAtPos(sel.head);
  const edge = view.coordsAtPos(dir < 0 ? 0 : view.state.doc.length);
  return !!here && !!edge && Math.abs(here.top - edge.top) < 2;
}

const highlightedLine = Decoration.line({ class: "cl-hl" });

function fenceHighlights(state: EditorState): DecorationSet {
  const first = state.doc.line(1).text;
  if (!FENCE.test(first)) return Decoration.none;
  const lines = highlightedLines(first.replace(FENCE, "")).filter((n) => n + 1 <= state.doc.lines);
  return Decoration.set(lines.map((n) => highlightedLine.range(state.doc.line(n + 1).from)));
}

/** A code block keeps its highlighted lines and its numbering, which skips the fences. */
function codeExtensions(showLineNumbers: boolean): Extension {
  const highlights = StateField.define<DecorationSet>({
    create: fenceHighlights,
    update: (v, tr) => (tr.docChanged ? fenceHighlights(tr.state) : v),
    provide: (f) => EditorView.decorations.from(f),
  });
  const isFence = (n: number, state: EditorState) => n === 1 || (n === state.doc.lines && FENCE.test(state.doc.line(n).text));
  return [
    highlights,
    showLineNumbers ? lineNumbers({ formatNumber: (n, state) => (isFence(n, state) ? "" : String(n - 1)) }) : [],
  ];
}

type Shell = "code" | "source" | "text";

function shellOf(block: Block | null): Shell {
  switch (block?.kind) {
    case "code":
      return "code";
    case "frontmatter":
    case "table":
    case "math":
    case "html":
      return "source";
    default:
      return "text";
  }
}

/** The element a text block edits in, so the editor keeps that block's typography. */
function textShell(block: Block | null): { tag: string; className: string } {
  switch (block?.kind) {
    case "heading":
      return { tag: `h${Math.min(block.level, 6)}`, className: "" };
    case "callout":
      return { tag: "div", className: `callout callout-${block.variant} lv-callout` };
    case "quote":
      return { tag: "blockquote", className: "quote" };
    case "footnotes":
      return { tag: "div", className: "fns muted" };
    case "list":
    case "hr":
      return { tag: "div", className: "" };
    default:
      return { tag: "p", className: "" };
  }
}

/** The active block of live mode: its source in a small CodeMirror, in place of the rendered block. */
export function LiveEditor({ block, source, caret, showLineNumbers, tools, onChange, onExit, onCursor }: Props) {
  const host = useRef<HTMLElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onExit, onCursor });
  callbacks.current = { onChange, onExit, onCursor };
  const shell = shellOf(block);

  // A block can change kind while typed (a paragraph becoming a heading); the
  // editor then moves into the new element, keeping its focus, rather than
  // starting over.
  const attach = useCallback((el: HTMLElement | null) => {
    host.current = el;
    const v = view.current;
    if (!el || !v || v.dom.parentElement === el) return;
    el.appendChild(v.dom);
    v.focus();
  }, []);

  useLayoutEffect(() => {
    const exit = (dir: -1 | 0 | 1) => {
      callbacks.current.onExit(dir);
      return true;
    };
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: source,
        extensions: [
          history(),
          drawSelection(),
          liveSyntax(),
          renderExtensions,
          tokenClasses.of(liveTokens),
          shell === "code" ? codeExtensions(showLineNumbers) : EditorView.lineWrapping,
          Prec.highest(
            keymap.of([
              { key: "ArrowUp", run: (view) => atEdge(view, -1) && exit(-1) },
              { key: "ArrowDown", run: (view) => atEdge(view, 1) && exit(1) },
              { key: "Escape", run: () => exit(0) },
            ]),
          ),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.scrollMargins.of(() => ({ top: 110, bottom: 80 })),
          EditorView.contentAttributes.of({ "aria-label": "当前块的 Markdown 源码", spellcheck: "false", autocorrect: "off", autocapitalize: "off" }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !u.transactions.some((tr) => tr.annotation(external))) {
              callbacks.current.onChange(u.state.doc.toString());
            }
            if (u.docChanged || u.selectionSet) {
              const head = u.state.selection.main.head;
              const line = u.state.doc.lineAt(head);
              callbacks.current.onCursor(line.number - 1, head - line.from);
            }
          }),
        ],
      }),
    });
    view.current = v;
    const len = v.state.doc.length;
    const anchor = caret === "start" ? 0 : caret === "end" ? len : Math.min(caret, len);
    v.dispatch({ selection: { anchor }, effects: EditorView.scrollIntoView(anchor, { y: "nearest" }) });
    v.focus();
    return () => {
      view.current = null;
      v.destroy();
    };
    // One editor per activation (the parent keys it); later props are applied below.
  }, []);

  useEffect(() => {
    const v = view.current;
    const change = v && diff(v.state.doc.toString(), source);
    if (v && change) v.dispatch({ changes: change, annotations: external.of(true) });
  }, [source]);

  if (shell === "code" && block?.kind === "code") {
    const meta = codeMeta(block.highlight);
    return (
      <div className="blk act cb">
        <div className="cb-head">
          <span className="cb-lang">{languageLabel(block.lang)}</span>
          {meta && <span className="cb-meta">{meta}</span>}
        </div>
        <div className="cb-body lv" ref={attach} />
      </div>
    );
  }
  if (shell === "source") {
    return (
      <div className="blk act lv-source">
        {tools}
        <div className="src-box lv" ref={attach} />
      </div>
    );
  }
  const { tag: Tag, className } = textShell(block);
  const El = Tag as "div";
  return <El className={`blk act lv${className ? " " + className : ""}`} ref={attach} />;
}
