import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { displayWidth } from "../markdown/tableLayout";
import { classifyPaste, onOwnLines, parseTsv, pasteNotice, type Paste } from "./paste";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", name), "utf8");
const paste = (html: string, text: string, selection = "", hasImage = false) => classifyPaste({ html, text, hasImage }, selection);
const notice = (p: Paste) => (p.kind === "plain" || p.kind === "image" ? null : pasteNotice(p));

describe("spreadsheets", () => {
  test("an Excel range becomes an aligned table that names Excel and counts body rows", () => {
    const p = paste(fixture("excel.html"), fixture("excel.txt"));
    expect(p.kind).toBe("table");
    if (p.kind !== "table") return;
    const lines = p.markdown.split("\n");
    expect(lines[0]).toBe("| 模块       | 负责人   | 进度 | 截止       |");
    expect(lines[1]).toBe("| ---------- | -------- | ---- | ---------- |");
    expect(lines[2]).toBe("| 斜杠命令   | Ada      | 80%  | 2026/11/20 |");
    expect(lines).toContain("| 表格对齐   | Margaret | -5%  | 2026/12/8  |");
    expect(lines).toHaveLength(7);
    expect(new Set(lines.map(displayWidth)).size).toBe(1);
    expect(p.plain).toBe(fixture("excel.txt"));
    expect(notice(p)).toEqual({ icon: "table", title: "表格已转换并对齐", detail: "来自 Excel · 4 列 × 5 行" });
  });

  test("a Google Sheets range names Google 表格 and escapes pipes in cells", () => {
    const p = paste(fixture("sheets.html"), "名称\t数量\n苹果\t12\na|b\t3");
    expect(p.kind === "table" && p.source).toBe("Google 表格");
    expect(p.kind === "table" && p.markdown.split("\n")[3]).toBe("| a\\|b | 3    |");
  });

  test("tab-separated text alone becomes a table from 表格", () => {
    const p = paste("", "城市\t人口\n上海\t2487\n\"多行\n单元\"\t\"说 \"\"你好\"\"\"\n");
    expect(p.kind === "table" && p.markdown).toBe(
      ["| 城市         | 人口      |", "| ------------ | --------- |", "| 上海         | 2487      |", '| 多行<br>单元 | 说 "你好" |'].join("\n"),
    );
    expect(notice(p)?.detail).toBe("来自表格 · 2 列 × 2 行");
  });

  test("text indented with tabs, ragged rows or a single line is not a table", () => {
    expect(parseTsv("\tif (a) {\n\t\tb();\n\t}")).toBeNull();
    expect(parseTsv("\ta\n\tb")).toBeNull();
    expect(parseTsv("a\tb")).toBeNull();
    expect(parseTsv("a\tb\nc")).toBeNull();
  });
});

describe("rich text", () => {
  test("a Safari selection keeps headings, lists, bold, links and code and drops the styles", () => {
    const p = paste(fixture("safari.html"), fixture("safari.txt"));
    expect(p.kind).toBe("rich");
    if (p.kind !== "rich") return;
    expect(p.markdown).toBe(
      [
        "## 安装",
        "",
        "运行 `bun add dew`，然后在 [文档](https://example.com/docs)中查看**完整**的*选项*。",
        "",
        "- 支持 **macOS**",
        "- 支持 Linux",
        "  - Ubuntu 24.04",
        "",
        "1. 下载",
        "2. 打开",
      ].join("\n"),
    );
    expect(p.markdown).not.toContain("style");
    expect(notice(p)).toEqual({ icon: "rich", title: "富文本已转为 Markdown", detail: "保留标题、列表、加粗与链接，清除内联样式" });
  });

  test("a Google Docs copy takes bold and italics from styles, not from its bold wrapper", () => {
    const p = paste(fixture("gdocs.html"), fixture("gdocs.txt"));
    expect(p.kind === "rich" && p.markdown).toBe("# 周报\n\n**本周**完成了*斜杠命令*");
  });

  test("HTML that only styles plain text, like code from VS Code, pastes as plain text", () => {
    expect(paste(fixture("vscode.html"), fixture("vscode.txt")).kind).toBe("plain");
  });

  test("Dew's own preview and rich text paste as their plain text", () => {
    expect(paste('<p class="blk" data-src="10" data-blk="paragraph">本次<strong>更新</strong></p>', "本次更新").kind).toBe("plain");
    expect(paste('<article data-dew-rich=""><h2>标题</h2></article>', "## 标题").kind).toBe("plain");
  });
});

describe("links, images and plain text", () => {
  test("a URL pasted over a selection makes a link; the plain paste would put the URL there", () => {
    const p = paste("", "https://dew.app/docs?q=1#slash\n", "块级映射");
    expect(p).toEqual({ kind: "link", markdown: "[块级映射](https://dew.app/docs?q=1#slash)", plain: "https://dew.app/docs?q=1#slash\n" });
    expect(notice(p)).toEqual({ icon: "link", title: "已合成链接", detail: "[块级映射](https://dew.app/docs?q=1#slash)" });
  });

  test("a URL without a selection, or text that is not a URL, pastes plainly", () => {
    expect(paste("", "https://dew.app").kind).toBe("plain");
    expect(paste("", "see https://dew.app", "块级映射").kind).toBe("plain");
    expect(paste("", "只是文字").kind).toBe("plain");
  });

  test("an image with no text is a screenshot; Excel's picture of its cells is not", () => {
    expect(paste("", "", "", true).kind).toBe("image");
    expect(paste(fixture("excel.html"), fixture("excel.txt"), "", true).kind).toBe("table");
  });
});

describe("placement", () => {
  test("a table or several lines pasted mid-line get blank lines around them; one line stays inline", () => {
    expect(onOwnLines("| a |\n| - |", "见下表：", "")).toBe("\n\n| a |\n| - |");
    expect(onOwnLines("| a |\n| - |", "", "后文")).toBe("| a |\n| - |\n\n");
    expect(onOwnLines("| a |\n| - |", "  ", "")).toBe("| a |\n| - |");
    expect(onOwnLines("**粗**", "前文", "后文")).toBe("**粗**");
  });
});
