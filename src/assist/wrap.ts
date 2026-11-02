import { isolateHistory } from "@codemirror/commands";
import { EditorSelection, type EditorState, type TransactionSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

interface Pair {
  open: string;
  close: string;
  /** A link leaves the caret between its parentheses, for the URL; the others keep the text selected. */
  link?: boolean;
}

const code: Pair = { open: "`", close: "`" };
const math: Pair = { open: "$", close: "$" };
const link: Pair = { open: "[", close: "]()", link: true };

/** The keys that wrap a selection, with what a Chinese input method types for the same key. */
const PAIRS: Record<string, Pair> = {
  "`": code,
  "·": code,
  "*": { open: "**", close: "**" },
  "[": link,
  "【": link,
  $: math,
  "￥": math,
  "¥": math,
};

/**
 * What typing a pairing symbol over a selection does: wraps the selected
 * text instead of replacing it, leaving surrounding spaces outside so the
 * Markdown stays valid. Null when nothing is selected or a selection spans
 * lines, where the key types as usual.
 */
export function wrapSelection(state: EditorState, typed: string): TransactionSpec | null {
  const pair = PAIRS[typed];
  const ranges = state.selection.ranges;
  if (!pair || ranges.every((r) => r.empty)) return null;
  if (ranges.some((r) => !r.empty && state.doc.lineAt(r.from).number !== state.doc.lineAt(r.to).number)) return null;
  return {
    ...state.changeByRange((range) => {
      const text = state.sliceDoc(range.from, range.to);
      if (!text.trim()) return { changes: { from: range.from, to: range.to, insert: typed }, range: EditorSelection.cursor(range.from + typed.length) };
      const from = range.from + (text.length - text.trimStart().length);
      const to = range.to - (text.length - text.trimEnd().length);
      const shift = pair.open.length;
      return {
        changes: [
          { from, insert: pair.open },
          { from: to, insert: pair.close },
        ],
        range: pair.link ? EditorSelection.cursor(to + shift + 2) : EditorSelection.range(from + shift, to + shift),
      };
    }),
    annotations: isolateHistory.of("full"),
    userEvent: "input.wrap",
    scrollIntoView: true,
  };
}

/** Typing ` * [ $ over a selection wraps it as code, bold, a link or math. */
export const wrapPairs = EditorView.inputHandler.of((view, from, to, text) => {
  const sel = view.state.selection.main;
  const spec = from === sel.from && to === sel.to ? wrapSelection(view.state, text) : null;
  if (spec) view.dispatch(spec);
  return !!spec;
});
