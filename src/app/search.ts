/** Indices of the units (lines, cells, labels) whose text contains query, ignoring case; none for a blank query. */
export function findHits(units: string[], query: string): number[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return units.flatMap((u, i) => (u.toLowerCase().includes(q) ? [i] : []));
}

/** The hit after (dir 1) or before (dir -1) current, wrapping around. */
export function stepHit(current: number, count: number, dir: 1 | -1): number {
  return count ? (current + dir + count) % count : 0;
}

/** "当前 / 总数" for a search with query; nothing before one is typed. */
export function hitLabel(query: string, current: number, count: number): string {
  if (!query.trim()) return "";
  return count ? `${current + 1} / ${count}` : "0 / 0";
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const TOKEN = /<[^>]*>|&(#x[\da-f]+|#\d+|\w+);|[\s\S]/giu;

interface Piece {
  /** The piece as it is written in the HTML. */
  src: string;
  /** The text it stands for; empty for a tag. */
  text: string;
}

function pieces(html: string): Piece[] {
  return [...html.matchAll(TOKEN)].map(([src, entity]) => {
    if (src.startsWith("<")) return { src, text: "" };
    if (entity === undefined) return { src, text: src };
    const code = entity[0] === "#" ? (entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))) : NaN;
    return { src, text: Number.isNaN(code) ? ENTITIES[entity.toLowerCase()] ?? src : String.fromCodePoint(code) };
  });
}

/** The text an HTML fragment shows. */
export function htmlText(html: string): string {
  return pieces(html).map((p) => p.text).join("");
}

/**
 * The HTML with every occurrence of query in its text wrapped in <mark>,
 * ignoring case. An occurrence that crosses tags is marked in pieces, so
 * the markup stays well formed.
 */
export function markText(html: string, query: string): string {
  const q = query.trim().toLowerCase();
  if (!q) return html;
  const ps = pieces(html);
  // One entry per character of text, pointing at the piece it came from.
  const owner: number[] = [];
  let text = "";
  ps.forEach((p, i) => {
    for (const ch of p.text) {
      const lower = ch.toLowerCase();
      text += lower.length === ch.length ? lower : ch;
      for (let k = 0; k < ch.length; k++) owner.push(i);
    }
  });
  const marked = new Set<number>();
  for (let at = text.indexOf(q); at >= 0; at = text.indexOf(q, at + q.length)) {
    for (let k = at; k < at + q.length; k++) marked.add(owner[k]!);
  }
  let out = "";
  let open = false;
  ps.forEach((p, i) => {
    const on = marked.has(i);
    if (open && (!on || !p.text)) {
      out += "</mark>";
      open = false;
    }
    if (on && !open) {
      out += "<mark>";
      open = true;
    }
    out += p.src;
  });
  return open ? out + "</mark>" : out;
}
