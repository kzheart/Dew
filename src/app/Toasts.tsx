import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { NoticeIcon } from "../assist/paste";
import type { ToastSpec } from "../assist/smartPaste";

const LIFETIME = 6000;
const LEAVE_MS = 200;
const MAX_SHOWN = 3;

interface Toast extends ToastSpec {
  id: number;
  leaving: boolean;
}

/** The toasts at the window's bottom right: newest at the bottom, each gone after a few seconds. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  /** The toasts not yet dismissed, oldest first. */
  const live = useRef(new Map<number, ToastSpec>());

  const dismiss = useCallback((id: number) => {
    const spec = live.current.get(id);
    if (!spec) return;
    live.current.delete(id);
    spec.onClose?.();
    setToasts((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), LEAVE_MS);
  }, []);

  const notify = useCallback(
    (spec: ToastSpec) => {
      const id = ++nextId.current;
      live.current.set(id, spec);
      setToasts((all) => [...all, { ...spec, id, leaving: false }]);
      for (const old of [...live.current.keys()].slice(0, -MAX_SHOWN)) dismiss(old);
      return () => dismiss(id);
    },
    [dismiss],
  );

  return { toasts, notify, dismiss };
}

const ICONS: Record<NoticeIcon, ReactNode> = {
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  rich: <path d="M4 7h16M4 12h10M4 17h7" />,
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M10 4v16" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 17l-5-5-8 8" />
    </>
  ),
  warn: <path d="M12 4l9 16H3zM12 10v4M12 17h.01" />,
};

function ToastView({ toast, onDismiss }: { toast: Toast; onDismiss(id: number): void }) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const start = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onDismiss(toast.id), LIFETIME);
  }, [toast.id, onDismiss]);
  useEffect(() => {
    start();
    return () => clearTimeout(timer.current);
  }, [start]);

  return (
    <div className={`toast t-${toast.icon}${toast.leaving ? " out" : ""}`} onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={start}>
      <span className="toast-ico" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {ICONS[toast.icon]}
        </svg>
      </span>
      <span className="toast-text">
        <b>{toast.title}</b>
        <small title={toast.detail}>{toast.detail}</small>
      </span>
      {toast.action && (
        <button
          type="button"
          className="toast-act"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            toast.action!.run();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss(id: number): void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <ToastView key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
