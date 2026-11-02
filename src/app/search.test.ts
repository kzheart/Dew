import { expect, test } from "bun:test";
import { findHits, hitLabel, htmlText, markText, stepHit } from "./search";

test("a search finds the units that contain the query, ignoring case, and nothing for a blank one", () => {
  const lines = ["export function sync(src: Pane) {", "  const map = build(src.doc);", "  view.onScroll(() => map);", "}"];
  expect(findHits(lines, "MAP")).toEqual([1, 2]);
  expect(findHits(lines, "src")).toEqual([0, 1]);
  expect(findHits(lines, "  ")).toEqual([]);
  expect(findHits(lines, "nothing")).toEqual([]);
});

test("stepping through hits wraps at both ends, and the label counts from one", () => {
  expect(stepHit(2, 3, 1)).toBe(0);
  expect(stepHit(0, 3, -1)).toBe(2);
  expect(stepHit(0, 0, 1)).toBe(0);
  expect(hitLabel("大纲", 0, 1)).toBe("1 / 1");
  expect(hitLabel("x", 0, 0)).toBe("0 / 0");
  expect(hitLabel(" ", 0, 0)).toBe("");
});

test("a cell's text reads through tags and entities", () => {
  expect(htmlText("<kbd>⌘1</kbd>")).toBe("⌘1");
  expect(htmlText("a &lt;b&gt; &amp; <code>c</code>&#39;&#x4e2d;")).toBe("a <b> & c'中");
});

test("matches are marked in the HTML, in pieces where they cross a tag", () => {
  expect(markText("智能悬浮大纲", "大纲")).toBe("智能悬浮<mark>大纲</mark>");
  expect(markText('<span class="tk-kw">def</span> build', "F B")).toBe('<span class="tk-kw">de<mark>f</mark></span><mark> b</mark>uild');
  expect(markText("a &lt; b", "< B")).toBe("a <mark>&lt; b</mark>");
  expect(markText("Map map", "map")).toBe("<mark>Map</mark> <mark>map</mark>");
  expect(markText("<b>x</b>", "")).toBe("<b>x</b>");
});
