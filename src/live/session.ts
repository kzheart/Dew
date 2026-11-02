import type { Block } from "../markdown/parse";
import type { LineRange } from "../preview/layout";

/** Where the cursor starts in a block that becomes active: a source offset, or one of its ends. */
export type Caret = number | "start" | "end";

export interface Active extends LineRange {
  caret: Caret;
  /** A new key per activation, so each activation gets a fresh editor and glow. */
  key: number;
}

/** The block just above (dir -1) or below (dir 1) the lines of range. */
export function neighbor(blocks: Block[], range: LineRange, dir: -1 | 1): Block | null {
  if (dir < 0) {
    for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i]!.end < range.start) return blocks[i]!;
    return null;
  }
  return blocks.find((b) => b.start > range.end) ?? null;
}

/** The first block that starts within range: what the active lines currently are. */
export function blockWithin(blocks: Block[], range: LineRange): Block | null {
  return blocks.find((b) => b.start >= range.start && b.start <= range.end) ?? null;
}

/** The range after the active lines were replaced by src. */
export function rangeAfterEdit(range: LineRange, src: string): LineRange {
  return { start: range.start, end: range.start + src.split("\n").length - 1 };
}
