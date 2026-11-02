/** A rendered block: its source lines and where it sits in the preview's scroll content. */
export interface BlockBox {
  start: number;
  end: number;
  top: number;
  height: number;
}

/** A place in the source: a 1-based line and how far down that line (0–1). */
export interface SourcePos {
  line: number;
  frac: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The preview offset showing the same place as pos: the last block starting
 * at or before the line, entered as far as the line is through its source.
 */
export function previewOffsetFor(pos: SourcePos, blocks: BlockBox[]): number | null {
  if (!blocks.length) return null;
  let b = blocks[0]!;
  for (const x of blocks) if (x.start <= pos.line) b = x;
  const f = clamp01((pos.line - b.start + pos.frac) / (b.end - b.start + 1));
  return b.top + f * b.height;
}

/** The source place shown at preview offset y, the inverse of previewOffsetFor. */
export function sourcePosFor(y: number, blocks: BlockBox[]): SourcePos | null {
  if (!blocks.length) return null;
  let b = blocks[0]!;
  for (const x of blocks) if (x.top <= y) b = x;
  const f = clamp01((y - b.top) / Math.max(1, b.height));
  const at = b.start + f * (b.end - b.start + 1);
  const line = Math.min(Math.floor(at), b.end);
  return { line, frac: at - line };
}

export const SPLIT_MIN = 25;
export const SPLIT_MAX = 75;

export function clampSplit(pct: number): number {
  return Math.round(Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, pct)) * 10) / 10;
}
