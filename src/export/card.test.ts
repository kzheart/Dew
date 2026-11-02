import { expect, test } from "bun:test";
import { clampLines, wrapText } from "./card";

const chars = (s: string) => [...s].length;

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
