import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";
import { parse as parseYaml } from "yaml";
import { relativeWidths } from "./table";
import { footnotePlugin, mathPlugin, presentationPlugin, taskPlugin, tokenLabel, tokenTask, type RenderEnv } from "./plugins";

/** 1-based, inclusive source lines. */
interface Span {
  start: number;
  end: number;
}

export type CalloutVariant = "note" | "tip" | "important" | "warning" | "caution";
export type Align = "left" | "center" | "right" | null;
export type DiagramEngine = "mermaid" | "plantuml" | "vega-lite";
/** How a code block shows its code: as code, as a diff, or as the chart it describes. */
export type CodeView = { kind: "plain" } | { kind: "diff" } | { kind: "diagram"; engine: DiagramEngine };

export interface ListItem extends Span {
  /** null for an item that is not a task. */
  task: boolean | null;
  html: string;
}

export interface FootnoteItem extends Span {
  label: string;
  n: number;
  html: string;
}

export type Block = Span &
  (
    | { kind: "frontmatter"; entries: FrontMatterEntry[] }
    | { kind: "heading"; level: number; html: string; text: string }
    | { kind: "paragraph"; html: string; hasMath: boolean; hasFootnoteRef: boolean }
    | { kind: "image"; src: string; alt: string; title: string; html: string }
    | { kind: "callout"; variant: CalloutVariant; title: string; folded: boolean; html: string }
    | { kind: "list"; ordered: boolean; startNumber: number; tasksOnly: boolean; items: ListItem[]; tasks: TaskCount }
    | { kind: "quote"; html: string }
    | { kind: "code"; lang: string; info: string; title: string; view: CodeView; code: string; highlight: number[] }
    | { kind: "table"; align: Align[]; header: string[]; rows: string[][]; widths: number[] | null }
    | { kind: "math"; tex: string; html: string }
    | { kind: "footnotes"; items: FootnoteItem[] }
    | { kind: "hr" }
    | { kind: "html"; html: string }
  );

export type BlockKind = Block["kind"];

export interface FrontMatterEntry {
  key: string;
  value: unknown;
}

export interface TaskCount {
  done: number;
  total: number;
}

export interface Heading {
  level: number;
  text: string;
  line: number;
  /** Tasks between this heading and the next one. */
  tasks: TaskCount;
}

export interface DocStats {
  /** Characters that are not whitespace. */
  chars: number;
  minutes: number;
}

export interface ParsedDocument {
  frontMatter: FrontMatterEntry[] | null;
  blocks: Block[];
  headings: Heading[];
  footnotes: FootnoteItem[];
  stats: DocStats;
  lineCount: number;
}

export interface ParseOptions {
  resolveImage?: (src: string) => string;
  /** Math as MathML alone, for exports that cannot load KaTeX's fonts. */
  mathml?: boolean;
}

const md = new MarkdownIt({ html: true, linkify: true });
md.use(mathPlugin).use(footnotePlugin).use(taskPlugin).use(presentationPlugin);

const CALLOUT = /^\[!(note|tip|important|warning|caution)\]([+-]?)[ \t]*(.*)$/i;

export const calloutTitles: Record<CalloutVariant, string> = {
  note: "提示",
  tip: "技巧",
  important: "重要",
  warning: "警告",
  caution: "注意",
};

