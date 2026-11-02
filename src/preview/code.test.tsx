import { expect, test } from "bun:test";
import { parseDiff } from "../markdown/diff";
import { highlightDiff } from "../markdown/highlight";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { parseDocument } from "../markdown/parse";
import { BlockActionsContext } from "./actions";
import { BlockView } from "./Blocks";
import { codeMeta, foldedLines, searchHits } from "./Code";

test("block search finds lines ignoring case, and nothing for a blank query", () => {
  const code = "export function sync() {\n  const map = build();\n  view.onScroll(() => map);\n}";
  expect([...searchHits(code, "MAP")]).toEqual([1, 2]);
  expect(searchHits(code, "  ").size).toBe(0);
  expect(searchHits(code, "nothing").size).toBe(0);
});

test("highlighted lines read as the prototype labels them", () => {
  expect(codeMeta([2, 4])).toBe("高亮第 2、4 行");
  expect(codeMeta([1, 2, 3, 7])).toBe("高亮第 1–3、7 行");
  expect(codeMeta([])).toBe("");
});

test("a diff highlights its code in the language of the file it names and leaves hunk headers plain", () => {
  const diff = parseDiff("@@ -1,1 +1,1 @@ <x>\n-const a = 1;\n+export const a = 2;");
  const lines = highlightDiff(diff, "src/sync.ts");
  expect(lines[0]).toBe("@@ -1,1 +1,1 @@ &lt;x&gt;");
  expect(lines[2]).toContain('<span class="tk-kw">export</span>');
  expect(highlightDiff(diff, "")[2]).toBe("export const a = 2;");
});

const superSample = parseDocument(readFileSync(new URL("../../samples/超级代码块.md", import.meta.url), "utf8"));

function renderBlock(start: number, interactive: boolean): string {
  const block = superSample.blocks.find((b) => b.start === start)!;
  const actions = { interactive, showLineNumbers: true, onToggleLineNumbers() {}, onToggleTask() {}, onZoom() {} };
  return renderToStaticMarkup(
    <BlockActionsContext.Provider value={actions}>
      <BlockView block={block} />
    </BlockActionsContext.Provider>,
  );
}

const rows = (html: string) => html.match(/<span class="(cl|dl)[ "]/g)?.length ?? 0;

test("a block over 20 lines starts on its first 8 and offers the other 38", () => {
  const html = renderBlock(23, true);
  expect(rows(html)).toBe(8);
  expect(html).toContain("展开剩余 38 行");
  expect(html).toContain("block_map.py · 共 46 行");
  expect([foldedLines(20), foldedLines(21), foldedLines(46)]).toEqual([0, 13, 38]);
});

test("a short block and every exported block show all their lines", () => {
  expect(rows(renderBlock(7, true))).toBe(11);
  expect(renderBlock(7, true)).not.toContain("cb-fold");
  const exported = renderBlock(23, false);
  expect(rows(exported)).toBe(46);
  expect(exported).not.toContain("展开剩余");
});
