import { highlightLines } from "../markdown/highlight";
import type { CardBackground } from "../platform";

/** What a share card shows: code in a dark window, or paragraphs on a light card. */
export type CardContent =
  | { kind: "code"; title: string; lang: string; code: string }
  | { kind: "text"; title: string; paragraphs: string[] };

export interface CardOptions {
  background: CardBackground;
  /** "" for none. */
  watermark: string;
}

export const CARD_BACKGROUNDS: Record<CardBackground, { label: string; stops: string[]; ink: string; shadow: string }> = {
  blue: { label: "深蓝渐变", stops: ["#22357A", "#0A66D8", "#5B66D6"], ink: "rgba(227,232,250,.92)", shadow: "rgba(8,12,30,.45)" },
  orange: { label: "暖橙渐变", stops: ["#B4521A", "#E9A35B"], ink: "rgba(255,240,224,.94)", shadow: "rgba(60,22,4,.4)" },
  green: { label: "墨绿渐变", stops: ["#0B4A3E", "#2E9C80"], ink: "rgba(220,245,236,.92)", shadow: "rgba(2,26,20,.45)" },
  gray: { label: "纯色浅灰", stops: ["#E9E9E4"], ink: "#6E6E73", shadow: "rgba(20,22,26,.18)" },
};

/** A background as CSS, for its swatch. */
export const cardSwatch = (bg: CardBackground) => {
  const { stops } = CARD_BACKGROUNDS[bg];
  return stops.length > 1 ? `linear-gradient(135deg, ${stops.join(", ")})` : stops[0]!;
};

/** Words of Latin text stay whole; CJK and other characters break anywhere. */
const WORD = /[\p{Script=Latin}\d_'’.,:;!?()\-/]+\s*|\s+|./gu;

/** Lines of text no wider than maxWidth, keeping its own line breaks. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const token of para.match(WORD) ?? []) {
      if (line && measure(line + token) > maxWidth) {
        out.push(line.trimEnd());
        line = token.trimStart();
      } else {
        line += token;
      }
      while (measure(line) > maxWidth && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && measure(line.slice(0, cut)) > maxWidth) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** At most max lines; a cut is marked with an ellipsis on the last line kept. */
export function clampLines(lines: string[], max: number): string[] {
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  kept[max - 1] = `${kept[max - 1]!.replace(/.$/u, "")}…`;
  return kept;
}

/** Selected code without the blank lines around it or the indentation all its lines share; tabs as four spaces. */
export function tidyCode(code: string): string {
  const lines = code.replace(/\t/g, "    ").split("\n");
  while (lines.length && !lines[0]!.trim()) lines.shift();
  while (lines.length && !lines.at(-1)!.trim()) lines.pop();
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
  return lines.map((l) => l.slice(indent)).join("\n");
}

export interface Token {
  text: string;
  /** The tk-* class of its scope, "" for plain text. */
  tk: string;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'", "&#39;": "'" };
const unescape = (s: string) => s.replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (e) => ENTITIES[e]!);

/** Each line of code as tokens of one scope, from the highlighter the document uses. */
export function codeTokens(code: string, lang: string): Token[][] {
  return highlightLines(code, lang).map((html) => {
    const tokens: Token[] = [];
    const open: string[] = [];
    for (const m of html.matchAll(/<span class="([^"]*)">|<\/span>|([^<]+)/g)) {
      if (m[1] !== undefined) open.push(m[1] === "tk-tx" ? "" : m[1]);
      else if (m[0] === "</span>") open.pop();
      else tokens.push({ text: unescape(m[2]!), tk: open.at(-1) ?? "" });
    }
    return tokens;
  });
}

const CODE_INK: Record<string, string> = {
  "tk-kw": "#C79BF2",
  "tk-fn": "#8FB0F5",
  "tk-link": "#8FB0F5",
  "tk-ty": "#6FD1B8",
  "tk-str": "#F2A385",
  "tk-num": "#D9C97C",
  "tk-attr": "#D9C97C",
  "tk-com": "#7F858E",
  "tk-meta": "#7F858E",
  "tk-q": "#9AA0A8",
};
const CODE_PLAIN = "#E4E6EA";

