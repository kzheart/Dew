import { useEffect, useMemo, useRef, useState } from "react";
import { languageLabel } from "../markdown/highlight";
import { CodeLines, searchHits, useHighlighted, type CodeBlock } from "../preview/Blocks";

const ZOOM_MIN = 60;
const ZOOM_MAX = 200;
const ZOOM_STEP = 20;

const Icon = ({ d, size = 14 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

/** A code block enlarged over the window, with search, zoom and drag to scroll. */
export function Lightbox({ block, section, showLineNumbers, leaving, onClose }: {
  block: CodeBlock;
  section: string | null;
  showLineNumbers: boolean;
  leaving: boolean;
  onClose(): void;
}) {
  const lines = useHighlighted(block);
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(100);
  const [grabbing, setGrabbing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const hits = useMemo(() => searchHits(block.code, query), [block.code, query]);

  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    // Capture phase, so Escape closes this before the editor underneath sees it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    scroller.current?.querySelector(".lb-hit")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [hits]);

  const title = [section, `${lines.length} 行`].filter(Boolean).join(" · ");

  return (
    <div className={leaving ? "lb out" : "lb"} role="dialog" aria-modal="true" aria-label="代码块放大查看" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lb-panel" ref={panel} tabIndex={-1}>
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
          onPointerUp={() => {
            drag.current = null;
            setGrabbing(false);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setGrabbing(false);
          }}
        >
          <CodeLines
            className="lb-code"
            fontSize={Math.round((14 * zoom) / 100)}
            lines={lines}
            highlight={block.highlight}
            showLineNumbers={showLineNumbers}
            hits={hits}
          />
        </div>
        <div className="lb-ctrl">
          <div className="glass lb-title">
            <span className="cb-lang">{languageLabel(block.lang)}</span>
            <span>{title}</span>
          </div>
          <span style={{ flex: "1 1 auto" }} />
          <div className="glass lb-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#55555A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <label htmlFor="lbq" className="sr">在代码块中搜索</label>
            <input id="lbq" type="text" placeholder="块内搜索" value={query} onChange={(e) => setQuery(e.target.value)} />
            <span>{query.trim() ? `${hits.size} 处匹配` : ""}</span>
          </div>
          <div className="glass ig">
            <button className="gbtn" aria-label="缩小" disabled={zoom <= ZOOM_MIN} onClick={() => setZoom(Math.max(ZOOM_MIN, zoom - ZOOM_STEP))}>
              <Icon d="M5 12h14" />
            </button>
            <span className="lb-zoom">{zoom}%</span>
            <button className="gbtn" aria-label="放大" disabled={zoom >= ZOOM_MAX} onClick={() => setZoom(Math.min(ZOOM_MAX, zoom + ZOOM_STEP))}>
              <Icon d="M12 5v14M5 12h14" />
            </button>
          </div>
          <div className="glass ig">
            <button className="gbtn" aria-label="关闭" onClick={onClose}>
              <Icon d="M6 6l12 12M18 6L6 18" size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
