import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { blockAtLine, highlightedLines, parseDocument } from "./parse";

const sample = readFileSync(new URL("../../samples/版本说明.md", import.meta.url), "utf8");

describe("the prototype's document", () => {
  const doc = parseDocument(sample);

  test("blocks span the prototype's data-src and data-end lines", () => {
    expect(doc.blocks.map((b) => [b.kind, b.start, b.end])).toEqual([
      ["frontmatter", 1, 6],
      ["heading", 8, 8],
      ["paragraph", 10, 10],
      ["callout", 12, 13],
      ["heading", 15, 15],
      ["list", 17, 19],
      ["heading", 21, 21],
      ["code", 23, 30],
      ["heading", 32, 32],
      ["table", 34, 39],
      ["paragraph", 41, 41],
      ["math", 43, 45],
      ["paragraph", 47, 47],
      ["footnotes", 49, 49],
    ]);
  });

  test("front matter entries", () => {
    expect(doc.frontMatter).toEqual([
      { key: "title", value: "版本 2.0 发布说明" },
      { key: "tags", value: ["发布", "编辑器", "阅读"] },
      { key: "date", value: "2026-11-02" },
      { key: "author", value: "产品组" },
    ]);
  });

  test("headings with their sections' tasks", () => {
    expect(doc.headings).toEqual([
      { level: 1, text: "版本 2.0 发布说明", line: 8, tasks: { done: 0, total: 0 } },
      { level: 2, text: "本次待办", line: 15, tasks: { done: 2, total: 3 } },
      { level: 2, text: "同步算法", line: 21, tasks: { done: 0, total: 0 } },
      { level: 2, text: "模式对比", line: 32, tasks: { done: 0, total: 0 } },
    ]);
  });

  test("inline markup", () => {
    const p = doc.blocks[2]!;
    expect(p.kind === "paragraph" && p.html).toBe(
      "本次更新聚焦<strong>阅读体验</strong>与<code class=\"ic\">代码块</code>渲染，并让编辑与预览真正对齐。",
    );
  });

  test("a GitHub alert becomes a callout", () => {
    const b = doc.blocks[3]!;
    expect(b.kind === "callout" && [b.variant, b.title, b.folded, b.html.trim()]).toEqual([
      "note",
      "提示",
      false,
      "<p>双击预览中的任意段落，即可跳回对应源码行。</p>",
    ]);
  });

  test("a task list", () => {
    const b = doc.blocks[5]!;
    if (b.kind !== "list") throw new Error(b.kind);
    expect(b.tasksOnly).toBe(true);
    expect(b.items.map((it) => [it.start, it.task, it.html.trim()])).toEqual([
      [17, true, "分栏像素级同步滚动"],
      [18, true, "代码块指定行高亮"],
      [19, false, "PDF 导出分页保护"],
    ]);
  });

  test("a fence with highlighted lines", () => {
    const b = doc.blocks[7]!;
    if (b.kind !== "code") throw new Error(b.kind);
    expect([b.lang, b.highlight, b.code.split("\n").length]).toEqual(["ts", [2, 4], 6]);
    expect(b.code.split("\n")[0]).toBe("export function sync(src: Pane, view: Pane) {");
  });

  test("a table with alignments", () => {
    const b = doc.blocks[9]!;
    if (b.kind !== "table") throw new Error(b.kind);
    expect(b.align).toEqual(["left", "left", "center"]);
    expect(b.header).toEqual(["模式", "适合场景", "快捷键"]);
    expect(b.rows.map((r) => r[0])).toEqual(["实时", "预览", "源码", "源码 · 分栏"]);
    expect(b.widths).toBeNull();
  });

  test("a table's delimiter runs are its column widths", () => {
    const b = parseDocument("---\ntitle: t\n---\n\n| a | b |\n| ------ | -- |\n| 1 | 2 |").blocks[1]!;
    if (b.kind !== "table") throw new Error(b.kind);
    expect(b.widths).toEqual([0.75, 0.25]);
  });

  test("inline and block math", () => {
    const p = doc.blocks[10]!;
    expect(p.kind === "paragraph" && p.hasMath).toBe(true);
    expect(p.kind === "paragraph" && p.html).toContain('class="katex"');
    const m = doc.blocks[11]!;
    expect(m.kind === "math" && m.tex).toBe("\\int_0^1 x^2\\,dx = \\frac{1}{3}");
  });

  test("footnote references show their definition", () => {
    const p = doc.blocks[12]!;
    expect(p.kind === "paragraph" && p.hasFootnoteRef).toBe(true);
    expect(p.kind === "paragraph" && p.html).toContain('<a class="fn-ref" href="#fn-1" aria-label="脚注 1">1<span class="fn-pop" role="tooltip"><b>脚注 1</b>以段落为锚点换算位置，而不是按总高度比例滚动。</span></a>');
    expect(doc.footnotes.map((f) => [f.label, f.n, f.start])).toEqual([["1", 1, 49]]);
  });

  test("stats count characters that are not whitespace", () => {
    expect(doc.stats.chars).toBe([...sample].filter((c) => !/\s/.test(c)).length);
    expect(doc.stats.minutes).toBe(Math.max(1, Math.ceil(doc.stats.chars / 400)));
    expect(doc.lineCount).toBe(50);
  });
});

