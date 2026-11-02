import type { CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DiagramTheme } from "../diagram/engines";
import type { Block, ParsedDocument } from "../markdown/parse";
import type { Prefs } from "../platform";
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

/** Each heading with the block after it, so a printed page never ends on a heading. */
export function keepHeadingsWithNext(blocks: Block[]): Block[][] {
  const groups: Block[][] = [];
  for (const b of blocks) {
    const last = groups.at(-1);
    if (last?.length === 1 && last[0]!.kind === "heading") last.push(b);
    else groups.push([b]);
  }
  return groups;
}

const blockView = (b: Block) => <BlockView key={`${b.kind}-${b.start}`} block={b} />;

/** The document as static article markup: every block open, no controls, diagrams drawn for theme. */
export function renderArticle(
  doc: ParsedDocument,
  prefs: Typography & Pick<Prefs, "showLn">,
  theme: DiagramTheme,
  { forPrint = false }: { forPrint?: boolean } = {},
): string {
  return renderToStaticMarkup(
    <BlockActionsContext.Provider value={exportActions(prefs.showLn, theme)}>
      <article className={`art doc ff-${prefs.ff}`} style={articleStyle(prefs)}>
        {forPrint
          ? keepHeadingsWithNext(doc.blocks).map((g) =>
              g.length === 1 ? blockView(g[0]!) : <div key={`keep-${g[0]!.start}`} className="keep">{g.map(blockView)}</div>,
            )
          : doc.blocks.map(blockView)}
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
.cb,.tbl-wrap,.mblk,.callout,.fm,img,.keep{break-inside:avoid}
.art .keep>*+*{margin-top:var(--gap)}
/* WebKit keeps a block whole on a printed page only in block flow, never as a flex item. */
@media print{.art.doc{display:block}.art.doc>*+*{margin-top:var(--gap)}}
`;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One self-contained HTML file; data-dew-export tells the PDF printer the page is complete. */
export function standaloneDocument({ title, body, css, bg }: { title: string; body: string; css: string; bg: Prefs["bg"] }): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body class="pv bg-${bg}" data-dew-export>
${body}
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
