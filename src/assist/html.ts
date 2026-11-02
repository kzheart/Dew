import TurndownService from "turndown";
import { formatTable } from "../markdown/tableLayout";

export interface HtmlMarkdown {
  markdown: string;
  /** The cells of each table converted, first row the header. */
  tables: string[][][];
}

// Cells and rows come up from turndown as text; these mark where each begins.
const CELL = "\u001F";
const ROW = "\u001E";

const styleOf = (node: HTMLElement) => node.getAttribute("style") ?? "";

/**
 * Turndown escapes what would start a block at the beginning of a line. A
 * table cell never starts a line, so those escapes only clutter it.
 */
const unescapeLineStart = (cell: string) => cell.replace(/^\\([-+=#>]|~~~)/, "$1").replace(/^(\d+)\\\. /, "$1. ");

const cellText = (content: string) => unescapeLineStart(content.replace(/\u00A0/g, " ").trim().replace(/\s*\n\s*/g, "<br>").replace(/\|/g, "\\|"));

/**
 * Markdown for HTML pasted from another app: headings, lists, emphasis,
 * links, code and tables survive; styles, scripts and layout wrappers do not.
 * Tables come out aligned, as formatTable lays them out.
 */
export function htmlToMarkdown(html: string): HtmlMarkdown {
  const tables: string[][][] = [];
  const td = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
  });
  td.remove(["style", "script", "title", "meta", "link", "head", "colgroup", "noscript", "template"]);

  // Turndown's own rule, with one space after the marker as Dew writes lists rather than three.
  td.addRule("listItem", {
    filter: "li",
    replacement(content, node, options) {
      const parent = node.parentNode as HTMLElement;
      let prefix = `${options.bulletListMarker} `;
      if (parent.nodeName === "OL") {
        prefix = `${Number(parent.getAttribute("start") ?? 1) + Array.prototype.indexOf.call(parent.children, node)}. `;
      }
      const paragraph = /\n$/.test(content);
      const body = (content.replace(/^\n+|\n+$/g, "") + (paragraph ? "\n" : "")).replace(/\n/gm, `\n${" ".repeat(prefix.length)}`);
      return prefix + body + (node.nextSibling ? "\n" : "");
    },
  });
  td.addRule("strikethrough", { filter: ["del", "s"], replacement: (c) => (c.trim() ? `~~${c}~~` : c) });
  // Google Docs wraps a whole copy in <b style="font-weight:normal"> and marks real bold and italics with styles.
  td.addRule("unboldWrapper", {
    filter: (node) => (node.nodeName === "B" || node.nodeName === "STRONG") && /font-weight:\s*(normal|[1-4]00)\b/.test(styleOf(node)),
    replacement: (c) => c,
  });
  td.addRule("styledBold", {
    filter: (node) => node.nodeName === "SPAN" && /font-weight:\s*(bold|[6-9]00)\b/.test(styleOf(node)),
    replacement: (c) => (c.trim() ? `**${c}**` : c),
  });
  td.addRule("styledItalic", {
    filter: (node) => node.nodeName === "SPAN" && /font-style:\s*italic/.test(styleOf(node)),
    replacement: (c) => (c.trim() ? `*${c}*` : c),
  });

  td.addRule("tableCell", { filter: ["th", "td"], replacement: (c) => CELL + cellText(c) });
  td.addRule("tableRow", { filter: "tr", replacement: (c) => ROW + c });
  td.addRule("table", {
    filter: "table",
    replacement(content) {
      const rows = content
        .split(ROW)
        .slice(1)
        .map((r) => r.split(CELL).slice(1).map((c) => c.trim()))
        .filter((r) => r.length);
      if (!rows.length) return "";
      tables.push(rows);
      return `\n\n${formatTable(rows)}\n\n`;
    },
  });

  // Browsers copy the spaces around inline elements as &nbsp; (Apple-converted-space), which reads as an
  // ordinary space but breaks Markdown that expects one.
  return { markdown: td.turndown(html).replace(/\u00A0/g, " ").trim(), tables };
}
