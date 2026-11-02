import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { engines, useDiagram } from "../diagram/engines";
import { parseDiff, type DiffLine } from "../markdown/diff";
import { highlightDiff, highlightLines, languageLabel } from "../markdown/highlight";
import type { DiagramEngine } from "../markdown/parse";
import { BlockActionsContext, type CodeBlock, type LightboxTarget } from "./actions";
import { Check, Chevron, CopyIcon, Download, Expand, Hash } from "./icons";

const html = (h: string) => ({ __html: h });

function attrs(b: CodeBlock, extra = "") {
  return { className: `blk cb${extra ? " " + extra : ""}`, "data-src": b.start, "data-end": b.end, "data-blk": b.kind };
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
  const lang = block.view.kind === "diagram" && block.view.engine === "vega-lite" ? "json" : block.lang;
  return useMemo(() => highlightLines(block.code, lang), [block.code, lang]);
}

export function useDiff(block: CodeBlock) {
  const diff = useMemo(() => parseDiff(block.code), [block.code]);
  const lines = useMemo(() => highlightDiff(diff, block.title), [diff, block.title]);
  return { diff, lines };
}

export function Code({ block }: { block: CodeBlock }) {
  switch (block.view.kind) {
    case "plain":
      return <PlainCode block={block} />;
    case "diff":
      return <DiffCode block={block} />;
    case "diagram":
      return <DiagramCode block={block} engine={block.view.engine} />;
  }
}

/** The badge a code block wears: its diagram engine, else its language. */
export function codeLabel(block: CodeBlock): string {
  return block.view.kind === "diagram" ? engines[block.view.engine].label : languageLabel(block.lang);
}

/** A diagram fence drawn as its chart, with its source a toggle away. */
function DiagramCode({ block, engine }: { block: CodeBlock; engine: DiagramEngine }) {
  const { interactive, showLineNumbers, theme, onExportSvg } = useContext(BlockActionsContext);
  const [showSource, setShowSource] = useState(false);
  const result = useDiagram(engine, block.code, theme);
  const lines = useHighlighted(block);
  const note = engines[engine].note;
  const svg = result.status === "ok" ? result.svg : null;
  return (
    <div {...attrs(block, "dia")}>
      <CodeHead
        label={codeLabel(block)}
        meta={
          <>
            {interactive && (
              <div className="cb-seg" role="group" aria-label="显示方式">
                <button aria-pressed={!showSource} onClick={() => setShowSource(false)}>图表</button>
                <button aria-pressed={showSource} onClick={() => setShowSource(true)}>源码</button>
              </div>
            )}
            {note && <span className="cb-meta">{note}</span>}
          </>
        }
      >
        {showSource && <LineNumberToggle />}
        <ZoomButton target={svg && !showSource ? { kind: "diagram", block, svg } : { kind: "code", block }} />
        {showSource ? (
          <CopyButton text={block.code} />
        ) : (
          <button className="cb-btn" disabled={!svg} onClick={() => svg && onExportSvg(svg, engine)}>
            <Download />导出 SVG
          </button>
        )}
      </CodeHead>
      {showSource ? (
        <CodeLines lines={lines} highlight={block.highlight} showLineNumbers={showLineNumbers} />
      ) : result.status === "ok" ? (
        <div className="dia-body">
          <div className="dia-svg" role="img" aria-label={`${engines[engine].label} 图表`} dangerouslySetInnerHTML={html(result.svg)} />
        </div>
      ) : result.status === "loading" ? (
        <div className="dia-body dia-wait">正在渲染图表…</div>
      ) : (
        <>
          <div className="dia-err" role="alert">
            <b>图表无法渲染</b>
            <pre>{result.message}</pre>
          </div>
          <CodeLines lines={lines} highlight={block.highlight} showLineNumbers={showLineNumbers} />
        </>
      )}
    </div>
  );
}

export const COLLAPSE_THRESHOLD = 20;
export const COLLAPSED_LINES = 8;

