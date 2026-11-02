import { useCallback, useEffect, useRef, useState } from "react";
import { host, type DocumentState } from "../platform";

const SEND_DELAY = 150;

/**
 * The document's text, which the page owns while the user types: it goes to
 * Go a moment after each change, and at once on blur and before saving, so
 * that Go never saves older text than the page shows.
 */
export function useDocument(initial: { text: string; state: DocumentState }) {
  const [text, setText] = useState(initial.text);
  const [state, setState] = useState(initial.state);
  /** Bumped when the text came from the file rather than from typing. */
  const [revision, setRevision] = useState(0);
  const unsent = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const t = unsent.current;
    if (t === null) return;
    unsent.current = null;
    await host.doc.setContent(t);
  }, []);

  const edit = useCallback(
    (next: string) => {
      setText(next);
      unsent.current = next;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SEND_DELAY);
    },
    [flush],
  );

  const save = useCallback(async () => {
    await flush();
    await host.doc.save().catch(() => {});
  }, [flush]);

  useEffect(() => {
    const offState = host.doc.onState(setState);
    const offReload = host.doc.onReload(async () => {
      clearTimeout(timer.current);
      unsent.current = null;
      setText(await host.doc.content());
      setRevision((r) => r + 1);
    });
    const onBlur = () => void flush();
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", onBlur);
    return () => {
      offState();
      offReload();
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onBlur);
    };
  }, [flush]);

  return { text, edit, state, revision, flush, save };
}
