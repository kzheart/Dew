import { createContext, memo, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { highlightLines, languageLabel } from "../markdown/highlight";
import type { Block } from "../markdown/parse";
import { Calendar, calloutIcons, Check, Chevron, CopyIcon, Expand, Hash, Person } from "./icons";

export type CodeBlock = Extract<Block, { kind: "code" }>;

export interface BlockActions {
  /** False when rendering for an export: no buttons, everything open. */
  interactive: boolean;
  showLineNumbers: boolean;
  onToggleLineNumbers(): void;
  onToggleTask(line: number): void;
  onZoomCode(block: CodeBlock): void;
}

export const BlockActionsContext = createContext<BlockActions>({
  interactive: false,
  showLineNumbers: true,
  onToggleLineNumbers() {},
  onToggleTask() {},
  onZoomCode() {},
});

const html = (h: string) => ({ __html: h });

function attrs(b: Block, extra = "") {
  return {
    className: `blk${extra ? " " + extra : ""}`,
    "data-src": b.start,
    "data-end": b.end,
    "data-blk": b.kind,
  };
}

export const BlockView = memo(function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "frontmatter":
      return <FrontMatter block={block} />;
    case "heading": {
      const Tag = `h${Math.min(block.level, 6)}` as "h1";
      return <Tag {...attrs(block)} data-sec={`h-${block.start}`} dangerouslySetInnerHTML={html(block.html)} />;
    }
    case "paragraph":
      return <p {...attrs(block)} dangerouslySetInnerHTML={html(block.html)} />;
    case "image":
      return <p {...attrs(block, "img")} dangerouslySetInnerHTML={html(block.html)} />;
    case "callout":
      return <Callout block={block} />;
    case "list":
      return block.tasksOnly ? <TaskList block={block} /> : <List block={block} />;
    case "quote":
      return <blockquote {...attrs(block, "quote")} dangerouslySetInnerHTML={html(block.html)} />;
    case "code":
      return <Code block={block} />;
    case "table":
      return <Table block={block} />;
    case "math":
      return <div {...attrs(block)} role="math" aria-label={block.tex} dangerouslySetInnerHTML={html(block.html)} />;
    case "footnotes":
      return (
        <section {...attrs(block, "fns muted")} aria-label="脚注">
          <ol>
            {block.items.map((it) => (
              <li key={it.label} id={`fn-${it.n}`} value={it.n} dangerouslySetInnerHTML={html(it.html)} />
            ))}
          </ol>
        </section>
      );
    case "hr":
      return <hr {...attrs(block)} />;
    case "html":
      return <div {...attrs(block, "html-blk")} dangerouslySetInnerHTML={html(block.html)} />;
  }
});

function FrontMatter({ block }: { block: Extract<Block, { kind: "frontmatter" }> }) {
  const { interactive } = useContext(BlockActionsContext);
  const [open, setOpen] = useState(true);
  const shown = open || !interactive;
  const chips: ReactNode[] = [];
  for (const { key, value } of block.entries) {
    const k = key.toLowerCase();
    if (k === "title") continue;
    if (k === "tags" || k === "tag" || k === "keywords") {
      for (const tag of toList(value)) chips.push(<span key={`t-${tag}`} className="chip chip-tag"># {tag}</span>);
    } else if (k === "date" || k === "updated" || k === "created") {
      chips.push(<span key={key} className="chip"><Calendar />{formatValue(value)}</span>);
    } else if (k === "author" || k === "authors") {
      chips.push(<span key={key} className="chip"><Person />{formatValue(value)}</span>);
    } else {
      chips.push(<span key={key} className="chip">{key}: {formatValue(value)}</span>);
    }
  }
  return (
    <div {...attrs(block, "fm")}>
      {interactive && (
        <button className="fm-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Chevron className={open ? "chev open" : "chev"} />属性
        </button>
      )}
      {shown ? chips : <span className="muted" style={{ fontSize: 12 }}>{block.entries.length} 项属性已收起</span>}
    </div>
  );
}

function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") return v.split(/[,，]\s*/).filter(Boolean);
  return v == null ? [] : [String(v)];
}

function formatValue(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.map(formatValue).join("、");
  if (v && typeof v === "object") return JSON.stringify(v);
  return v == null ? "" : String(v);
}

function Callout({ block }: { block: Extract<Block, { kind: "callout" }> }) {
  const { interactive } = useContext(BlockActionsContext);
  const [open, setOpen] = useState(!block.folded);
  const shown = open || !interactive;
  return (
    <div {...attrs(block, `callout callout-${block.variant}`)}>
      {interactive ? (
        <button className="callout-h" aria-expanded={shown} onClick={() => setOpen(!open)}>
          {calloutIcons[block.variant]}
          <span>{block.title}</span>
          <Chevron size={15} weight={2} className={open ? "chev open" : "chev"} style={{ marginLeft: "auto" }} />
        </button>
      ) : (
        <div className="callout-h">
          {calloutIcons[block.variant]}
          <span>{block.title}</span>
        </div>
      )}
      <div className={shown ? "clp open" : "clp"}>
        <div>
          <div className="callout-b" dangerouslySetInnerHTML={html(block.html)} />
        </div>
      </div>
    </div>
  );
}

