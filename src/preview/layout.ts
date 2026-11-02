import type { Block } from "../markdown/parse";

export interface LineRange {
  start: number;
  end: number;
}

export type ArticleItem = { type: "block"; block: Block; key: string } | { type: "editor"; key: "editor" };

/** Keys by kind and position among blocks of that kind, so that typing a line above a block keeps it mounted. */
export function blockKeys(blocks: Block[]): string[] {
  const seen = new Map<string, number>();
  return blocks.map((b) => {
    const n = seen.get(b.kind) ?? 0;
    seen.set(b.kind, n + 1);
    return `${b.kind}-${n}`;
  });
}

/** The article's items: the blocks, with the live editor in place of the blocks inside the lines it edits. */
export function articleItems(blocks: Block[], editing: LineRange | null): ArticleItem[] {
  const keys = blockKeys(blocks);
  const items: ArticleItem[] = [];
  let placed = editing === null;
  blocks.forEach((block, i) => {
    if (editing && block.start >= editing.start && block.end <= editing.end) return;
    if (!placed && block.start >= editing!.start) {
      items.push({ type: "editor", key: "editor" });
      placed = true;
    }
    items.push({ type: "block", block, key: keys[i]! });
  });
  if (!placed) items.push({ type: "editor", key: "editor" });
  return items;
}
