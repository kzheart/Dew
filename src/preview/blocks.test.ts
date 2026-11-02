import { expect, test } from "bun:test";
import { codeMeta, searchHits } from "./Blocks";

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
