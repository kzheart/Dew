import { expect, test } from "bun:test";
import { deleteLines, diff, replaceLines, sliceLines, toggleTask } from "./source";

const doc = "# t\n\n- [x] a\n- [ ] b\n\ntail";

test("toggling a task flips its marker and nothing else", () => {
  expect(toggleTask(doc, 4)).toBe("# t\n\n- [x] a\n- [x] b\n\ntail");
  expect(toggleTask(doc, 3)).toBe("# t\n\n- [ ] a\n- [ ] b\n\ntail");
});

test("toggling a line without a task changes nothing", () => {
  expect(toggleTask(doc, 1)).toBe(doc);
  expect(toggleTask(doc, 99)).toBe(doc);
});

test("tasks in ordered lists, nested lists and callouts", () => {
  expect(toggleTask("1. [ ] x", 1)).toBe("1. [x] x");
  expect(toggleTask("  - [X] x", 1)).toBe("  - [ ] x");
  expect(toggleTask("> - [ ] x", 1)).toBe("> - [x] x");
});

test("replacing lines with more or fewer lines", () => {
  expect(replaceLines(doc, 3, 4, "- c")).toBe("# t\n\n- c\n\ntail");
  expect(replaceLines(doc, 1, 1, "# a\nmore")).toBe("# a\nmore\n\n- [x] a\n- [ ] b\n\ntail");
  expect(sliceLines(doc, 3, 4)).toBe("- [x] a\n- [ ] b");
});

test("deleting lines takes one blank line along", () => {
  expect(deleteLines(doc, 3, 4)).toBe("# t\n\ntail");
  expect(deleteLines("a\n\nb", 3, 3)).toBe("a");
});

test("the smallest change between two texts", () => {
  expect(diff("hello world", "hello brave world")).toEqual({ from: 6, to: 6, insert: "brave " });
  expect(diff("abc", "abc")).toBeNull();
  expect(diff("aXc", "aYYc")).toEqual({ from: 1, to: 2, insert: "YY" });
});
