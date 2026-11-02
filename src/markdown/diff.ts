export interface DiffLine {
  type: "hunk" | "context" | "add" | "del" | "meta";
  /** Line numbers in the old and new file; null where the line is not in that file. */
  old: number | null;
  new: number | null;
  /** The line without its +, - or space marker; a hunk or meta line whole. */
  text: string;
}

export interface ParsedDiff {
  lines: DiffLine[];
  added: number;
  removed: number;
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const FILE_HEADER = /^(diff |index |--- |\+\+\+ |new file mode|deleted file mode|old mode|new mode|similarity index|rename (from|to) |Binary files )/;

/**
 * A unified diff's lines, numbered from its `@@ -a,b +c,d @@` headers. A
 * diff without headers numbers both sides from 1. File headers count as
 * meta only outside a hunk, so a removed line that starts with "--" stays
 * a removal.
 */
export function parseDiff(code: string): ParsedDiff {
  const lines: DiffLine[] = [];
  let added = 0;
  let removed = 0;
  let oldNo = 1;
  let newNo = 1;
  // Lines a hunk header announces that have not been seen; Infinity before any header.
  let oldLeft = Infinity;
  let newLeft = Infinity;
  let sawHunk = false;

  for (const line of code.split("\n")) {
    const hunk = HUNK.exec(line);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[3]);
      oldLeft = hunk[2] === undefined ? 1 : Number(hunk[2]);
      newLeft = hunk[4] === undefined ? 1 : Number(hunk[4]);
      sawHunk = true;
      lines.push({ type: "hunk", old: null, new: null, text: line });
      continue;
    }
    const inHunk = sawHunk && (oldLeft > 0 || newLeft > 0);
    if (line.startsWith("\\") || (!inHunk && FILE_HEADER.test(line))) {
      lines.push({ type: "meta", old: null, new: null, text: line });
      continue;
    }
    const mark = line[0];
    if (mark === "+") {
      lines.push({ type: "add", old: null, new: newNo++, text: line.slice(1) });
      newLeft--;
      added++;
    } else if (mark === "-") {
      lines.push({ type: "del", old: oldNo++, new: null, text: line.slice(1) });
      oldLeft--;
      removed++;
    } else {
      lines.push({ type: "context", old: oldNo++, new: newNo++, text: mark === " " ? line.slice(1) : line });
      oldLeft--;
      newLeft--;
    }
  }
  return { lines, added, removed };
}