const SANS = "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif";
const MONO = "'SF Mono', Menlo, 'JetBrains Mono', 'PingFang SC', monospace";
export const FONTS = {
  code: `13.5px ${MONO}`,
  bar: `12px ${MONO}`,
  title: `600 20px ${SANS}`,
  body: `16px ${SANS}`,
  watermark: `500 12px ${SANS}`,
};

const MARGIN = 48;
const BOTTOM = 56;
const CODE = { min: 360, max: 720, pad: 22, bar: 38, line: 22, top: 4, bottom: 20, maxLines: 48 };
const TEXT = { width: 640, pad: 36, title: 30, titleGap: 14, line: 28, gap: 10, maxTitle: 2, maxLines: 22 };

export interface CardText {
  text: string;
  x: number;
  y: number;
  font: string;
  color: string;
}

/** Everything a card draws, in logical pixels; y is each text's baseline. */
export interface CardLayout {
  width: number;
  height: number;
  background: CardBackground;
  window: { x: number; y: number; w: number; h: number; dark: boolean };
  /** The traffic lights' row of a code window. */
  bar: { y: number } | null;
  texts: CardText[];
}

type Measure = (text: string, font: string) => number;

/** Visual lines of tokens no wider than max, breaking long lines between characters. */
function wrapTokens(line: Token[], max: number, width: (s: string) => number): Token[][] {
  const out: Token[][] = [[]];
  let x = 0;
  for (const token of line) {
    let rest = token.text;
    while (rest) {
      const w = width(rest);
      if (x + w <= max) {
        out.at(-1)!.push({ text: rest, tk: token.tk });
        x += w;
        break;
      }
      let cut = 0;
      for (const ch of rest) {
        if (x + width(rest.slice(0, cut + ch.length)) > max) break;
        cut += ch.length;
      }
      if (cut === 0 && x === 0) cut = [...rest][0]!.length;
      if (cut > 0) out.at(-1)!.push({ text: rest.slice(0, cut), tk: token.tk });
      rest = rest.slice(cut);
      out.push([]);
      x = 0;
    }
  }
  return out;
}

function layoutCode(content: Extract<CardContent, { kind: "code" }>, measure: Measure) {
  const width = (s: string) => measure(s, FONTS.code);
  const source = codeTokens(content.code.replace(/\s+$/, ""), content.lang);
  const natural = Math.max(0, ...source.map((l) => width(l.map((t) => t.text).join(""))));
  const inner = Math.min(Math.max(Math.ceil(natural), CODE.min), CODE.max);
  let lines = source.flatMap((l) => wrapTokens(l, inner, width));
  if (lines.length > CODE.maxLines) lines = [...lines.slice(0, CODE.maxLines - 1), [{ text: "…", tk: "tk-com" }]];
  const w = inner + CODE.pad * 2;
  const h = CODE.bar + CODE.top + lines.length * CODE.line + CODE.bottom;
  const win = { x: MARGIN, y: MARGIN, w, h, dark: true };
  const texts: CardText[] = [{ text: content.title, x: win.x + 74, y: win.y + CODE.bar / 2 + 4, font: FONTS.bar, color: "#9AA0A8" }];
  lines.forEach((line, i) => {
    let x = win.x + CODE.pad;
    const y = win.y + CODE.bar + CODE.top + i * CODE.line + 16;
    for (const t of line) {
      texts.push({ text: t.text, x, y, font: FONTS.code, color: CODE_INK[t.tk] ?? CODE_PLAIN });
      x += width(t.text);
    }
  });
  return { win, texts, bar: { y: win.y + CODE.bar / 2 } };
}

