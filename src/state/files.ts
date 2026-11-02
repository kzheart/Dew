import type { FileTab } from "../mygo";

/** What a file's tear shows: unsaved edits, no file on disk yet, or the file as saved. */
export type DropState = "saved" | "dirty" | "empty";

export function dropState(t: Pick<FileTab, "edited" | "untitled">): DropState {
  return t.edited ? "dirty" : t.untitled ? "empty" : "saved";
}

const statuses: Record<DropState, string> = {
  saved: "已保存 · 与磁盘同步",
  dirty: "有未保存的修改",
  empty: "尚未保存到磁盘",
};

export function fileStatus(t: Pick<FileTab, "edited" | "untitled">): string {
  return statuses[dropState(t)];
}

export interface Closed {
  tab: FileTab;
  /** Where the tab stood in the group. */
  index: number;
}

/** What the dock animates as the group's list changes. */
export interface Changes {
  /** Files that joined the group. */
  born: number[];
  /** Files whose unsaved edits were just saved. */
  saved: number[];
  closed: Closed[];
}

export function changes(prev: FileTab[], next: FileTab[]): Changes {
  const before = new Map(prev.map((t) => [t.id, t]));
  const after = new Set(next.map((t) => t.id));
  return {
    born: next.filter((t) => !before.has(t.id)).map((t) => t.id),
    saved: next.filter((t) => {
      const was = before.get(t.id);
      return was && dropState(was) === "dirty" && dropState(t) === "saved";
    }).map((t) => t.id),
    closed: prev.flatMap((tab, index) => (after.has(tab.id) ? [] : [{ tab, index }])),
  };
}

/** The group's files, with those that just closed still where they stood while they fade out. */
export function withClosed(tabs: FileTab[], closed: Closed[]): (FileTab & { closing: boolean })[] {
  const shown = tabs.map((t) => ({ ...t, closing: false }));
  for (const c of [...closed].sort((a, b) => a.index - b.index)) {
    if (!tabs.some((t) => t.id === c.tab.id)) shown.splice(Math.min(c.index, shown.length), 0, { ...c.tab, current: false, closing: true });
  }
  return shown;
}
