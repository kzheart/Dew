import { useCallback, useEffect, useRef } from "react";
import { host } from "../platform";

const REPORT_DELAY = 250;
/** How long a restored position follows the page while diagrams and images take their height. */
const SETTLE_MS = 2500;

const progressOf = (el: HTMLElement) => {
  const max = el.scrollHeight - el.clientHeight;
  return max > 0 ? Math.min(1, el.scrollTop / max) : 0;
};

/**
 * Tells Go how far the document is read, so that closing the window records it, and scrolls a
 * reopened document back to where it was read to. Returns what the scroll handlers call.
 */
export function useReadingProgress(scroller: () => HTMLElement | null, resume: number) {
  const unsent = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const p = unsent.current;
    if (p === null) return;
    unsent.current = null;
    void host.recent.report(p).catch(() => {});
  }, []);

  const track = useCallback(
    (el: HTMLElement) => {
      unsent.current = progressOf(el);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, REPORT_DELAY);
    },
    [flush],
  );

  useEffect(() => {
    window.addEventListener("blur", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("blur", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [flush]);

  const latest = useRef(scroller);
  latest.current = scroller;
  useEffect(() => {
    if (resume <= 0) return;
    const el = latest.current();
    if (!el) return;
    let following = true;
    const apply = () => {
      const max = el.scrollHeight - el.clientHeight;
      if (following && max > 0) el.scrollTop = resume * max;
    };
    // The user scrolling takes over from the restored position.
    const stop = () => (following = false);
    const grow = new ResizeObserver(apply);
    const content = el.querySelector("article, .cm-content");
    if (content) grow.observe(content);
    apply();
    const done = setTimeout(() => {
      stop();
      grow.disconnect();
    }, SETTLE_MS);
    const takeover = ["wheel", "pointerdown", "keydown"] as const;
    for (const t of takeover) window.addEventListener(t, stop, { capture: true });
    return () => {
      clearTimeout(done);
      grow.disconnect();
      for (const t of takeover) window.removeEventListener(t, stop, { capture: true });
    };
  }, [resume]);

  return track;
}
