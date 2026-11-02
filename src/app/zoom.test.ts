import { expect, test } from "bun:test";
import { anchorAt, CODE_ZOOM, fitZoom, scrollFor, SHEET_ZOOM, stepZoom, wheelZoom } from "./zoom";

test("the − and + buttons walk a ladder inside each range", () => {
  expect(stepZoom(100, 1, CODE_ZOOM)).toBe(125);
  expect(stepZoom(100, -1, CODE_ZOOM)).toBe(75);
  expect(stepZoom(60, -1, CODE_ZOOM)).toBe(60);
  expect(stepZoom(200, 1, CODE_ZOOM)).toBe(200);
  expect(stepZoom(400, 1, SHEET_ZOOM)).toBe(400);
  expect(stepZoom(25, -1, SHEET_ZOOM)).toBe(25);
  expect(stepZoom(137, 1, SHEET_ZOOM)).toBe(150);
  expect(stepZoom(137, -1, SHEET_ZOOM)).toBe(125);
});

test("wheeling down zooms out and up zooms in, a pinch faster, never past the range", () => {
  expect(wheelZoom(100, 100, false, SHEET_ZOOM)).toBeLessThan(100);
  expect(wheelZoom(100, -100, false, SHEET_ZOOM)).toBeGreaterThan(100);
  expect(wheelZoom(100, -10, true, SHEET_ZOOM)).toBeGreaterThan(wheelZoom(100, -10, false, SHEET_ZOOM));
  expect(wheelZoom(190, -5000, false, CODE_ZOOM)).toBe(200);
  expect(wheelZoom(30, 5000, false, SHEET_ZOOM)).toBe(25);
});

test("a chart opens at the zoom that fits it, at most 200%", () => {
  expect(fitZoom({ width: 360, height: 660 }, { width: 1000, height: 600 }, SHEET_ZOOM)).toBe(91);
  expect(fitZoom({ width: 100, height: 100 }, { width: 1000, height: 600 }, SHEET_ZOOM)).toBe(200);
  expect(fitZoom({ width: 10000, height: 100 }, { width: 1000, height: 600 }, SHEET_ZOOM)).toBe(25);
});

test("zooming keeps the point under the pointer where it was", () => {
  const before = { left: 40, top: 84, width: 400, height: 300 };
  const pointer = { x: 240, y: 200 };
  const a = anchorAt({ x: 0, y: 0 }, pointer, before);
  // The same content at twice the size.
  const after = { left: 40, top: 84, width: 800, height: 600 };
  const scroll = scrollFor(a, after);
  // The content point under the pointer: (240 - 40) / 400 = half way across, before and after.
  expect((scroll.x + pointer.x - after.left) / after.width).toBeCloseTo(0.5);
  expect((scroll.y + pointer.y - after.top) / after.height).toBeCloseTo((200 - 84) / 300);
  expect(scroll).toEqual({ x: 200, y: 116 });
});
