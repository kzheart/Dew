import { describe, expect, test } from "bun:test";
import { addColumn, addRow, alignments, columnAt, setAlign, splitRow } from "./table";

const table = [
  "| 模式 | 适合场景 | 快捷键 |",
  "| :-- | :-- | :-: |",
  "| 实时 | 所见即所得 | ⌘1 |",
  "| 预览 | 沉浸阅读 | ⌘2 |",
].join("\n");

test("rows split on unescaped pipes, with or without outer pipes", () => {
  expect(splitRow("| a | b \\| c | d |")).toEqual(["a", "b \\| c", "d"]);
  expect(splitRow("a | b")).toEqual(["a", "b"]);
});

test("the column under the cursor counts the pipes before it", () => {
  const row = "| 实时 | 所见即所得 | ⌘1 |";
  expect(columnAt(row, 0)).toBe(0);
  expect(columnAt(row, 3)).toBe(0);
  expect(columnAt(row, row.indexOf("所"))).toBe(1);
  expect(columnAt(row, row.indexOf("⌘"))).toBe(2);
  expect(columnAt("a \\| b | c", 9)).toBe(1);
});

describe("alignment", () => {
  test("reads the delimiter row", () => {
    expect(alignments(table)).toEqual(["left", "left", "center"]);
  });

  test("rewrites only the chosen column", () => {
    const out = setAlign(table, 1, "right");
    expect(out.split("\n")[1]).toBe("| :-- | --: | :-: |");
    expect(alignments(out)).toEqual(["left", "right", "center"]);
    expect(out.split("\n")[0]).toBe(table.split("\n")[0]!);
  });

  test("a column past the end is left alone", () => {
    expect(setAlign(table, 5, "center")).toBe(table);
  });
});

describe("rows", () => {
  test("a row goes below the cursor's row", () => {
    const { src, line } = addRow(table, 2);
    expect(line).toBe(3);
    expect(src.split("\n")[3]).toBe("|  |  |  |");
    expect(src.split("\n")).toHaveLength(5);
  });

  test("from the header the new row is the first body row", () => {
    expect(addRow(table, 0).line).toBe(2);
    expect(addRow(table, 0).src.split("\n")[2]).toBe("|  |  |  |");
  });
});

test("a column goes after the cursor's column, with a plain delimiter", () => {
  const { src, col } = addColumn(table, 0);
  expect(col).toBe(1);
  expect(src.split("\n").slice(0, 3)).toEqual([
    "| 模式 |  | 适合场景 | 快捷键 |",
    "| :-- | --- | :-- | :-: |",
    "| 实时 |  | 所见即所得 | ⌘1 |",
  ]);
});
