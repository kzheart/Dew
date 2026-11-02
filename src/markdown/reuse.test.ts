import { expect, test } from "bun:test";
import { parseDocument } from "./parse";
import { reuseUnchanged } from "./reuse";

const before = "# 标题\n\n第一段。\n\n$$\nx^2\n$$\n\n第三段。\n";

test("an edit inside one block keeps every other block and the headings", () => {
  const prev = parseDocument(before);
  const next = reuseUnchanged(prev, parseDocument(before.replace("第一段。", "第一段，改了。")));
  expect(next.blocks.map((b, i) => b === prev.blocks[i])).toEqual([true, false, true, true]);
  expect(next.headings).toBe(prev.headings);
  expect(next.blocks[1]).toMatchObject({ kind: "paragraph", html: "第一段，改了。" });
});

test("blocks that moved to other lines are not reused", () => {
  const prev = parseDocument(before);
  const next = reuseUnchanged(prev, parseDocument("新的一行\n\n" + before));
  expect(next.blocks.some((b) => prev.blocks.includes(b))).toBe(false);
  expect(next.headings).not.toBe(prev.headings);
});

test("without a previous parse the new one comes back as it is", () => {
  const doc = parseDocument(before);
  expect(reuseUnchanged(null, doc)).toBe(doc);
});
