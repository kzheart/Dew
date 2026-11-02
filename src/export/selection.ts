import { EditorView } from "@codemirror/view";
import { languageLabel } from "../markdown/highlight";
import { parseDocument, type Block, type ParsedDocument } from "../markdown/parse";
import type { CodeBlock } from "../preview/actions";
import { tidyCode, type CardContent } from "./card";
import { documentTitle } from "./names";

/** Rendered parts that are not the passage itself: footnote markers, MathML twins, line numbers, controls. */
const NOT_TEXT = ".fn-ref,.katex-mathml,.cb-ln,.dl-no,button,input";
const FENCE = /^\s*(`{3,}|~{3,})/;

interface Source {
  doc: ParsedDocument;
  text: string;
  fileName: string;
  /** The source editor, whose selection counts when the page has none. */
  editor: EditorView | null;
}

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const htmlText = (html: string) => new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";

function codeCard(block: CodeBlock, code: string): CardContent {
  const lang = block.view.kind === "diagram" && block.view.engine === "vega-lite" ? "json" : block.lang;
  const tidy = tidyCode(block.view.kind === "diagram" ? block.code : code);
  return { kind: "code", title: block.title || languageLabel(block.lang), lang, code: tidy || block.code };
}

/** A selection that starts at the document's title shows it once, as the card's title. */
function textCard(src: Source, paragraphs: string[]): CardContent {
  const title = documentTitle(src.doc, src.fileName);
  return { kind: "text", title, paragraphs: paragraphs[0] === title ? paragraphs.slice(1) : paragraphs };
}

/** The paragraphs of a Markdown passage as plain text. */
function markdownParagraphs(md: string): string[] {
  const text = (b: Block): string[] => {
    switch (b.kind) {
      case "code":
        return [b.code];
      case "list":
        return b.items.flatMap((it) => lines(htmlText(it.html)));
      case "table":
        return [b.header, ...b.rows].map((r) => r.map(htmlText).join("  "));
      case "heading":
      case "paragraph":
      case "quote":
      case "callout":
      case "html":
        return lines(htmlText(b.html));
      default:
        return [];
    }
  };
  return parseDocument(md).blocks.flatMap(text);
}

const codeBlockAround = (doc: ParsedDocument, from: number, to: number) =>
  doc.blocks.find((b): b is CodeBlock => b.kind === "code" && b.start <= from && to <= b.end) ?? null;

/** A selection in an editor of Markdown source: the main editor, or live mode's, whose host names its first line. */
function editorCard(view: EditorView, src: Source): CardContent | null {
  const { from, to } = view.state.selection.main;
  if (from === to) return null;
  const first = Number(view.dom.closest<HTMLElement>("[data-line]")?.dataset.line ?? 1);
  const lineOf = (pos: number) => first + view.state.doc.lineAt(pos).number - 1;
  const start = lineOf(from);
  const end = lineOf(to > from && view.state.doc.lineAt(to).from === to ? to - 1 : to);
  const selected = view.state.sliceDoc(from, to);
  const block = codeBlockAround(src.doc, start, end);
  if (!block) return textCard(src, markdownParagraphs(selected));
  const source = src.text.split("\n");
  const fence = (n: number) => (n === block.start || n === block.end) && FENCE.test(source[n - 1] ?? "");
  const code = selected.split("\n").filter((_, i) => !fence(start + i)).join("\n");
  return codeCard(block, code);
}

/** A selection in the rendered document, as laid out. */
function renderedCard(range: Range, src: Source): CardContent | null {
  const holder = document.createElement("div");
  holder.className = "art";
  holder.style.cssText = "position:fixed;left:-20000px;top:0;width:820px";
  holder.append(range.cloneContents());
  holder.querySelectorAll(NOT_TEXT).forEach((el) => el.remove());
  document.body.append(holder);
  const text = holder.innerText;
  holder.remove();
  if (!text.trim()) return null;
  const node = range.commonAncestorContainer;
  const el = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>("[data-src]");
  const block = el?.dataset.blk === "code" ? codeBlockAround(src.doc, Number(el.dataset.src), Number(el.dataset.src)) : null;
  return block ? codeCard(block, text.replace(/\n+$/, "")) : textCard(src, lines(text));
}

/**
 * What a share card shows for the user's selection: code from inside a code
 * block, else the selected paragraphs; with nothing selected, the document's
 * first paragraph.
 */
export function selectedCard(src: Source): CardContent {
  const sel = getSelection();
  if (sel && !sel.isCollapsed && sel.rangeCount) {
    const cm = sel.anchorNode?.parentElement?.closest<HTMLElement>(".cm-editor");
    const card = cm ? editorCard(EditorView.findFromDOM(cm)!, src) : renderedCard(sel.getRangeAt(0), src);
    if (card) return card;
  }
  const fromEditor = src.editor && editorCard(src.editor, src);
  if (fromEditor) return fromEditor;
  const p = src.doc.blocks.find((b) => b.kind === "paragraph");
  return textCard(src, p ? lines(htmlText(p.html)) : []);
}
