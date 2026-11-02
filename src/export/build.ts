import katexCss from "katex/dist/katex.min.css?raw";
import { renderDiagrams } from "../diagram/engines";
import type { ParsedDocument } from "../markdown/parse";
import type { Prefs } from "../platform";
import articleCss from "../styles/article.css?raw";
import { exportCss, renderArticle, standaloneDocument } from "./standalone";

const katexFonts = import.meta.glob("/node_modules/katex/dist/fonts/*.woff2", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

let katexStyles: Promise<string> | null = null;

/** KaTeX's styles with its woff2 fonts inlined, so a saved file renders math anywhere. */
function inlinedKatexStyles(): Promise<string> {
  katexStyles ??= (async () => {
    const fonts = new Map<string, string>();
    await Promise.all(
      Object.entries(katexFonts).map(async ([path, url]) => {
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        fonts.set(path.slice(path.lastIndexOf("/") + 1), `data:font/woff2;base64,${toBase64(bytes)}`);
      }),
    );
    return katexCss.replace(/src:url\(fonts\/([\w-]+\.woff2)\) format\("woff2"\)[^;}]*/g, (src, name: string) =>
      fonts.has(name) ? `src:url(${fonts.get(name)}) format("woff2")` : src,
    );
  })();
  return katexStyles;
}

/** The standalone HTML that both the HTML and the PDF export write. */
export async function buildStandalone(doc: ParsedDocument, prefs: Prefs, title: string, bg: Prefs["bg"]): Promise<string> {
  await renderDiagrams(doc.blocks, bg);
  const body = renderArticle(doc, prefs, bg);
  const css = [body.includes('class="katex') ? await inlinedKatexStyles() : "", articleCss, exportCss].join("\n");
  return standaloneDocument({ title, body, css, bg });
}
