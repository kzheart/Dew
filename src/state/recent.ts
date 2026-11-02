import type { RecentFile } from "../mygo";

/** When a file closed, as the light table's 水汽 groups it. */
export type Bucket = "now" | "pm" | "am" | "y" | "w" | "m" | "o";
/** A place the scrubber can jump to. */
export type Anchor = "open" | "today" | "y" | "w" | "m" | "o";

interface BucketInfo {
  label: string;
  /** How faded its cards are, from 0 (today) to 4 (older). */
  age: number;
  anchor: Exclude<Anchor, "open">;
}

const buckets: Record<Bucket, BucketInfo> = {
  now: { label: "刚刚关闭", age: 0, anchor: "today" },
  pm: { label: "今天 · 下午", age: 0, anchor: "today" },
  am: { label: "今天 · 上午", age: 0, anchor: "today" },
  y: { label: "昨天", age: 1, anchor: "y" },
  w: { label: "最近 7 天", age: 2, anchor: "w" },
  m: { label: "最近 30 天", age: 3, anchor: "m" },
  o: { label: "更早", age: 4, anchor: "o" },
};
const order = Object.keys(buckets) as Bucket[];

export const anchorLabels: Record<Anchor, string> = { open: "已打开", today: "今天", y: "昨天", w: "最近 7 天", m: "最近 30 天", o: "更早" };
/** The 水汽 header names the part of the table in view. */
export const sectionLabels: Record<Anchor, string> = { open: "最近关闭", today: "今天", y: "昨天", w: "最近 7 天", m: "最近 30 天", o: "更早" };

/** Closed this long ago or less, a file counts as just closed. */
export const JUST_CLOSED_MS = 15 * 60 * 1000;
/** A today block longer than this shows its first CUT - 1 files and a stack of the rest. */
const CUT = 8;

const DAY = 24 * 60 * 60 * 1000;
const midnight = (t: number) => new Date(t).setHours(0, 0, 0, 0);
const daysAgo = (t: number, now: number) => Math.round((midnight(now) - midnight(t)) / DAY);

export function bucketOf(closedAt: number, now: number): Bucket {
  const days = daysAgo(closedAt, now);
  if (days <= 0) return now - closedAt <= JUST_CLOSED_MS ? "now" : new Date(closedAt).getHours() >= 12 ? "pm" : "am";
  if (days === 1) return "y";
  if (days <= 7) return "w";
  if (days <= 30) return "m";
  return "o";
}

