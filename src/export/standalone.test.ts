import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { defaultPrefs } from "../defaultPrefs";
import { engines, renderDiagrams } from "../diagram/engines";
import { parseDocument } from "../markdown/parse";
import { baseName, documentTitle, keepHeadingsWithNext, pageUnits, pdfScript, renderArticle, standaloneDocument } from "./standalone";

const sample = parseDocument(readFileSync(new URL("../../samples/版本说明.md", import.meta.url), "utf8"));

test("the exported article has every block and no controls", () => {
  const html = renderArticle(sample, defaultPrefs, "white");
  expect(html).toContain('<article class="art doc ff-sans" style="max-width:720px;font-size:16px;line-height:1.75;gap:1em;--gap:16px">');
  expect(html).toContain("版本 2.0 发布说明");
  expect(html).toContain('class="cb-lang">TypeScript');
  expect(html).toContain('<table class="tbl">');
  expect(html).toContain('class="katex"');
  expect(html).not.toContain("<button");
  expect(html).toContain('class="clp open"');
});

test("a printed export keeps each heading on the page of the block after it", () => {
  const html = renderArticle(sample, defaultPrefs, "white", { guard: defaultPrefs.pageGuard });
  expect(html).toMatch(/<div class="pg" data-protect=""><h2[^>]*>模式对比<\/h2><div[^>]*><div class="tbl-wrap">/);
  expect(renderArticle(sample, defaultPrefs, "white")).not.toContain('class="pg"');
});

test("a run of headings stays with the block after them", () => {
  const groups = keepHeadingsWithNext(parseDocument("# 一\n\n## 二\n\n正文\n\n另一段").blocks);
  expect(groups.map((g) => g.map((b) => b.kind))).toEqual([["heading", "heading", "paragraph"], ["paragraph"]]);
});

describe("page protection", () => {
  const doc = parseDocument(
    ["段落", "", "```ts", "a()", "```", "", "```mermaid", "graph TD", "```", "", "| a |", "| - |", "| 1 |", "", "![图](a.png)", "", "$$", "x", "$$", "", "## 标题", "", "![图](b.png)"].join("\n"),
  );
  const protectedKinds = (guard: typeof defaultPrefs.pageGuard) =>
    pageUnits(doc.blocks, guard).map((u) => `${u.blocks.map((b) => (b.kind === "code" && b.view.kind === "diagram" ? "chart" : b.kind)).join("+")}${u.protect ? "!" : ""}`);

  test("guards code, tables and charts by default, and always math and a heading with its block", () => {
    expect(protectedKinds(defaultPrefs.pageGuard)).toEqual(["paragraph", "code!", "chart!", "table!", "image", "math!", "heading+image!"]);
  });

  test("follows each setting", () => {
    expect(protectedKinds({ code: false, table: false, chart: false, image: true })).toEqual(["paragraph", "code", "chart", "table", "image!", "math!", "heading+image!"]);
  });
});

test("the PDF's page is ready only once its script has measured it; the HTML file's from the start", () => {
  const pdf = standaloneDocument({ title: "t", body: "<p>x</p>", css: "", bg: "white", script: pdfScript });
  expect(pdf).toContain('<body class="pv bg-white">');
  expect(pdf).toContain(`<script>${pdfScript}</script>`);
  expect(pdfScript).toContain('setAttribute("data-dew-export"');
  expect(standaloneDocument({ title: "t", body: "", css: "", bg: "white" })).not.toContain("<script>");
});

test("an export draws its charts, keeps a failed one's source, colors diffs and shows long code whole", async () => {
  const doc = parseDocument(readFileSync(new URL("../../samples/超级代码块.md", import.meta.url), "utf8"));
  const real = { ...engines };
  engines.mermaid = { ...real.mermaid, render: async () => '<svg viewBox="0 0 360 660"><text>打开 .md 文件</text></svg>' };
  engines["vega-lite"] = { ...real["vega-lite"], render: async () => Promise.reject(new Error("JSON 格式有误")) };
  engines.plantuml = { ...real.plantuml, render: async () => '<svg viewBox="0 0 256 278"><text>编辑器</text></svg>' };
  try {
    await renderDiagrams(doc.blocks, "white");
    const html = renderArticle(doc, defaultPrefs, "white");
    expect(html).toMatch(/<div class="dia-svg"[^>]*><svg [^>]*width="360" height="660"[^>]*><text>打开 .md 文件<\/text><\/svg>/);
    expect(html).toContain("<text>编辑器</text>");
    expect(html).toContain("图表无法渲染");
    expect(html).toContain("JSON 格式有误");
    expect(html).toContain("各模式的使用占比");
    expect(html).not.toContain("正在渲染图表");
    expect(html.match(/class="dl dl-add"/g)).toHaveLength(4);
    expect(html.match(/class="dl dl-del"/g)).toHaveLength(2);
    expect(html).toContain("block_map.py · 共 46 行");
    expect(html).not.toContain("展开剩余");
  } finally {
    Object.assign(engines, real);
  }
});

test("a standalone document marks itself complete and carries its styles", () => {
  const html = standaloneDocument({ title: "a < b", body: "<p>x</p>", css: ".x{}", bg: "paper" });
  expect(html).toContain("<title>a &lt; b</title>");
  expect(html).toContain('<body class="pv bg-paper" data-dew-export>');
  expect(html).toContain("<style>.x{}</style>");
});

test("titles come from front matter, else the file name", () => {
  expect(documentTitle(sample, "版本说明.md")).toBe("版本 2.0 发布说明");
  expect(documentTitle(parseDocument("正文"), "笔记.markdown")).toBe("笔记");
  expect(baseName("")).toBe("未命名");
});
