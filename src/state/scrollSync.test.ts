import { describe, expect, test } from "bun:test";
import { clampSplit, previewOffsetFor, sourcePosFor, type BlockBox } from "./scrollSync";

// A heading on line 1, a gap, a four-line code block on lines 3–6, a paragraph on 8.
const blocks: BlockBox[] = [
  { start: 1, end: 1, top: 0, height: 40 },
  { start: 3, end: 6, top: 60, height: 200 },
  { start: 8, end: 8, top: 280, height: 30 },
];

describe("previewOffsetFor", () => {
  test("a line inside a block maps proportionally into it", () => {
    expect(previewOffsetFor({ line: 3, frac: 0 }, blocks)).toBe(60);
    expect(previewOffsetFor({ line: 5, frac: 0 }, blocks)).toBe(160);
    expect(previewOffsetFor({ line: 6, frac: 0.5 }, blocks)).toBe(235);
  });

  test("a blank line between blocks stays at the end of the block before it", () => {
    expect(previewOffsetFor({ line: 7, frac: 0 }, blocks)).toBe(260);
  });

  test("lines before the first block map to its top", () => {
    expect(previewOffsetFor({ line: 1, frac: 0 }, [{ start: 4, end: 4, top: 10, height: 20 }])).toBe(10);
  });

  test("no blocks, no offset", () => {
    expect(previewOffsetFor({ line: 1, frac: 0 }, [])).toBeNull();
  });
});

describe("sourcePosFor", () => {
  test("an offset inside a block maps to the matching source line", () => {
    expect(sourcePosFor(160, blocks)).toEqual({ line: 5, frac: 0 });
    const pos = sourcePosFor(285, blocks)!;
    expect(pos.line).toBe(8);
    expect(pos.frac).toBeCloseTo(1 / 6);
  });

  test("the gap after a block clamps to its last line", () => {
    expect(sourcePosFor(270, blocks)).toEqual({ line: 6, frac: 1 });
  });

  test("round-trips with previewOffsetFor inside a block", () => {
    const pos = sourcePosFor(110, blocks)!;
    expect(previewOffsetFor(pos, blocks)).toBeCloseTo(110);
  });
});

test("the split stays between a quarter and three quarters", () => {
  expect(clampSplit(10)).toBe(25);
  expect(clampSplit(90)).toBe(75);
  expect(clampSplit(41.26)).toBe(41.3);
});
