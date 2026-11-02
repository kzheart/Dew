import { expect, test } from "bun:test";
import { parseDocument } from "../markdown/parse";
import { blockWithin, neighbor, rangeAfterEdit } from "./session";

const { blocks } = parseDocument("# 标题\n\n第一段\n\n- [ ] 任务\n- [x] 完成\n\n最后");

test("neighbors skip the blank lines between blocks", () => {
  expect(neighbor(blocks, { start: 5, end: 6 }, -1)?.start).toBe(3);
  expect(neighbor(blocks, { start: 5, end: 6 }, 1)?.start).toBe(8);
});

test("there is no neighbor past either end", () => {
  expect(neighbor(blocks, { start: 1, end: 1 }, -1)).toBeNull();
  expect(neighbor(blocks, { start: 8, end: 8 }, 1)).toBeNull();
});

test("an edited range that split into blocks still has neighbors outside it", () => {
  const split = parseDocument("# 标题\n\n第一段\n\n分出来\n\n最后").blocks;
  expect(neighbor(split, { start: 3, end: 5 }, 1)?.start).toBe(7);
  expect(blockWithin(split, { start: 3, end: 5 })?.kind).toBe("paragraph");
});

test("blank active lines hold no block", () => {
  expect(blockWithin(blocks, { start: 2, end: 2 })).toBeNull();
});

test("the range follows the number of lines typed", () => {
  expect(rangeAfterEdit({ start: 3, end: 3 }, "一\n二\n")).toEqual({ start: 3, end: 5 });
  expect(rangeAfterEdit({ start: 5, end: 6 }, "合并")).toEqual({ start: 5, end: 5 });
});
