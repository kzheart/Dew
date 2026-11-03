import type { EditorView } from "@codemirror/view";
import { useRef, type RefObject } from "react";
import { previewOffsetFor, sourcePosFor, type BlockBox, type SourcePos } from "../state/scrollSync";

/** How far each pane's content sits below the floating header. */
const EDITOR_INSET = 84;
const PREVIEW_INSET = 92;
/** Long enough to swallow the scroll event that a sync itself causes. */
const LOCK_MS = 120;

function previewBlocks(pv: HTMLElement): BlockBox[] {
  return [...pv.querySelectorAll<HTMLElement>("[data-src]")].map((el) => ({
    start: Number(el.dataset.src),
    end: Number(el.dataset.end),
    top: el.offsetTop,
    height: el.offsetHeight,
  }));
}

/** Where the document starts inside the editor's scroll content. */
function documentOffset(view: EditorView) {
  return view.documentTop - view.scrollDOM.getBoundingClientRect().top + view.scrollDOM.scrollTop;
}

function editorPos(view: EditorView): SourcePos {
  const y = view.scrollDOM.scrollTop + EDITOR_INSET - documentOffset(view);
  const block = view.lineBlockAtHeight(y);
  return { line: view.state.doc.lineAt(block.from).number, frac: Math.max(0, (y - block.top) / block.height) };
}

function editorOffsetFor(view: EditorView, pos: SourcePos) {
  const block = view.lineBlockAt(view.state.doc.line(Math.min(pos.line, view.state.doc.lines)).from);
  return documentOffset(view) + block.top - EDITOR_INSET + pos.frac * block.height;
}

/**
 * Block-anchored scroll sync between the source editor and the preview. It remembers the source place
 * the reader last scrolled to in either pane, so a pane that shows after a mode change opens there.
 */
export function useScrollSync(editor: RefObject<EditorView | null>, preview: RefObject<HTMLElement | null>) {
  const lock = useRef<{ by: "editor" | "preview" | null; timer?: ReturnType<typeof setTimeout> }>({ by: null });
  const anchor = useRef<SourcePos | null>(null);
  const hold = (by: "editor" | "preview") => {
    lock.current.by = by;
    clearTimeout(lock.current.timer);
    lock.current.timer = setTimeout(() => (lock.current.by = null), LOCK_MS);
  };
  const toPreview = (pos: SourcePos) => {
    const pv = preview.current;
    const top = pv && previewOffsetFor(pos, previewBlocks(pv));
    if (!pv || top == null) return;
    hold("editor");
    pv.scrollTop = top - PREVIEW_INSET;
  };
  const toEditor = (pos: SourcePos) => {
    const view = editor.current;
    if (!view) return;
    hold("preview");
    view.scrollDOM.scrollTop = editorOffsetFor(view, pos);
  };
  return {
    /** The editor scrolled; the preview follows when it shows beside it. */
    fromEditor(follow: boolean) {
      const view = editor.current;
      if (!view || lock.current.by === "preview") return;
      anchor.current = editorPos(view);
      if (follow) toPreview(anchor.current);
    },
    /** The preview scrolled; the editor follows when it shows beside it. */
    fromPreview(follow: boolean) {
      const pv = preview.current;
      if (!pv || lock.current.by === "editor") return;
      const pos = sourcePosFor(pv.scrollTop + PREVIEW_INSET, previewBlocks(pv));
      if (!pos) return;
      anchor.current = pos;
      if (follow) toEditor(pos);
    },
    /** Brings a pane to the place the reader last scrolled to. */
    restore(pane: "editor" | "preview") {
      if (!anchor.current) return;
      if (pane === "editor") toEditor(anchor.current);
      else toPreview(anchor.current);
    },
  };
}
