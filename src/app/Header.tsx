import { useEffect, useRef, useState } from "react";
import type { DocumentState, PageGuard, Prefs } from "../platform";
import type { Base, Layout, ViewState } from "../state/view";
import { usePresence } from "./hooks";
import { titleStatus } from "./labels";

export type Popover = "aa" | "export";

export type ExportAction = "pdf" | "html" | "richText" | "shareCard";

interface Props {
  doc: DocumentState;
  view: ViewState;
  focus: boolean;
  inline: boolean;
  popover: Popover | null;
  prefs: Prefs;
  onBase(base: Base): void;
  onToggleSource(): void;
  onLayout(layout: Layout): void;
  onToggleInline(): void;
  onToggleFocus(): void;
  onPopover(p: Popover | null): void;
  onPrefs(p: Partial<Prefs>): void;
  onExport(a: ExportAction): void;
  onKeepMine(): void;
  onRevert(): void;
}

const modes: { id: Base; label: string; tip: string; icon: string }[] = [
  { id: "live", label: "实时", tip: "实时编辑 ⌘1", icon: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" },
  { id: "preview", label: "预览", tip: "预览 ⌘2", icon: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" },
];

const layouts: { id: Layout; label: string; tip: string }[] = [
  { id: "full", label: "单栏", tip: "仅源码 ⌘/" },
  { id: "split", label: "分栏", tip: "源码 + 预览 ⌥⌘/" },
];

export function Header(p: Props) {
  const source = p.view.source;
  const ext = usePresence(source !== null, 300);
  const [squash, setSquash] = useState(0);
  const lastBase = useRef(p.view.base);
  useEffect(() => {
    if (lastBase.current !== p.view.base) setSquash((n) => n + 1);
    lastBase.current = p.view.base;
  }, [p.view.base]);

  const status = titleStatus(p.doc);
  const right = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!p.popover) return;
    const down = (e: MouseEvent) => {
      if (!right.current?.contains(e.target as Node)) p.onPopover(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") p.onPopover(null);
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [p.popover, p.onPopover]);

  const toggle = (which: Popover) => p.onPopover(p.popover === which ? null : which);

  return (
    <header className="bar">
      <div className="bar-l">
        {status?.conflict ? (
          <div className="glass gtitle conflict hide-sm">
            <span className="gt-text">
              <b>{p.doc.name}</b>
              <span className="warn">{status.text}</span>
            </span>
            <button className="gt-act" onClick={p.onRevert} title="丢弃更改，读取磁盘上的版本">还原</button>
            <button className="gt-act primary" onClick={p.onKeepMine} title="用当前内容覆盖磁盘上的文件">保留我的</button>
          </div>
        ) : status && (
          <div className="glass gtitle hide-sm" title={p.doc.path || p.doc.name}>
            <b>{p.doc.name}</b>
            <span className="warn">{status.text}</span>
          </div>
        )}
      </div>

      <div className="bar-c">
        <div className="glass seg-g" role="group" aria-label="视图">
          <span className={`thumb ${p.view.base === "live" ? "at0" : "at1"}${source ? " off" : ""}${squash % 2 ? " sqA" : " sqB"}`} aria-hidden="true" />
          {modes.map((m) => {
            const on = !source && p.view.base === m.id;
            return (
              <button key={m.id} className={on ? "sb on" : "sb"} aria-pressed={on} onClick={() => p.onBase(m.id)} title={m.tip}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={m.icon} /></svg>
                <span className="lbl">{m.label}</span>
              </button>
            );
          })}
        </div>
        <div className="glass srcg">
          <button className="src-btn" aria-pressed={source !== null} onClick={p.onToggleSource} title="源码模式 ⌘/">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" /></svg>
            <span className="lbl">源码</span>
          </button>
          {ext.mounted && (
            <div className={ext.leaving ? "src-ext out" : "src-ext"}>
              <div className="mseg" role="group" aria-label="源码布局">
                {layouts.map((y) => (
                  <button key={y.id} aria-pressed={(source ?? "full") === y.id} onClick={() => p.onLayout(y.id)} title={y.tip}>{y.label}</button>
                ))}
              </div>
              <span className="vsep" />
              <button className="tog" aria-pressed={p.inline} onClick={p.onToggleInline} title="仅光标所在行显示 Markdown 标记，其余行原地渲染">
                <span className="sw" aria-hidden="true" />行内渲染
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bar-r">
        <div ref={right}>
          <div className="glass ig">
            <button className="gbtn" aria-pressed={p.focus} onClick={p.onToggleFocus} aria-label="聚光灯模式" title="聚光灯模式">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M3 9V5a2 2 0 0 1 2-2h4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4" /></svg>
            </button>
            <button className="gbtn" aria-expanded={p.popover === "aa"} onClick={() => toggle("aa")} aria-label="排版设置" title="排版设置">
              <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.02em" }}>Aa</span>
            </button>
            <button className="gbtn" aria-expanded={p.popover === "export"} onClick={() => toggle("export")} aria-label="导出与分享" title="导出与分享">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4" /><path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" /></svg>
            </button>
          </div>
          <AaPopover open={p.popover === "aa"} prefs={p.prefs} onPrefs={p.onPrefs} />
          <ExportPopover
            open={p.popover === "export"}
            guard={p.prefs.pageGuard}
            onGuard={(pageGuard) => p.onPrefs({ pageGuard })}
            onExport={(a) => { p.onPopover(null); p.onExport(a); }}
          />
        </div>
      </div>
    </header>
  );
}

const fonts: { id: Prefs["ff"]; label: string }[] = [
  { id: "serif", label: "衬线" },
  { id: "sans", label: "无衬线" },
  { id: "mono", label: "等宽" },
];

const backgrounds: { id: Prefs["bg"]; label: string; color: string }[] = [
  { id: "white", label: "纯白", color: "#FFFFFF" },
  { id: "paper", label: "羊皮纸", color: "#F4ECDA" },
  { id: "night", label: "暗夜", color: "#1E1E20" },
];

function AaPopover({ open, prefs, onPrefs }: { open: boolean; prefs: Prefs; onPrefs(p: Partial<Prefs>): void }) {
  const { mounted, leaving } = usePresence(open, 190);
  if (!mounted) return null;
  const range = (id: string, label: string, value: number, shown: string, min: number, max: number, step: number, set: (v: number) => void) => (
    <div className="field">
      <div className="field-top"><label htmlFor={id}>{label}</label><b>{shown}</b></div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} />
    </div>
  );
  return (
    <div className={leaving ? "pop pop-aa out" : "pop pop-aa"} role="dialog" aria-label="排版设置">
      {range("f-mw", "版心宽度", prefs.mw, `${prefs.mw} pt`, 560, 1000, 20, (mw) => onPrefs({ mw }))}
      {range("f-fs", "字号", prefs.fs, `${prefs.fs} pt`, 13, 22, 1, (fs) => onPrefs({ fs }))}
      {range("f-lh", "行高", prefs.lh, prefs.lh.toFixed(2), 1.4, 2.2, 0.05, (lh) => onPrefs({ lh }))}
      {range("f-pg", "段落间距", prefs.pg, `${prefs.pg.toFixed(1)} em`, 0.6, 1.8, 0.1, (pg) => onPrefs({ pg }))}
      <div className="psep" style={{ margin: "2px 0" }} />
      <div className="field">
        <div className="field-top"><span>字体</span></div>
        <div className="pills">
          {fonts.map((f) => (
            <button key={f.id} className={prefs.ff === f.id ? "pill on" : "pill"} aria-pressed={prefs.ff === f.id} onClick={() => onPrefs({ ff: f.id })}>{f.label}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <div className="field-top"><span>背景</span></div>
        <div className="pills">
          {backgrounds.map((b) => (
            <button key={b.id} className={prefs.bg === b.id ? "pill on" : "pill"} aria-pressed={prefs.bg === b.id} onClick={() => onPrefs({ bg: b.id })}>
              <span className="swatch" style={{ background: b.color }} />{b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const guards: { id: keyof PageGuard; label: string }[] = [
  { id: "code", label: "代码块" },
  { id: "table", label: "表格" },
  { id: "chart", label: "图表" },
  { id: "image", label: "图片" },
];

/** What the PDF keeps whole on a page, in words. */
export function guardSummary(guard: PageGuard): string {
  const on = guards.filter((g) => guard[g.id]).map((g) => g.label);
  return on.length ? `${on.join("、")}分页保护` : "不做分页保护";
}

function ExportPopover({ open, guard, onGuard, onExport }: { open: boolean; guard: PageGuard; onGuard(g: PageGuard): void; onExport(a: ExportAction): void }) {
  const { mounted, leaving } = usePresence(open, 190);
  if (!mounted) return null;
  return (
    <div className={leaving ? "pop pop-exp out" : "pop pop-exp"} role="menu" aria-label="导出与分享">
      <button className="mi" role="menuitem" onClick={() => onExport("pdf")}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
        <span>导出为 PDF…<small>{guardSummary(guard)}</small></span><span className="sc">⇧⌘E</span>
      </button>
      <div className="pg-guard" role="group" aria-label="分页保护">
        <span className="pg-guard-l" aria-hidden="true">分页保护<small>放不下时整体移到下一页</small></span>
        <div className="pg-chks">
          {guards.map((g) => (
            <button key={g.id} className="pg-chk" role="menuitemcheckbox" aria-checked={guard[g.id]} onClick={() => onGuard({ ...guard, [g.id]: !guard[g.id] })}>
              <span className="pg-box" aria-hidden="true">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
              </span>
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <button className="mi" role="menuitem" onClick={() => onExport("html")}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 8l-4 4 4 4M16 8l4 4-4 4" /></svg>
        <span>导出为 HTML…</span>
      </button>
      <div className="psep" />
      <button className="mi" role="menuitem" onClick={() => onExport("richText")}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4h6v3H9z" /></svg>
        <span>拷贝为富文本<small>粘贴到公众号、飞书、邮件保持样式</small></span>
      </button>
      <button className="mi" role="menuitem" onClick={() => onExport("shareCard")}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 17l-5-5-8 8" /></svg>
        <span>将选区生成分享卡片…<small>渐变背景、窗口阴影、水印</small></span>
      </button>
    </div>
  );
}
