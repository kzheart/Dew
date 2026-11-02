import type { Extension } from "@codemirror/state";
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import { blockLabel } from "../app/labels";
import { blockAtLine, type Block, type ParsedDocument } from "../markdown/parse";
import { deleteLines, replaceLines, sliceLines } from "../markdown/source";
import { addColumn, addRow, alignments, columnAt, setAlign } from "../markdown/table";
import type { Cursor } from "../editor/SourceEditor";
import type { LiveEditing } from "../preview/Article";
import type { LineRange } from "../preview/layout";
import { renderedPrefixAt, sourceOffsetFor } from "./caret";
import { LiveEditor } from "./LiveEditor";
import { blockWithin, neighbor, rangeAfterEdit, type Active, type Caret } from "./session";
import { TableTools } from "./TableTools";

interface Options {
  enabled: boolean;
  doc: ParsedDocument;
  text: string;
  edit(change: (text: string) => string): void;
  revision: number;
  showLineNumbers: boolean;
  assist: Extension;
  article: RefObject<HTMLElement | null>;
  /** The caret as a document line and column, for the source editor to pick up. */
  onCaret(cursor: Cursor): void;
}

/** Live mode: which block is being edited, and the handlers that move between blocks. */
export function useLive({ enabled, doc, text, edit, revision, showLineNumbers, assist, article, onCaret }: Options) {
  const [active, setActive] = useState<Active | null>(null);
  const [cursor, setCursor] = useState({ line: 0, ch: 0 });
  // Editor events arrive between renders, so handlers read the latest values from refs.
  const current = useRef<Active | null>(null);
  const latest = useRef({ doc, text });
  latest.current = { doc, text };
  const keys = useRef(0);
  const lastLine = useRef<number | null>(null);

  const whole = () => ({ start: 1, end: Math.max(1, latest.current.doc.lineCount) });
  const set = (a: Active | null) => {
    current.current = a;
    setActive(a);
  };
  const activate = (range: LineRange, caret: Caret) => {
    set({ start: range.start, end: range.end, caret, key: ++keys.current });
    lastLine.current = range.start;
    setCursor({ line: 0, ch: 0 });
  };
  const leave = () => {
    set(null);
    article.current?.focus({ preventScroll: true });
  };
  const replace = (src: string) => {
    const a = current.current;
    if (!a) return;
    edit((t) => replaceLines(t, a.start, a.end, src));
    set({ ...a, ...rangeAfterEdit(a, src) });
  };

  useEffect(() => {
    if (!enabled) set(null);
  }, [enabled]);

  useEffect(() => {
    if (enabled && !current.current && doc.blocks.length === 0) activate(whole(), "start");
  }, [enabled, doc]);

  const seenRevision = useRef(revision);
  useEffect(() => {
    if (revision === seenRevision.current) return;
    seenRevision.current = revision;
    const a = current.current;
    if (!a) return;
    const blocks = latest.current.doc.blocks;
    const b = blocks[blockAtLine(blocks, a.start)];
    set(b ? { ...a, start: b.start, end: b.end } : null);
  }, [revision]);

  if (!enabled) return { live: null, label: null };

  const onActivate = (block: Block | null, e: MouseEvent) => {
    const target = e.target as Element;
    if (target.closest(".act")) return;
    if (!block) {
      if (!latest.current.doc.blocks.length) activate(whole(), "end");
      return;
    }
    const el = target.closest<HTMLElement>("[data-src]");
    const prefix = el && renderedPrefixAt(el, e.clientX, e.clientY);
    const src = sliceLines(latest.current.text, block.start, block.end);
    activate(block, prefix == null ? "end" : sourceOffsetFor(src, prefix));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget || current.current || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    e.preventDefault();
    const down = e.key === "ArrowDown";
    const blocks = latest.current.doc.blocks;
    if (!blocks.length) return activate(whole(), down ? "start" : "end");
    const line = lastLine.current;
    const b = line === null ? (down ? blocks[0] : blocks.at(-1)) : neighbor(blocks, { start: line, end: line }, down ? 1 : -1) ?? blocks[blockAtLine(blocks, line)];
    if (b) activate(b, down ? "start" : "end");
  };

  const onExit = (dir: -1 | 0 | 1) => {
    const a = current.current;
    if (!a) return;
    if (dir === 0) return leave();
    const b = neighbor(latest.current.doc.blocks, a, dir);
    if (b) activate(b, dir < 0 ? "end" : "start");
  };

  if (!active) return { live: { range: null, editor: null, onActivate, onKeyDown }, label: null };

  const block = blockWithin(doc.blocks, active);
  const source = sliceLines(text, active.start, active.end);
  const wholeTable = block?.kind === "table" && block.start === active.start && block.end === active.end;
  const col = columnAt(source.split("\n")[cursor.line] ?? "", cursor.ch);
  const tools = wholeTable && (
    <TableTools
      align={alignments(source)[col] ?? null}
      onAlign={(a) => replace(setAlign(source, col, a))}
      onAddRow={() => replace(addRow(source, cursor.line).src)}
      onAddColumn={() => replace(addColumn(source, col).src)}
      onDelete={() => {
        set(null);
        edit((t) => deleteLines(t, active.start, active.end));
      }}
    />
  );

  const live: LiveEditing = {
    range: active,
    onActivate,
    onKeyDown,
    editor: (
      <LiveEditor
        key={`${active.key}-${showLineNumbers}`}
        block={block}
        source={source}
        caret={active.caret}
        showLineNumbers={showLineNumbers}
        assist={assist}
        tools={tools}
        onChange={replace}
        onExit={onExit}
        onCursor={(line, ch) => {
          setCursor({ line, ch });
          if (current.current) onCaret({ line: current.current.start + line, col: ch + 1 });
        }}
      />
    ),
  };
  return { live, label: block ? blockLabel(block) : "段落" };
}
