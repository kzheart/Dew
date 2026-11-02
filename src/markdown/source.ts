/** Lines start to end (1-based, inclusive) of text. */
export function sliceLines(text: string, start: number, end: number): string {
  return text.split("\n").slice(start - 1, end).join("\n");
}

/** Replaces lines start to end (1-based, inclusive) with replacement, which may have any number of lines. */
export function replaceLines(text: string, start: number, end: number, replacement: string): string {
  const lines = text.split("\n");
  lines.splice(start - 1, end - start + 1, ...replacement.split("\n"));
  return lines.join("\n");
}

/** Removes lines start to end, and one blank line around them so that no double gap is left. */
export function deleteLines(text: string, start: number, end: number): string {
  const lines = text.split("\n");
  let s = start - 1;
  let e = end;
  if (lines[e] !== undefined && !lines[e]!.trim() && (s === 0 || !lines[s - 1]!.trim())) e++;
  else if (s > 0 && !lines[s - 1]!.trim()) s--;
  lines.splice(s, e - s);
  return lines.join("\n");
}

const TASK = /^(\s*(?:[-*+]|\d+[.)])\s+(?:>\s*)?)\[([ xX])\]/;

/** Checks or unchecks the task item on line (1-based). Lines that hold no task are left alone. */
export function toggleTask(text: string, line: number): string {
  const lines = text.split("\n");
  const l = lines[line - 1];
  if (l === undefined) return text;
  const m = TASK.exec(l.replace(/^(\s*>\s?)+/, (q) => " ".repeat(q.length)));
  if (!m) return text;
  const at = m[1]!.length + 1;
  lines[line - 1] = l.slice(0, at) + (m[2] === " " ? "x" : " ") + l.slice(at + 1);
  return lines.join("\n");
}

/** The smallest change that turns a into b, for editors that keep their selection through it. */
export function diff(a: string, b: string): { from: number; to: number; insert: string } | null {
  if (a === b) return null;
  let start = 0;
  const max = Math.min(a.length, b.length);
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) {
    endA--;
    endB--;
  }
  return { from: start, to: endA, insert: b.slice(start, endB) };
}
