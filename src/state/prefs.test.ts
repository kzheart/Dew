import { expect, test } from "bun:test";
import { defaultPrefs } from "../defaultPrefs";
import { sharedChange } from "./prefs";

test("a window takes what another changed, but not its view", () => {
  const p = { ...defaultPrefs, bg: "paper" as const, fs: 19, base: "preview" as const, source: "split" as const };
  expect(sharedChange(p, ["bg", "fs", "base", "source"])).toEqual({ bg: "paper", fs: 19 });
});
