import { useEffect, useRef } from "react";

const FLIGHT = 360;
const CLEAR = 540;

/** Where a box's point lies, as window coordinates. */
function at(sel: string, pick: (r: DOMRect) => [number, number]): [number, number] | null {
  const r = document.querySelector(sel)?.getBoundingClientRect();
  return r && r.width + r.height > 0 ? pick(r) : null;
}

/**
 * A new file's page as it arrives: a drop leaves the dock's 新建 button, lands where writing starts,
 * and its ripple clears the mist off the fresh page. Purely visual: the caret is live underneath.
 */
export function Condense({ onDone }: { onDone(): void }) {
  const root = useRef<HTMLDivElement>(null);
  const drop = useRef<HTMLSpanElement>(null);
  const ring = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = root.current!;
    let live = true;
    let done: ReturnType<typeof setTimeout> | undefined;
    let raf = requestAnimationFrame(() => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const [x0, y0] = at('.dock [aria-label="新建文件"]', (r) => [r.left + r.width / 2, r.top + r.height / 2]) ?? [w / 2, h - 40];
      const [x1, y1] = at("main .art-hint, main .cm-placeholder", (r) => [r.left + 2, r.top + r.height / 2]) ?? [w / 2, h * 0.3];
      el.style.setProperty("--x", `${x1}px`);
      el.style.setProperty("--y", `${y1}px`);

      // A thrown drop: up from the button, over the top of its arc, down onto the first line.
      const cx = (x0 + x1) / 2;
      const cy = Math.min(y0, y1) - 90;
      const path = Array.from({ length: 13 }, (_, i) => {
        const t = i / 12;
        const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t ** 2 * x1;
        const y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t ** 2 * y1;
        return { transform: `translate(${x}px,${y}px) scale(${0.35 + 0.65 * t})`, opacity: Math.min(1, t * 4) };
      });
      drop.current!.animate(path, { duration: FLIGHT, easing: "cubic-bezier(.4,.1,.7,1)", fill: "forwards" }).onfinish = () => {
        if (!live) return;
        drop.current?.animate(
          [
            { transform: `translate(${x1}px,${y1}px) scale(1.7,.45)`, opacity: 1 },
            { transform: `translate(${x1}px,${y1}px) scale(2.4,.2)`, opacity: 0 },
          ],
          { duration: 180, easing: "ease-out", fill: "forwards" },
        );
        ring.current?.animate(
          [
            { transform: `translate(${x1}px,${y1}px) scale(.2)`, opacity: 0.9 },
            { transform: `translate(${x1}px,${y1}px) scale(5)`, opacity: 0 },
          ],
          { duration: 700, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" },
        );
        const far = Math.hypot(Math.max(x1, w - x1), Math.max(y1, h - y1)) + 80;
        const start = performance.now();
        const clear = (now: number) => {
          const t = Math.min(1, (now - start) / CLEAR);
          el.style.setProperty("--r", `${(far + 70) * (1 - (1 - t) ** 3) - 70}px`);
          if (t < 1) raf = requestAnimationFrame(clear);
          // Stays a moment longer, so the drop falling into the dock finishes on its delay.
          else done = setTimeout(onDone, 260);
        };
        raf = requestAnimationFrame(clear);
      };
    });
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
  }, []);

  return (
    <div ref={root} className="condense" data-condense aria-hidden="true">
      <span className="cd-mist" />
      <span ref={ring} className="cd-ring" />
      <span ref={drop} className="cd-drop" />
    </div>
  );
}
