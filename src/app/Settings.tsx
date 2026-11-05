import { Fragment, useEffect, useState, type ReactNode } from "react";
import { defaultPrefs } from "../defaultPrefs";
import type { PageGuard, Prefs } from "../platform";
import { groupLabels, isModified, shownRows, type RowId, type SettingsGroup } from "../state/settings";
import type { Base } from "../state/view";

const backgrounds: { id: Prefs["bg"]; label: string; color: string }[] = [
  { id: "white", label: "纯白", color: "#FFFFFF" },
  { id: "paper", label: "羊皮纸", color: "#F4ECDA" },
  { id: "night", label: "暗夜", color: "#1E1E20" },
];

const fonts: { id: Prefs["ff"]; label: string }[] = [
  { id: "serif", label: "衬线" },
  { id: "sans", label: "无衬线" },
  { id: "mono", label: "等宽" },
];

const guards: { id: keyof PageGuard; label: string }[] = [
  { id: "code", label: "代码块" },
  { id: "table", label: "表格" },
  { id: "chart", label: "图表" },
  { id: "image", label: "图片" },
];

/** The menu's accelerators, as menu.go sets them. */
const keys: [string, string][] = [
  ["实时", "⌘1"],
  ["预览", "⌘2"],
  ["源码", "⌘/"],
  ["源码 · 分栏", "⌥⌘/"],
  ["快速打开", "⌘P"],
  ["新建文件", "⌘N"],
  ["关闭文件", "⌘W"],
  ["灯桌总览", "⇧⌘\\"],
  ["聚光灯模式", "⇧⌘F"],
  ["设置", "⌘,"],
  ["导出 PDF", "⇧⌘E"],
];

const resetLabels: Partial<Record<keyof Prefs, string>> = {
  bg: "恢复默认：纯白",
  ff: "恢复默认：无衬线",
  fs: `恢复默认 ${defaultPrefs.fs} pt`,
  lh: `恢复默认 ${defaultPrefs.lh.toFixed(2)}`,
  pg: `恢复默认 ${defaultPrefs.pg.toFixed(1)} em`,
  mw: `恢复默认 ${defaultPrefs.mw} pt`,
  glass: "恢复默认质感",
  inline: "恢复默认：关",
  pairs: "恢复默认：开",
  slash: "恢复默认：开",
  keep: `恢复默认 ${defaultPrefs.keep} 个`,
  pageGuard: "恢复默认：代码块、表格、图表",
  watermark: "恢复默认：无水印",
};

const KEEP_STEP = 10;