/** The lines a collapsed block of n lines hides; 0 when it is short enough to show whole. */
export function foldedLines(n: number): number {
  return n > COLLAPSE_THRESHOLD ? n - COLLAPSED_LINES : 0;
}

export function lineCountMeta(n: number): string {
  return n > COLLAPSE_THRESHOLD ? `共 ${n} 行` : "";
}

// Block start lines the reader expanded. A block remounts when live mode
// edits it or the mode changes, and should come back as the reader left it.
const expandedBlocks = new Set<number>();

// The header bar floats over the top of the preview this far down.
const HEADER_INSET = 84;

/** Long blocks start collapsed to their first lines; exports show every line. */
function useFold(block: CodeBlock, lineCount: number) {
  const { interactive } = useContext(BlockActionsContext);
  const hidden = interactive ? foldedLines(lineCount) : 0;
  const [expanded, setExpanded] = useState(() => expandedBlocks.has(block.start));
  const ref = useRef<HTMLDivElement>(null);
  const revealHeader = useRef(false);

  useLayoutEffect(() => {
    if (expanded || !revealHeader.current) return;
    revealHeader.current = false;
    ref.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [expanded]);

  const toggle = () => {
    if (expanded) {
      expandedBlocks.delete(block.start);
      const el = ref.current;
      const scroller = el?.closest(".pv-scroll");
      revealHeader.current = !!el && !!scroller && el.getBoundingClientRect().top < scroller.getBoundingClientRect().top + HEADER_INSET;
    } else {
      expandedBlocks.add(block.start);
    }
    setExpanded(!expanded);
  };

  const collapsed = hidden > 0 && !expanded;
  return {
    ref,
    className: hidden ? (collapsed ? "folded" : "unfolded") : "",
    visible: <T,>(rows: T[]) => (collapsed ? rows.slice(0, COLLAPSED_LINES) : rows),
    fold: hidden > 0 && <FoldButton hidden={hidden} expanded={expanded} onToggle={toggle} />,
  };
}

function FoldButton({ hidden, expanded, onToggle }: { hidden: number; expanded: boolean; onToggle(): void }) {
  return (
    <div className={expanded ? "cb-fold open" : "cb-fold"}>
      <button className="cb-pill" aria-expanded={expanded} onClick={onToggle}>
        <Chevron size={14} weight={2} className={expanded ? "flip" : undefined} />
        {expanded ? "收起" : `展开剩余 ${hidden} 行`}
      </button>
    </div>
  );
}

function PlainCode({ block }: { block: CodeBlock }) {
  const { showLineNumbers } = useContext(BlockActionsContext);
  const lines = useHighlighted(block);
  const fold = useFold(block, lines.length);
  const meta = [block.title, codeMeta(block.highlight), lineCountMeta(lines.length)].filter(Boolean).join(" · ");
  return (
    <div {...attrs(block, fold.className)} ref={fold.ref}>
      <CodeHead label={languageLabel(block.lang)} meta={meta && <span className="cb-meta">{meta}</span>}>
        <LineNumberToggle />
        <ZoomButton target={{ kind: "code", block }} />
        <CopyButton text={block.code} />
      </CodeHead>
      <CodeLines lines={fold.visible(lines)} highlight={block.highlight} showLineNumbers={showLineNumbers} />
      {fold.fold}
    </div>
  );
}

function DiffCode({ block }: { block: CodeBlock }) {
  const { showLineNumbers } = useContext(BlockActionsContext);
  const { diff, lines } = useDiff(block);
  const fold = useFold(block, diff.lines.length);
  const meta = [block.title, lineCountMeta(diff.lines.length)].filter(Boolean).join(" · ");
  return (
    <div {...attrs(block, fold.className)} ref={fold.ref}>
      <CodeHead
        label={languageLabel(block.lang)}
        meta={
          <>
            {meta && <span className="cb-meta">{meta}</span>}
            <span className="df-count df-add" title={`新增 ${diff.added} 行`}>+{diff.added}</span>
            <span className="df-count df-del" title={`删除 ${diff.removed} 行`}>−{diff.removed}</span>
          </>
        }
      >
        <ZoomButton target={{ kind: "code", block }} />
        <CopyButton text={block.code} />
      </CodeHead>
      <DiffLines rows={fold.visible(diff.lines)} lines={lines} showLineNumbers={showLineNumbers} />
      {fold.fold}
    </div>
  );
}

/** A code block's header; its buttons show only where the block is interactive. */
function CodeHead({ label, meta, children }: { label: string; meta?: ReactNode; children?: ReactNode }) {
  const { interactive } = useContext(BlockActionsContext);
  return (
    <div className="cb-head">
      <span className="cb-lang">{label}</span>
      {meta}
      <span style={{ flex: "1 1 auto" }} />
      {interactive && children}
    </div>
  );
}

function LineNumberToggle() {
  const { showLineNumbers, onToggleLineNumbers } = useContext(BlockActionsContext);
  return (
    <button className="cb-btn" aria-pressed={showLineNumbers} onClick={onToggleLineNumbers} aria-label="显示行号" title="行号">
      <Hash />
    </button>
  );
}

export function ZoomButton({ target, className = "cb-btn" }: { target: LightboxTarget; className?: string }) {
  const { onZoom } = useContext(BlockActionsContext);
  return (
    <button
      className={className}
      onClick={(e) => {
        // WebKit leaves a clicked button unfocused; the lightbox gives focus back to whatever had it.
        e.currentTarget.focus({ preventScroll: true });
        onZoom(target);
      }}
      aria-label="放大查看"
      title="放大查看"
    >
      <Expand />
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, copy] = useCopied(text);
  return (
    <button className={copied ? "cb-btn ok" : "cb-btn"} onClick={copy}>
      {copied ? <><Check key="ok" className="ic-pop" />已拷贝</> : <><CopyIcon key="copy" className="ic-pop" />拷贝</>}
    </button>
  );
}

/** Search marks on a row: every row with a hit, and the one the search is on. */
interface RowHits {
  hits?: Set<number>;
  current?: number | null;
}

const hitClass = (i: number, { hits, current }: RowHits) => (i === current ? " lb-hit lb-cur" : hits?.has(i) ? " lb-hit" : "");

export function CodeLines({ lines, highlight, showLineNumbers, className = "cb-body", fontSize, ...marks }: RowHits & {
  lines: string[];
  highlight: number[];
  showLineNumbers: boolean;
  className?: string;
  fontSize?: number;
}) {
  return (
    <pre className={className} style={fontSize ? { fontSize } : undefined}>
      {lines.map((l, i) => (
        <span key={i} className={`cl${highlight.includes(i + 1) ? " cl-hl" : ""}${hitClass(i, marks)}`}>
          {showLineNumbers && <span className="cb-ln">{i + 1}</span>}
          <span dangerouslySetInnerHTML={html(l)} />
        </span>
      ))}
    </pre>
  );
}

const DIFF_MARK: Record<DiffLine["type"], string> = { add: "+", del: "−", context: "", hunk: "", meta: "" };

/** Diff rows: old and new line numbers, a +/− mark that does not rely on color, and the code. */
export function DiffLines({ rows, lines, showLineNumbers, className = "cb-body", fontSize, ...marks }: RowHits & {
  rows: DiffLine[];
  /** Each row's highlighted code. */
  lines: string[];
  showLineNumbers: boolean;
  className?: string;
  fontSize?: number;
}) {
  return (
    <pre className={`${className} df`} style={fontSize ? { fontSize } : undefined}>
      {rows.map((l, i) => (
        <span key={i} className={`dl dl-${l.type}${hitClass(i, marks)}`}>
          {showLineNumbers && (
            <>
              <span className="dl-no">{l.old ?? ""}</span>
              <span className="dl-no">{l.new ?? ""}</span>
            </>
          )}
          <span className="dl-mark">{DIFF_MARK[l.type]}</span>
          <span className="dl-tx" dangerouslySetInnerHTML={html(lines[i]!)} />
        </span>
      ))}
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
