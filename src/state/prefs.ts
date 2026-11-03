import type { Prefs } from "../mygo";

/** The keys whose values differ between two sets of preferences. */
export function changedKeys(a: Prefs, b: Prefs): (keyof Prefs)[] {
  return (Object.keys(b) as (keyof Prefs)[]).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

/** What a window takes of another window's change: all but its own view, which each window picks for itself. */
export function sharedChange(p: Prefs, keys: (keyof Prefs)[]): Partial<Prefs> {
  return Object.fromEntries(keys.filter((k) => k !== "base" && k !== "source").map((k) => [k, p[k]]));
}
