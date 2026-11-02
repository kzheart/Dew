import type { DiagramTheme } from "./engines";
import { plantumlUrl } from "./plantumlEncode";

async function deflateRaw(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * No PlantUML renderer runs in a page, so plantuml.com draws the chart.
 * The night theme asks for the server's dark rendering.
 */
export async function renderPlantuml(source: string, theme: DiagramTheme): Promise<string> {
  let url = plantumlUrl(await deflateRaw(source));
  if (theme === "night") url = url.replace("/plantuml/svg/", "/plantuml/dsvg/");
  let res: Response;
  try {
    // An export waits for every chart, so a stalled server must not hold it.
    res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error("无法连接 plantuml.com，请检查网络");
  }
  const body = await res.text();
  if (!res.ok) {
    // The server draws its error as a picture; the line it names is all a reader needs.
    const line = /\(line (\d+)\)/.exec(body)?.[1];
    throw new Error(line ? `PlantUML 语法有误（第 ${line} 行）` : `plantuml.com 无法渲染（HTTP ${res.status}）`);
  }
  // The dark rendering paints its own backdrop, which would sit as a box on the night page.
  return theme === "night" ? body.replace(/<rect x="0" y="0" width="[\d.]+" height="[\d.]+" fill="#1B1B1B"[^>]*\/>/, "") : body;
}
