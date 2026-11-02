import { useCallback, useEffect, useRef, useState } from "react";
import { host, type FileTab } from "../platform";
import { changes, withClosed, type Closed } from "../state/files";

export interface ShownFile extends FileTab {
  /** Just joined the group: its drop falls into the dock. */
  born: boolean;
  /** Its edits were just saved: a ring ripples off its tear. */
  ripple: boolean;
  /** Just left the group: it fades out where it stood. */
  closing: boolean;
}

/** Items that each drop out ms after they were added. */
function useMarks<T>(ms: number): [T[], (items: T[]) => void] {
  const [items, setItems] = useState<T[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const add = useCallback(
    (more: T[]) => {
      if (!more.length) return;
      setItems((xs) => [...xs, ...more]);
      const t = setTimeout(() => {
        timers.current.delete(t);
        setItems((xs) => xs.filter((x) => !more.includes(x)));
      }, ms);
      timers.current.add(t);
    },
    [ms],
  );
  return [items, add];
}

/** The files of the window's tab group, as the dock and the light table show them. */
export function useFiles(initial: FileTab[]): ShownFile[] {
  const [tabs, setTabs] = useState(initial);
  const last = useRef(initial);
  const [born, addBorn] = useMarks<number>(820);
  const [saved, addSaved] = useMarks<number>(1150);
  const [closed, addClosed] = useMarks<Closed>(320);

  useEffect(() => {
    // A file opened into a group drops into its dock as its page shows.
    if (initial.length > 1) addBorn(initial.filter((t) => t.current).map((t) => t.id));
    const take = (next: FileTab[]) => {
      const c = changes(last.current, next);
      last.current = next;
      setTabs(next);
      addBorn(c.born);
      addSaved(c.saved);
      addClosed(c.closed);
    };
    const off = host.files.onChange(take);
    // What changed before the page listened.
    void host.files.list().then(take, () => {});
    return off;
  }, []);

  return withClosed(tabs, closed).map((t) => ({ ...t, born: born.includes(t.id), ripple: saved.includes(t.id) }));
}
