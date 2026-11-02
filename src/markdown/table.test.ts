import { describe, expect, test } from "bun:test";
import {
  alignments,
  columnAt,
  displayWidth,
  formatTable,
  insertColumn,
  insertRow,
  moveColumn,
  relativeWidths,
  setAlign,
  setColumnWidths,
  splitRow,
} from "./table";

const table = [
  "| 模式 | 适合场景 | 快捷键 |",
  "| :-- | :-- | :-: |",
  "| 实时 | 所见即所得 | ⌘1 |",
  "| 预览 | 沉浸阅读 | ⌘2 |",
].join("\n");

const lines = (src: string) => src.split("\n");
const cells = (src: string, line: number) => splitRow(lines(src)[line]!);

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

test("CJK characters are two columns wide", () => {
  expect(displayWidth("所见即所得")).toBe(10);
  expect(displayWidth("⌘1")).toBe(2);
  expect(displayWidth("a，b")).toBe(4);
});

describe("formatting", () => {
  test("pads every cell to its column, counting CJK as double width", () => {
    expect(formatTable(table)).toBe(
      [
        "| 模式 | 适合场景   | 快捷键 |",
        "| :--  | :--        | :-:    |",
        "| 实时 | 所见即所得 |   ⌘1   |",
        "| 预览 | 沉浸阅读   |   ⌘2   |",
      ].join("\n"),
    );
  });

  test("right-aligned cells pad on the left", () => {
    expect(lines(formatTable("| n |\n| --: |\n| 12345 |"))[2]).toBe("| 12345 |");
    expect(lines(formatTable("| number |\n| --: |\n| 1 |"))[2]).toBe("|      1 |");
  });

  test("short rows get empty cells and stay a table", () => {
    const out = formatTable("| a | b |\n| --- | --- |\n| 1 |");
    expect(cells(out, 2)).toEqual(["1", ""]);
  });

  test("is stable", () => {
    expect(formatTable(formatTable(table))).toBe(formatTable(table));
  });

  test("keeps escaped pipes in their cell", () => {
    expect(cells(formatTable("| a | b |\n| --- | --- |\n| x \\| y | z |"), 2)).toEqual(["x \\| y", "z"]);
  });
});

describe("alignment", () => {
  test("reads the delimiter row", () => {
    expect(alignments(table)).toEqual(["left", "left", "center"]);
  });

  test("rewrites only the chosen column", () => {
    const out = setAlign(table, 1, "right");
    expect(alignments(out)).toEqual(["left", "right", "center"]);
    expect(cells(out, 0)).toEqual(["模式", "适合场景", "快捷键"]);
  });

  test("a column past the end is left alone", () => {
    expect(setAlign(table, 5, "center")).toBe(table);
  });
});

describe("rows", () => {
  test("an empty row goes in at the body index", () => {
    const out = insertRow(table, 1);
    expect(lines(out)).toHaveLength(5);
    expect(cells(out, 2)).toEqual(["实时", "所见即所得", "⌘1"]);
    expect(cells(out, 3)).toEqual(["", "", ""]);
    expect(cells(out, 4)).toEqual(["预览", "沉浸阅读", "⌘2"]);
  });

  test("index 0 is right under the header, and the end appends", () => {
    expect(cells(insertRow(table, 0), 2)).toEqual(["", "", ""]);
    expect(cells(insertRow(table, 2), 4)).toEqual(["", "", ""]);
  });
});

describe("columns", () => {
  test("an empty, unaligned column goes in at the index on every row", () => {
    const out = insertColumn(table, 1);
    expect(cells(out, 0)).toEqual(["模式", "", "适合场景", "快捷键"]);
    expect(alignments(out)).toEqual(["left", null, "left", "center"]);
    expect(cells(out, 3)).toEqual(["预览", "", "沉浸阅读", "⌘2"]);
  });

  test("columns can go in first and last", () => {
    expect(cells(insertColumn(table, 0), 0)).toEqual(["", "模式", "适合场景", "快捷键"]);
    expect(cells(insertColumn(table, 3), 0)).toEqual(["模式", "适合场景", "快捷键", ""]);
  });

  test("a moved column takes its cells, alignment and width along", () => {
    const wide = setColumnWidths(table, [4, 12, 6]);
    const out = moveColumn(wide, 2, 0);
    expect(cells(out, 0)).toEqual(["快捷键", "模式", "适合场景"]);
    expect(cells(out, 2)).toEqual(["⌘1", "实时", "所见即所得"]);
    expect(alignments(out)).toEqual(["center", "left", "left"]);
    expect(relativeWidths(lines(out)[1]!)).toEqual([6 / 22, 4 / 22, 12 / 22]);
    expect(cells(moveColumn(table, 0, 2), 0)).toEqual(["适合场景", "快捷键", "模式"]);
  });

  test("moving a column out of range changes nothing but the padding", () => {
    expect(moveColumn(table, 0, 7)).toBe(formatTable(table));
  });
});

describe("widths", () => {
  test("the minimal delimiter row leaves widths to the content", () => {
    expect(relativeWidths("| --- | :-: | --: |")).toBeNull();
    expect(relativeWidths(lines(formatTable(table))[1]!)).toBeNull();
    expect(relativeWidths(lines(insertColumn(table, 1))[1]!)).toBeNull();
  });

  test("longer runs are relative widths", () => {
    expect(relativeWidths("| ---------- | ----- | :-------: |")).toEqual([10 / 24, 5 / 24, 9 / 24]);
  });

  test("set widths read back, alignment kept, and the table stays aligned", () => {
    const out = setColumnWidths(table, [5, 15, 8]);
    expect(relativeWidths(lines(out)[1]!)).toEqual([5 / 28, 15 / 28, 8 / 28]);
    expect(alignments(out)).toEqual(["left", "left", "center"]);
    expect(lines(out).map((l) => displayWidth(l)).every((w, _, all) => w === all[0])).toBe(true);
    expect(lines(out)[1]).toBe("| :---- | :-------------- | :------: |");
  });

  test("a column narrower than its content keeps its run and pads with spaces", () => {
    const out = setColumnWidths(table, [4, 6, 6]);
    expect(lines(out)[1]).toBe("| :--- | :-----     | :----: |");
    expect(relativeWidths(lines(out)[1]!)).toEqual([4 / 16, 6 / 16, 6 / 16]);
  });

  test("widths survive inserting rows and columns", () => {
    const wide = setColumnWidths(table, [5, 15, 8]);
    expect(relativeWidths(lines(insertRow(wide, 0))[1]!)).toEqual([5 / 28, 15 / 28, 8 / 28]);
    expect(relativeWidths(lines(insertColumn(wide, 3))[1]!)).toEqual([5 / 31, 15 / 31, 8 / 31, 3 / 31]);
  });
});
