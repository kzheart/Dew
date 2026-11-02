import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState, Prec, StateField, type Extension } from "@codemirror/state";
import { Decoration, drawSelection, EditorView, keymap, lineNumbers, type DecorationSet } from "@codemirror/view";
import { useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from "react";
import { liveTokens, renderExtensions, tokenClasses } from "../editor/render";
import { external } from "../editor/SourceEditor";
import { liveSyntax } from "../editor/syntax";
import { highlightedLines, type Block } from "../markdown/parse";
import { diff } from "../markdown/source";
import { codeLabel, codeMeta } from "../preview/Code";
import type { Caret } from "./session";

interface Props {
  /** What the active lines currently parse as; null while they are blank. */
  block: Block | null;
  source: string;
  /** The document line source starts on, which a share card reads a selection's lines by. */
  firstLine: number;
  caret: Caret;
  showLineNumbers: boolean;
  /** Typing aids shared with the source editor; they take keys before the block's own. */
  assist?: Extension;
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

/**
 * How the active element presents a text block, so the editor keeps that block's typography. It is
 * always a div: an element of another tag would replace it as the block changes kind while typed.
 */
function textShell(block: Block | null): HTMLAttributes<HTMLDivElement> {
  switch (block?.kind) {
    case "heading":
      return { role: "heading", "aria-level": Math.min(block.level, 6) };
    case "callout":
      return { className: `callout callout-${block.variant} lv-callout` };
    case "quote":
      return { className: "quote" };
    case "footnotes":
      return { className: "fns muted" };
    default:
      return {};
  }
}

/** The active block of live mode: its source in a small CodeMirror, in place of the rendered block. */
export function LiveEditor({ block, source, firstLine, caret, showLineNumbers, assist = [], tools, onChange, onExit, onCursor }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onExit, onCursor });
  callbacks.current = { onChange, onExit, onCursor };
  const shell = shellOf(block);

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
          // Before the block's keys, so ↑↓ and Esc reach an open menu rather than leave the block.
          assist,
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

  // In the commit that rendered `source`, not after the next keystroke (see SourceEditor).
  useLayoutEffect(() => {
    const v = view.current;
    const change = v && diff(v.state.doc.toString(), source);
    if (v && change) v.dispatch({ changes: change, annotations: external.of(true) });
  }, [source]);

  // The editor's element stays put while the block changes kind; moving it would drop the browser's
  // selection, which CodeMirror then reads back as the start.
  const meta = block?.kind === "code" && codeMeta(block.highlight);
  const head = shell === "code" && block?.kind === "code" && (
    <div className="cb-head">
      <span className="cb-lang">{codeLabel(block)}</span>
      {meta && <span className="cb-meta">{meta}</span>}
    </div>
  );
  const { className, ...attrs } = shell === "text" ? textShell(block) : {};
  const frame = shell === "code" ? "cb" : shell === "source" ? "lv-source" : `lv${className ? " " + className : ""}`;
  return (
    <div className={`blk act ${frame}`} data-line={firstLine} {...attrs}>
      {head}
      {shell === "source" && tools}
      <div className={shell === "code" ? "cb-body lv" : shell === "source" ? "src-box lv" : undefined} ref={host} />
    </div>
  );
}
