import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { defaultPrefs } from "../platform";
import { parseDocument } from "../markdown/parse";
import { baseName, documentTitle, renderArticle, standaloneDocument } from "./standalone";

const sample = parseDocument(readFileSync(new URL("../../samples/版本说明.md", import.meta.url), "utf8"));

test("the exported article has every block and no controls", () => {
  const html = renderArticle(sample, defaultPrefs);
  expect(html).toContain('<article class="art doc ff-sans" style="max-width:720px;font-size:16px;line-height:1.75;gap:1em">');
  expect(html).toContain("版本 2.0 发布说明");
  expect(html).toContain('class="cb-lang">TypeScript');
  expect(html).toContain('<table class="tbl">');
  expect(html).toContain('class="katex"');
  expect(html).not.toContain("<button");
  expect(html).toContain('class="clp open"');
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
