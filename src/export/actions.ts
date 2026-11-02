import type { ExportAction } from "../app/Header";
import { renderDiagrams } from "../diagram/engines";
import { parseDocument, type Block } from "../markdown/parse";
import { host, type Prefs } from "../platform";
import { buildStandalone } from "./build";
import { drawShareCard } from "./card";
import { inlineStyled } from "./richText";
import { baseName, documentTitle, renderArticle } from "./standalone";

interface Source {
  text: string;
  fileName: string;
  prefs: Prefs;
  /** How the app shows images next to the document; a saved HTML file keeps the original paths instead. */
  resolveImage(src: string): string;
  /** The text the user selected, which a share card shows. */
  selection: string;
}

/** Runs a document export; resolves to the saved path, or "" when nothing was saved. */
export async function exportDocument(action: ExportAction, { text, fileName, prefs, resolveImage, selection }: Source): Promise<string> {
  const name = baseName(fileName);
  switch (action) {
    case "pdf": {
      // Printed pages keep white margins, so the page is printed on white too.
      const doc = parseDocument(text, { resolveImage });
      return host.exports.pdf(await buildStandalone(doc, prefs, documentTitle(doc, fileName), "white"), name);
    }
    case "html": {
      const doc = parseDocument(text);
      return host.exports.html(await buildStandalone(doc, prefs, documentTitle(doc, fileName), prefs.bg), name);
    }
    case "richText": {
      const doc = parseDocument(text, { resolveImage, mathml: true });
      await renderDiagrams(doc.blocks, prefs.bg);
      await host.exports.richText(await inlineStyled(renderArticle(doc, prefs, prefs.bg), prefs.bg), text);
      return "";
    }
    case "shareCard": {
      const doc = parseDocument(text);
      const passage = selection.trim() || firstParagraph(doc.blocks);
      const png = drawShareCard({ title: documentTitle(doc, fileName), text: passage, fileName: fileName || "未命名" });
      return host.exports.shareCard(png, `${name}-分享卡片`);
    }
  }
}

/** With nothing selected, a card shows the document's first paragraph. */
function firstParagraph(blocks: Block[]): string {
  const p = blocks.find((b) => b.kind === "paragraph");
  return p ? new DOMParser().parseFromString(p.html, "text/html").body.textContent ?? "" : "";
}