export function parseDocument(text: string, options: ParseOptions = {}): ParsedDocument {
  const lines = text.split("\n");
  const fm = frontMatterEnd(lines);
  // Blank front matter lines keep markdown-it's line numbers the source's.
  const body = fm ? "\n".repeat(fm) + lines.slice(fm).join("\n") : text;
  const env: RenderEnv = { footnotes: new Map(), resolveImage: options.resolveImage, mathml: options.mathml };
  const tokens = md.parse(body, env);

  const footnoteDefs = tokens.filter((t) => t.type === "footnote_def");
  footnoteDefs.forEach((t, i) => {
    env.footnotes!.set(tokenLabel(t), { n: i + 1, html: "" });
  });
  for (const t of footnoteDefs) {
    env.footnotes!.get(tokenLabel(t))!.html = md.renderInline(t.content, env);
  }

  const blocks: Block[] = [];
  let frontMatter: FrontMatterEntry[] | null = null;
  if (fm) {
    frontMatter = parseFrontMatter(lines.slice(1, fm - 1).join("\n"));
    blocks.push({ kind: "frontmatter", start: 1, end: fm, entries: frontMatter });
  }

  const end = (map: [number, number]) => lastContentLine(lines, map[0] + 1, map[1]);
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;
    const close = closingIndex(tokens, i);
    const span = t.map ? { start: t.map[0] + 1, end: end(t.map) } : null;
    if (!span) {
      i = close + 1;
      continue;
    }
    switch (t.type) {
      case "heading_open": {
        const inline = tokens[i + 1]!;
        blocks.push({ kind: "heading", ...span, level: Number(t.tag.slice(1)), html: md.renderer.renderInline(inline.children ?? [], md.options, env), text: plainText(inline) });
        break;
      }
      case "paragraph_open": {
        const inline = tokens[i + 1]!;
        const children = inline.children ?? [];
        const image = children.length === 1 && children[0]!.type === "image" ? children[0]! : null;
        const src = String(image?.attrGet("src") ?? "");
        const html = md.renderer.renderInline(children, md.options, env);
        if (image) {
          blocks.push({ kind: "image", ...span, src, alt: image.content, title: String(image.attrGet("title") ?? ""), html });
        } else {
          blocks.push({
            kind: "paragraph",
            ...span,
            html,
            hasMath: children.some((c) => c.type === "math_inline"),
            hasFootnoteRef: children.some((c) => c.type === "footnote_ref"),
          });
        }
        break;
      }
      case "blockquote_open":
        blocks.push(calloutOrQuote(tokens.slice(i + 1, close), lines, span, env));
        break;
      case "bullet_list_open":
      case "ordered_list_open":
        blocks.push(list(tokens, i, close, lines, span, env));
        break;
      case "fence":
      case "code_block": {
        const info = t.info.trim();
        const lang = info.split(/[\s{]/)[0] ?? "";
        blocks.push({
          kind: "code",
          ...span,
          lang,
          info,
          title: info.slice(lang.length).replace(/\{[^}]*\}/g, "").trim(),
          view: VIEWS[lang.toLowerCase()] ?? PLAIN,
          code: t.content.replace(/\n$/, ""),
          highlight: highlightedLines(info),
        });
        break;
      }
      case "table_open":
        blocks.push(table(tokens.slice(i, close + 1), span, lines[span.start] ?? "", env));
        break;
      case "math_block":
        blocks.push({ kind: "math", ...span, tex: t.content, html: md.renderer.render([t], md.options, env) });
        break;
      case "footnote_def": {
        const label = tokenLabel(t);
        const fn = env.footnotes!.get(label)!;
        const item = { ...span, label, n: fn.n, html: fn.html };
        const prev = blocks.at(-1);
        if (prev?.kind === "footnotes" && prev.end < span.start && onlyBlankBetween(lines, prev.end, span.start)) {
          prev.items.push(item);
          prev.end = span.end;
        } else {
          blocks.push({ kind: "footnotes", ...span, items: [item] });
        }
        break;
      }
      case "hr":
        blocks.push({ kind: "hr", ...span });
        break;
      case "html_block":
        blocks.push({ kind: "html", ...span, html: t.content });
        break;
    }
    i = close + 1;
  }

  return {
    frontMatter,
    blocks,
    headings: headings(blocks),
    footnotes: blocks.flatMap((b) => (b.kind === "footnotes" ? b.items : [])),
    stats: stats(text),
    lineCount: lines.length,
  };
}

/** The line after a front matter block that opens the document, or 0. */
function frontMatterEnd(lines: string[]): number {
  if (lines[0]?.trimEnd() !== "---") return 0;
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i]!.trimEnd();
    if (l === "---" || l === "...") return i + 1;
  }
  return 0;
}

