import { useEffect, useRef, useState } from "react";
import { host, type Handoff } from "../platform";

/**
 * The page's side of a swap of windows. The page leaving fades its writing into a blank sheet of its own paper; the
 * page arriving starts on the same blank sheet. Go swaps the windows once both report, so the swap shows the same
 * frame on both sides. The chrome stays out of it: only the paper between the bars turns.
 */
type Phase = "off" | "covering" | "covered" | "revealing";

interface State {
  phase: Phase;
  part: Handoff;
}

const COVER = 120;
const REVEAL = 200;
const RIPPLE = 420;
// A page left blank, as when its swap failed, shows its writing again after this.
const STRANDED = 2000;

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Where a box's point lies once the entrance animations in main moved it home: they wait, paused, under the sheet. */
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

export function Veil({ part }: { part: Handoff }) {
  const [s, setS] = useState<State>(() => ({ phase: part.role ? "covered" : "off", part }));
  const el = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const drifting = useRef<Animation | undefined>(undefined);
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
        // A page that left in a swap and comes back to the front shows its writing again.
        setS((x) => ({ ...x, phase: x.part.role === "in" && !still() ? "revealing" : "off" }));
      }
    };
    document.addEventListener("visibilitychange", seen);
    return () => document.removeEventListener("visibilitychange", seen);
  }, []);

  useEffect(() => {
    const v = el.current;
    if (!v) return;
    if (s.phase === "covering") {
      const fade = v.animate([{ opacity: 0 }, { opacity: 1 }], { duration: COVER, easing: "ease-in", fill: "forwards" });
      const drift = document.querySelector("main")?.animate([{ transform: "none" }, { transform: "translateY(-6px)" }], { duration: COVER, easing: "ease-in", fill: "forwards" });
      fade.onfinish = () => {
        setS((x) => ({ ...x, phase: "covered" }));
        void host.files.covered().catch(() => {});
      };
      // The drift holds while covered, and is undone once the sheet goes.
      drifting.current = drift;
      return () => fade.cancel();
    }
    if (s.phase === "covered" && !document.hidden) {
      const t = setTimeout(off, STRANDED);
      return () => clearTimeout(t);
    }
    if (s.phase === "revealing") {
      const fade = v.animate([{ opacity: 1 }, { opacity: 0 }], { duration: REVEAL, easing: "ease-out", fill: "forwards" });
      if (s.part.kind !== "new") {
        fade.onfinish = off;
        return () => fade.cancel();
      }
      const [x, y] = at("main .art-hint, main .cm-placeholder") ?? [innerWidth / 2, innerHeight * 0.3];
      const ripple = ring.current!.animate(
        [
          { transform: `translate(${x}px,${y}px) scale(.2)`, opacity: 0.7 },
          { transform: `translate(${x}px,${y}px) scale(3)`, opacity: 0 },
        ],
        { duration: RIPPLE, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" },
      );
      ripple.onfinish = off;
      return () => {
        fade.cancel();
        ripple.cancel();
      };
    }
  }, [s]);

  useEffect(() => {
    if (s.phase === "off") {
      drifting.current?.cancel();
      drifting.current = undefined;
    }
  }, [s.phase]);

  if (s.phase === "off") return null;
  const held = s.phase === "covered" && s.part.role === "in";
  return (
    <>
      <div ref={el} className={`veil ${s.phase}${held ? " held" : ""}`} data-veil={s.phase} data-kind={s.part.kind} aria-hidden="true" />
      <span ref={ring} className="veil-ring" aria-hidden="true" />
    </>
  );
}
