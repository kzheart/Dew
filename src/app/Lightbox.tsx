import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { engines, type DiagramTheme } from "../diagram/engines";
import { svgSize, type SvgSize } from "../diagram/svg";
import type { CodeBlock, LightboxTarget, TableBlock } from "../preview/actions";
import { alignClass, cellHtml } from "../preview/Blocks";
import { codeLabel, CodeLines, DiffLines, useDiff, useHighlighted } from "../preview/Code";
import { findHits, hitLabel, htmlText, markText, stepHit } from "./search";
import { anchorAt, clampZoom, CODE_ZOOM, fitZoom, scrollFor, SHEET_ZOOM, stepZoom, wheelZoom, type Anchor, type Box, type Point, type ZoomRange } from "./zoom";

const Icon = ({ d, size = 14 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

interface Common {
  /** The heading the block sits under. */
  section: string | null;
  showLineNumbers: boolean;
  theme: DiagramTheme;
  leaving: boolean;
  onClose(): void;
}

/** What a sheet needs to draw the search: the query, the units with a hit, and the unit the search is on. */
interface SearchView {
  zoom: number;
  query: string;
  hits: Set<number>;
  current: number | null;
}

/** A code block, table or chart enlarged over the window: drag to pan, wheel or pinch to zoom, search inside. */
export function Lightbox({ target, ...common }: Common & { target: LightboxTarget }) {
  switch (target.kind) {
    case "code":
      return target.block.view.kind === "diff" ? <DiffSheet block={target.block} common={common} /> : <CodeSheet block={target.block} common={common} />;
    case "table":
      return <TableSheet block={target.block} common={common} />;
    case "diagram":
      return <DiagramSheet block={target.block} svg={target.svg} common={common} />;
  }
}

const fontSize = (zoom: number) => (14 * zoom) / 100;
const marked = (lines: string[], v: SearchView) => (v.hits.size ? lines.map((l, i) => (v.hits.has(i) ? markText(l, v.query) : l)) : lines);

function CodeSheet({ block, common }: { block: CodeBlock; common: Common }) {
  const lines = useHighlighted(block);
  const units = useMemo(() => block.code.split("\n"), [block.code]);
  return (
    <Frame kind="code" label={codeLabel(block)} meta={[common.section, `${lines.length} 行`]} units={units} range={CODE_ZOOM} common={common}>
      {(v) => (
        <CodeLines className="lb-code" fontSize={fontSize(v.zoom)} lines={marked(lines, v)} highlight={block.highlight} showLineNumbers={common.showLineNumbers} hits={v.hits} current={v.current} />
      )}
    </Frame>
  );
}

function DiffSheet({ block, common }: { block: CodeBlock; common: Common }) {
  const { diff, lines } = useDiff(block);
  const units = useMemo(() => diff.lines.map((l) => l.text), [diff]);
  const meta = [common.section, block.title, `${lines.length} 行 · +${diff.added} −${diff.removed}`];
  return (
    <Frame kind="code" label={codeLabel(block)} meta={meta} units={units} range={CODE_ZOOM} common={common}>
      {(v) => (
        <DiffLines className="lb-code" fontSize={fontSize(v.zoom)} rows={diff.lines} lines={marked(lines, v)} showLineNumbers={common.showLineNumbers} hits={v.hits} current={v.current} />
      )}
    </Frame>
  );
}

function TableSheet({ block, common }: { block: TableBlock; common: Common }) {
  const cols = block.header.length;
  // Header cells, then each row's, in reading order: unit i is row ⌊i / cols⌋ - 1, column i % cols.
  const cells = useMemo(() => [block.header, ...block.rows].flatMap((r) => Array.from({ length: cols }, (_, c) => cellHtml(r[c] ?? ""))), [block, cols]);
  const units = useMemo(() => cells.map(htmlText), [cells]);
  return (
    <Frame kind="table" label="表格" meta={[common.section, `${cols} 列 × ${block.rows.length} 行`]} units={units} range={SHEET_ZOOM} initialZoom={125} common={common}>
      {(v) => {
        const cell = (i: number, Tag: "th" | "td") => (
          <Tag
            key={i}
            className={[alignClass(block.align[i % cols] ?? null), i === v.current ? "lb-hit lb-cur" : v.hits.has(i) ? "lb-hit" : ""].filter(Boolean).join(" ") || undefined}
            dangerouslySetInnerHTML={{ __html: v.hits.has(i) ? markText(cells[i]!, v.query) : cells[i]! }}
          />
        );
        return (
          <table className="tbl lb-tbl" style={{ fontSize: fontSize(v.zoom) }}>
            <thead>
              <tr>{block.header.map((_, c) => cell(c, "th"))}</tr>
            </thead>
            <tbody>
              {block.rows.map((_, r) => (
                <tr key={r}>{Array.from({ length: cols }, (_, c) => cell((r + 1) * cols + c, "td"))}</tr>
              ))}
            </tbody>
          </table>
        );
      }}
    </Frame>
  );
}

const SVG_NS = "http://www.w3.org/2000/svg";

function DiagramSheet({ block, svg, common }: { block: CodeBlock; svg: string; common: Common }) {
  const host = useRef<HTMLDivElement>(null);
  const size = useMemo(() => svgSize(svg) ?? { width: 640, height: 400 }, [svg]);
  const [units, setUnits] = useState<string[]>([]);
  useLayoutEffect(() => setUnits([...host.current!.querySelectorAll("text")].map((t) => t.textContent ?? "")), [svg]);
  return (
    <Frame kind="diagram" label={codeLabel(block)} meta={[common.section]} units={units} range={SHEET_ZOOM} fit={size} common={common}>
      {(v) => <ChartMarks host={host} svg={svg} size={size} view={v} />}
    </Frame>
  );
}

/** The chart at the zoom, with a highlight drawn behind each label the search found. */
function ChartMarks({ host, svg, size, view }: { host: RefObject<HTMLDivElement | null>; svg: string; size: SvgSize; view: SearchView }) {
  useLayoutEffect(() => {
    const root = host.current!;
    root.querySelectorAll(".lb-hl").forEach((r) => r.remove());
    const texts = [...root.querySelectorAll<SVGTextElement>("text")];
    for (const i of view.hits) {
      const t = texts[i];
      if (!t?.parentNode) continue;
      const b = t.getBBox();
      const pad = 2;
      const r = document.createElementNS(SVG_NS, "rect");
      r.setAttribute("x", String(b.x - pad));
      r.setAttribute("y", String(b.y - pad));
      r.setAttribute("width", String(b.width + 2 * pad));
      r.setAttribute("height", String(b.height + 2 * pad));
      r.setAttribute("rx", "3");
      // getBBox is in the label's own coordinates, before its transform.
      const transform = t.getAttribute("transform");
      if (transform) r.setAttribute("transform", transform);
      r.setAttribute("class", i === view.current ? "lb-hl lb-cur" : "lb-hl");
      t.parentNode.insertBefore(r, t);
    }
  }, [svg, view.hits, view.current]);
  return (
    <div
      ref={host}
      className="lb-dia"
      style={{ width: (size.width * view.zoom) / 100, height: (size.height * view.zoom) / 100 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

const ARIA: Record<LightboxTarget["kind"], string> = { code: "代码块放大查看", table: "表格放大查看", diagram: "图表放大查看" };

/** The shell every sheet shares: controls, search state, zoom around the pointer, drag to pan, Escape to close. */
function Frame({ kind, label, meta, units, range, initialZoom = 100, fit, common, children }: {
  kind: LightboxTarget["kind"];
  label: string;
  meta: (string | null)[];
  /** The text of each searchable unit, in the order the sheet numbers them. */
  units: string[];
  range: ZoomRange;
  initialZoom?: number;
  /** A chart's size, to open at the zoom that fits it; it overrides initialZoom. */
  fit?: SvgSize;
  common: Common;
  children(view: SearchView): ReactNode;
}) {
  const { theme, leaving, onClose } = common;
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const [zoom, setZoom] = useState(initialZoom);
  const [grabbing, setGrabbing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const zoomNow = useRef(zoom);
  const anchor = useRef<Anchor | null>(null);

  const hitList = useMemo(() => findHits(units, query), [units, query]);
  const hits = useMemo(() => new Set(hitList), [hitList]);
  const index = Math.min(current, Math.max(0, hitList.length - 1));
  const view: SearchView = { zoom, query, hits, current: hitList[index] ?? null };

  const box = (): Box => {
    const s = sheet.current!;
    return { left: s.offsetLeft, top: s.offsetTop, width: s.offsetWidth, height: s.offsetHeight };
  };

  // Zooming holds the point under the pointer (or the middle) in place; the
  // scroll that does so is set once the new size is laid out.
  const zoomTo = (next: number, pointer?: Point) => {
    const el = scroller.current;
    if (!el || Math.abs(next - zoomNow.current) < 0.01) return;
    anchor.current ??= anchorAt({ x: el.scrollLeft, y: el.scrollTop }, pointer ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 }, box());
    zoomNow.current = next;
    setZoom(next);
  };

  useLayoutEffect(() => {
    const el = scroller.current;
    const a = anchor.current;
    if (!el || !a) return;
    anchor.current = null;
    const s = scrollFor(a, box());
    el.scrollLeft = s.x;
    el.scrollTop = s.y;
  }, [zoom]);

  useLayoutEffect(() => {
    if (!fit) return;
    const el = scroller.current!;
    const sc = getComputedStyle(el);
    const sh = getComputedStyle(sheet.current!);
    const room = {
      width: el.clientWidth - parseFloat(sh.paddingLeft) - parseFloat(sh.paddingRight),
      height: el.clientHeight - parseFloat(sc.paddingTop) - parseFloat(sc.paddingBottom),
    };
    zoomNow.current = fitZoom(fit, room, range);
    setZoom(zoomNow.current);
  }, []);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    // Capture phase, so Escape closes this before the editor underneath sees it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [onClose]);

  useEffect(() => {
    const el = scroller.current!;
    const pointerIn = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomTo(wheelZoom(zoomNow.current, e.deltaY, e.ctrlKey, range), pointerIn(e));
    };
    // WebKit reports a trackpad pinch as gesture events rather than ctrl-wheel.
    let pinchFrom = 100;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      pinchFrom = zoomNow.current;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      zoomTo(clampZoom(pinchFrom * g.scale, range), pointerIn(g));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
    };
  }, []);

  // The hit the search is on comes into view when it is not already.
  useEffect(() => {
    const el = scroller.current!;
    const target = el.querySelector(".lb-cur mark") ?? el.querySelector(".lb-cur");
    if (!target) return;
    const t = target.getBoundingClientRect();
    const s = el.getBoundingClientRect();
    const inside = t.top >= s.top + 84 && t.bottom <= s.bottom - 56 && t.left >= s.left + 16 && t.right <= s.right - 16;
    if (!inside) {
      el.scrollBy({ left: t.left + t.width / 2 - (s.left + s.width / 2), top: t.top + t.height / 2 - (s.top + s.height / 2), behavior: "smooth" });
    }
  }, [query, view.current]);

  const step = (dir: 1 | -1) => setCurrent(stepHit(index, hitList.length, dir));
  const endDrag = () => {
    drag.current = null;
    setGrabbing(false);
  };
  const title = meta.filter(Boolean).join(" · ");
  const shown = Math.round(zoom);

  return (
    <div className={leaving ? "lb out" : "lb"} role="dialog" aria-modal="true" aria-label={ARIA[kind]} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`lb-panel lbk-${kind} bg-${theme}`} ref={panel} tabIndex={-1}>
        <div
          ref={scroller}
          className={grabbing ? "lb-scroll grabbing" : "lb-scroll"}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            const el = e.currentTarget;
            drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
            el.setPointerCapture(e.pointerId);
            setGrabbing(true);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            e.currentTarget.scrollLeft = d.left - (e.clientX - d.x);
            e.currentTarget.scrollTop = d.top - (e.clientY - d.y);
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="lb-stage">
            <div className="lb-sheet" ref={sheet}>
              {children(view)}
            </div>
          </div>
        </div>
        <div className="lb-ctrl">
          <div className="glass lb-title">
            <span className="cb-lang">{label}</span>
            {title && <span>{title}</span>}
          </div>
          <span style={{ flex: "1 1 auto" }} />
          <div className="glass lb-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <label htmlFor="lbq" className="sr">块内搜索</label>
            <input
              id="lbq"
              type="text"
              placeholder="块内搜索"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCurrent(0);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                e.preventDefault();
                step(e.shiftKey ? -1 : 1);
              }}
            />
            <span className="lb-count" aria-live="polite">{hitLabel(query, index, hitList.length)}</span>
            <button className="gbtn lb-step" aria-label="上一处匹配" disabled={!hitList.length} onClick={() => step(-1)}>
              <Icon d="M6 15l6-6 6 6" size={13} />
            </button>
            <button className="gbtn lb-step" aria-label="下一处匹配" disabled={!hitList.length} onClick={() => step(1)}>
              <Icon d="M6 9l6 6 6-6" size={13} />
            </button>
          </div>
          <div className="glass ig">
            <button className="gbtn" aria-label="缩小" disabled={shown <= range.min} onClick={() => zoomTo(stepZoom(zoom, -1, range))}>
              <Icon d="M5 12h14" />
            </button>
            <span className="lb-zoom">{shown}%</span>
            <button className="gbtn" aria-label="放大" disabled={shown >= range.max} onClick={() => zoomTo(stepZoom(zoom, 1, range))}>
              <Icon d="M12 5v14M5 12h14" />
            </button>
          </div>
          <div className="glass ig">
            <button className="gbtn" aria-label="关闭" onClick={onClose}>
              <Icon d="M6 6l12 12M18 6L6 18" size={15} />
            </button>
          </div>
        </div>
        <div className="lb-foot" aria-hidden="true">
          <span className="glass">拖拽平移 · 滚轮缩放</span>
          <span className="glass">Esc 关闭</span>
        </div>
      </div>
    </div>
  );
}