describe("edge cases", () => {
  test("an empty document has no blocks", () => {
    expect(parseDocument("").blocks).toEqual([]);
  });

  test("an unclosed front matter is a paragraph and a rule", () => {
    expect(parseDocument("---\ntitle: x").blocks.map((b) => b.kind)).not.toContain("frontmatter");
  });

  test("callout variants, custom titles and folding", () => {
    const b = parseDocument("> [!WARNING]- 小心\n> body").blocks[0]!;
    expect(b.kind === "callout" && [b.variant, b.title, b.folded]).toEqual(["warning", "小心", true]);
  });

  test("a plain quote stays a quote", () => {
    expect(parseDocument("> hello\n> world").blocks[0]!.kind).toBe("quote");
  });

  test("dollars around amounts are not math", () => {
    const b = parseDocument("costs $5 and $10 today").blocks[0]!;
    expect(b.kind === "paragraph" && b.hasMath).toBe(false);
  });

  test("lists keep nested tasks' source lines", () => {
    const b = parseDocument("- a\n  - [x] b\n- c").blocks[0]!;
    if (b.kind !== "list") throw new Error(b.kind);
    expect(b.tasksOnly).toBe(false);
    expect(b.items[0]!.html).toContain('data-task-line="2" checked');
    expect(b.tasks).toEqual({ done: 1, total: 1 });
  });

  test("a lone image is an image block", () => {
    const doc = parseDocument("![猫](cat.png)", { resolveImage: (s) => `docfile://localhost/d/${s}` });
    const b = doc.blocks[0]!;
    expect(b.kind === "image" && [b.src, b.alt]).toEqual(["cat.png", "猫"]);
    expect(b.kind === "image" && b.html).toContain('src="docfile://localhost/d/cat.png"');
  });

  test("footnote definitions next to each other form one block", () => {
    const doc = parseDocument("a[^x] b[^y]\n\n[^x]: one\n[^y]: two");
    expect(doc.blocks.map((b) => [b.kind, b.start, b.end])).toEqual([
      ["paragraph", 1, 1],
      ["footnotes", 3, 4],
    ]);
  });

  test("blocks stay in source order", () => {
    const doc = parseDocument(sample + "\n\n" + sample.replace(/^---[\s\S]*?---\n/, ""));
    const starts = doc.blocks.map((b) => b.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  test("a fence names its file after the language, and its language picks how it shows", () => {
    const code = (src: string) => {
      const b = parseDocument(src).blocks[0]!;
      if (b.kind !== "code") throw new Error(b.kind);
      return [b.lang, b.title, b.view];
    };
    expect(code("```diff src/sync.ts\n-a\n+b\n```")).toEqual(["diff", "src/sync.ts", { kind: "diff" }]);
    expect(code("```ts {2,4}\nx\n```")).toEqual(["ts", "", { kind: "plain" }]);
    expect(code("```py main.py {3}\nx\n```")).toEqual(["py", "main.py", { kind: "plain" }]);
    expect(code("```mermaid\nflowchart LR\n```")).toEqual(["mermaid", "", { kind: "diagram", engine: "mermaid" }]);
    expect(code("```puml\n@startuml\n```")[2]).toEqual({ kind: "diagram", engine: "plantuml" });
    expect(code("```PlantUML\n@startuml\n```")[2]).toEqual({ kind: "diagram", engine: "plantuml" });
    expect(code("```vegalite\n{}\n```")[2]).toEqual({ kind: "diagram", engine: "vega-lite" });
    expect(code("```vega-lite\n{}\n```")[2]).toEqual({ kind: "diagram", engine: "vega-lite" });
    expect(code("    indented\n")).toEqual(["", "", { kind: "plain" }]);
  });

  test("highlighted line ranges", () => {
    expect(highlightedLines("ts {2,4-6}")).toEqual([2, 4, 5, 6]);
    expect(highlightedLines("ts")).toEqual([]);
  });

  test("the block at a line", () => {
    const doc = parseDocument(sample);
    expect(doc.blocks[blockAtLine(doc.blocks, 25)]!.kind).toBe("code");
    expect(doc.blocks[blockAtLine(doc.blocks, 7)]!.kind).toBe("frontmatter");
  });
});
