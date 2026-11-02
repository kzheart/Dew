import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { host, type FolderFile, type RecentFile } from "../platform";
import { dropState } from "../state/files";
import { quickOpen, type QuickItem } from "../state/quickOpen";
import { folderOf, timeLabel } from "../state/recent";
import { Tear } from "./Dock";
import type { ShownFile } from "./useFiles";

function Row({ item, selected, onPick, onHover }: { item: QuickItem; selected: boolean; onPick(): void; onHover(): void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const { before, hit, after } = item.match;
  let path: string;
  let meta: string | null = null;
  let progress = 0;
  switch (item.kind) {
    case "open":
      path = item.tab.untitled ? "尚未保存到磁盘" : folderOf(item.tab.path);
      break;
    case "recent":
      progress = Math.round(item.file.progress * 100);
      path = `${folderOf(item.file.path)}${progress ? ` · 读到 ${progress}%` : ""}`;
      meta = item.file.pinned ? "已钉住" : timeLabel(item.file.closedAt, Date.now()).replace("今天 ", "");
      break;
    case "folder":
      path = folderOf(item.file.path);
      break;
  }
  return (
    <button ref={ref} className={selected ? "qit sel" : "qit"} role="option" aria-selected={selected} onClick={onPick} onMouseEnter={onHover}>
      {item.kind === "open" && <span className="m22" aria-hidden="true"><Tear state={dropState(item.tab)} /></span>}
      {item.kind === "recent" && (
        <span className="m22" aria-hidden="true"><span className="sc tear gone"><span className="shell"><span className="lv"><span className="fill" /></span></span></span></span>
      )}
      {item.kind === "folder" && (
        <span className="qfi" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
        </span>
      )}
      <span className="qnw">
        <span className="qn">{before}<b>{hit}</b>{after}</span>
        <span className="qpt">{path}</span>
      </span>
      {progress > 0 && <span className="qprog"><i style={{ width: `${progress}%` }} /></span>}
      {meta && <span className="qmt">{meta}</span>}
      {item.kind === "open" && item.tab.current && <span className="qbadge">当前</span>}
      {selected && <span className="qret">↩</span>}
    </button>
  );
}

/** ⌘P 快速打开: the group's files, the recent ones and those beside this one, by name. */
export function QuickOpen({ files, recent, leaving, onSelect, onOpenPath, onClose }: {
  files: ShownFile[];
  recent: RecentFile[];
  leaving: boolean;
  onSelect(id: number): void;
  onOpenPath(path: string): void;
  onClose(): void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [folder, setFolder] = useState<FolderFile[]>([]);
  useEffect(() => void host.files.folder().then(setFolder, () => {}), []);

  const tabs = files.filter((f) => !f.closing);
  const sections = useMemo(() => quickOpen({ tabs, recent, folder, query: q }), [tabs, recent, folder, q]);
  const flat = sections.flatMap((s) => s.items);
  const at = Math.min(sel, Math.max(0, flat.length - 1));
  const name = q.trim();

  const pick = (item: QuickItem) => {
    onClose();
    if (item.kind === "open") {
      if (!item.tab.current) onSelect(item.tab.id);
    } else onOpenPath(item.file.path);
  };
  const create = () => {
    onClose();
    void host.files.create(name).catch((e) => console.error("create failed", e));
  };
  const key = (e: KeyboardEvent) => {
    const last = Math.max(0, flat.length - 1);
    if (e.key === "ArrowDown") setSel((s) => Math.min(last, Math.min(s, last) + 1));
    else if (e.key === "ArrowUp") setSel((s) => Math.max(0, Math.min(s, last) - 1));
    else if (e.key === "Enter") {
      if (flat[at]) pick(flat[at]);
      else if (name) create();
    } else if (e.key === "Escape") onClose();
    else return;
    e.preventDefault();
  };

  let index = 0;
  return (
    <div className={leaving ? "qback out" : "qback"} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="qpal" role="dialog" aria-label="快速打开">
        <div className="qq">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#55555A" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <label htmlFor="qo-in" className="sr">快速打开</label>
          <input
            id="qo-in"
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={key}
            placeholder="输入文件名…"
            autoComplete="off"
            autoFocus
          />
          <span className="qesc">esc</span>
        </div>
        <div className="qlist" role="listbox" aria-label="匹配的文件">
          {sections.map((s) => (
            <div key={s.label} role="group" aria-label={s.label}>
              <div className="qsh">{s.label}</div>
              {s.items.map((item) => {
                const i = index++;
                return <Row key={`${item.kind}-${item.kind === "open" ? item.tab.id : item.file.path}`} item={item} selected={i === at} onPick={() => pick(item)} onHover={() => setSel(i)} />;
              })}
            </div>
          ))}
          {!flat.length && name && (
            <div className="qnone">没有匹配的文件<button className="wbtn pri" onClick={create}>新建「{name.replace(/\.(md|markdown)$/i, "")}.md」</button></div>
          )}
        </div>
        <div className="qft"><span><kbd>↑↓</kbd>选择</span><span><kbd>↩</kbd>打开</span><span><kbd>esc</kbd>关闭</span><span>也会搜索最近关闭的文件</span></div>
      </div>
    </div>
  );
}
