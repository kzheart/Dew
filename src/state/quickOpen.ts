import type { FileTab, FolderFile, RecentFile } from "../mygo";
import { fileName } from "./recent";

/** A name split around the run that matched the query, which the palette bolds. */
export interface Match {
  before: string;
  hit: string;
  after: string;
}

/** Where the query occurs in the name, ignoring case; null when it doesn't. An empty query matches all. */
export function matchName(name: string, query: string): Match | null {
  const q = query.trim().toLowerCase();
  if (!q) return { before: name, hit: "", after: "" };
  const i = name.toLowerCase().indexOf(q);
  return i < 0 ? null : { before: name.slice(0, i), hit: name.slice(i, i + q.length), after: name.slice(i + q.length) };
}

export type QuickItem =
  | { kind: "open"; tab: FileTab; match: Match }
  | { kind: "recent"; file: RecentFile; match: Match }
  | { kind: "folder"; file: FolderFile; match: Match };

export interface QuickSection {
  label: string;
  items: QuickItem[];
}

const MAX_RECENT = 5;
const MAX_FOLDER = 3;

/**
 * What the palette lists for a query: the group's files, then recent ones (pinned first), then,
 * once something is typed, files beside the current one that are not open.
 */
export function quickOpen({ tabs, recent, folder, query }: { tabs: FileTab[]; recent: RecentFile[]; folder: FolderFile[]; query: string }): QuickSection[] {
  const open: QuickItem[] = [];
  for (const tab of tabs) {
    const match = matchName(tab.name, query);
    if (match) open.push({ kind: "open", tab, match });
  }
  const rec: QuickItem[] = [];
  for (const file of [...recent.filter((f) => f.pinned), ...recent.filter((f) => !f.pinned)]) {
    const match = matchName(fileName(file.path), query);
    if (match && rec.length < MAX_RECENT) rec.push({ kind: "recent", file, match });
  }
  const near: QuickItem[] = [];
  const known = new Set([...tabs.map((t) => t.path), ...rec.map((r) => (r.kind === "recent" ? r.file.path : ""))]);
  if (query.trim()) {
    for (const file of folder) {
      const match = matchName(file.name, query);
      if (match && !known.has(file.path) && near.length < MAX_FOLDER) near.push({ kind: "folder", file, match });
    }
  }
  return [
    { label: "已打开", items: open },
    { label: "最近", items: rec },
    { label: "当前文件夹", items: near },
  ].filter((s) => s.items.length);
}
