import { expect, test } from "bun:test";
import { modeOf, viewReducer, type ViewAction, type ViewState } from "./view";

const run = (s: ViewState, ...actions: ViewAction[]) => actions.reduce(viewReducer, s);
const live: ViewState = { base: "live", source: null };

test("the four modes", () => {
  expect(modeOf(live)).toBe("live");
  expect(modeOf({ base: "preview", source: null })).toBe("preview");
  expect(modeOf({ base: "preview", source: "full" })).toBe("edit");
  expect(modeOf({ base: "live", source: "split" })).toBe("split");
});

test("turning the source off returns to the base mode", () => {
  const s = run(live, { type: "base", base: "preview" }, { type: "toggleSource" }, { type: "layout", layout: "split" });
  expect(modeOf(s)).toBe("split");
  expect(modeOf(run(s, { type: "toggleSource" }))).toBe("preview");
});

test("picking a base mode hides the source", () => {
  expect(run({ base: "preview", source: "split" }, { type: "base", base: "live" })).toEqual(live);
});

test("the layout only changes while the source shows", () => {
  expect(run(live, { type: "layout", layout: "split" })).toEqual(live);
});

test("shortcuts toggle their layout", () => {
  expect(modeOf(run(live, { type: "toggleLayout", layout: "split" }))).toBe("split");
  expect(modeOf(run(live, { type: "toggleLayout", layout: "split" }, { type: "toggleLayout", layout: "split" }))).toBe("live");
  expect(modeOf(run(live, { type: "toggleLayout", layout: "split" }, { type: "toggleLayout", layout: "full" }))).toBe("edit");
});

test("locating a block keeps a split a split", () => {
  expect(modeOf(run({ base: "preview", source: null }, { type: "locate" }))).toBe("edit");
  expect(modeOf(run({ base: "preview", source: "split" }, { type: "locate" }))).toBe("split");
});
