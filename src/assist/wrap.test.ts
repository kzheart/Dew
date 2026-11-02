import { history, undo } from "@codemirror/commands";
import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, test } from "bun:test";
import { wrapSelection } from "./wrap";

const DOC = "滚动对齐基于块级映射。";
const selected = (doc = DOC, from = doc.indexOf("块级映射"), to = from + 4) =>
  EditorState.create({ doc, selection: { anchor: from, head: to }, extensions: [history()] });

function wrap(state: EditorState, key: string) {
  const spec = wrapSelection(state, key);
  if (!spec) return null;
  const next = state.update(spec).state;
  const { from, to } = next.selection.main;
  return { state: next, doc: next.doc.toString(), selection: next.sliceDoc(from, to), caret: to };
}

describe("wrapping a selection", () => {
  test("` makes inline code and keeps the text selected", () => {
    const r = wrap(selected(), "`")!;
    expect(r.doc).toBe("滚动对齐基于`块级映射`。");
    expect(r.selection).toBe("块级映射");
  });

  test("* makes bold", () => {
    expect(wrap(selected(), "*")!.doc).toBe("滚动对齐基于**块级映射**。");
  });

  test("[ makes a link with the caret between the parentheses", () => {
    const r = wrap(selected(), "[")!;
    expect(r.doc).toBe("滚动对齐基于[块级映射]()。");
    expect(r.doc.slice(r.caret - 1, r.caret + 1)).toBe("()");
  });

  test("$ makes inline math", () => {
    expect(wrap(selected(), "$")!.doc).toBe("滚动对齐基于$块级映射$。");
  });

  test("a Chinese input method's 【 · ￥ wrap like [ ` $", () => {
    expect(wrap(selected(), "【")!.doc).toBe("滚动对齐基于[块级映射]()。");
    expect(wrap(selected(), "·")!.doc).toBe("滚动对齐基于`块级映射`。");
    expect(wrap(selected(), "￥")!.doc).toBe("滚动对齐基于$块级映射$。");
  });

  test("spaces at the ends of the selection stay outside the markers", () => {
    expect(wrap(selected("a  word  b", 1, 9), "*")!.doc).toBe("a  **word**  b");
  });

  test("one undo restores the original text and selection", () => {
    const start = selected();
    const r = wrap(start, "*")!;
    let back = r.state;
    undo({ state: r.state, dispatch: (tr) => (back = tr.state) });
    expect(back.doc.toString()).toBe(DOC);
    expect(back.sliceDoc(back.selection.main.from, back.selection.main.to)).toBe("块级映射");
  });

  test("without a selection, across lines, or for other keys the key types as usual", () => {
    expect(wrap(EditorState.create({ doc: DOC }), "*")).toBeNull();
    expect(wrap(selected("一行\n二行", 0, 4), "*")).toBeNull();
    expect(wrap(selected(), "a")).toBeNull();
  });

  test("every selected range is wrapped", () => {
    const state = EditorState.create({
      doc: "甲 乙",
      selection: EditorSelection.create([EditorSelection.range(0, 1), EditorSelection.range(2, 3)]),
      extensions: [EditorState.allowMultipleSelections.of(true)],
    });
    expect(wrap(state, "`")!.doc).toBe("`甲` `乙`");
  });
});
