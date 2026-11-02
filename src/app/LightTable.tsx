import { useEffect, useMemo, useRef, useState, type PointerEvent, type UIEvent } from "react";
import { parseDocument, type Block } from "../markdown/parse";
import { host, type RecentFile } from "../platform";
import { dropState, fileStatus } from "../state/files";
import { sectionLabels, vapor, type Anchor, type Card } from "../state/recent";
import { Tear } from "./Dock";
import type { ShownFile } from "./useFiles";

const rotations = [-2, 2.5, -1.5, 2, -2.5, 1.5, -1, 3];
const codeColors = ["#6BDFFF", "#8E8E96", "#FF7AB2", "#7DD8B5"];
/** How near the close zone's center a dragged page closes its file. */
const HOT = 90;

const pct = (n: number, lo: number, hi: number) => `${Math.round(Math.min(hi, Math.max(lo, n)))}%`;
const plain = (html: string) => html.replace(/<[^>]+>/g, "").trim();

function BlockSketch({ b }: { b: Block }) {
  switch (b.kind) {
    case "frontmatter":
      return <span className="sk-chips"><span style={{ width: 26 }} /><span style={{ width: 32 }} /></span>;
    case "heading":
      return b.level === 1
        ? <span className="ttl" style={{ width: pct(30 + b.text.length * 4, 40, 78) }} />
        : <span className="ttl sub" style={{ width: pct(18 + b.text.length * 3, 26, 50) }} />;
    case "paragraph": {
      const n = plain(b.html).length;
      const rows = Math.min(3, Math.max(1, Math.ceil(n / 34)));
      return (
        <span className="sk-rows">
          {Array.from({ length: rows }, (_, i) => <span key={i} className="bar" style={{ width: i < rows - 1 ? pct(96 - i * 4, 0, 100) : pct(((n % 34) / 34) * 90, 30, 90) }} />)}
        </span>
      );
    }
    case "code":
      return (
        <span className="sk-code">
          {b.code.split("\n").slice(0, 4).map((line, i) => <span key={i} className="bar" style={{ width: pct(line.length * 2.5, 20, 80), background: codeColors[i] }} />)}
        </span>
      );
    case "list":
      return (
        <span className="sk-rows">
          {b.items.slice(0, 3).map((it, i) => (
            <span key={i} className="sk-item">
              <span className={it.task === null ? "sk-dot" : it.task ? "sk-chk" : "sk-chk open"} />
              <span className="bar" style={{ width: pct(plain(it.html).length * 4, 30, 72) }} />
            </span>
          ))}
        </span>
      );
    case "quote":
    case "callout":
    case "table":
    case "image":
      return <span className={`sk-box sk-${b.kind}`} />;
    case "hr":
      return <span className="sk-hr" />;
    case "math":
    case "footnotes":
    case "html":
      return <span className="bar" style={{ width: "50%" }} />;
  }
}

/** A page's first blocks, drawn as a skeleton. */
function Sketch({ text, max = 8 }: { text: string | undefined; max?: number }) {
  const blocks = useMemo(() => (text === undefined ? null : parseDocument(text).blocks.slice(0, max)), [text, max]);
  if (!blocks) return null;
  if (!blocks.length) return <><span className="bar" style={{ width: "46%", background: "#ECECEF" }} /><span className="sk-caret" /></>;
  return <>{blocks.map((b) => <BlockSketch key={b.start} b={b} />)}</>;
}

const pinIcon = "M15 3l6 6-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z";

function GoneTear() {
  return <span className="m12" aria-hidden="true"><span className="sc tear gone"><span className="shell"><span className="lv"><span className="fill" /></span></span></span></span>;
}

