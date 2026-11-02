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

const joinRow = (cells: string[]) => `| ${cells.join(" | ")} |`;

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

function alignOf(cell: string): Align {
  const c = cell.trim();
  const l = c.startsWith(":");
  const r = c.endsWith(":");
  return l && r ? "center" : r ? "right" : l ? "left" : null;
}

const delimiter = (a: Align) => (a === "center" ? ":-:" : a === "right" ? "--:" : a === "left" ? ":--" : "---");

interface Table {
  rows: string[][];
  width: number;
}

/** Rows of a table's source lines; line 1 is the delimiter row. Rows are padded to the widest. */
function parse(src: string): Table {
  const rows = src.split("\n").map(splitRow);
  const width = Math.max(...rows.map((r) => r.length));
  return { rows: rows.map((r) => [...r, ...Array<string>(width - r.length).fill("")]), width };
}

const format = (t: Table) => t.rows.map(joinRow).join("\n");

export function alignments(src: string): Align[] {
  return splitRow(src.split("\n")[1] ?? "").map(alignOf);
}

export function setAlign(src: string, col: number, align: Align): string {
  const lines = src.split("\n");
  if (lines.length < 2) return src;
  const cells = splitRow(lines[1]!);
  if (col < 0 || col >= cells.length) return src;
  cells[col] = delimiter(align);
  lines[1] = joinRow(cells);
  return lines.join("\n");
}

/** Adds an empty row below the row on line (0-based); from the header or delimiter it becomes the first body row. */
export function addRow(src: string, line: number): { src: string; line: number } {
  const t = parse(src);
  const at = Math.max(2, line + 1);
  t.rows.splice(at, 0, Array<string>(t.width).fill(""));
  return { src: format(t), line: at };
}

/** Adds an empty column after col. */
export function addColumn(src: string, col: number): { src: string; col: number } {
  const t = parse(src);
  const at = Math.min(col + 1, t.width);
  t.rows.forEach((r, i) => r.splice(at, 0, i === 1 ? "---" : ""));
  return { src: format(t), col: at };
}
