import { describe, expect, test } from "bun:test";
import { CARD_BACKGROUNDS, clampLines, codeTokens, layoutCard, tidyCode, wrapText, type CardContent } from "./card";

const chars = (s: string) => [...s].length;
/** Every character 8px wide, CJK 16px, whatever the font. */
const measure = (s: string) => [...s].reduce((w, c) => w + (/[一-鿿]/.test(c) ? 16 : 8), 0);
const blue = { background: "blue" as const, watermark: "" };

test("Chinese text breaks between any characters", () => {
  expect(wrapText("滚动对齐基于块级映射", 4, chars)).toEqual(["滚动对齐", "基于块级", "映射"]);
});

test("Latin words stay whole and their trailing space is dropped at a break", () => {
  expect(wrapText("block map sync", 10, chars)).toEqual(["block map", "sync"]);
});

test("a word longer than a line is broken hard", () => {
  expect(wrapText("abcdefghij", 4, chars)).toEqual(["abcd", "efgh", "ij"]);
});

test("the text's own line breaks are kept", () => {
  expect(wrapText("第一行\n\n第三", 10, chars)).toEqual(["第一行", "", "第三"]);
});

test("clamped lines end in an ellipsis", () => {
  expect(clampLines(["一二三", "四五六", "七"], 2)).toEqual(["一二三", "四五…"]);
  expect(clampLines(["一"], 2)).toEqual(["一"]);
});

test("selected code loses the blank lines around it and the indentation its lines share", () => {
  expect(tidyCode("\n    src.scrollTo(y);\n\n  });\n")).toBe("  src.scrollTo(y);\n\n});");
  expect(tidyCode("a\n  b")).toBe("a\n  b");
  expect(tidyCode("\n \n")).toBe("");
});

test("code splits into tokens of one scope per line, entities decoded", () => {
  const lines = codeTokens('const a = "<b>";\nreturn a', "ts");
  expect(lines).toHaveLength(2);
  expect(lines[0]!.map((t) => t.text).join("")).toBe('const a = "<b>";');
  expect(lines[0]!.find((t) => t.text === "const")?.tk).toBe("tk-kw");
  expect(lines[0]!.find((t) => t.text.includes("<b>"))?.tk).toBe("tk-str");
  expect(codeTokens("x < y", "nosuchlang")).toEqual([[{ text: "x < y", tk: "" }]]);
});

describe("a code card", () => {
  const code: CardContent = { kind: "code", title: "sync.ts", lang: "ts", code: "export function sync() {\n  return 1;\n}" };
  const texts = (c: CardContent, o = blue) => layoutCard(c, o, measure).texts;

  test("draws a dark window with its title and the code colored by scope", () => {
    const layout = layoutCard(code, blue, measure);
    expect(layout.window.dark).toBe(true);
    expect(layout.bar).not.toBeNull();
    expect(layout.texts[0]!.text).toBe("sync.ts");
    const colorOf = (s: string) => layout.texts.find((t) => t.text === s)!.color;
    expect(colorOf("export")).not.toBe(colorOf("sync"));
    expect(layout.texts.filter((t) => t.font.includes("13.5px")).map((t) => t.text).join("")).toBe("export function sync() {  return 1;}");
  });

  test("lines too wide for the widest window wrap, and nothing is lost", () => {
    const long: CardContent = { ...code, code: "x".repeat(200) };
    const layout = layoutCard(long, blue, measure);
    const rows = new Set(layout.texts.filter((t) => t.font.includes("13.5px")).map((t) => t.y));
    expect(rows.size).toBe(3);
    expect(layout.texts.filter((t) => t.font.includes("13.5px")).map((t) => t.text).join("")).toBe("x".repeat(200));
    expect(layout.window.w).toBe(720 + 44);
  });

  test("a short snippet keeps the narrowest window, and more lines make a taller card", () => {
    const one = layoutCard({ ...code, code: "a" }, blue, measure);
    const three = layoutCard(code, blue, measure);
    expect(one.window.w).toBe(360 + 44);
    expect(three.height - one.height).toBe(2 * 22);
  });

  test("very long code is cut with an ellipsis line", () => {
    const tall = texts({ ...code, code: Array.from({ length: 80 }, (_, i) => `line${i}`).join("\n") });
    const rows = tall.filter((t) => t.font.includes("13.5px"));
    expect(rows.at(-1)!.text).toBe("…");
    expect(new Set(rows.map((t) => t.y)).size).toBe(48);
  });
});

describe("a text card", () => {
  const text: CardContent = { kind: "text", title: "版本 2.0 发布说明", paragraphs: ["滚动对齐基于块级映射，".repeat(6), "第二段。"] };

  test("draws a light card with the title and every paragraph wrapped to its width", () => {
    const layout = layoutCard(text, blue, measure);
    expect(layout.window.dark).toBe(false);
    expect(layout.bar).toBeNull();
    expect(layout.texts[0]!.text).toBe("版本 2.0 发布说明");
    const body = layout.texts.filter((t) => t.font.startsWith("16px"));
    expect(body.map((t) => t.text).join("")).toBe(text.paragraphs.join(""));
    expect(body.every((t) => measure(t.text) <= 640 - 96 - 72)).toBe(true);
    expect(body.length).toBeGreaterThan(2);
  });

  test("more paragraphs than fit end in an ellipsis", () => {
    const many = layoutCard({ ...text, paragraphs: Array.from({ length: 40 }, (_, i) => `第 ${i} 段`) }, blue, measure);
    const body = many.texts.filter((t) => t.font.startsWith("16px"));
    expect(body).toHaveLength(22);
    expect(body.at(-1)!.text.endsWith("…")).toBe(true);
  });
});

test("the watermark sits at the bottom right in the background's ink, and an empty one draws nothing", () => {
  const content: CardContent = { kind: "text", title: "", paragraphs: ["一段"] };
  const marked = layoutCard(content, { background: "gray", watermark: " @dew " }, measure);
  const mark = marked.texts.at(-1)!;
  expect(mark.text).toBe("@dew");
  expect(mark.color).toBe(CARD_BACKGROUNDS.gray.ink);
  expect(mark.x + measure("@dew")).toBe(marked.width - 22);
  expect(mark.y).toBe(marked.height - 22);
  expect(layoutCard(content, { background: "gray", watermark: "  " }, measure).texts.map((t) => t.text)).toEqual(["一段"]);
});
