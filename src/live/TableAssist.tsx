import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { insertColumn, insertRow, moveColumn, setColumnWidths } from "../markdown/table";
import type { TableBlock } from "../preview/actions";
import { dropIndex, hoverAt, nearest, RAIL, resizeColumns, type TableGeometry, type TableHover } from "./tableHover";

/** Pixels of rendered width per dash of the delimiter row. */
const PX_PER_DASH = 8;
const MIN_COLUMN = 48;
const DRAG_THRESHOLD = 4;
const SYNCED_MS = 2600;

type Drag =
  | { kind: "move"; from: number; startX: number; gap: number | null }
  | { kind: "resize"; col: number; startX: number; start: number[] };

interface Props {
  block: TableBlock;
  /** Column widths in pixels while a border is dragged, which the table shows instead of its own. */
  draft: number[] | null;
  onDraft(widths: number[] | null): void;
  /** Rewrites the table's source; returns the new source. */
  onEdit(change: (src: string) => string): string;
}

function measure(blk: HTMLElement): TableGeometry | null {
  const table = blk.querySelector("table");
  const head = table?.tHead?.rows[0];
  if (!table || !head) return null;
  const o = blk.getBoundingClientRect();
  const cells = [...head.cells].map((c) => c.getBoundingClientRect());
  const body = [...(table.tBodies[0]?.rows ?? [])].map((r) => r.getBoundingClientRect().bottom);
  return {
    cols: [cells[0]!.left - o.left, ...cells.map((c) => c.right - o.left)],
    top: table.getBoundingClientRect().top - o.top,
    rows: [table.tHead!.getBoundingClientRect().bottom, ...body].map((y) => y - o.top),
  };
}

/**
 * A drag that ends over the table would click it, which opens its source in
 * live mode; the click comes in the same task as the pointerup, so a listener
 * removed on the next task catches only that one.
 */
function swallowClick() {
  const stop = (e: MouseEvent) => e.stopPropagation();
  window.addEventListener("click", stop, true);
  setTimeout(() => window.removeEventListener("click", stop, true));
}

const Plus = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/**
 * Live mode's controls on a rendered table: insert a column or row at the
 * edge the pointer is near, select and drag a column by its grip, drag a
 * border to resize. Every change rewrites the table's Markdown.
 */
