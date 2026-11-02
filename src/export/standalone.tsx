import { renderToStaticMarkup } from "react-dom/server";
import type { ParsedDocument } from "../markdown/parse";
import type { Prefs } from "../platform";
import { typographyStyle, type Typography } from "../preview/Article";
import { BlockActionsContext, BlockView, type BlockActions } from "../preview/Blocks";

const exportActions = (showLineNumbers: boolean): BlockActions => ({
  interactive: false,
  showLineNumbers,
  onToggleLineNumbers() {},
  onToggleTask() {},
  onZoomCode() {},
});

/** The document as static article markup: every block open, no controls. */
export function renderArticle(doc: ParsedDocument, prefs: Typography & Pick<Prefs, "showLn">): string {
  return renderToStaticMarkup(
    <BlockActionsContext.Provider value={exportActions(prefs.showLn)}>
      <article className={`art doc ff-${prefs.ff}`} style={typographyStyle(prefs)}>
        {doc.blocks.map((b) => (
          <BlockView key={`${b.kind}-${b.start}`} block={b} />
        ))}
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
.cb,.tbl-wrap,.mblk,.callout,.fm,img{break-inside:avoid}
h1,h2,h3,h4,h5,h6{break-after:avoid}
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
