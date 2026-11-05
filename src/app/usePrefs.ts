import { useCallback, useEffect, useRef, useState } from "react";
import { host, type Prefs } from "../platform";
import { changedKeys, sharedChange } from "../state/prefs";
import { settleUnseen, useDebouncedEffect } from "./hooks";

/**
 * The preferences as the window reads them, with what other windows change, and saving what it
 * changes. view is the window's own view, which saves as the one new windows open in.
 */
export function usePrefs(initial: Prefs, view?: Pick<Prefs, "base" | "source">): [Prefs, (p: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState(initial);
  const update = useCallback((p: Partial<Prefs>) => setPrefs((old) => ({ ...old, ...p })), []);
  // Only what this window changed, so that it never puts back what another window changed meanwhile.
  const saved = useRef(initial);
  useDebouncedEffect({ ...prefs, ...view }, 300, (p) => {
    const keys = changedKeys(saved.current, p);
    saved.current = p;
    if (keys.length) void host.prefs.update(p, keys).catch(() => {});
  });
  useEffect(
    () =>
      host.prefs.follow(initial, (p, keys) => {
        const change = sharedChange(p, keys);
        if (Object.keys(change).length) settleUnseen();
        // Saved as taken, so that this window doesn't send it back.
        saved.current = { ...saved.current, ...change };
        update(change);
      }),
    [update],
  );
  return [prefs, update];
}
