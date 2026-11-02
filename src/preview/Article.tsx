import { Fragment, memo, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, type Ref } from "react";
import type { Block, ParsedDocument } from "../markdown/parse";
import type { Prefs } from "../platform";
import { BlockActionsContext, type BlockActions } from "./actions";
import { BlockView } from "./Blocks";
import { WRITE_HERE } from "../editor/SourceEditor";
import { articleItems, type LineRange } from "./layout";

export type Typography = Pick<Prefs, "mw" | "fs" | "lh" | "pg" | "ff">;

export interface LiveEditing {
  range: LineRange | null;
  editor: ReactNode;
  /** block is null for a click on no block, which only an empty document acts on. */
  onActivate(block: Block | null, e: MouseEvent): void;
  /** A click on the page outside the article. */
  onBlank(): void;
  onKeyDown(e: KeyboardEvent<HTMLElement>): void;
}

interface Props {
  doc: ParsedDocument;
  typography: Typography;
  focus?: boolean;
  actions: BlockActions;
  live?: LiveEditing | null;
  onLocate?(line: number): void;
  articleRef?: Ref<HTMLElement>;
}

export function typographyStyle(t: Typography): CSSProperties {
  return { maxWidth: t.mw, fontSize: t.fs, lineHeight: t.lh, gap: `${t.pg}em` };
}

const INTERACTIVE = "label,button,input,a,select,textarea";

export const Article = memo(function Article({ doc, typography, focus, actions, live, onLocate, articleRef }: Props) {
  const items = articleItems(doc.blocks, live?.range ?? null);
  const blockOf = (e: MouseEvent) => {
    const t = e.target as Element;
    if (t.closest(INTERACTIVE)) return null;
    return t.closest<HTMLElement>("[data-src]");
  };
  return (
    <BlockActionsContext.Provider value={actions}>
      <article
        ref={articleRef}
        className={`art doc ff-${typography.ff}${focus ? " focus" : ""}${live ? " live" : ""}`}
        style={typographyStyle(typography)}
        tabIndex={live ? 0 : -1}
        aria-label={live ? "文档（实时编辑）" : "文档预览"}
        onDoubleClick={(e) => {
          const el = !live && onLocate ? blockOf(e) : null;
          if (el) onLocate!(Number(el.dataset.src));
        }}
        onClick={(e) => {
          if (!live) return;
          const el = blockOf(e);
          const block = el && doc.blocks.find((b) => b.start === Number(el.dataset.src));
          live.onActivate(block ?? null, e);
        }}
        onKeyDown={live?.onKeyDown}
        onChange={(e) => {
          const line = (e.target as HTMLElement).dataset.taskLine;
          if (line) actions.onToggleTask(Number(line));
        }}
      >
        {items.map((it) => (it.type === "editor" ? <Fragment key="editor">{live!.editor}</Fragment> : <BlockView key={it.key} block={it.block} />))}
        {live && !live.range && !doc.blocks.length && <p className="art-hint">{WRITE_HERE}</p>}
      </article>
    </BlockActionsContext.Provider>
  );
});
