import { useCallback, useEffect, useRef, useState } from "react";
import { host, type Inspector } from "../platform";
import { settleUnseen } from "./hooks";

/** The 设置 inspector of the window's tab group, which the window changes for every tab of it. */
export function useInspector(initial: Inspector): [Inspector, (i: Partial<Inspector>) => void] {
  const [inspector, setInspector] = useState(initial);
  const latest = useRef(initial);
  useEffect(
    () =>
      host.files.followInspector((i) => {
        settleUnseen();
        latest.current = i;
        setInspector(i);
      }),
    [],
  );
  const update = useCallback((i: Partial<Inspector>) => {
    const next = { ...latest.current, ...i };
    if (next.open === latest.current.open && next.group === latest.current.group) return;
    latest.current = next;
    setInspector(next);
    void host.files.setInspector(next).catch(() => {});
  }, []);
  return [inspector, update];
}