/** A closed file as a small page, faded by how long ago it closed. */
function RecentCard({ c, head, onOpen, onPin }: { c: Card; head: string | undefined; onOpen(): void; onPin(): void }) {
  return (
    <div className="rcw">
      <button className={`rc a${c.age}`} onClick={onOpen} aria-label={`${c.name}，${c.time} 关闭，读到 ${c.pct}%，点按重新打开`} title={`点按重新打开 · 回到上次读到的 ${c.pct}%`}>
        <span className="rpg">
          {head ? (
            <span className="rsk"><Sketch text={head} max={6} /></span>
          ) : (
            <><span className="ttl" /><span className="bar" style={{ width: "88%" }} /><span className="bar" style={{ width: "70%" }} /><span className="bar" style={{ width: "80%" }} /></>
          )}
          <span className="vprog"><i style={{ width: `${c.pct}%` }} /></span>
        </span>
        <span className="nmr"><GoneTear /><b>{c.name}</b></span>
        <span className="rfld">{c.folder}</span>
        <span className="rtm">{c.time}</span>
        <span className="rlp"><i style={{ width: `${c.pct}%` }} /></span>
      </button>
      <button className="rpin" onClick={onPin} aria-label={`钉住 ${c.name}`} title="钉住">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={pinIcon} /></svg>
      </button>
    </div>
  );
}

/**
 * 灯桌总览: the group's files as pages on a light table, to pick one, or to close one by dragging it away; below them, the files closed lately, to reopen.
 * With no files, as on the welcome page, it is the recent files alone.
 */
