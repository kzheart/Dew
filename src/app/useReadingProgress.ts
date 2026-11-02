import { useCallback, useEffect, useRef } from "react";
import { host } from "../platform";

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
  // Scroll events come at most once a frame; reporting each one, rather than after a pause,
  // means a ⌘W right after scrolling still records where the reader stopped.
  const sent = useRef(-1);
  const track = useCallback((el: HTMLElement) => {
    const p = progressOf(el);
    if (Math.abs(p - sent.current) < 0.001) return;
    sent.current = p;
    void host.recent.report(p).catch(() => {});
  }, []);

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
