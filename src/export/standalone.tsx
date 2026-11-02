import type { CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DiagramTheme } from "../diagram/engines";
import type { Block, ParsedDocument } from "../markdown/parse";
import type { PageGuard, Prefs } from "../platform";
import { typographyStyle, type Typography } from "../preview/Article";
import { BlockActionsContext, type BlockActions } from "../preview/actions";
import { BlockView } from "../preview/Blocks";

const exportActions = (showLineNumbers: boolean, theme: DiagramTheme): BlockActions => ({
  interactive: false,
  showLineNumbers,
  theme,
  onToggleLineNumbers() {},
  onToggleTask() {},
  onZoom() {},
  onExportSvg() {},
});

/**
 * The article's typography, with its block spacing also as --gap for the
 * printed layout, in pixels: an em there would size by each block's own font.
 */
function articleStyle(t: Typography): CSSProperties {
  return { ...typographyStyle(t), "--gap": `${t.pg * t.fs}px` } as CSSProperties;
}

/** Each run of headings with the block after it, so a printed page never ends on a heading. */
export function keepHeadingsWithNext(blocks: Block[]): Block[][] {
  const groups: Block[][] = [];
  for (const b of blocks) {
    const last = groups.at(-1);
    if (last?.at(-1)!.kind === "heading") last.push(b);
    else groups.push([b]);
  }
  return groups;
}

/** The setting of 分页保护 that covers a block, if any. */
function guardOf(b: Block): keyof PageGuard | null {
  switch (b.kind) {
    case "code":
      return b.view.kind === "diagram" ? "chart" : "code";
    case "table":
      return "table";
    case "image":
      return "image";
    default:
      return null;
  }
}

/** Blocks kept whole whatever the setting: short, and no use in halves. */
const ALWAYS_WHOLE: ReadonlySet<Block["kind"]> = new Set(["frontmatter", "math", "callout"]);

export interface PageUnit {
  blocks: Block[];
  /** Kept whole on one page when it fits one. */
  protect: boolean;
}

/**
 * The blocks as the units a printed page breaks between: headings with the
 * block after them, every other block alone. A unit with a heading, a block
 * always kept whole, or a kind the setting guards is protected; the rest may
 * split across pages.
 */
export function pageUnits(blocks: Block[], guard: PageGuard): PageUnit[] {
  return keepHeadingsWithNext(blocks).map((group) => ({
    blocks: group,
    protect: group.some((b) => {
      const kind = guardOf(b);
      return b.kind === "heading" || ALWAYS_WHOLE.has(b.kind) || (kind !== null && guard[kind]);
    }),
  }));
}

const blockView = (b: Block) => <BlockView key={`${b.kind}-${b.start}`} block={b} />;

const unitView = (u: PageUnit) => (
  <div key={`pg-${u.blocks[0]!.start}`} className="pg" data-protect={u.protect ? "" : undefined}>
    {u.blocks.map(blockView)}
  </div>
);

/** The document as static article markup: every block open, no controls, diagrams drawn for theme; in page units for print with a guard. */
export function renderArticle(
  doc: ParsedDocument,
  prefs: Typography & Pick<Prefs, "showLn">,
  theme: DiagramTheme,
  { guard }: { guard?: PageGuard } = {},
): string {
  return renderToStaticMarkup(
    <BlockActionsContext.Provider value={exportActions(prefs.showLn, theme)}>
      <article className={`art doc ff-${prefs.ff}`} style={articleStyle(prefs)}>
        {guard ? pageUnits(doc.blocks, guard).map(unitView) : doc.blocks.map(blockView)}
      </article>
    </BlockActionsContext.Provider>,
  );
}

