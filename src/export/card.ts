/** Words of Latin text stay whole; CJK and other characters break anywhere. */
const TOKEN = /[\p{Script=Latin}\d_'’.,:;!?()\-/]+\s*|\s+|./gu;

/** Lines of text no wider than maxWidth, keeping its own line breaks. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const token of para.match(TOKEN) ?? []) {
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

const SCALE = 2;
const WIDTH = 640;
const MARGIN = 48;
const PAD = 32;
const BAR = 44;
const BODY_FONT = "16px -apple-system, 'PingFang SC', sans-serif";
const TITLE_FONT = "600 22px -apple-system, 'PingFang SC', sans-serif";
const BODY_LINE = 28;
const TITLE_LINE = 32;
const MAX_LINES = 22;

/**
 * A share card for a passage: the text in a window on a gradient, with the
 * window's shadow and a watermark. Drawn with the 2D canvas API, which (unlike
 * an SVG foreignObject) leaves the canvas exportable in WebKit. Returns PNG
 * bytes as base64.
 */
export function drawShareCard({ title, text, fileName }: { title: string; text: string; fileName: string }): string {
  const ctx = document.createElement("canvas").getContext("2d")!;
  const inner = WIDTH - MARGIN * 2 - PAD * 2;
  ctx.font = TITLE_FONT;
  const titleLines = clampLines(wrapText(title, inner, (s) => ctx.measureText(s).width), 2);
  ctx.font = BODY_FONT;
  const bodyLines = clampLines(wrapText(text, inner, (s) => ctx.measureText(s).width), MAX_LINES);
  const windowHeight = BAR + 24 + titleLines.length * TITLE_LINE + 14 + bodyLines.length * BODY_LINE + PAD;
  const height = MARGIN + windowHeight + MARGIN + 20;

  const canvas = ctx.canvas;
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  ctx.scale(SCALE, SCALE);

  const bg = ctx.createLinearGradient(0, 0, WIDTH, height);
  bg.addColorStop(0, "#6E9BFF");
  bg.addColorStop(0.55, "#8B7CF6");
  bg.addColorStop(1, "#E58ACB");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, height);
  const glow = ctx.createRadialGradient(WIDTH * 0.2, 0, 0, WIDTH * 0.2, 0, WIDTH * 0.8);
  glow.addColorStop(0, "rgba(255,255,255,.35)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, height);

  const x = MARGIN;
  const y = MARGIN;
  const w = WIDTH - MARGIN * 2;
  ctx.save();
  ctx.shadowColor = "rgba(20, 24, 70, .32)";
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.roundRect(x, y, w, windowHeight, 18);
  ctx.fill();
  ctx.restore();

  ["#FF5F57", "#FEBC2E", "#28C840"].forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 22 + i * 20, y + BAR / 2, 6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#6E6E73";
  ctx.font = "12px -apple-system, 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(fileName, x + w / 2, y + BAR / 2);
  ctx.fillStyle = "rgba(0,0,0,.08)";
  ctx.fillRect(x, y + BAR, w, 1);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let cy = y + BAR + 24;
  ctx.fillStyle = "#1D1D1F";
  ctx.font = TITLE_FONT;
  for (const line of titleLines) {
    cy += TITLE_LINE;
    ctx.fillText(line, x + PAD, cy - 9);
  }
  cy += 14;
  ctx.font = BODY_FONT;
  ctx.fillStyle = "#3A3A3E";
  for (const line of bodyLines) {
    cy += BODY_LINE;
    ctx.fillText(line, x + PAD, cy - 9);
  }

  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.font = "600 12px -apple-system, 'PingFang SC', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("Dew · Markdown", WIDTH - MARGIN, height - 26);

  return canvas.toDataURL("image/png").slice("data:image/png;base64,".length);
}
