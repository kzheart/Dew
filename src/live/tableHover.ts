/** Where a rendered table's lines are, in pixels relative to its block. */
export interface TableGeometry {
  /** The x of each column boundary, the left edge first: one more than the columns. */
  cols: number[];
  top: number;
  /** The y of each row boundary below the header, the bottom edge last: one more than the body rows. */
  rows: number[];
}

/** What a pointer over a table offers: a column or row to insert, or a column border to drag. */
export type TableTarget =
  | { kind: "column"; at: number }
  | { kind: "row"; at: number }
  | { kind: "border"; col: number };

export interface TableHover {
  target: TableTarget | null;
  /** The column under the pointer, whose grip shows. */
  col: number | null;
}

/** How far outside the table the top and left edges respond. */
export const RAIL = 22;
const INSET = 8;
const COLUMN_REACH = 16;
const ROW_REACH = 12;
const BORDER_REACH = 4;

/** The index of the value in xs nearest to x. */
export function nearest(xs: number[], x: number): number {
  let best = 0;
  xs.forEach((v, i) => {
    if (Math.abs(v - x) < Math.abs(xs[best]! - x)) best = i;
  });
  return best;
}

export function hoverAt(g: TableGeometry, x: number, y: number): TableHover {
  const left = g.cols[0]!;
  const right = g.cols.at(-1)!;
  const bottom = g.rows.at(-1)!;
  const overX = x >= left && x <= right;
  let col: number | null = null;
  if (overX && y >= g.top - RAIL && y <= bottom) {
    col = g.cols.findIndex((c, i) => i > 0 && x <= c) - 1;
    if (col < 0) col = 0;
  }
  const hover = (target: TableTarget | null): TableHover => ({ target, col });

  if (y >= g.top - RAIL && y <= g.top + INSET && x >= left - COLUMN_REACH && x <= right + COLUMN_REACH) {
    const at = nearest(g.cols, x);
    if (Math.abs(g.cols[at]! - x) <= COLUMN_REACH) return hover({ kind: "column", at });
  }
  if (x >= left - RAIL && x <= left + INSET && y >= g.rows[0]! - ROW_REACH && y <= bottom + ROW_REACH) {
    const at = nearest(g.rows, y);
    if (Math.abs(g.rows[at]! - y) <= ROW_REACH) return hover({ kind: "row", at });
  }
  if (overX && y >= g.top && y <= bottom) {
    const inner = g.cols.slice(1, -1);
    const i = nearest(inner, x);
    if (inner.length && Math.abs(inner[i]! - x) <= BORDER_REACH) return hover({ kind: "border", col: i });
  }
  return hover(null);
}

/** Column widths after dragging the right border of col by dx: its neighbor gives or takes the difference. */
export function resizeColumns(widths: number[], col: number, dx: number, min: number): number[] {
  const pair = widths[col]! + widths[col + 1]!;
  const w = Math.min(Math.max(widths[col]! + dx, min), pair - min);
  return widths.map((v, i) => (i === col ? w : i === col + 1 ? pair - w : v));
}

/** Where column from lands when dropped at boundary gap, or null when that leaves it in place. */
export function dropIndex(from: number, gap: number): number | null {
  if (gap === from || gap === from + 1) return null;
  return gap > from ? gap - 1 : gap;
}
