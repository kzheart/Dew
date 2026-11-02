import { expect, test } from "bun:test";
import type { FileTab, RecentFile } from "../mygo";
import { matchName, quickOpen } from "./quickOpen";

const tab = (name: string, current = false): FileTab => ({ id: name.length, name, path: `/d/${name}`, edited: false, untitled: false, current });
const rec = (name: string, pinned = false): RecentFile => ({ path: `/d/${name}`, closedAt: 1, progress: 0.4, pinned });
const labels = (q: string, more: Partial<Parameters<typeof quickOpen>[0]> = {}) =>
  quickOpen({ tabs: [tab("版本说明.md", true), tab("README.md")], recent: [rec("版本规划.md"), rec("周报.md"), rec("项目总览.md", true)], folder: [], query: q, ...more }).map(
    (s) => `${s.label}:${s.items.map((i) => `${i.match.before}[${i.match.hit}]${i.match.after}`).join(",")}`,
  );

test("the matched run is split out, ignoring case", () => {
  expect(matchName("README.md", "read")).toEqual({ before: "", hit: "READ", after: "ME.md" });
  expect(matchName("版本说明.md", "说明")).toEqual({ before: "版本", hit: "说明", after: ".md" });
  expect(matchName("周报.md", "版本")).toBe(null);
});

test("with no query, the open files and the recent ones show, pinned first", () => {
  expect(labels("")).toEqual(["已打开:版本说明.md[],README.md[]", "最近:项目总览.md[],版本规划.md[],周报.md[]"]);
});

test("a query narrows every section and adds files beside the current one", () => {
  const folder = [{ name: "版本说明.md", path: "/d/版本说明.md" }, { name: "版本号约定.md", path: "/d/版本号约定.md" }, { name: "更新日志.md", path: "/d/更新日志.md" }];
  expect(labels("版本", { folder })).toEqual(["已打开:[版本]说明.md", "最近:[版本]规划.md", "当前文件夹:[版本]号约定.md"]);
});

test("nothing matching leaves no sections", () => {
  expect(labels("不存在")).toEqual([]);
});

test("at most five recent files and three folder files show", () => {
  const recent = Array.from({ length: 9 }, (_, i) => rec(`笔记 ${i}.md`));
  const folder = Array.from({ length: 6 }, (_, i) => ({ name: `笔记 x${i}.md`, path: `/d/笔记 x${i}.md` }));
  const sections = quickOpen({ tabs: [], recent, folder, query: "笔记" });
  expect(sections.map((s) => s.items.length)).toEqual([5, 3]);
});
