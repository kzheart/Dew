import { expect, test } from "bun:test";
import { sourceOffsetFor } from "./caret";

test("a heading's marker is skipped", () => {
  const src = "# 版本 2.0 发布说明";
  expect(sourceOffsetFor(src, "版本 2.0 发")).toBe(src.indexOf("发") + 1);
  expect(sourceOffsetFor(src, "")).toBe(0);
});

test("emphasis and code marks are skipped", () => {
  const src = "本次更新聚焦**阅读体验**与`代码块`渲染";
  expect(sourceOffsetFor(src, "本次更新聚焦阅读")).toBe(src.indexOf("读") + 1);
  expect(sourceOffsetFor(src, "本次更新聚焦阅读体验与代码块渲")).toBe(src.indexOf("渲") + 1);
});

test("a callout body is found past its marker line", () => {
  const src = "> [!NOTE]\n> 双击预览中的任意段落";
  expect(sourceOffsetFor(src, "双击")).toBe(src.indexOf("击") + 1);
});

test("a link's URL is skipped to reach the text after it", () => {
  const src = "见[文档](https://example.com/a/very/long/path)之后";
  expect(sourceOffsetFor(src, "见文档之")).toBe(src.indexOf("之") + 1);
});

test("rendered characters the source lacks are passed over", () => {
  const src = "| 模式 | 适合场景 |";
  expect(sourceOffsetFor(src, "模式★适合")).toBe(src.indexOf("合") + 1);
});
