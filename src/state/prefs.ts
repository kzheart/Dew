import type { Prefs } from "../mygo";

/** The keys whose values differ between two sets of preferences. */
export function changedKeys(a: Prefs, b: Prefs): (keyof Prefs)[] {
  return (Object.keys(b) as (keyof Prefs)[]).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}
