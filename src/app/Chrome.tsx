import { useState } from "react";
import type { Heading } from "../markdown/parse";
import { clampSplit, SPLIT_MAX, SPLIT_MIN } from "../state/scrollSync";
import { modeLabels, type Mode } from "../state/view";

export function Toc({ headings, active, pct, onJump }: {
  headings: Heading[];
  active: number | null;
  pct: number;
  onJump(line: number): void;
}) {
  const items = headings.filter((h) => h.level <= 3);
  if (!items.length) return null;
  return (
    <nav className="toc" aria-label="文档大纲">
      <div className="toc-rail glass" aria-hidden="true">
        {items.map((h) => (
          <span key={h.line} className={`tick l${h.level}${active === h.line ? " on" : ""}`} />
        ))}
        <span className="toc-track"><span className="toc-fill" style={{ height: `${pct}%` }} /></span>
      </div>
      <div className="toc-panel">
        <div className="toc-head"><b>大纲</b><span>已读 {pct}%</span></div>
        <div className="toc-list">
          {items.map((h) => (
            <button key={h.line} className={`toc-item l${h.level}${active === h.line ? " on" : ""}`} onClick={() => onJump(h.line)}>
              <span>{h.text}</span>
              {h.tasks.total > 0 && (
                <span className={h.tasks.done === h.tasks.total ? "toc-prog all" : "toc-prog"}>{h.tasks.done}/{h.tasks.total}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

export function StatusBar({ chars, minutes, mode, cursor, blockLabel }: {
  chars: number;
  minutes: number;
  mode: Mode;
  cursor: { line: number; col: number } | null;
  blockLabel: string | null;
}) {
  return (
    <footer className="glass stat" aria-label="文档状态">
      <span>{chars.toLocaleString("zh-CN")} 字</span><span className="dot" />
      <span>约 {minutes} 分钟</span><span className="dot" />
      {(mode === "edit" || mode === "split") && cursor && (
        <><span>行 {cursor.line}，列 {cursor.col}</span><span className="dot" /></>
      )}
      {mode === "live" && blockLabel && <><span>{blockLabel}</span><span className="dot" /></>}
      {mode === "split" && <><span className="hide-sm">段落对齐同步</span><span className="dot hide-sm" /></>}
      <span>{modeLabels[mode]}</span>
    </footer>
  );
}

export function Divider({ split, onSplit }: { split: number; onSplit(pct: number): void }) {
  const [drag, setDrag] = useState(false);
  return (
    <div
      className={drag ? "divider drag" : "divider"}
      role="separator"
      aria-orientation="vertical"
      aria-label="拖拽调整分栏宽度"
      aria-valuemin={SPLIT_MIN}
      aria-valuemax={SPLIT_MAX}
      aria-valuenow={split}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(true);
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        const r = e.currentTarget.parentElement!.getBoundingClientRect();
        onSplit(clampSplit(((e.clientX - r.left) / r.width) * 100));
      }}
      onPointerUp={() => setDrag(false)}
      onPointerCancel={() => setDrag(false)}
      onKeyDown={(e) => {
        const step = e.key === "ArrowLeft" ? -2 : e.key === "ArrowRight" ? 2 : 0;
        if (!step) return;
        e.preventDefault();
        onSplit(clampSplit(split + step));
      }}
    >
      <span className="grip glass" />
    </div>
  );
}