export function TableAssist({ block, draft, onDraft, onEdit }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [geom, setGeom] = useState<TableGeometry | null>(null);
  const [hover, setHover] = useState<TableHover>({ target: null, col: null });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [synced, setSynced] = useState<{ row: string; key: number } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const blk = () => root.current?.parentElement ?? null;
  const remeasure = () => {
    const el = blk();
    const g = el && measure(el);
    if (g) setGeom(g);
    return g;
  };
  const local = (e: { clientX: number; clientY: number }) => {
    const o = blk()!.getBoundingClientRect();
    return { x: e.clientX - o.left, y: e.clientY - o.top };
  };

  useEffect(() => {
    const el = blk();
    if (!el) return;
    const move = (e: PointerEvent) => {
      if (dragRef.current) return;
      const g = remeasure();
      if (!g) return;
      const { x, y } = local(e);
      setHover(hoverAt(g, x, y));
    };
    const leave = () => {
      if (!dragRef.current) setHover({ target: null, col: null });
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("scroll", remeasure, true);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("scroll", remeasure, true);
    };
  }, []);

  // The table's rows and columns move with every change; keep the controls on them.
  useLayoutEffect(() => {
    if (geom || drag) remeasure();
  }, [block, draft]);

  useEffect(() => {
    if (selected === null) return;
    const down = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.(".ta-grip")) setSelected(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [selected]);

  useEffect(() => {
    if (!synced) return;
    const t = setTimeout(() => setSynced(null), SYNCED_MS);
    return () => clearTimeout(t);
  }, [synced]);

  const commit = (change: (src: string) => string) => {
    const src = onEdit(change);
    setSynced((s) => ({ row: src.split("\n")[0] ?? "", key: (s?.key ?? 0) + 1 }));
  };

  const startDrag = (e: ReactPointerEvent, d: Drag) => {
    e.preventDefault();
    e.stopPropagation();
    getSelection()?.removeAllRanges();
    const noSelect = (ev: Event) => ev.preventDefault();
    document.addEventListener("selectstart", noSelect);
    setDrag(d);
    dragRef.current = d;
    const move = (ev: PointerEvent) => {
      const cur = dragRef.current;
      const g = geom ?? remeasure();
      if (!cur || !g) return;
      const dx = ev.clientX - cur.startX;
      if (cur.kind === "resize") {
        onDraft(resizeColumns(cur.start, cur.col, dx, MIN_COLUMN));
      } else if (cur.gap !== null || Math.abs(dx) > DRAG_THRESHOLD) {
        const next = { ...cur, gap: nearest(g.cols, local(ev).x) };
        dragRef.current = next;
        setDrag(next);
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.removeEventListener("selectstart", noSelect);
      const cur = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!cur) return;
      if (cur.kind === "resize" || cur.gap !== null) swallowClick();
      if (cur.kind === "resize") {
        const widths = draftRef.current;
        onDraft(null);
        if (widths) commit((src) => setColumnWidths(src, widths.map((w) => w / PX_PER_DASH)));
      } else if (cur.gap === null) {
        setSelected((s) => (s === cur.from ? null : cur.from));
      } else {
        const to = dropIndex(cur.from, cur.gap);
        if (to !== null) {
          commit((src) => moveColumn(src, cur.from, to));
          setSelected(to);
        }
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (!geom) return <div className="tbl-assist" ref={root} aria-hidden="true" />;

  const { cols, top, rows } = geom;
  const bottom = rows.at(-1)!;
  const target = drag ? null : hover.target;
  const grip = drag?.kind === "move" ? drag.from : hover.col;

  return (
    <div className="tbl-assist" ref={root}>
      <div className="ta-rail ta-rail-top" style={{ left: cols[0], width: cols.at(-1)! - cols[0]!, top: top - RAIL, height: RAIL }} onClick={(e) => e.stopPropagation()} />
      <div className="ta-rail ta-rail-left" style={{ left: cols[0]! - RAIL, width: RAIL, top, height: bottom - top }} onClick={(e) => e.stopPropagation()} />
      {selected !== null && cols[selected + 1] !== undefined && (
        <div className="ta-sel" style={{ left: cols[selected], width: cols[selected + 1]! - cols[selected]!, top, height: bottom - top }} />
      )}
      {[...new Set([grip, selected])].map(
        (c) =>
          c !== null &&
          cols[c + 1] !== undefined && (
            <button
              key={`grip-${c}`}
              className={c === selected || drag?.kind === "move" ? "ta-grip on" : "ta-grip"}
              style={{ left: (cols[c]! + cols[c + 1]!) / 2 - 16, top: top - 19 }}
              aria-label={`选中或拖动第 ${c + 1} 列`}
              title="点击选中此列，拖动调整列顺序"
              aria-pressed={c === selected}
              onPointerDown={(e) => startDrag(e, { kind: "move", from: c, startX: e.clientX, gap: null })}
            >
              <span />
              <span />
              <span />
            </button>
          ),
      )}
      {drag?.kind === "move" && drag.gap !== null && <div className="ta-line" style={{ left: cols[drag.gap]! - 1.5, top, height: bottom - top }} />}
      {target?.kind === "column" && (
        <button className="ta-plus" style={{ left: cols[target.at]! - 11, top: top - 11 }} aria-label="在此插入列" title="在此插入列" onClick={() => commit((src) => insertColumn(src, target.at))}>
          <Plus />
        </button>
      )}
      {target?.kind === "row" && (
        <button className="ta-plus" style={{ left: cols[0]! - 11, top: rows[target.at]! - 11 }} aria-label="在此插入行" title="在此插入行" onClick={() => commit((src) => insertRow(src, target.at))}>
          <Plus />
        </button>
      )}
      {(target?.kind === "border" || drag?.kind === "resize") && (
        <button
          className={drag?.kind === "resize" ? "ta-border on" : "ta-border"}
          style={{ left: cols[(drag?.kind === "resize" ? drag.col : (target as { col: number }).col) + 1]! - 4, top, height: bottom - top }}
          aria-label="拖动调整列宽"
          onPointerDown={(e) => {
            const col = (target as { col: number } | null)?.col ?? 0;
            startDrag(e, { kind: "resize", col, startX: e.clientX, start: cols.slice(1).map((c, i) => c - cols[i]!) });
          }}
        />
      )}
      {drag?.kind === "resize" && draft && (
        <span className="ta-tip" style={{ left: cols[drag.col + 1]! + 10, top: bottom - 30 }}>
          列宽 {Math.round(draft[drag.col]!)}px
        </span>
      )}
      {synced && (
        <div key={synced.key} className="ta-synced" style={{ left: cols[0], top: bottom + 6, maxWidth: cols.at(-1)! - cols[0]! }} role="status">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12l5 5 9-10" />
          </svg>
          源码已同步：<code>{synced.row}</code>
        </div>
      )}
    </div>
  );
}
