import { dropState, fileStatus, type DropState } from "../state/files";
import type { ShownFile } from "./useFiles";

/** A file's save state as a teardrop: full and blue when saved, low and amber while edited, empty before it has a file. */
export function Tear({ state, ripple = false }: { state: DropState; ripple?: boolean }) {
  return (
    <span className={`sc tear${state === "saved" ? "" : ` ${state}`}${ripple ? " ripple" : ""}`}>
      <span className="shell"><span className="lv"><span className="fill" /></span></span>
      <span className="hl" />
      <span className="tring" />
    </span>
  );
}

/** The files of the window's tab group, along the bottom of the window. */
export function Dock({ files, onSelect, onClose, onNew, onOverview }: {
  files: ShownFile[];
  onSelect(id: number): void;
  onClose(id: number): void;
  onNew(): void;
  onOverview(): void;
}) {
  return (
    <nav className="glass dock" aria-label="已打开的文件">
      {files.map((f) => {
        const state = dropState(f);
        const tip = `${f.name}，${fileStatus(f)}`;
        return (
          <div key={f.id} className={`dk${f.current ? " on" : ""}${f.closing ? " closing" : ""}${f.born ? " born" : ""}`}>
            <button className="dk-btn" aria-label={tip} aria-current={f.current ? "page" : undefined} onClick={() => !f.current && onSelect(f.id)}>
              <span className={state === "dirty" ? "m18 trem" : "m18"} aria-hidden="true"><Tear state={state} ripple={f.ripple} /></span>
              <span className="nm">{f.name}</span>
            </button>
            {!f.current && <span className="dk-tip" aria-hidden="true">{f.name}</span>}
            <button className="dk-x" aria-label={`关闭 ${f.name}`} title="关闭 ⌘W" onClick={() => onClose(f.id)}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        );
      })}
      <span className="dvs" aria-hidden="true" />
      <button className="gbtn" onClick={onNew} aria-label="新建文件" title="新建 ⌘N">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      <button className="gbtn" onClick={onOverview} aria-label="灯桌总览" title="灯桌总览 ⇧⌘\">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.5" /><rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
        </svg>
      </button>
    </nav>
  );
}