function TaskList({ block }: { block: Extract<Block, { kind: "list" }> }) {
  const { onToggleTask, interactive } = useContext(BlockActionsContext);
  return (
    <ul {...attrs(block, "tasks")}>
      {block.items.map((it) => (
        <li key={it.start}>
          <label className="task">
            <input type="checkbox" checked={!!it.task} disabled={!interactive} onChange={() => onToggleTask(it.start)} />
            <span className={it.task ? "txt done" : "txt"} dangerouslySetInnerHTML={html(it.html)} />
          </label>
        </li>
      ))}
    </ul>
  );
}

function List({ block }: { block: Extract<Block, { kind: "list" }> }) {
  const { onToggleTask, interactive } = useContext(BlockActionsContext);
  const items = block.items.map((it) =>
    it.task === null ? (
      <li key={it.start} dangerouslySetInnerHTML={html(it.html)} />
    ) : (
      <li key={it.start} className="task-li">
        <input type="checkbox" checked={it.task} disabled={!interactive} onChange={() => onToggleTask(it.start)} />
        <div dangerouslySetInnerHTML={html(it.html)} />
      </li>
    ),
  );
  return block.ordered ? (
    <ol {...attrs(block, "list")} start={block.startNumber}>{items}</ol>
  ) : (
    <ul {...attrs(block, "list")}>{items}</ul>
  );
}

export function codeMeta(highlight: number[]): string {
  if (!highlight.length) return "";
  const parts: string[] = [];
  for (let i = 0; i < highlight.length; ) {
    let j = i;
    while (j + 1 < highlight.length && highlight[j + 1] === highlight[j]! + 1) j++;
    parts.push(j - i >= 2 ? `${highlight[i]}–${highlight[j]}` : highlight.slice(i, j + 1).join("、"));
    i = j + 1;
  }
  return `高亮第 ${parts.join("、")} 行`;
}

export function useHighlighted(block: CodeBlock) {
  return useMemo(() => highlightLines(block.code, block.lang), [block.code, block.lang]);
}

function Code({ block }: { block: CodeBlock }) {
  const { interactive, showLineNumbers, onToggleLineNumbers, onZoomCode } = useContext(BlockActionsContext);
  const lines = useHighlighted(block);
  const [copied, copy] = useCopied(block.code);
  const meta = codeMeta(block.highlight);
  return (
    <div {...attrs(block, "cb")}>
      <div className="cb-head">
        <span className="cb-lang">{languageLabel(block.lang)}</span>
        {meta && <span className="cb-meta">{meta}</span>}
        <span style={{ flex: "1 1 auto" }} />
        {interactive && (
          <>
            <button className="cb-btn" aria-pressed={showLineNumbers} onClick={onToggleLineNumbers} aria-label="显示行号" title="行号">
              <Hash />
            </button>
            <button className="cb-btn" onClick={() => onZoomCode(block)} aria-label="放大查看" title="放大查看">
              <Expand />
            </button>
            <button className={copied ? "cb-btn ok" : "cb-btn"} onClick={copy}>
              {copied ? <><Check key="ok" className="ic-pop" />已拷贝</> : <><CopyIcon key="copy" className="ic-pop" />拷贝</>}
            </button>
          </>
        )}
      </div>
      <CodeLines lines={lines} highlight={block.highlight} showLineNumbers={showLineNumbers} />
    </div>
  );
}

export function CodeLines({ lines, highlight, showLineNumbers, hits, before, after }: {
  lines: string[];
  highlight: number[];
  showLineNumbers: boolean;
  hits?: Set<number>;
  before?: ReactNode;
  after?: ReactNode;
}) {
  return (
    <pre className="cb-body">
      {before}
      {lines.map((l, i) => (
        <span key={i} className={`cl${highlight.includes(i + 1) ? " cl-hl" : ""}${hits?.has(i) ? " lb-hit" : ""}`}>
          {showLineNumbers && <span className="cb-ln">{i + 1}</span>}
          <span dangerouslySetInnerHTML={html(l)} />
        </span>
      ))}
      {after}
    </pre>
  );
}

function useCopied(text: string): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [
    copied,
    () => {
      void copyText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    },
  ];
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

const SHORTCUT = /^[⌘⌥⇧⌃]+[^\s<]{1,6}$/;

function Table({ block }: { block: Extract<Block, { kind: "table" }> }) {
  const cls = (i: number) => (block.align[i] === "center" ? "c" : block.align[i] === "right" ? "r" : undefined);
  const cell = (h: string) => html(SHORTCUT.test(h) ? `<kbd>${h}</kbd>` : h);
  return (
    <div {...attrs(block)}>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>{block.header.map((h, i) => <th key={i} className={cls(i)} dangerouslySetInnerHTML={cell(h)} />)}</tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>{row.map((c, i) => <td key={i} className={cls(i)} dangerouslySetInnerHTML={cell(c)} />)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
