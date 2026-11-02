import { formatTable } from "../markdown/tableLayout";
import { htmlToMarkdown } from "./html";

/** What a paste carries, read from the clipboard event. */
export interface Clipboard {
  text: string;
  html: string;
  hasImage: boolean;
}

/**
 * What a paste becomes. `plain` is left to the editor's own paste; the
 * others insert `markdown` and keep `plain`, what an ordinary paste would
 * have inserted, for 撤销.
 */
export type Paste =
  | { kind: "plain" }
  | { kind: "image" }
  | { kind: "link"; markdown: string; plain: string }
  | { kind: "rich"; markdown: string; plain: string }
  | { kind: "table"; markdown: string; plain: string; source: string | null; cols: number; rows: number };

const URL_ONLY = /^https?:\/\/[^\s<>"]+$/i;

/** Dew's own rendered HTML: its preview blocks, or what 拷贝为富文本 writes. */
const FROM_DEW = /\sdata-blk="|\sdata-dew-rich\b/;

/** The app a spreadsheet's HTML names, or null. */
export function spreadsheetSource(html: string): string | null {
  if (/urn:schemas-microsoft-com:office:excel|ProgId content="?Excel\.Sheet|Microsoft Excel/i.test(html)) return "Excel";
  if (/google-sheets-html-origin|data-sheets-root/i.test(html)) return "Google 表格";
  return null;
}

/** Cells of tab-separated text, with spreadsheet quoting ("" inside quotes, line breaks in quoted cells). */
function splitTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  while (i <= text.length) {
    let cell = "";
    if (text[i] === '"') {
      i++;
      for (; i < text.length; i++) {
        if (text[i] === '"' && text[i + 1] === '"') cell += text[i++];
        else if (text[i] === '"') break;
        else cell += text[i];
      }
      i++;
      while (i < text.length && text[i] !== "\t" && text[i] !== "\n") cell += text[i++];
    } else {
      while (i < text.length && text[i] !== "\t" && text[i] !== "\n") cell += text[i++];
    }
    row.push(cell);
    if (text[i] !== "\t") {
      rows.push(row);
      row = [];
    }
    i++;
  }
  return rows;
}

/**
 * Rows of text copied from a spreadsheet: two or more lines, all with the
 * same number of tab-separated cells, at least two. Text indented with tabs,
 * whose first cells are all empty, is not a table.
 */
export function parseTsv(text: string): string[][] | null {
  const body = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  if (!body.includes("\t") || !body.includes("\n")) return null;
  const rows = splitTsv(body);
  const width = rows[0]!.length;
  if (rows.length < 2 || width < 2 || rows.some((r) => r.length !== width) || rows.every((r) => !r[0]!.trim())) return null;
  return rows.map((r) => r.map((c) => c.trim().replace(/\n/g, "<br>").replace(/\|/g, "\\|")));
}

/** Text with Markdown's escapes and all spacing gone, to tell whether conversion added anything. */
const bare = (s: string) => s.replace(/\\(.)/g, "$1").replace(/\s+/g, "");

function table(rows: string[][], plain: string, source: string | null): Paste {
  return { kind: "table", markdown: formatTable(rows), plain, source, cols: rows[0]!.length, rows: rows.length - 1 };
}

/** Decides what a paste over `selection` becomes. */
export function classifyPaste({ text, html, hasImage }: Clipboard, selection: string): Paste {
  if (hasImage && !text.trim()) return { kind: "image" };
  const url = text.trim();
  if (selection.trim() && !selection.includes("\n") && URL_ONLY.test(url)) {
    return { kind: "link", markdown: `[${selection}](${url})`, plain: text };
  }
  if (html && !FROM_DEW.test(html)) {
    const { markdown, tables } = htmlToMarkdown(html);
    if (tables.length === 1 && markdown === formatTable(tables[0]!)) return table(tables[0]!, text, spreadsheetSource(html));
    if (markdown && bare(markdown) !== bare(text)) return { kind: "rich", markdown, plain: text };
  }
  const rows = parseTsv(text);
  if (rows) return table(rows, text, spreadsheetSource(html));
  return { kind: "plain" };
}

/**
 * A pasted table, or rich text of more than one line, on lines of its own:
 * text before or after the caret on its line is set apart by a blank line,
 * so it neither joins the table nor turns into one of its rows.
 */
export function onOwnLines(markdown: string, before: string, after: string): string {
  if (!markdown.includes("\n")) return markdown;
  return (before.trim() ? "\n\n" : "") + markdown + (after.trim() ? "\n\n" : "");
}

export type NoticeIcon = "link" | "rich" | "table" | "image" | "warn";

/** A toast's content; the editor adds its action. */
export interface Notice {
  icon: NoticeIcon;
  title: string;
  detail: string;
}

/** What the toast after a converted paste says. */
export function pasteNotice(paste: Exclude<Paste, { kind: "plain" } | { kind: "image" }>): Notice {
  switch (paste.kind) {
    case "link":
      return { icon: "link", title: "已合成链接", detail: paste.markdown };
    case "rich":
      return { icon: "rich", title: "富文本已转为 Markdown", detail: "保留标题、列表、加粗与链接，清除内联样式" };
    case "table":
      return { icon: "table", title: "表格已转换并对齐", detail: `${paste.source ? `来自 ${paste.source}` : "来自表格"} · ${paste.cols} 列 × ${paste.rows} 行` };
  }
}