/** Rules a file or a printed page needs beyond the article styles. */
export const exportCss = `
html,body{margin:0}
body{padding:56px 24px 72px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media print{body{padding:0}}
*,*::before,*::after{animation:none!important;transition:none!important}
.pg[data-protect]{break-inside:avoid}
.art .pg>*+*{margin-top:var(--gap)}
/* WebKit keeps a block whole on a printed page only in block flow, never as a flex item. */
@media print{.art.doc{display:block}.art.doc>*+*{margin-top:var(--gap)}}
`;

/**
 * The width of an A4 page inside Dew's margins and its height, in the CSS
 * pixels WebKit prints at (1.25 per point), less room for a unit's top margin.
 */
const PRINT_WIDTH = 618;
const PAGE_FIT = 900;

/**
 * Rules only the printed PDF has. A unit marked whole prints as one inline
 * box, which WebKit moves to the next page when it does not fit, as it does
 * not reliably for a block that asks to avoid breaks. Protected pictures are
 * capped to fit a page.
 */
export const pdfCss = `
@media print{.pg.whole{display:inline-block;width:100%;vertical-align:top}}
.pg[data-protect] .img img{max-height:840px}
.pg[data-protect] .dia-svg svg{max-height:760px}
.slice{display:block;max-width:100%;margin:0 auto;background:center/100% 100% no-repeat}
.art .img .slice{border-radius:10px}
`;

/**
 * Runs in the page the PDF prints, once fonts and images are in: marks the
 * protected units that fit a page whole, measured at the printed width;
 * turns pictures in unprotected units into backgrounds, which can be sliced
 * across pages where an image or inline SVG cannot; then tells the printer
 * the page is ready, whatever failed.
 */
function guardPages(width: number, fit: number) {
  const slice = (el: Element) => {
    const { width: w, height: h } = el.getBoundingClientRect();
    if (!w || !h) return;
    const src =
      el instanceof HTMLImageElement ? el.currentSrc || el.src : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(el))}`;
    const pic = document.createElement("span");
    pic.className = "slice";
    pic.setAttribute("role", "img");
    pic.setAttribute("aria-label", el.getAttribute("alt") ?? "");
    pic.style.cssText = `width:${w}px;aspect-ratio:${w}/${h};background-image:url("${src.replace(/"/g, "%22")}")`;
    el.replaceWith(pic);
  };
  const loaded = Promise.all([document.fonts.ready, ...[...document.images].map((img) => img.decode().catch(() => {}))]);
  void Promise.race([loaded, new Promise((r) => setTimeout(r, 3000))]).then(() => {
    try {
      const art = document.querySelector<HTMLElement>(".art");
      if (!art) return;
      art.style.width = `${width}px`;
      for (const unit of document.querySelectorAll<HTMLElement>(".pg")) {
        if (!unit.hasAttribute("data-protect")) unit.querySelectorAll(".img img, .dia-svg > svg").forEach(slice);
        else if (unit.getBoundingClientRect().height <= fit) unit.classList.add("whole");
      }
      art.style.width = "";
    } finally {
      document.body.setAttribute("data-dew-export", "");
    }
  });
}

export const pdfScript = `(${guardPages.toString()})(${PRINT_WIDTH}, ${PAGE_FIT})`;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * One self-contained HTML file. data-dew-export tells the PDF printer the
 * page is complete: on the body from the start, or set by the script.
 */
export function standaloneDocument({ title, body, css, bg, script }: { title: string; body: string; css: string; bg: Prefs["bg"]; script?: string }): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body class="pv bg-${bg}"${script ? "" : " data-dew-export"}>
${body}${script ? `\n<script>${script}</script>` : ""}
</body>
</html>
`;
}

/** The front matter title, else the file name without its extension. */
export function documentTitle(doc: ParsedDocument, fileName: string): string {
  const title = doc.frontMatter?.find((e) => e.key.toLowerCase() === "title")?.value;
  if (typeof title === "string" && title.trim()) return title.trim();
  return baseName(fileName);
}

export function baseName(fileName: string): string {
  const name = fileName.replace(/\.(md|markdown)$/i, "");
  return name || "未命名";
}
