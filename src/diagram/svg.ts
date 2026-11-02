const ROOT = /<svg\b[^>]*>/;
const ATTR = /([\w:.-]+)\s*=\s*("[^"]*"|'[^']*')/g;
const SIZE_STYLES = new Set(["width", "height", "max-width", "background", "background-color"]);

export interface SvgSize {
  width: number;
  height: number;
}

function rootAttrs(svg: string): Map<string, string> {
  const tag = ROOT.exec(svg)?.[0] ?? "";
  return new Map([...tag.slice(4).matchAll(ATTR)].map((m) => [m[1]!, m[2]!.slice(1, -1)]));
}

/** The size an SVG draws at: its viewBox, else its width and height in px. */
export function svgSize(svg: string): SvgSize | null {
  const attrs = rootAttrs(svg);
  const box = attrs.get("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (box?.length === 4 && box[2]! > 0 && box[3]! > 0) return { width: box[2]!, height: box[3]! };
  const width = parseFloat(attrs.get("width") ?? "");
  const height = parseFloat(attrs.get("height") ?? "");
  return width > 0 && height > 0 && !/%/.test(attrs.get("width")!) ? { width, height } : null;
}

/**
 * The SVG as one file can hold it: an xmlns, a width and height in px
 * from its viewBox, and no background or size of its own in its style, so
 * pages can scale it and it sits on the color of whatever shows it.
 */
export function normalizeSvg(svg: string): string {
  const start = svg.indexOf("<svg");
  if (start < 0) return svg;
  svg = svg.slice(start);
  const attrs = rootAttrs(svg);
  const size = svgSize(svg);
  attrs.delete("width");
  attrs.delete("height");
  if (size) {
    attrs.set("width", String(size.width));
    attrs.set("height", String(size.height));
  }
  if (!attrs.has("xmlns")) attrs.set("xmlns", "http://www.w3.org/2000/svg");
  const style = (attrs.get("style") ?? "")
    .split(";")
    .filter((d) => d.trim() && !SIZE_STYLES.has(d.split(":")[0]!.trim().toLowerCase()))
    .join(";");
  if (style) attrs.set("style", style);
  else attrs.delete("style");
  const tag = `<svg ${[...attrs].map(([k, v]) => `${k}="${v.replace(/"/g, "&quot;")}"`).join(" ")}>`;
  return svg.replace(ROOT, () => tag);
}
