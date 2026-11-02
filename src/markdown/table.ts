export type Align = "left" | "center" | "right" | null;

/** The cells of a table row, without the outer pipes; escaped pipes stay in their cell. */
export function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") {
      cell += "\\|";
      i++;
    } else if (s[i] === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += s[i];
    }
  }
  cells.push(cell.trim());
  return cells;
}

/** The column holding character ch of a row line (0-based), counting unescaped pipes before it. */
export function columnAt(line: string, ch: number): number {
  const lead = line.trimStart();
  const offset = line.length - lead.length;
  let col = 0;
  for (let i = lead.startsWith("|") ? offset + 1 : offset; i < Math.min(ch, line.length); i++) {
    if (line[i] === "\\") i++;
    else if (line[i] === "|") col++;
  }
  return col;
}

const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1F300}-\u{1F64F}\u{1F900}-\u{1F9FF}\u{20000}-\u{3FFFD}]/u;

/** Columns a string takes in a monospaced editor: CJK and other wide characters take two. */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += WIDE.test(ch) ? 2 : 1;
  return w;
}

/**
 * A pipe table. Each column's run is the length of its delimiter cell
 * (colons included), which by the pandoc convention is its relative width.
 */
interface Table {
  header: string[];
  aligns: Align[];
  runs: number[];
  body: string[][];
}

const MIN_RUN = 3;

function alignOf(cell: string): Align {
  const l = cell.startsWith(":");
  const r = cell.endsWith(":");
  return l && r ? "center" : r ? "right" : l ? "left" : null;
}

/** A delimiter cell of n characters for align. */
function delimiterCell(align: Align, n: number): string {
  const len = Math.max(n, align === "center" ? 3 : 2);
  if (align === "center") return `:${"-".repeat(len - 2)}:`;
  if (align === "left") return `:${"-".repeat(len - 1)}`;
  if (align === "right") return `${"-".repeat(len - 1)}:`;
  return "-".repeat(len);
}

/** Rows of a table's source lines; line 1 is the delimiter row. Short rows are padded to the widest. */
function parse(src: string): Table {
  const [head = "", delim = "", ...rest] = src.split("\n");
  const header = splitRow(head);
  const cells = splitRow(delim);
  const body = rest.map(splitRow);
  const width = Math.max(header.length, cells.length, ...body.map((r) => r.length));
  const fill = (r: string[]) => [...r, ...Array<string>(width - r.length).fill("")];
  const delimiter = fill(cells);
  return {
    header: fill(header),
    aligns: delimiter.map(alignOf),
    runs: delimiter.map((c) => Math.max(c.length, MIN_RUN)),
    body: body.map(fill),
  };
}

function pad(cell: string, width: number, align: Align): string {
  const space = width - displayWidth(cell);
  if (align === "right") return " ".repeat(space) + cell;
  if (align === "center") return " ".repeat(Math.floor(space / 2)) + cell + " ".repeat(Math.ceil(space / 2));
  return cell + " ".repeat(space);
}

/**
 * The table's source, every column padded to its widest cell or its run.
 * Delimiter cells keep their run and pad with spaces, so that padding never
 * reads as a width.
 */
function format(t: Table): string {
  const widths = t.runs.map((run, i) => Math.max(run, displayWidth(t.header[i]!), ...t.body.map((r) => displayWidth(r[i]!))));
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const row = (r: string[]) => line(r.map((c, i) => pad(c, widths[i]!, t.aligns[i]!)));
  const delimiter = line(t.runs.map((run, i) => pad(delimiterCell(t.aligns[i]!, run), widths[i]!, null)));
  return [row(t.header), delimiter, ...t.body.map(row)].join("\n");
}

const edit = (src: string, change: (t: Table) => void) => {
  const t = parse(src);
  change(t);
  return format(t);
};

/** The table's source with its columns aligned. */
export const formatTable = (src: string) => edit(src, () => {});

export function alignments(src: string): Align[] {
  return parse(src).aligns;
}

export function setAlign(src: string, col: number, align: Align): string {
  if (col < 0 || col >= parse(src).aligns.length) return src;
  return edit(src, (t) => {
    t.aligns[col] = align;
  });
}

/** Inserts an empty body row before body row index (0 is right under the header). */
export function insertRow(src: string, index: number): string {
  return edit(src, (t) => {
    t.body.splice(Math.max(0, Math.min(index, t.body.length)), 0, t.header.map(() => ""));
  });
}

/** Inserts an empty, unaligned column before column index. */
export function insertColumn(src: string, index: number): string {
  return edit(src, (t) => {
    const at = Math.max(0, Math.min(index, t.header.length));
    for (const r of [t.header, ...t.body]) r.splice(at, 0, "");
    t.aligns.splice(at, 0, null);
    t.runs.splice(at, 0, MIN_RUN);
  });
}

/** Moves column from so that it ends up at index to, with its alignment and width. */
export function moveColumn(src: string, from: number, to: number): string {
  return edit(src, (t) => {
    const n = t.header.length;
    if (from < 0 || from >= n || to < 0 || to >= n) return;
    for (const list of [t.header, t.aligns, t.runs, ...t.body] as unknown[][]) list.splice(to, 0, list.splice(from, 1)[0]);
  });
}

/** Gives the columns runs of the given lengths, which the renderer reads as their relative widths. */
export function setColumnWidths(src: string, runs: number[]): string {
  return edit(src, (t) => {
    t.runs = t.runs.map((r, i) => (runs[i] === undefined ? r : Math.max(1, Math.round(runs[i]!))));
  });
}

/**
 * The columns' relative widths (summing to 1) from a delimiter row's runs,
 * or null for the minimal form (every run three characters or fewer),
 * which leaves the widths to the content.
 */
export function relativeWidths(delimiterRow: string): number[] | null {
  const runs = splitRow(delimiterRow).map((c) => c.length);
  if (runs.every((r) => r <= MIN_RUN)) return null;
  const total = runs.reduce((a, b) => a + b, 0);
  return runs.map((r) => r / total);
}
