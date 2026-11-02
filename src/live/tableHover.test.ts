import { describe, expect, test } from "bun:test";
import { dropIndex, hoverAt, resizeColumns, type TableGeometry } from "./tableHover";

// Three columns 100, 150, 200 wide; a 40px header and two 36px rows.
const g: TableGeometry = { cols: [0, 100, 250, 450], top: 0, rows: [40, 76, 112] };

describe("hovering a table", () => {
  test("the top edge offers a column at the nearest boundary, edges included", () => {
    expect(hoverAt(g, 98, -10).target).toEqual({ kind: "column", at: 1 });
    expect(hoverAt(g, 2, -4).target).toEqual({ kind: "column", at: 0 });
    expect(hoverAt(g, 455, 0).target).toEqual({ kind: "column", at: 3 });
  });

  test("the top edge between boundaries offers nothing but the column's grip", () => {
    expect(hoverAt(g, 175, -10)).toEqual({ target: null, col: 1 });
  });

  test("the left edge offers a row at the nearest boundary below the header", () => {
    expect(hoverAt(g, -8, 42).target).toEqual({ kind: "row", at: 0 });
    expect(hoverAt(g, -8, 110).target).toEqual({ kind: "row", at: 2 });
    expect(hoverAt(g, -8, 20).target).toBeNull();
  });

  test("an inner border inside the table can be dragged; the outer edges cannot", () => {
    expect(hoverAt(g, 252, 60)).toEqual({ target: { kind: "border", col: 1 }, col: 2 });
    expect(hoverAt(g, 449, 60).target).toBeNull();
    expect(hoverAt(g, 175, 60)).toEqual({ target: null, col: 1 });
  });

  test("far from the table nothing shows", () => {
    expect(hoverAt(g, 175, -60)).toEqual({ target: null, col: null });
    expect(hoverAt(g, -60, 60)).toEqual({ target: null, col: null });
  });
});

test("a border drag moves width between the two columns it separates, down to a minimum", () => {
  expect(resizeColumns([100, 150, 200], 0, 30, 40)).toEqual([130, 120, 200]);
  expect(resizeColumns([100, 150, 200], 1, 500, 40)).toEqual([100, 310, 40]);
  expect(resizeColumns([100, 150, 200], 0, -500, 40)).toEqual([40, 210, 200]);
});

test("a column dropped at a boundary lands before it, and its own boundaries leave it in place", () => {
  expect(dropIndex(0, 3)).toBe(2);
  expect(dropIndex(2, 0)).toBe(0);
  expect(dropIndex(1, 1)).toBeNull();
  expect(dropIndex(1, 2)).toBeNull();
});
