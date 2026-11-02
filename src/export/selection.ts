import { EditorView } from "@codemirror/view";

/** Rendered parts that are not the passage itself: footnote markers, MathML twins, line numbers, controls. */
const NOT_TEXT = ".fn-ref,.katex-mathml,.cb-ln,button,input";

/**
 * The passage the user selected, as text: from an editor, its source; from
 * the rendered document, the text as laid out, line breaks included.
 */
export function selectedPassage(fallback: EditorView | null): string {
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.rangeCount) {
    const editor = sel.anchorNode?.parentElement?.closest<HTMLElement>(".cm-editor");
    if (editor) return editorSelection(EditorView.findFromDOM(editor));
    const holder = document.createElement("div");
    holder.className = "art";
    holder.style.cssText = "position:fixed;left:-20000px;top:0;width:820px";
    holder.append(sel.getRangeAt(0).cloneContents());
    holder.querySelectorAll(NOT_TEXT).forEach((el) => el.remove());
    document.body.append(holder);
    const text = holder.innerText;
    holder.remove();
    if (text.trim()) return text;
  }
  return editorSelection(fallback);
}

function editorSelection(view: EditorView | null): string {
  const r = view?.state.selection.main;
  return view && r && !r.empty ? view.state.sliceDoc(r.from, r.to) : "";
}
