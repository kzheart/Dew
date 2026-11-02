import type { ExportAction } from "../app/Header";
import { renderDiagrams } from "../diagram/engines";
import { parseDocument } from "../markdown/parse";
import { host, type Prefs } from "../platform";
import { buildStandalone } from "./build";
import { embeddingImages } from "./images";
import { inlineStyled } from "./richText";
import { baseName, documentTitle, renderArticle } from "./standalone";

interface Source {
  text: string;
  fileName: string;
  prefs: Prefs;
  /** How the app shows images next to the document; a saved HTML file keeps the original paths instead. */
  resolveImage(src: string): string;
}

/** Runs a document export; resolves to the saved path, or "" when nothing was saved. */
export async function exportDocument(action: Exclude<ExportAction, "shareCard">, { text, fileName, prefs, resolveImage }: Source): Promise<string> {
  const name = baseName(fileName);
  switch (action) {
    case "pdf": {
      // Printed pages keep white margins, so the page is printed on white too.
      const doc = parseDocument(text, { resolveImage: await embeddingImages(text, resolveImage) });
      return host.exports.pdf(await buildStandalone(doc, prefs, documentTitle(doc, fileName), "white", { pdf: true }), name);
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
  }
}

