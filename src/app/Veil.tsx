import { useEffect, useRef, useState } from "react";
import { host, type Handoff } from "../platform";

/**
 * The page's side of a swap of windows. The page leaving covers itself in mist from where it was clicked; the page
 * arriving starts under the same mist. Go swaps the windows once both report, so the swap shows the same frame on
 * both sides, and the arriving page clears the mist once it is the one shown.
 */
type Phase = "off" | "covering" | "covered" | "revealing";

interface State {
  phase: Phase;
  part: Handoff;
}

const COVER = 240;
const CLEAR = 420;
const FADE = 280;
// A page left under its mist, as when its swap failed, clears after this.
const STRANDED = 2000;

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = (t: number) => 1 - (1 - t) ** 3;

let press = { x: 0, y: 0, at: -Infinity };
window.addEventListener("pointerdown", (e) => (press = { x: e.clientX, y: e.clientY, at: performance.now() }), true);

/** Where a box's point lies once the entrance animations in main moved it home: they wait, paused, under the mist. */
function at(sel: string): [number, number] | null {
  const el = document.querySelector(sel);
  const r = el?.getBoundingClientRect();
  if (!el || !r || r.width + r.height === 0) return null;
  let [x, y] = [r.left + 2, r.top + r.height / 2];
  for (let a = el.parentElement; a && a.closest("main"); a = a.parentElement) {
    const t = getComputedStyle(a).transform;
    if (t === "none") continue;
    const m = new DOMMatrixReadOnly(t);
    x -= m.m41;
    y -= m.m42;
  }
  return [x, y];
}

/** Grows (or, clearing, shrinks) the mist's edge around x, y over ms, through --r. */
function sweep(el: HTMLElement, [x, y]: [number, number], ms: number, done: () => void) {
  const far = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 80;
  el.style.setProperty("--x", `${x}px`);
  el.style.setProperty("--y", `${y}px`);
  const start = performance.now();
  let raf = 0;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    el.style.setProperty("--r", `${(far + 60) * ease(t) - 60}px`);
    if (t < 1) raf = requestAnimationFrame(step);
    else done();
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

export function Veil({ part }: { part: Handoff }) {
  const [s, setS] = useState<State>(() => ({ phase: part.role ? "covered" : "off", part }));
  const el = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const phase = useRef(s.phase);
  phase.current = s.phase;
  const off = () => setS((x) => ({ ...x, phase: "off" }));

  useEffect(() => {
    if (part.role === "in") void host.files.ready().catch(() => {});
    if (part.role === "out") void host.files.covered().catch(() => {});
    return host.files.onHandoff((h) => {
      if (h.role === "in") {
        setS({ phase: "covered", part: h });
        void host.files.ready().catch(() => {});
      } else if (document.hidden || still()) {
        setS({ phase: "covered", part: h });
        void host.files.covered().catch(() => {});
      } else {
        setS({ phase: "covering", part: h });
      }
    });
  }, []);

  useEffect(() => {
    const seen = () => {
      if (document.hidden) {
        if (phase.current !== "off") off();
      } else if (phase.current === "covered") {
        setS((x) => (x.part.role === "in" ? { ...x, phase: still() ? "off" : "revealing" } : x));
      }
    };
    document.addEventListener("visibilitychange", seen);
    return () => document.removeEventListener("visibilitychange", seen);
  }, []);

  useEffect(() => {
    const v = el.current;
    if (!v) return;
    if (s.phase === "covering") {
      const recent = performance.now() - press.at < 1000;
      return sweep(v, recent ? [press.x, press.y] : [innerWidth / 2, innerHeight / 2], COVER, () => {
        setS((x) => ({ ...x, phase: "covered" }));
        void host.files.covered().catch(() => {});
      });
    }
    if (s.phase === "covered" && !document.hidden) {
      const t = setTimeout(off, STRANDED);
      return () => clearTimeout(t);
    }
    if (s.phase === "revealing") {
      if (s.part.kind !== "new") {
        const a = v.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE, easing: "ease-out", fill: "forwards" });
        a.onfinish = off;
        return () => a.cancel();
      }
      const p = at("main .art-hint, main .cm-placeholder") ?? [innerWidth / 2, innerHeight * 0.3];
      ring.current?.animate(
        [
          { transform: `translate(${p[0]}px,${p[1]}px) scale(.2)`, opacity: 0.9 },
          { transform: `translate(${p[0]}px,${p[1]}px) scale(5)`, opacity: 0 },
        ],
        { duration: CLEAR, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" },
      );
      return sweep(v, p, CLEAR, off);
    }
  }, [s]);

  if (s.phase === "off") return null;
  const held = s.phase === "covered" && s.part.role === "in";
  return (
    <div ref={el} className={`veil ${s.phase}${held ? " held" : ""}`} data-veil={s.phase} data-kind={s.part.kind} aria-hidden="true">
      <span ref={ring} className="veil-ring" />
    </div>
  );
}
