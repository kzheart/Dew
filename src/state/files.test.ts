import { expect, test } from "bun:test";
import type { FileTab } from "../mygo";
import { changes, dropState, fileStatus, withClosed } from "./files";

const tab = (id: number, more: Partial<FileTab> = {}): FileTab => ({ id, name: `${id}.md`, edited: false, untitled: false, current: false, ...more });

test("a tear is dirty while edited, empty while untitled, else saved", () => {
  expect(dropState(tab(1))).toBe("saved");
  expect(dropState(tab(1, { edited: true }))).toBe("dirty");
  expect(dropState(tab(1, { untitled: true }))).toBe("empty");
  expect(dropState(tab(1, { untitled: true, edited: true }))).toBe("dirty");
});

test("each tear state reads as a status", () => {
  expect(fileStatus(tab(1))).toBe("已保存 · 与磁盘同步");
  expect(fileStatus(tab(1, { edited: true }))).toBe("有未保存的修改");
  expect(fileStatus(tab(1, { untitled: true }))).toBe("尚未保存到磁盘");
});

test("a file that joins the group is born", () => {
  const c = changes([tab(1), tab(2)], [tab(1), tab(3, { untitled: true }), tab(2)]);
  expect(c.born).toEqual([3]);
  expect(c.saved).toEqual([]);
  expect(c.closed).toEqual([]);
});

test("saving edits ripples, including an untitled file's first save", () => {
  const c = changes([tab(1, { edited: true }), tab(2, { untitled: true, edited: true })], [tab(1), tab(2)]);
  expect(c.saved).toEqual([1, 2]);
});

test("edits undone on an untitled file or still unsaved do not ripple", () => {
  const prev = [tab(1, { untitled: true, edited: true }), tab(2, { edited: true }), tab(3)];
  const c = changes(prev, [tab(1, { untitled: true }), tab(2, { edited: true }), tab(3)]);
  expect(c.saved).toEqual([]);
  expect(changes([], [tab(1)]).saved).toEqual([]);
});

test("a file that leaves the group is closed where it stood", () => {
  const two = tab(2, { edited: true });
  const c = changes([tab(1), two, tab(3)], [tab(1), tab(3)]);
  expect(c.closed).toEqual([{ tab: two, index: 1 }]);
  expect(c.born).toEqual([]);
});

test("closed files stay in place while they fade out", () => {
  const shown = withClosed([tab(1, { current: true }), tab(4)], [{ tab: tab(3), index: 2 }, { tab: tab(2), index: 1 }]);
  expect(shown.map((t) => [t.id, t.closing])).toEqual([[1, false], [2, true], [3, true], [4, false]]);
  expect(shown[0]!.current).toBe(true);
});

test("a closed file that is back in the list shows once", () => {
  expect(withClosed([tab(1), tab(2)], [{ tab: tab(2), index: 1 }]).map((t) => [t.id, t.closing])).toEqual([[1, false], [2, false]]);
});