export function LightTable({ files, recent, text, leaving, onSelect, onCloseFile, onReopen, onNew, onClose }: {
  files: ShownFile[];
  recent: RecentFile[];
  /** The current file's text, which may be ahead of the app's. */
  text: string;
  leaving: boolean;
  onSelect(id: number): void;
  onCloseFile(id: number): void;
  onReopen(path: string): void;
  onNew(): void;
  onClose(): void;
}) {
  const [q, setQ] = useState("");
  const [texts, setTexts] = useState<Record<number, string>>({});
  const asked = useRef(new Set<number>());
  const [heads, setHeads] = useState<Record<string, string>>({});
  const askedHeads = useRef(new Set<string>());
  const [drag, setDrag] = useState<{ id: number; dx: number; dy: number; hot: boolean } | null>(null);
  const press = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const zone = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [look, setLook] = useState<"card" | "list">("card");
  const [group, setGroup] = useState<"time" | "folder">("time");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [sec, setSec] = useState<Anchor>("open");
  const open = files.filter((f) => !f.closing);
  const hasPages = files.length > 0;

  useEffect(() => {
    for (const f of files) {
      if (f.current || asked.current.has(f.id)) continue;
      asked.current.add(f.id);
      host.files.content(f.id).then((t) => setTexts((m) => ({ ...m, [f.id]: t })), () => {});
    }
  }, [files]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);

  const down = (e: PointerEvent, id: number) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    press.current = { id, x: e.clientX, y: e.clientY, moved: false };
  };
  const move = (e: PointerEvent) => {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.moved && Math.hypot(dx, dy) < 5) return;
    p.moved = true;
    const r = zone.current?.getBoundingClientRect();
    const hot = !!r && Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < HOT;
    setDrag({ id: p.id, dx, dy, hot });
  };
  const up = () => {
    const p = press.current;
    press.current = null;
    if (!p?.moved) return;
    dragged.current = true;
    setTimeout(() => (dragged.current = false), 60);
    if (drag?.hot && open.length > 1) {
      onCloseFile(p.id);
      // The page stays where it was dropped while its file closes, unless that waits on the user.
      setDrag({ ...drag, hot: false });
      setTimeout(() => setDrag(null), 280);
    } else {
      setDrag(null);
    }
  };

  const needle = q.trim().toLowerCase();
  const pages = files.filter((f) => !needle || f.name.toLowerCase().includes(needle));
  const current = files.find((f) => f.current);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [recent]);
  const vap = useMemo(() => vapor(recent, { now, group, expanded, query: q }), [recent, now, group, expanded, q]);
  const scrub = hasPages ? vap.scrub : vap.scrub.filter((x) => x.anchor !== "open");

  const shownCards = [...vap.pins, ...vap.blocks.flatMap((b) => (b.kind === "grid" ? b.cards : []))];
  useEffect(() => {
    for (const c of shownCards) {
      const path = c.file.path;
      if (askedHeads.current.has(path)) continue;
      askedHeads.current.add(path);
      host.recent.head(path).then((t) => setHeads((m) => ({ ...m, [path]: t })), () => {});
    }
  });

  const expand = (key: string, on: boolean) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    let at: Anchor = "open";
    for (const a of el.querySelectorAll<HTMLElement>("[data-anchor]")) {
      const id = a.dataset.anchor as Anchor | "vap";
      if (id !== "vap" && a.offsetTop - 60 <= el.scrollTop) at = id;
    }
    if (at !== sec) setSec(at);
  };
  const go = (anchor: Anchor) => {
    const el = scroller.current;
    const t = el?.querySelector<HTMLElement>(`[data-anchor="${anchor}"]`);
    if (el && t) el.scrollTo({ top: anchor === "open" ? 0 : Math.max(0, t.offsetTop - 56), behavior: "smooth" });
  };
  const reopen = (path: string) => onReopen(path);
  const pin = (path: string, pinned: boolean) => void host.recent.pin(path, pinned).catch(() => {});

  return (
    <div className={`lt${leaving ? " out" : ""}`} role="dialog" aria-modal="true" aria-label="灯桌总览">
      <div className="lt-bar" aria-hidden="true" />
      <div className="glass lt-top">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#55555A" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <label htmlFor="lt-q" className="sr">搜索文件</label>
        <input id="lt-q" className="lt-q" type="text" placeholder="搜索" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="lt-scroll" ref={scroller} onScroll={onScroll}>
        {hasPages && <div className="lt-grid" data-anchor="open" onClick={(e) => e.target === e.currentTarget && onClose()}>
          {pages.map((f, i) => {
            const dragging = drag?.id === f.id;
            return (
              <button
                key={f.id}
                className={`ltp${f.current ? " cur" : ""}${dragging ? " dragging" : ""}${f.closing ? " poof" : ""}`}
                style={{ transform: `translate(${dragging ? drag.dx : 0}px, ${dragging ? drag.dy : 0}px) rotate(${dragging ? -4 : rotations[i % rotations.length]}deg)` }}
                aria-label={`${f.name}，${fileStatus(f)}${f.current ? "，当前文件" : ""}`}
                onClick={() => !dragged.current && onSelect(f.id)}
                onPointerDown={(e) => down(e, f.id)}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
              >
                <span className="pg"><Sketch text={f.current ? text : texts[f.id]} /></span>
                <span className="ltp-lbl"><span className="m14" aria-hidden="true"><Tear state={dropState(f)} /></span>{f.name}</span>
              </button>
            );
          })}
          {!pages.length && <div className="vempty">没有匹配的文件</div>}
        </div>}

        {(recent.length > 0 || !hasPages) && <section className={look === "list" ? "vap list" : "vap"} data-anchor="vap" aria-label="最近关闭的文件">
          <div className="vap-head">
            <b>{sectionLabels[sec]}</b>
            {recent.length > 0 && (
              <>
                <span className="vcnt">{recent.length}</span>
                <span className="glass seg3" role="group" aria-label="显示方式">
                  <button aria-pressed={look === "card"} onClick={() => setLook("card")} aria-label="纸片" title="纸片">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="4" y="4" width="7" height="9" rx="1.5" /><rect x="13" y="4" width="7" height="9" rx="1.5" /></svg>
                  </button>
                  <button aria-pressed={look === "list"} onClick={() => setLook("list")} aria-label="列表" title="列表">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" /></svg>
                  </button>
                </span>
                <span className="glass seg3" role="group" aria-label="分组方式">
                  <button aria-pressed={group === "time"} onClick={() => setGroup("time")}>时间</button>
                  <button aria-pressed={group === "folder"} onClick={() => setGroup("folder")}>文件夹</button>
                </span>
                <span style={{ flex: "1 1 auto" }} />
                <button className="vclear" onClick={() => void host.recent.clear().catch(() => {})}>清空</button>
              </>
            )}
          </div>
          {vap.pins.length > 0 && (
            <div className="vblk">
              <div className="vlab">已钉住<span>{vap.pins.length}</span></div>
              <div className="pinr">
                {vap.pins.map((c) => (
                  <span key={c.file.path} className="pinw">
                    <button className="pin" onClick={() => reopen(c.file.path)} aria-label={`重新打开钉住的文件 ${c.name}`}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="#0A66D8" aria-hidden="true"><path d={pinIcon} /></svg>{c.name}
                    </button>
                    <button className="pin-x" onClick={() => pin(c.file.path, false)} aria-label={`取消钉住 ${c.name}`} title="取消钉住">
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {vap.blocks.map((b) =>
            b.kind === "grid" ? (
              <div key={b.key} className="vblk" data-anchor={b.anchor ?? undefined}>
                <div className="vlab">{b.label}<span>{b.count}</span>{b.collapsible && <button onClick={() => expand(b.key, false)}>收起</button>}</div>
                <div className="vgrid">
                  {b.cards.map((c) => (
                    <RecentCard key={c.file.path} c={c} head={heads[c.file.path]} onOpen={() => reopen(c.file.path)} onPin={() => pin(c.file.path, true)} />
                  ))}
                  {b.more > 0 && (
                    <button className="stk" onClick={() => expand(b.key, true)} aria-label={group === "folder" ? `${b.label}，还有 ${b.more} 个文件，点按展开` : `${b.label}还有 ${b.more} 个文件，点按展开`}>
                      <span className="sheets"><span className="s3" /><span className="s2" /><span className="s1"><span className="ttl" /><span className="bar" style={{ width: "80%" }} /><span className="bar" style={{ width: "64%" }} /></span><span className="cnt">+{b.more}</span></span>
                      <span className="stl">展开<small>{b.moreHint}</small></span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div key={`stacks-${b.anchor}`} className="vblk" data-anchor={b.anchor}>
                <div className="vlab">更早<span>{b.count}</span></div>
                <div className="vgrid">
                  {b.stacks.map((k) => (
                    <button key={k.bucket} className={`stk a${k.age}`} onClick={() => expand(k.bucket, true)} aria-label={`${k.label}，${k.count} 个文件，点按展开`}>
                      <span className="sheets"><span className="s3" /><span className="s2" /><span className="s1"><span className="sl">{k.label}</span><span className="bar" style={{ width: "74%" }} /><span className="bar" style={{ width: "56%" }} /></span><span className="cnt">{k.count}</span></span>
                      <span className="stl">{k.label}<small>{k.range}</small></span>
                    </button>
                  ))}
                </div>
              </div>
            ),
          )}
          {!vap.blocks.length && !vap.pins.length && <div className="vempty">{recent.length ? "没有匹配的文件" : "还没有关闭过的文件"}</div>}
        </section>}
      </div>

      {group === "time" && scrub.length > 1 && (
        <nav className="scrub" aria-label="按时间跳转">
          {scrub.map((x) => (
            <button key={x.anchor} className={sec === x.anchor ? "on" : ""} onClick={() => go(x.target)}>{x.label}</button>
          ))}
        </nav>
      )}
      <div className={`zone${drag ? " show" : ""}${drag?.hot ? " hot" : ""}`} ref={zone} aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </div>
      <button className="glass lt-btn" style={{ left: 20 }} onClick={onNew}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>新建
      </button>
      <button className="glass lt-btn" style={{ right: 20 }} onClick={onClose}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>{current ? `返回 ${current.name}` : "返回"}
      </button>
    </div>
  );
}
