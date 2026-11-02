/** East Asian wide and fullwidth characters take two columns in a monospaced font. */
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u;

/** How many monospaced columns text takes, counting CJK as two. */
export function displayWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += WIDE.test(ch) ? 2 : 1;
  return w;
}

const pad = (cell: string, width: number) => cell + " ".repeat(width - displayWidth(cell));

/**
 * A Markdown table with its first row as the header and every column padded
 * to its widest cell, so the source lines up in a monospaced editor. Rows are
 * filled out to the widest row.
 */
export function formatTable(rows: string[][]): string {
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const filled = rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ""));
  const widths = Array.from({ length: cols }, (_, i) => Math.max(3, ...filled.map((r) => displayWidth(r[i]!))));
  const line = (cells: string[]) => `| ${cells.map((c, i) => pad(c, widths[i]!)).join(" | ")} |`;
  const [header = [], ...body] = filled;
  return [line(header), line(widths.map((w) => "-".repeat(w))), ...body.map(line)].join("\n");
}