function parseFrontMatter(yaml: string): FrontMatterEntry[] {
  try {
    const data = parseYaml(yaml);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return Object.entries(data).map(([key, value]) => ({ key, value }));
    }
  } catch {
    // Half-typed YAML still shows its lines as entries below.
  }
  return yaml
    .split("\n")
    .map((l) => /^([^:#\s][^:]*):\s*(.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ key: m[1]!.trim(), value: m[2]! }));
}

function closingIndex(tokens: Token[], i: number): number {
  const t = tokens[i]!;
  if (t.nesting !== 1) return i;
  let depth = 0;
  for (let j = i; j < tokens.length; j++) {
    depth += tokens[j]!.nesting;
    if (depth === 0) return j;
  }
  return tokens.length - 1;
}

function lastContentLine(lines: string[], start: number, end: number): number {
  let e = end;
  while (e > start && !lines[e - 1]?.trim()) e--;
  return e;
}

function onlyBlankBetween(lines: string[], a: number, b: number): boolean {
  for (let l = a + 1; l < b; l++) if (lines[l - 1]?.trim()) return false;
  return true;
}

function plainText(inline: Token): string {
  return (inline.children ?? [])
    .map((c) => (c.type === "text" || c.type === "code_inline" || c.type === "math_inline" ? c.content : c.type === "image" ? c.content : ""))
    .join("");
}

function calloutOrQuote(inner: Token[], lines: string[], span: Span, env: RenderEnv): Block {
  const firstInline = inner[0]?.type === "paragraph_open" ? inner[1] : undefined;
  const m = firstInline ? CALLOUT.exec(firstInline.content.split("\n")[0]!) : null;
  if (!m) return { kind: "quote", ...span, html: md.renderer.render(inner, md.options, env) };
  const variant = m[1]!.toLowerCase() as CalloutVariant;
  // The body is the quote's source without its markers and first line,
  // after blank lines that keep its task checkboxes' line numbers.
  const body =
    "\n".repeat(span.start) +
    lines
      .slice(span.start, span.end)
      .map((l) => l.replace(/^\s{0,3}> ?/, ""))
      .join("\n");
  return {
    kind: "callout",
    ...span,
    variant,
    title: m[3]?.trim() || calloutTitles[variant],
    folded: m[2] === "-",
    html: md.render(body, env),
  };
}

function list(tokens: Token[], open: number, close: number, lines: string[], span: Span, env: RenderEnv): Block {
  const t = tokens[open]!;
  const items: ListItem[] = [];
  const tasks: TaskCount = { done: 0, total: 0 };
  for (let j = open + 1; j < close; j++) {
    const tok = tokens[j]!;
    const task = tokenTask(tok);
    if (tok.type === "list_item_open" && task !== undefined) {
      tasks.total++;
      if (task) tasks.done++;
    }
    if (tok.type !== "list_item_open" || tok.level !== t.level + 1) continue;
    const itemClose = closingIndex(tokens, j);
    const inner = tokens.slice(j + 1, itemClose);
    const html = md.renderer.render(inner, md.options, env);
    items.push({
      start: tok.map![0] + 1,
      end: lastContentLine(lines, tok.map![0] + 1, tok.map![1]),
      task: task ?? null,
      html,
    });
  }
  return {
    kind: "list",
    ...span,
    ordered: t.type === "ordered_list_open",
    startNumber: Number(t.attrGet("start") ?? 1),
    tasksOnly: items.length > 0 && items.every((it) => it.task !== null && !/<(ul|ol)[\s>]/.test(it.html)),
    items,
    tasks,
  };
}

/** delimiterRow, the table's second line, gives its column widths. */
function table(tokens: Token[], span: Span, delimiterRow: string, env: RenderEnv): Block {
  const align: Align[] = [];
  const header: string[] = [];
  const rows: string[][] = [];
  let inHead = false;
  let row: string[] | null = null;
  for (let j = 0; j < tokens.length; j++) {
    const t = tokens[j]!;
    if (t.type === "thead_open") inHead = true;
    else if (t.type === "thead_close") inHead = false;
    else if (t.type === "tr_open" && !inHead) row = [];
    else if (t.type === "tr_close" && row) {
      rows.push(row);
      row = null;
    } else if (t.type === "th_open" || t.type === "td_open") {
      const html = md.renderer.renderInline(tokens[j + 1]!.children ?? [], md.options, env);
      if (inHead) {
        header.push(html);
        const style = String(t.attrGet("style") ?? "");
        align.push(style.includes("center") ? "center" : style.includes("right") ? "right" : style.includes("left") ? "left" : null);
      } else row?.push(html);
    }
  }
  return { kind: "table", ...span, align, header, rows, widths: relativeWidths(delimiterRow) };
}

const PLAIN: CodeView = { kind: "plain" };
const diagram = (engine: DiagramEngine): CodeView => ({ kind: "diagram", engine });

/** Fence languages that show as something other than plain code. */
const VIEWS: Record<string, CodeView> = {
  diff: { kind: "diff" },
  patch: { kind: "diff" },
  mermaid: diagram("mermaid"),
  plantuml: diagram("plantuml"),
  puml: diagram("plantuml"),
  "vega-lite": diagram("vega-lite"),
  vegalite: diagram("vega-lite"),
};

/** `ts {2,4-6}` highlights lines 2, 4, 5 and 6. */
export function highlightedLines(info: string): number[] {
  const m = /\{([\d,\s-]+)\}/.exec(info);
  if (!m) return [];
  const out = new Set<number>();
  for (const part of m[1]!.split(",")) {
    const [a, b] = part.trim().split("-").map(Number);
    if (!a) continue;
    for (let n = a; n <= (b && b >= a ? b : a); n++) out.add(n);
  }
  return [...out].sort((x, y) => x - y);
}

function headings(blocks: Block[]): Heading[] {
  const out: Heading[] = [];
  for (const b of blocks) {
    if (b.kind === "heading") out.push({ level: b.level, text: b.text, line: b.start, tasks: { done: 0, total: 0 } });
    else if (b.kind === "list" && out.length) {
      const h = out.at(-1)!;
      h.tasks.done += b.tasks.done;
      h.tasks.total += b.tasks.total;
    }
  }
  return out;
}

export function stats(text: string): DocStats {
  let chars = 0;
  for (const ch of text) if (!/\s/.test(ch)) chars++;
  return { chars, minutes: Math.max(1, Math.ceil(chars / 400)) };
}

/** The block whose lines hold line, else the nearest before it. */
export function blockAtLine(blocks: Block[], line: number): number {
  let found = -1;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i]!.start <= line) found = i;
    else break;
  }
  return found;
}
