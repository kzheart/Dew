import { useEffect, useRef, useState } from "react";

/** Keeps something mounted for ms after it closes, while its exit animation plays. */
export function usePresence(open: boolean, ms: number): { mounted: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [open, ms]);
  return { mounted: open || mounted, leaving: !open && mounted };
}

/** A value that falls back to null ms after it was set. */
export function useTransient<T>(ms: number): [T | null, (v: T) => void] {
  const [value, setValue] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [
    value,
    (v: T) => {
      setValue(v);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setValue(null), ms);
    },
  ];
}

/** Calls fn after the value, compared as JSON, stops changing for ms. */
export function useDebouncedEffect<T>(value: T, ms: number, fn: (v: T) => void) {
  const first = useRef(true);
  const latest = useRef({ fn, value });
  latest.current = { fn, value };
  const key = JSON.stringify(value);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => latest.current.fn(latest.current.value), ms);
    return () => clearTimeout(t);
  }, [key, ms]);
}
