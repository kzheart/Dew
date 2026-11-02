import { expect, test } from "bun:test";
import type { RecentFile } from "../mygo";
import { bucketOf, folderOf, rangeLabel, timeLabel, vapor } from "./recent";

const at = (month: number, day: number, h = 12, min = 0) => new Date(2026, month - 1, day, h, min).getTime();
const now = at(11, 2, 16, 50);
const file = (name: string, closedAt: number, more: Partial<RecentFile> = {}): RecentFile => ({ path: `/Users/me/Dew/文档/${name}`, closedAt, progress: 0.42, pinned: false, ...more });
const opts = { now, group: "time" as const, expanded: new Set<string>(), query: "" };

test("a file falls in the bucket of when it closed", () => {
  expect(bucketOf(at(11, 2, 16, 45), now)).toBe("now");
  expect(bucketOf(at(11, 2, 14, 5), now)).toBe("pm");
  expect(bucketOf(at(11, 2, 9, 15), now)).toBe("am");
  expect(bucketOf(at(11, 1, 23, 59), now)).toBe("y");
  expect(bucketOf(at(10, 27), now)).toBe("w");
  expect(bucketOf(at(10, 10), now)).toBe("m");
  expect(bucketOf(at(9, 1), now)).toBe("o");
});

test("times and spans read as the light table words them", () => {
  expect(timeLabel(at(11, 2, 9, 5), now)).toBe("今天 9:05");
  expect(timeLabel(at(11, 1, 22, 10), now)).toBe("昨天 22:10");
  expect(timeLabel(at(10, 31), now)).toBe("10月31日");
  expect(rangeLabel([at(11, 1, 9), at(11, 1, 20)], false)).toBe("11月1日");
  expect(rangeLabel([at(10, 31), at(10, 27)], false)).toBe("10月27日 – 31日");
  expect(rangeLabel([at(10, 3), at(10, 20)], true)).toBe("10月");
  expect(rangeLabel([at(9, 3), at(10, 1)], true)).toBe("9月 – 10月");
  expect(folderOf("/Users/me/Dew/文档/a.md")).toBe("Dew / 文档");
});

test("today shows as cards, older days fold into one block of stacks", () => {
  const v = vapor([file("a.md", at(11, 2, 16, 40)), file("b.md", at(11, 2, 13)), file("c.md", at(11, 1)), file("d.md", at(10, 28)), file("e.md", at(8, 1))], opts);
  expect(v.blocks.map((b) => (b.kind === "grid" ? `${b.label}:${b.cards.map((c) => c.name)}` : `stacks:${b.stacks.map((s) => `${s.label}${s.count}`)}`))).toEqual([
    "刚刚关闭:a.md",
    "今天 · 下午:b.md",
    "stacks:昨天1,最近 7 天1,更早1",
  ]);
  expect(v.blocks[0]!.kind === "grid" && v.blocks[0]!.anchor).toBe("today");
  expect(v.blocks[1]!.kind === "grid" && v.blocks[1]!.anchor).toBe(null);
  // Folded buckets jump to the block that folds them.
  expect(v.scrub.map((s) => `${s.label}>${s.target}`)).toEqual(["已打开>open", "今天>today", "昨天>y", "最近 7 天>y", "更早>y"]);
});

test("an expanded bucket shows its cards and can fold again", () => {
  const v = vapor([file("c.md", at(11, 1)), file("d.md", at(10, 28))], { ...opts, expanded: new Set(["y"]) });
  expect(v.blocks.map((b) => b.kind)).toEqual(["grid", "stacks"]);
  const y = v.blocks[0]!;
  expect(y.kind === "grid" && y.collapsible && y.cards[0]!.age).toBe(1);
});

test("a long today block shows seven cards and stacks the rest", () => {
  const files = Array.from({ length: 10 }, (_, i) => file(`p${i}.md`, at(11, 2, 15, 50 - i * 5)));
  const b = vapor(files, opts).blocks[0]!;
  expect(b.kind === "grid" && [b.cards.length, b.more, b.moreHint]).toEqual([7, 3, "15:20 之前"]);
  const all = vapor(files, { ...opts, expanded: new Set(["pm"]) }).blocks[0]!;
  expect(all.kind === "grid" && [all.cards.length, all.collapsible]).toEqual([10, true]);
});

test("pinned files sit apart, and a query narrows and opens everything", () => {
  const files = [file("会议纪要.md", at(1, 1), { pinned: true }), file("周报.md", at(10, 1)), file("会议 2.md", at(9, 1))];
  const v = vapor(files, { ...opts, query: "会议" });
  expect(v.pins.map((c) => [c.name, c.time])).toEqual([["会议纪要.md", "已钉住"]]);
  expect(v.blocks.map((b) => b.kind === "grid" && b.cards.map((c) => c.name).join())).toEqual(["会议 2.md"]);
});

test("by folder, files group under their folder's name", () => {
  const v = vapor([file("a.md", at(11, 2)), { ...file("b.md", at(11, 1)), path: "/x/个人/笔记/b.md" }], { ...opts, group: "folder" });
  expect(v.blocks.map((b) => b.kind === "grid" && `${b.label}:${b.count}`)).toEqual(["Dew / 文档:1", "个人 / 笔记:1"]);
  expect(v.scrub).toEqual([]);
});
