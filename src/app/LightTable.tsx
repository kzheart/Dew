import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { parseDocument, type Block } from "../markdown/parse";
import { host } from "../platform";
import { dropState, fileStatus } from "../state/files";
import { Tear } from "./Dock";
import type { ShownFile } from "./useFiles";

const rotations = [-2, 2.5, -1.5, 2, -2.5, 1.5, -1, 3];
const codeColors = ["#6BDFFF", "#8E8E96", "#FF7AB2", "#7DD8B5"];
/** How near the close zone's center a dragged page closes its file. */
const HOT = 90;

const pct = (n: number, lo: number, hi: number) => `${Math.round(Math.min(hi, Math.max(lo, n)))}%`;
const plain = (html: string) => html.replace(/<[^>]+>/g, "").trim();

function BlockSketch({ b }: { b: Block }) {
  switch (b.kind) {
    case "frontmatter":
      return <span className="sk-chips"><span style={{ width: 26 }} /><span style={{ width: 32 }} /></span>;
    case "heading":
      return b.level === 1
        ? <span className="ttl" style={{ width: pct(30 + b.text.length * 4, 40, 78) }} />
        : <span className="ttl sub" style={{ width: pct(18 + b.text.length * 3, 26, 50) }} />;
    case "paragraph": {
      const n = plain(b.html).length;
      const rows = Math.min(3, Math.max(1, Math.ceil(n / 34)));
      return (
        <span className="sk-rows">
          {Array.from({ length: rows }, (_, i) => <span key={i} className="bar" style={{ width: i < rows - 1 ? pct(96 - i * 4, 0, 100) : pct(((n % 34) / 34) * 90, 30, 90) }} />)}
        </span>
      );
    }
    case "code":
      return (
        <span className="sk-code">
          {b.code.split("\n").slice(0, 4).map((line, i) => <span key={i} className="bar" style={{ width: pct(line.length * 2.5, 20, 80), background: codeColors[i] }} />)}
        </span>
      );
    case "list":
      return (
        <span className="sk-rows">
          {b.items.slice(0, 3).map((it, i) => (
            <span key={i} className="sk-item">
              <span className={it.task === null ? "sk-dot" : it.task ? "sk-chk" : "sk-chk open"} />
              <span className="bar" style={{ width: pct(plain(it.html).length * 4, 30, 72) }} />
            </span>
          ))}
        </span>
      );
    case "quote":
    case "callout":
    case "table":
    case "image":
      return <span className={`sk-box sk-${b.kind}`} />;
    case "hr":
      return <span className="sk-hr" />;
    case "math":
    case "footnotes":
    case "html":
      return <span className="bar" style={{ width: "50%" }} />;
  }
}

/** A page's first blocks, drawn as a skeleton. */
function Sketch({ text }: { text: string | undefined }) {
  const blocks = useMemo(() => (text === undefined ? null : parseDocument(text).blocks.slice(0, 8)), [text]);
  if (!blocks) return null;
  if (!blocks.length) return <><span className="bar" style={{ width: "46%", background: "#ECECEF" }} /><span className="sk-caret" /></>;
  return <>{blocks.map((b) => <BlockSketch key={b.start} b={b} />)}</>;
}

/** 灯桌总览: the group's files as pages on a light table, to pick one, or to close one by dragging it away. */
export function LightTable({ files, text, leaving, onSelect, onCloseFile, onNew, onClose }: {
  files: ShownFile[];
  /** The current file's text, which may be ahead of the app's. */
  text: string;
  leaving: boolean;
  onSelect(id: number): void;
  onCloseFile(id: number): void;
  onNew(): void;
  onClose(): void;
}) {
  const [q, setQ] = useState("");
  const [texts, setTexts] = useState<Record<number, string>>({});
  const asked = useRef(new Set<number>());
  const [drag, setDrag] = useState<{ id: number; dx: number; dy: number; hot: boolean } | null>(null);
  const press = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const zone = useRef<HTMLDivElement>(null);
  const open = files.filter((f) => !f.closing);

  useEffect(() => {
    for (const f of files) {
      if (f.current || asked.current.has(f.id)) continue;
      asked.current.add(f.id);
      host.files.content(f.id).then((t) => setTexts((m) => ({ ...m, [f.id]: t })), () => {});
    }
  }, [files]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);

  const down = (e: PointerEvent, id: number) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    press.current = { id, x: e.clientX, y: e.clientY, moved: false };
  };
  const move = (e: PointerEvent) => {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.moved && Math.hypot(dx, dy) < 5) return;
    p.moved = true;
    const r = zone.current?.getBoundingClientRect();
    const hot = !!r && Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < HOT;
    setDrag({ id: p.id, dx, dy, hot });
  };
  const up = () => {
    const p = press.current;
    press.current = null;
    if (!p?.moved) return;
    dragged.current = true;
    setTimeout(() => (dragged.current = false), 60);
    if (drag?.hot && open.length > 1) {
      onCloseFile(p.id);
      // The page stays where it was dropped while its file closes, unless that waits on the user.
      setDrag({ ...drag, hot: false });
      setTimeout(() => setDrag(null), 280);
    } else {
      setDrag(null);
    }
  };

  const needle = q.trim().toLowerCase();
  const pages = files.filter((f) => !needle || f.name.toLowerCase().includes(needle));
  const current = files.find((f) => f.current);

  return (
    <div className={leaving ? "lt out" : "lt"} role="dialog" aria-modal="true" aria-label="灯桌总览">
      <div className="glass lt-top">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#55555A" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <label htmlFor="lt-q" className="sr">筛选打开的文件</label>
        <input id="lt-q" className="lt-q" type="text" placeholder="筛选打开的文件" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <span className="vsep" />
        <span className="lt-count">{open.length} 个文件</span>
      </div>
      <div className="lt-grid" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {pages.map((f, i) => {
          const dragging = drag?.id === f.id;
          return (
            <button
              key={f.id}
              className={`ltp${f.current ? " cur" : ""}${dragging ? " dragging" : ""}${f.closing ? " poof" : ""}`}
              style={{ transform: `translate(${dragging ? drag.dx : 0}px, ${dragging ? drag.dy : 0}px) rotate(${dragging ? -4 : rotations[i % rotations.length]}deg)` }}
              aria-label={`${f.name}，${fileStatus(f)}${f.current ? "，当前文件" : ""}`}
              onClick={() => !dragged.current && onSelect(f.id)}
              onPointerDown={(e) => down(e, f.id)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            >
              <span className="pg"><Sketch text={f.current ? text : texts[f.id]} /></span>
              <span className="ltp-lbl"><span className="m14" aria-hidden="true"><Tear state={dropState(f)} /></span>{f.name}</span>
            </button>
          );
        })}
      </div>
      <div className={`zone${drag ? " show" : ""}${drag?.hot ? " hot" : ""}`} ref={zone} aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </div>
      <button className="glass lt-btn" style={{ left: 20 }} onClick={onNew}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>新建
      </button>
      <button className="glass lt-btn" style={{ right: 20 }} onClick={onClose}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>返回 {current?.name}
      </button>
    </div>
  );
}
