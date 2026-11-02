import { expect, test } from "bun:test";
import { defaultPrefs } from "../defaultPrefs";
import { glassLevel, isModified, shownRows } from "./settings";

const ids = (rows: ReturnType<typeof shownRows>) => rows.map((g) => `${g.group}:${g.rows.map((r) => r.id).join(",")}`);

test("without a query, the picked group's rows show", () => {
  expect(ids(shownRows("look", ""))).toEqual(["look:bg,ff,fs,lh,pg,mw,glass"]);
  expect(ids(shownRows("file", " "))).toEqual(["file:keep,clear"]);
});

test("a query finds rows across groups by their keywords", () => {
  expect(ids(shownRows("look", "水印"))).toEqual(["export:watermark"]);
  expect(ids(shownRows("keys", "记录"))).toEqual(["file:keep,clear"]);
  expect(ids(shownRows("look", "PDF"))).toEqual(["export:pdf"]);
  expect(shownRows("look", "主题")).toEqual([]);
});

test("a row is modified when its preference differs from the defaults", () => {
  expect(isModified(defaultPrefs, "fs")).toBe(false);
  expect(isModified({ ...defaultPrefs, fs: 18 }, "fs")).toBe(true);
  expect(isModified({ ...defaultPrefs, pageGuard: { ...defaultPrefs.pageGuard } }, "pageGuard")).toBe(false);
  expect(isModified({ ...defaultPrefs, pageGuard: { ...defaultPrefs.pageGuard, image: true } }, "pageGuard")).toBe(true);
});

test("the glass setting picks clear, default or frosted", () => {
  expect([0, 2, 3, 4, 6, 7, 10].map(glassLevel)).toEqual(["clear", "clear", "default", "default", "default", "frost", "frost"]);
});
