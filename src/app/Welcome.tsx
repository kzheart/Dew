import { useCallback, useEffect, useRef, useState } from "react";
import { host, type Command, type Prefs } from "../platform";
import { fileName, welcomeRows } from "../state/recent";
import { glassStyle } from "../state/settings";
import { usePresence } from "./hooks";
import { LightTable } from "./LightTable";
import { QuickOpen } from "./QuickOpen";
import { Toasts, useToasts } from "./Toasts";
import { useRecent } from "./useRecent";

type Overlay = "palette" | "table" | null;

const newFile = () => void host.files.new().catch(() => {});

/** The page of the window the app shows while no document is open: start a file, or find a recent one again. */
export function Welcome({ prefs }: { prefs: Prefs }) {
  const recent = useRecent();
  const rows = welcomeRows(recent, Date.now());
  const [overlay, setOverlay] = useState<Overlay>(null);
  const palette = usePresence(overlay === "palette", 200);
  const table = usePresence(overlay === "table", 240);
  const close = useCallback(() => setOverlay(null), []);
  const toggle = (o: Exclude<Overlay, null>) => setOverlay((now) => (now === o ? null : o));

  const toasts = useToasts();
  const { notify } = toasts;
  const openPath = useCallback(
    (path: string) =>
      void host.files.open(path).catch(() => notify({ icon: "warn", title: `打不开 ${fileName(path)}`, detail: "它可能已被移动或删除" })),
    [notify],
  );

  // Only the commands that need no document; the rest have nothing to act on here.
  const onCommand = useRef<(c: Command) => void>(() => {});
  onCommand.current = (c) => {
    if (c === "quickOpen") toggle("palette");
    else if (c === "overview") toggle("table");
  };
  useEffect(() => host.onCommand((c) => onCommand.current(c)), []);

  const theme = prefs.bg === "night" ? " th-night" : prefs.bg === "paper" ? " th-paper" : "";

  return (
    <div style={glassStyle(prefs.glass)} className={`app welcome${theme}${overlay === "table" ? " lt-on" : ""}`}>
      <div className="wel-drag" aria-hidden="true" />
      <main className={`wel bg-${prefs.bg}`} aria-label="欢迎">
        <div className="wel-in">
          <span className="wel-tear" aria-hidden="true">
            <span className="sc tear"><span className="shell"><span className="lv"><span className="fill" /></span></span><span className="hl" /></span>
          </span>
          <h1>Dew</h1>
          <div className="wel-acts">
            <button className="wbtn pri" onClick={newFile}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>新建<kbd>⌘N</kbd>
            </button>
            <button className="wbtn" onClick={() => setOverlay("palette")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>快速打开<kbd>⌘P</kbd>
            </button>
            <button className="wbtn" onClick={() => setOverlay("table")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
                <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.5" /><rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
              </svg>灯桌
            </button>
          </div>
          {rows.length > 0 && (
            <section className="wrec" aria-label="最近">
              <div className="wrec-h" aria-hidden="true">最近</div>
              {rows.map((r) => (
                <button key={r.file.path} className="wrow" onClick={() => openPath(r.file.path)} aria-label={`重新打开 ${r.name}`}>
                  <span className="m14" aria-hidden="true"><span className="sc tear gone"><span className="shell"><span className="lv"><span className="fill" /></span></span></span></span>
                  <span className="wn">{r.name}</span>
                  <span className="wf">{r.folder}</span>
                  <span className="wt">{r.time}</span>
                </button>
              ))}
            </section>
          )}
        </div>
      </main>
      <Toasts toasts={toasts.toasts} onDismiss={toasts.dismiss} />
      {palette.mounted && <QuickOpen files={[]} recent={recent} leaving={palette.leaving} onSelect={() => {}} onOpenPath={openPath} onClose={close} />}
      {table.mounted && (
        <LightTable
          files={[]}
          recent={recent}
          text=""
          leaving={table.leaving}
          onSelect={() => {}}
          onCloseFile={() => {}}
          onReopen={(path) => {
            close();
            openPath(path);
          }}
          onNew={() => {
            close();
            newFile();
          }}
          onClose={close}
        />
      )}
    </div>
  );
}
