import { expect, test } from "bun:test";
import { modeOf, viewReducer, type ViewAction, type ViewState } from "./view";

const run = (s: ViewState, ...actions: ViewAction[]) => actions.reduce(viewReducer, s);
const live: ViewState = { base: "live", source: null, layout: "full" };

test("the four modes", () => {
  expect(modeOf(live)).toBe("live");
  expect(modeOf({ ...live, base: "preview" })).toBe("preview");
  expect(modeOf({ ...live, base: "preview", source: "full" })).toBe("edit");
  expect(modeOf({ ...live, source: "split", layout: "split" })).toBe("split");
});

test("turning the source off returns to the base mode", () => {
  const s = run(live, { type: "base", base: "preview" }, { type: "toggleSource" }, { type: "layout", layout: "split" });
  expect(modeOf(s)).toBe("split");
  expect(modeOf(run(s, { type: "toggleSource" }))).toBe("preview");
});

test("picking a base mode hides the source", () => {
  expect(modeOf(run({ ...live, base: "preview", source: "split", layout: "split" }, { type: "base", base: "live" }))).toBe("live");
});

test("the source shows again the way it last showed", () => {
  const split = run(live, { type: "toggleSource" }, { type: "layout", layout: "split" }, { type: "base", base: "live" });
  expect(modeOf(split)).toBe("live");
  expect(modeOf(run(split, { type: "toggleSource" }))).toBe("split");
  expect(modeOf(run(split, { type: "toggleSource" }, { type: "layout", layout: "full" }, { type: "toggleSource" }, { type: "toggleSource" }))).toBe("edit");
});

test("the layout only changes while the source shows", () => {
  expect(run(live, { type: "layout", layout: "split" })).toEqual(live);
});

test("shortcuts toggle their layout", () => {
  expect(modeOf(run(live, { type: "toggleLayout", layout: "split" }))).toBe("split");
  expect(modeOf(run(live, { type: "toggleLayout", layout: "split" }, { type: "toggleLayout", layout: "split" }))).toBe("live");
  expect(modeOf(run(live, { type: "toggleLayout", layout: "split" }, { type: "toggleLayout", layout: "full" }))).toBe("edit");
});