function layoutText(content: Extract<CardContent, { kind: "text" }>, measure: Measure) {
  const w = TEXT.width - MARGIN * 2;
  const inner = w - TEXT.pad * 2;
  const titleLines = content.title ? clampLines(wrapText(content.title, inner, (s) => measure(s, FONTS.title)), TEXT.maxTitle) : [];
  const lines = content.paragraphs.flatMap((p, i) => wrapText(p, inner, (s) => measure(s, FONTS.body)).map((text, j) => ({ text, opens: i > 0 && j === 0 })));
  const kept = lines.slice(0, TEXT.maxLines);
  if (kept.length < lines.length) kept[kept.length - 1]!.text = `${kept.at(-1)!.text.replace(/.$/u, "")}…`;
  const texts: CardText[] = [];
  const x = MARGIN + TEXT.pad;
  let y = MARGIN + TEXT.pad;
  for (const line of titleLines) {
    texts.push({ text: line, x, y: y + 22, font: FONTS.title, color: "#1D1D1F" });
    y += TEXT.title;
  }
  if (titleLines.length) y += TEXT.titleGap;
  for (const line of kept) {
    if (line.opens) y += TEXT.gap;
    texts.push({ text: line.text, x, y: y + 20, font: FONTS.body, color: "#3A3A3E" });
    y += TEXT.line;
  }
  const win = { x: MARGIN, y: MARGIN, w, h: y - MARGIN + TEXT.pad - 4, dark: false };
  return { win, texts, bar: null };
}

/** Where everything on a card goes, measured with measure(text, font). */
export function layoutCard(content: CardContent, options: CardOptions, measure: Measure): CardLayout {
  const { win, texts, bar } = content.kind === "code" ? layoutCode(content, measure) : layoutText(content, measure);
  const width = win.w + MARGIN * 2;
  const height = win.y + win.h + BOTTOM;
  const mark = options.watermark.trim();
  if (mark) texts.push({ text: mark, x: width - 22 - measure(mark, FONTS.watermark), y: height - 22, font: FONTS.watermark, color: CARD_BACKGROUNDS[options.background].ink });
  return { width, height, background: options.background, window: win, bar, texts };
}

/** Paints a layout onto a canvas context already scaled to logical pixels. */
export function paintCard(ctx: CanvasRenderingContext2D, layout: CardLayout) {
  const { width, height, window: win } = layout;
  const bg = CARD_BACKGROUNDS[layout.background];
  const fill = ctx.createLinearGradient(0, 0, width, height);
  bg.stops.forEach((c, i) => fill.addColorStop(bg.stops.length > 1 ? i / (bg.stops.length - 1) : 0, c));
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.shadowColor = bg.shadow;
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = win.dark ? "#17191D" : "#FFFFFF";
  ctx.beginPath();
  ctx.roundRect(win.x, win.y, win.w, win.h, win.dark ? 12 : 16);
  ctx.fill();
  ctx.restore();

  if (layout.bar) {
    ["#E5675B", "#E2B33E", "#5BBE6B"].forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(win.x + 20 + i * 17, layout.bar!.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  for (const t of layout.texts) {
    ctx.font = t.font;
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
}

/** A canvas measure for layoutCard. */
export function canvasMeasure(ctx: CanvasRenderingContext2D): Measure {
  return (text, font) => {
    if (ctx.font !== font) ctx.font = font;
    return ctx.measureText(text).width;
  };
}

/**
 * Draws the card into a canvas at scale times its logical size, with the 2D
 * canvas API, which (unlike an SVG foreignObject) leaves the canvas
 * exportable in WebKit.
 */
export function renderCard(canvas: HTMLCanvasElement, content: CardContent, options: CardOptions, scale = 2): CardLayout {
  const ctx = canvas.getContext("2d")!;
  const layout = layoutCard(content, options, canvasMeasure(ctx));
  canvas.width = Math.ceil(layout.width * scale);
  canvas.height = Math.ceil(layout.height * scale);
  ctx.scale(scale, scale);
  paintCard(ctx, layout);
  return layout;
}

/** The card as a PNG at twice its size, base64-encoded. */
export function drawShareCard(content: CardContent, options: CardOptions): string {
  const canvas = document.createElement("canvas");
  renderCard(canvas, content, options);
  return canvas.toDataURL("image/png").slice("data:image/png;base64,".length);
}