/** 设置: the defaults every document starts with, by group or by search. */
export function Settings({ prefs, base, leaving, group, onGroup, onPrefs, onBase, onClearRecent, onClose }: {
  prefs: Prefs;
  /** The view this window shows, which new windows open in. */
  base: Base;
  leaving: boolean;
  group: SettingsGroup;
  onGroup(g: SettingsGroup): void;
  onPrefs(p: Partial<Prefs>): void;
  onBase(b: Base): void;
  onClearRecent(): void;
  onClose(): void;
}) {
  // Opened in a background tab, it is already there when the tab shows.
  const [unseen] = useState(() => document.hidden);
  const [q, setQ] = useState("");
  const searching = q.trim() !== "";
  const groups = shownRows(group, q);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);

  const label = (pref: keyof Prefs | undefined, text: ReactNode, htmlFor?: string) => (
    <span className="k">
      {pref && isModified(prefs, pref) && (
        <button className="modb" onClick={() => onPrefs({ [pref]: defaultPrefs[pref] })} aria-label={resetLabels[pref]} title={resetLabels[pref]} />
      )}
      {htmlFor ? <label htmlFor={htmlFor}>{text}</label> : text}
    </span>
  );
  const toggle = (pref: "inline" | "pairs" | "slash", name: string, hint: string) => (
    <div className="srow">
      {label(pref, <span>{name}<small>{hint}</small></span>)}
      <button className="stog" aria-pressed={prefs[pref]} onClick={() => onPrefs({ [pref]: !prefs[pref] })} aria-label={name}><span className="sw" /></button>
    </div>
  );
  const range = (pref: "fs" | "lh" | "pg" | "mw", name: string, min: number, max: number, step: number, shown: string) => (
    <div className="srow">
      {label(pref, name, `s-${pref}`)}
      <input id={`s-${pref}`} type="range" min={min} max={max} step={step} value={prefs[pref]} onChange={(e) => onPrefs({ [pref]: Number(e.target.value) })} />
      <span className="v" style={{ width: 44, textAlign: "right" }}>{shown}</span>
    </div>
  );

  const rows: Record<RowId, () => ReactNode> = {
    bg: () => (
      <div className="srow">
        {label("bg", "阅读背景")}
        <span style={{ display: "flex", gap: 8 }}>
          {backgrounds.map((b) => (
            <button key={b.id} className="sdot" aria-label={b.label} title={b.label} aria-pressed={prefs.bg === b.id} onClick={() => onPrefs({ bg: b.id })} style={{ background: b.color }} />
          ))}
        </span>
      </div>
    ),
    ff: () => (
      <div className="srow">
        {label("ff", "正文字体")}
        <div className="pills" style={{ width: 200 }}>
          {fonts.map((f) => (
            <button key={f.id} className={prefs.ff === f.id ? "pill on" : "pill"} aria-pressed={prefs.ff === f.id} onClick={() => onPrefs({ ff: f.id })}>{f.label}</button>
          ))}
        </div>
      </div>
    ),
    fs: () => range("fs", "字号", 13, 22, 1, `${prefs.fs} pt`),
    lh: () => range("lh", "行高", 1.4, 2.2, 0.05, prefs.lh.toFixed(2)),
    pg: () => range("pg", "段落间距", 0.6, 1.8, 0.1, `${prefs.pg.toFixed(1)} em`),
    mw: () => range("mw", "版心宽度", 560, 1000, 20, String(prefs.mw)),
    glass: () => (
      <div className="srow">
        {label("glass", "玻璃质感", "s-gl")}
        <span className="v">清透</span>
        <input id="s-gl" type="range" min={0} max={10} step={1} value={prefs.glass} onChange={(e) => onPrefs({ glass: Number(e.target.value) })} style={{ width: 100 }} />
        <span className="v">磨砂</span>
      </div>
    ),
    view: () => (
      <div className="srow">
        {label(undefined, "打开文件时的视图")}
        <span className="sseg" role="group" aria-label="打开文件时的视图" style={{ width: 140 }}>
          <button aria-pressed={base === "live"} onClick={() => onBase("live")}>实时</button>
          <button aria-pressed={base === "preview"} onClick={() => onBase("preview")}>预览</button>
        </span>
      </div>
    ),
    inline: () => toggle("inline", "行内渲染", "源码模式中，仅光标所在行显示标记"),
    pairs: () => toggle("pairs", "成对符号包裹", "选中文字后输入 ` * [ $ 自动包裹"),
    slash: () => toggle("slash", "斜杠命令", "空行输入 / 呼出插入菜单"),
    keep: () => (
      <div className="srow">
        {label("keep", "最近文件保留")}
        <span className="step">
          <button onClick={() => onPrefs({ keep: Math.max(10, prefs.keep - KEEP_STEP) })} aria-label="减少">−</button>
          <span>{prefs.keep}</span>
          <button onClick={() => onPrefs({ keep: Math.min(200, prefs.keep + KEEP_STEP) })} aria-label="增加">+</button>
        </span>
        <span className="v">个</span>
      </div>
    ),
    clear: () => (
      <div className="srow">
        {label(undefined, "最近文件记录")}
        <button className="sbtn warn" onClick={onClearRecent}>清空记录</button>
      </div>
    ),
    pdf: () => (
      <div className="srow">
        {label("pageGuard", <span>PDF 分页保护<small>放不下时整体移到下一页</small></span>)}
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {guards.map((g) => (
            <button key={g.id} className="schip" aria-pressed={prefs.pageGuard[g.id]} onClick={() => onPrefs({ pageGuard: { ...prefs.pageGuard, [g.id]: !prefs.pageGuard[g.id] } })}>{g.label}</button>
          ))}
        </span>
      </div>
    ),
    watermark: () => (
      <div className="srow">
        {label("watermark", "分享卡片水印", "s-wm")}
        <input id="s-wm" className="stx" type="text" maxLength={40} placeholder="@你的名字" value={prefs.watermark} onChange={(e) => onPrefs({ watermark: e.target.value })} />
      </div>
    ),
    keys: () => (
      <>
        {keys.map(([what, key]) => (
          <div key={what} className="kbr"><span>{what}</span><kbd>{key}</kbd></div>
        ))}
      </>
    ),
  };

  return (
    <aside className={`insp${leaving ? " out" : ""}${unseen ? " unseen" : ""}`} aria-label="设置">
      <div className="insp-head">
        <h2>设置</h2>
        <button className="gbtn insp-x" onClick={onClose} aria-label="关闭设置">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div className="insp-top">
        <label className="ssearch">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ opacity: 0.6 }}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <span className="sr">搜索设置</span>
          <input type="text" placeholder="搜索设置，例如“行高”“水印”" value={q} onChange={(e) => setQ(e.target.value)} />
          {searching && (
            <button onClick={(e) => { e.preventDefault(); setQ(""); }} aria-label="清除搜索">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
        </label>
        {!searching && (
          <div className="sseg" role="group" aria-label="设置分组">
            {(Object.keys(groupLabels) as SettingsGroup[]).map((g) => (
              <button key={g} aria-pressed={group === g} onClick={() => onGroup(g)}>{groupLabels[g]}</button>
            ))}
          </div>
        )}
      </div>
      <div className="insp-body">
        {groups.map((g) => (
          <div key={g.group} role="group" aria-label={groupLabels[g.group]}>
            {searching && <div className="sgt">{groupLabels[g.group]}</div>}
            <div className="sgrp">{g.rows.map((r) => <Fragment key={r.id}>{rows[r.id]()}</Fragment>)}</div>
          </div>
        ))}
        {searching && !groups.length && <div className="snone">没有找到与「{q.trim()}」相关的设置</div>}
      </div>
      <div className="insp-foot">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
        这里是所有文档的默认值；改过的项旁会出现一颗泪滴，点它恢复默认。
      </div>
    </aside>
  );
}