const hm = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
const md = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`;

/** When a file closed, in words: 今天 16:40, 昨天 22:10, 10月31日. */
export function timeLabel(closedAt: number, now: number): string {
  const d = new Date(closedAt);
  const days = daysAgo(closedAt, now);
  if (days <= 0) return `今天 ${hm(d)}`;
  if (days === 1) return `昨天 ${hm(d)}`;
  return md(d);
}

/** The dates a stack of files spans: 11月1日, 10月27日 – 31日, 10月, 9月 – 10月. */
export function rangeLabel(times: number[], wholeMonths: boolean): string {
  const ds = times.map((t) => new Date(t));
  const first = new Date(Math.min(...times));
  const last = new Date(Math.max(...times));
  const sameMonth = first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth();
  if (wholeMonths) return sameMonth ? `${first.getMonth() + 1}月` : `${first.getMonth() + 1}月 – ${last.getMonth() + 1}月`;
  if (ds.every((d) => d.toDateString() === first.toDateString())) return md(first);
  return sameMonth ? `${md(first)} – ${last.getDate()}日` : `${md(first)} – ${md(last)}`;
}

export const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** The folder a file is in, by its last two names: Dew / 文档. */
export function folderOf(path: string): string {
  const parts = path.split("/").filter(Boolean).slice(0, -1);
  return parts.slice(-2).join(" / ") || "/";
}

export interface Card {
  file: RecentFile;
  name: string;
  folder: string;
  time: string;
  /** Read to, in percent. */
  pct: number;
  age: number;
}

export interface Stack {
  bucket: Bucket;
  label: string;
  count: number;
  range: string;
  age: number;
}

export type VaporBlock =
  | {
      kind: "grid";
      /** What expanded and collapsing it name: a bucket, or f:<folder>. */
      key: string;
      anchor: Anchor | null;
      label: string;
      count: number;
      cards: Card[];
      /** Files left in a stack after the cards, with a hint of which. */
      more: number;
      moreHint: string;
      collapsible: boolean;
    }
  | { kind: "stacks"; anchor: Anchor; count: number; stacks: Stack[] };

export interface Vapor {
  pins: Card[];
  blocks: VaporBlock[];
  /** The scrubber's stops, with where each jumps to. */
  scrub: { anchor: Anchor; label: string; target: Anchor }[];
}

export interface VaporOptions {
  now: number;
  group: "time" | "folder";
  /** The buckets and folders the user opened up. */
  expanded: ReadonlySet<string>;
  query: string;
}

/** The recent files as the 水汽 zone lays them out: pinned ones, then blocks by time or by folder. */
export function vapor(files: RecentFile[], { now, group, expanded, query }: VaporOptions): Vapor {
  const q = query.trim().toLowerCase();
  const card = (f: RecentFile, age: number): Card => ({
    file: f,
    name: fileName(f.path),
    folder: folderOf(f.path),
    time: f.pinned ? "已钉住" : timeLabel(f.closedAt, now),
    pct: Math.round(f.progress * 100),
    age,
  });
  const shown = files.filter((f) => !q || fileName(f.path).toLowerCase().includes(q));
  const pins = shown.filter((f) => f.pinned).map((f) => card(f, 0));
  const rest = shown.filter((f) => !f.pinned);
  const blocks: VaporBlock[] = [];
  // Searching opens every block.
  const isOpen = (key: string) => !!q || expanded.has(key);

  if (group === "folder") {
    const byFolder = new Map<string, RecentFile[]>();
    for (const f of rest) byFolder.set(folderOf(f.path), [...(byFolder.get(folderOf(f.path)) ?? []), f]);
    for (const [folder, list] of byFolder) {
      const key = `f:${folder}`;
      const cut = !isOpen(key) && list.length > CUT;
      blocks.push({
        kind: "grid", key, anchor: null, label: folder, count: list.length,
        cards: (cut ? list.slice(0, CUT - 1) : list).map((f) => card(f, 0)),
        more: cut ? list.length - (CUT - 1) : 0, moreHint: "同一文件夹",
        collapsible: !q && expanded.has(key) && list.length > CUT,
      });
    }
    return { pins, blocks, scrub: [] };
  }

  const present = new Set<Anchor>(["open"]);
  const collapsedTo: Partial<Record<Anchor, Anchor>> = {};
  let stacks: Extract<VaporBlock, { kind: "stacks" }> | null = null;
  let todayAnchored = false;
  for (const b of order) {
    const list = rest.filter((f) => bucketOf(f.closedAt, now) === b);
    if (!list.length) continue;
    const info = buckets[b];
    const today = info.age === 0;
    if (!today && !isOpen(b)) {
      if (!stacks) {
        stacks = { kind: "stacks", anchor: info.anchor, count: 0, stacks: [] };
        blocks.push(stacks);
      }
      stacks.count += list.length;
      collapsedTo[info.anchor] = stacks.anchor;
      present.add(info.anchor);
      stacks.stacks.push({ bucket: b, label: info.label, count: list.length, range: rangeLabel(list.map((f) => f.closedAt), b === "m" || b === "o"), age: info.age });
      continue;
    }
    stacks = null;
    const cut = today && !isOpen(b) && list.length > CUT;
    const cards = (cut ? list.slice(0, CUT - 1) : list).map((f) => card(f, info.age));
    let anchor: Anchor | null = info.anchor;
    if (anchor === "today") {
      anchor = todayAnchored ? null : "today";
      todayAnchored = true;
    }
    if (anchor) present.add(anchor);
    blocks.push({
      kind: "grid", key: b, anchor, label: info.label, count: list.length, cards,
      more: cut ? list.length - cards.length : 0,
      moreHint: cut ? `${cards.at(-1)!.time.replace("今天 ", "")} 之前` : "",
      collapsible: !q && expanded.has(b) && (!today || list.length > CUT),
    });
  }
  const scrub = (Object.keys(anchorLabels) as Anchor[])
    .filter((a) => present.has(a))
    .map((a) => ({ anchor: a, label: anchorLabels[a], target: collapsedTo[a] ?? a }));
  return { pins, blocks, scrub };
}

/** How many recent files the welcome page lists. */
const WELCOME_ROWS = 6;

export interface WelcomeRow {
  file: RecentFile;
  name: string;
  folder: string;
  /** When it closed, or 已钉住. */
  time: string;
}

/** The recent files the welcome page lists: pinned ones first, then the newest. */
export function welcomeRows(files: RecentFile[], now: number): WelcomeRow[] {
  return [...files.filter((f) => f.pinned), ...files.filter((f) => !f.pinned)].slice(0, WELCOME_ROWS).map((file) => ({
    file,
    name: fileName(file.path),
    folder: folderOf(file.path),
    time: file.pinned ? "已钉住" : timeLabel(file.closedAt, now),
  }));
}
