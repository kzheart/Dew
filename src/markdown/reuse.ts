import type { Block, ParsedDocument } from "./parse";

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** next, with the blocks and headings that did not change taken from prev, so memoized views of them skip a render. */
export function reuseUnchanged(prev: ParsedDocument | null, next: ParsedDocument): ParsedDocument {
  if (!prev) return next;
  const byStart = new Map<number, Block>(prev.blocks.map((b) => [b.start, b]));
  const blocks = next.blocks.map((b) => {
    const old = byStart.get(b.start);
    return old && equal(old, b) ? old : b;
  });
  const headings = equal(prev.headings, next.headings) ? prev.headings : next.headings;
  return { ...next, blocks, headings };
}
