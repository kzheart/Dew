import { useCallback, useEffect, useRef, useState } from "react";
import { host, type FileTab } from "../platform";
import { changes, withClosed, type Closed } from "../state/files";

export interface ShownFile extends FileTab {
  /** The page's own file, just joined to its group: its drop falls into the dock. A page never sees another file join, as a file joins in its own tab. */
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
  // Kept for the page's life: a class that sets an animation restarts it when it comes off and on.
  const born = initial.length > 1 ? initial.find((t) => t.current)?.id : undefined;
  const [saved, addSaved] = useMarks<number>(1150);
  const [closed, addClosed] = useMarks<Closed>(320);

  useEffect(() => {
    const take = (next: FileTab[]) => {
      const c = changes(last.current, next);
      last.current = next;
      setTabs(next);
      // A page in a background tab takes the change as is: it would show only the tail of an animation once it is selected.
      if (document.hidden) return;
      addSaved(c.saved);
      addClosed(c.closed);
    };
    const off = host.files.onChange(take);
    // What changed before the page listened.
    void host.files.list().then(take, () => {});
    return off;
  }, []);

  return withClosed(tabs, closed).map((t) => ({ ...t, born: t.id === born, ripple: saved.includes(t.id) }));
}
