import { history, undo } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, test } from "bun:test";
import { slashCommands } from "./slash";
import { insertCommand, menuItems, slashField, slashMenu } from "./slashMenu";

const editor = (doc: string, at = doc.length) => {
  const state = EditorState.create({ doc, selection: { anchor: at }, extensions: [markdown(), history(), slashMenu()] });
  ensureSyntaxTree(state, state.doc.length, 1000);
  return state;
};
const type = (state: EditorState, text: string) => {
  const head = state.selection.main.head;
  return state.update({ changes: { from: head, insert: text }, selection: { anchor: head + text.length }, userEvent: "input.type" }).state;
};
const ids = (state: EditorState) => menuItems(state).map((c) => c.id);
const pick = (state: EditorState, id: string) => state.update(insertCommand(state, slashCommands.find((c) => c.id === id)!)).state;

describe("slash menu", () => {
  test("opens on / at the start of an empty line and lists the blocks", () => {
    const s = type(editor("# 部署步骤\n\n"), "/");
    expect(s.field(slashField)).not.toBeNull();
    expect(ids(s).slice(0, 5)).toEqual(["code", "table", "note", "math", "task"]);
    expect(ids(s)).not.toContain("tip");
  });

  test("filters by Chinese name and by English or pinyin alias", () => {
    const s = type(editor(""), "/");
    expect(ids(type(s, "ta"))).toEqual(["table", "task"]);
    expect(ids(type(s, "表格"))).toEqual(["table"]);
    expect(ids(type(s, "列表"))).toEqual(["task", "ul", "ol"]);
    expect(ids(type(s, "h"))).toEqual(["h1", "h2", "h3", "hr"]);
    expect(ids(type(s, "提示"))).toEqual(["note", "tip", "warning"]);
    expect(ids(type(s, "bg"))).toEqual(["table"]);
  });

  test("does not open after text, inside a code fence, or on a second /", () => {
    expect(type(editor("看 "), "/").field(slashField)).toBeNull();
    expect(type(editor("```\n\n```", 4), "/").field(slashField)).toBeNull();
    expect(type(editor("/"), "/").field(slashField)).toBeNull();
  });

  test("closes when nothing matches, the caret leaves the line, or the / is deleted", () => {
    const s = type(editor("上一行\n"), "/");
    expect(type(s, "zzz").field(slashField)).toBeNull();
    expect(s.update({ selection: { anchor: 0 } }).state.field(slashField)).toBeNull();
    expect(s.update({ changes: { from: s.doc.length - 1, to: s.doc.length } }).state.field(slashField)).toBeNull();
  });

  test("Enter on 表格 replaces /query with a 3 × 3 table and puts the caret in the first header cell", () => {
    const s = pick(type(type(editor(""), "/"), "table"), "table");
    const lines = s.doc.toString().split("\n");
    expect(lines).toEqual(["|     |     |     |", "| --- | --- | --- |", "|     |     |     |", "|     |     |     |", "|     |     |     |"]);
    expect(s.selection.main.head).toBe(2);
    expect(s.field(slashField)).toBeNull();
  });

  test("a code block puts the caret on the language, and keeps the line's indent", () => {
    const s = pick(type(editor("- 列表\n  "), "/"), "code");
    expect(s.doc.toString()).toBe("- 列表\n\n  ```\n  \n  ```");
    expect(s.doc.lineAt(s.selection.main.head).text).toBe("  ```");
  });

  test("TIP and WARNING callouts are reachable by alias", () => {
    const s = type(type(editor(""), "/"), "warn");
    expect(ids(s)).toEqual(["warning"]);
    expect(pick(s, "warning").doc.toString()).toBe("> [!WARNING]\n> ");
  });

  test("blocks get the blank lines that keep them from joining their neighbours", () => {
    const table = pick(type(editor("段落\n\n下文", 3), "/"), "table").doc.toString().split("\n");
    expect(table[0]).toBe("段落");
    expect(table[1]).toBe("");
    expect(table.at(-2)).toBe("");
    expect(table.at(-1)).toBe("下文");
    expect(pick(type(editor("段落\n"), "/"), "hr").doc.toString()).toBe("段落\n\n---\n");
    expect(pick(type(editor("段落\n"), "/"), "task").doc.toString()).toBe("段落\n- [ ] ");
  });

  test("one undo brings the /query back", () => {
    const typed = type(type(editor(""), "/"), "math");
    const inserted = pick(typed, "math");
    expect(inserted.doc.toString()).toBe("$$\n\n$$");
    let after = inserted;
    undo({ state: inserted, dispatch: (tr) => (after = tr.state) });
    expect(after.doc.toString()).toBe("/math");
  });
});
