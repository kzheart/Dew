import type { CSSProperties } from "react";
import { defaultPrefs } from "../defaultPrefs";
import type { Prefs } from "../mygo";

export type SettingsGroup = "look" | "edit" | "file" | "export" | "keys";

export const groupLabels: Record<SettingsGroup, string> = { look: "外观", edit: "编辑", file: "文件", export: "导出", keys: "快捷键" };

export type RowId = "bg" | "ff" | "fs" | "lh" | "pg" | "mw" | "glass" | "view" | "inline" | "pairs" | "slash" | "keep" | "clear" | "pdf" | "watermark" | "keys";

export interface SettingsRow {
  id: RowId;
  group: SettingsGroup;
  /** What a search finds the row by. */
  keywords: string;
  /** The preference it edits, which a drop before its label resets. */
  pref?: keyof Prefs;
}

/** Every row of the settings inspector, in order. Only settings the app acts on are here. */
export const settingsRows: SettingsRow[] = [
  { id: "bg", group: "look", keywords: "阅读背景 背景 纯白 羊皮纸 暗夜", pref: "bg" },
  { id: "ff", group: "look", keywords: "正文字体 字体 衬线 无衬线 等宽", pref: "ff" },
  { id: "fs", group: "look", keywords: "字号 字体大小", pref: "fs" },
  { id: "lh", group: "look", keywords: "行高 行距", pref: "lh" },
  { id: "pg", group: "look", keywords: "段落间距 间距", pref: "pg" },
  { id: "mw", group: "look", keywords: "版心宽度 宽度 版心", pref: "mw" },
  { id: "glass", group: "look", keywords: "玻璃质感 liquid glass 透明 磨砂 清透", pref: "glass" },
  { id: "view", group: "edit", keywords: "打开文件时的视图 默认视图 实时 预览" },
  { id: "inline", group: "edit", keywords: "行内渲染 源码 标记", pref: "inline" },
  { id: "pairs", group: "edit", keywords: "成对符号包裹 自动配对 包裹", pref: "pairs" },
  { id: "slash", group: "edit", keywords: "斜杠命令 插入菜单 /", pref: "slash" },
  { id: "keep", group: "file", keywords: "最近文件保留 最近 历史 记录 数量 水汽", pref: "keep" },
  { id: "clear", group: "file", keywords: "清空记录 最近文件记录 清空 水汽" },
  { id: "pdf", group: "export", keywords: "pdf 分页保护 导出", pref: "pageGuard" },
  { id: "watermark", group: "export", keywords: "分享卡片水印 水印 卡片", pref: "watermark" },
  { id: "keys", group: "keys", keywords: "快捷键 键位 shortcut" },
];

/**
 * The rows to show: those of the picked group, or, while searching, every row whose keywords
 * contain the query, under their groups.
 */
export function shownRows(group: SettingsGroup, query: string): { group: SettingsGroup; rows: SettingsRow[] }[] {
  const q = query.trim().toLowerCase();
  const rows = settingsRows.filter((r) => (q ? r.keywords.toLowerCase().includes(q) : r.group === group));
  return (Object.keys(groupLabels) as SettingsGroup[])
    .map((g) => ({ group: g, rows: rows.filter((r) => r.group === g) }))
    .filter((g) => g.rows.length);
}

/** Whether a preference differs from what a new install starts with. */
export function isModified(prefs: Prefs, key: keyof Prefs): boolean {
  return JSON.stringify(prefs[key]) !== JSON.stringify(defaultPrefs[key]);
}

/** The 0–10 glass texture as the `--g` the glass styles scale with: clear at 0, frosted at 10. */
export function glassStyle(glass: number): CSSProperties {
  return { "--g": glass } as CSSProperties;
}
