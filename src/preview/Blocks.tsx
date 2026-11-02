import { memo, useContext, useState, type ReactNode } from "react";
import type { Align, Block } from "../markdown/parse";
import { BlockActionsContext, type TableBlock } from "./actions";
import { Code, ZoomButton } from "./Code";
import { Calendar, calloutIcons, Chevron, Person } from "./icons";

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

const SHORTCUT = /^[⌘⌥⇧⌃]+[^\s<]{1,6}$/;

/** A cell's HTML as a table shows it: a lone shortcut reads as a key. */
export const cellHtml = (h: string) => (SHORTCUT.test(h) ? `<kbd>${h}</kbd>` : h);

export const alignClass = (a: Align) => (a === "center" ? "c" : a === "right" ? "r" : undefined);

function Table({ block }: { block: TableBlock }) {
  const { interactive } = useContext(BlockActionsContext);
  const cls = (i: number) => alignClass(block.align[i] ?? null);
  const cell = (h: string) => html(cellHtml(h));
  return (
    <div {...attrs(block, "tbl-blk")}>
      {interactive && <ZoomButton target={{ kind: "table", block }} className="tbl-zoom" />}
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
