import { syntaxTree } from "@codemirror/language";
import { EditorState, Facet, RangeSet, StateEffect, StateField, type Range } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, WidgetType, gutterLineClass, type DecorationSet } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { calloutTitles } from "../markdown/parse";
import { toggleTask } from "../markdown/source";

/** Whether lines away from the cursor render their markup (行内渲染). */
export const inlineRender = Facet.define<boolean, boolean>({ combine: (v) => v.some(Boolean) });

/** Classes for the tokens that decorations colour; live blocks show them all as plain marks. */
export interface TokenClasses {
  taskDone: string;
  taskTodo: string;
  calloutKind: string;
  fenceLang: string;
  fenceMeta: string;
}

const sourceTokens: TokenClasses = { taskDone: "tk-ok", taskTodo: "tk-todo", calloutKind: "tk-kw", fenceLang: "tk-lang", fenceMeta: "tk-attr" };
export const liveTokens: TokenClasses = { taskDone: "mk", taskTodo: "mk", calloutKind: "mk", fenceLang: "mk", fenceMeta: "mk" };
export const tokenClasses = Facet.define<TokenClasses, TokenClasses>({ combine: (v) => v[0] ?? sourceTokens });

class LineClass extends GutterMarker {
  constructor(readonly elementClass: string) {
    super();
  }
  eq(other: GutterMarker) {
    return other instanceof LineClass && other.elementClass === this.elementClass;
  }
}

const gutterClass = new Map<string, LineClass>();
const gutterMarker = (cls: string) => {
  let m = gutterClass.get(cls);
  if (!m) gutterClass.set(cls, (m = new LineClass(cls)));
  return m;
};

class TaskBox extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: TaskBox) {
    return other.checked === this.checked;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("span");
    box.className = this.checked ? "tk-box-on" : "tk-box";
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(this.checked));
    box.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const line = view.state.doc.lineAt(view.posAtDOM(box));
      const next = toggleTask(line.text, 1);
      if (next !== line.text) view.dispatch({ changes: { from: line.from, to: line.to, insert: next } });
    });
    return box;
  }
  ignoreEvent() {
    return true;
  }
}

class CalloutLabel extends WidgetType {
  constructor(readonly title: string) {
    super();
  }
  eq(other: CalloutLabel) {
    return other.title === this.title;
  }
  toDOM() {
    const label = document.createElement("span");
    label.className = "tk-callout";
    label.textContent = this.title;
    return label;
  }
}

const hidden = Decoration.replace({});
const mark = (cls: string) => Decoration.mark({ class: cls });
const CALLOUT = /^(\s*>\s?)\[!(\w+)\]([+-]?)[ \t]*(.*)$/;
const HEADING = /^(ATX|Setext)Heading(\d)$/;

interface Decorations {
  content: DecorationSet;
  gutter: RangeSet<GutterMarker>;
}

/**
 * Token colours the highlighter cannot give (task states, callout kinds,
 * fence meta) and, with inline rendering on, the rendered look of every
 * line the selection does not touch.
 */
function build(state: EditorState): Decorations {
  const { doc } = state;
  const inline = state.facet(inlineRender);
  const tk = state.facet(tokenClasses);
  const sel = state.selection.main;
  const curFrom = doc.lineAt(sel.from).number;
  const curTo = doc.lineAt(sel.to).number;
  const rendered = (pos: number) => {
    if (!inline) return false;
    const n = doc.lineAt(pos).number;
    return n < curFrom || n > curTo;
  };
  const ranges: Range<Decoration>[] = [];
  const lineClass = new Map<number, string>();
  const calloutLines = new Set<number>();
  const setLines = (from: number, to: number, cls: string) => {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos);
      if (rendered(line.from) && !calloutLines.has(line.number)) lineClass.set(line.from, cls);
      pos = line.to + 1;
    }
  };
  const hideWithSpace = (from: number, to: number) => {
    while (doc.sliceString(to, to + 1) === " ") to++;
    ranges.push(hidden.range(from, to));
  };

  syntaxTree(state).iterate({
    enter(ref) {
      const node = ref.node;
      const heading = HEADING.exec(node.name);
      if (heading) {
        const level = Number(heading[2]);
        const cls = level === 1 ? "lv-h1" : level === 2 ? "lv-h2" : "lv-p";
        if (heading[1] === "ATX") {
          setLines(node.from, node.to, cls);
          if (rendered(node.from)) {
            node.getChildren("HeaderMark").forEach((m, i) => (i === 0 ? hideWithSpace(m.from, m.to) : ranges.push(hidden.range(m.from, m.to))));
          }
        } else {
          setLines(node.from, doc.lineAt(node.to).from - 1, cls);
        }
        return;
      }
      switch (node.name) {
        case "FrontMatter":
        case "Table":
        case "HTMLBlock":
        case "CommentBlock":
        case "BlockMath":
        case "InlineMath":
        case "Image":
          return false;
        case "FencedCode":
          fenceInfo(node, ranges, state, tk);
          return false;
        case "Paragraph":
          setLines(node.from, node.to, "lv-p");
          return;
        case "Blockquote":
          callout(node, state, rendered, ranges, calloutLines, tk);
          return;
        case "QuoteMark":
          if (rendered(node.from) && !calloutLines.has(doc.lineAt(node.from).number)) {
            ranges.push(hidden.range(node.from, Math.min(node.to + (doc.sliceString(node.to, node.to + 1) === " " ? 1 : 0), doc.lineAt(node.from).to)));
          }
          return;
        case "TaskMarker":
          task(node, state, rendered(node.from), ranges, setLines, tk);
          return;
        case "EmphasisMark":
        case "StrikethroughMark":
          if (rendered(node.from)) ranges.push(hidden.range(node.from, node.to));
          return;
        case "CodeMark":
          if (node.parent?.name === "InlineCode" && rendered(node.from)) ranges.push(hidden.range(node.from, node.to));
          return;
        case "Link":
          return link(node, rendered(node.from), ranges);
      }
    },
  });

  const gutter: Range<GutterMarker>[] = [];
  for (const [from, cls] of lineClass) {
    ranges.push(Decoration.line({ class: cls }).range(from));
    if (cls !== "lv-p") gutter.push(gutterMarker(cls).range(from));
  }
  return { content: Decoration.set(ranges, true), gutter: RangeSet.of(gutter, true) };
}

function fenceInfo(node: SyntaxNode, ranges: Range<Decoration>[], state: EditorState, tk: TokenClasses) {
  const info = node.getChild("CodeInfo");
  if (!info) return;
  const text = state.doc.sliceString(info.from, info.to);
  const lang = /^\S*/.exec(text)![0].length;
  if (lang) ranges.push(mark(tk.fenceLang).range(info.from, info.from + lang));
  if (lang < text.length) ranges.push(mark(tk.fenceMeta).range(info.from + lang, info.to));
}

function callout(
  node: SyntaxNode,
  state: EditorState,
  rendered: (pos: number) => boolean,
  ranges: Range<Decoration>[],
  calloutLines: Set<number>,
  tk: TokenClasses,
) {
  const line = state.doc.lineAt(node.from);
  const m = CALLOUT.exec(line.text);
  if (!m) return;
  const kind = m[2]!.toLowerCase();
  const start = line.from + m[1]!.length;
  if (rendered(line.from)) {
    calloutLines.add(line.number);
    const title = m[4]!.trim() || calloutTitles[kind as keyof typeof calloutTitles] || m[2]!;
    ranges.push(Decoration.replace({ widget: new CalloutLabel(title) }).range(line.from, line.to));
  } else {
    ranges.push(mark(tk.calloutKind).range(start, start + m[2]!.length + 3));
  }
}

function task(
  node: SyntaxNode,
  state: EditorState,
  rendered: boolean,
  ranges: Range<Decoration>[],
  setLines: (from: number, to: number, cls: string) => void,
  tk: TokenClasses,
) {
  const checked = /x/i.test(state.doc.sliceString(node.from, node.to));
  const item = node.parent?.parent;
  const bullet = item?.firstChild;
  if (!rendered || !item || bullet?.name !== "ListMark") {
    ranges.push(mark(checked ? tk.taskDone : tk.taskTodo).range(node.from, node.to));
    return;
  }
  const line = state.doc.lineAt(node.from);
  const textFrom = Math.min(line.to, node.to + (state.doc.sliceString(node.to, node.to + 1) === " " ? 1 : 0));
  ranges.push(Decoration.replace({ widget: new TaskBox(checked) }).range(bullet.from, textFrom));
  if (checked && textFrom < line.to) ranges.push(mark("tk-done").range(textFrom, line.to));
  setLines(line.from, line.from, "lv-p");
}

/** Inline links show only their text; references and footnotes stay as typed. */
function link(node: SyntaxNode, rendered: boolean, ranges: Range<Decoration>[]) {
  if (!rendered || !node.getChild("URL")) return false;
  const marks = node.getChildren("LinkMark");
  if (marks.length < 2) return false;
  ranges.push(hidden.range(marks[0]!.from, marks[0]!.to));
  ranges.push(hidden.range(marks[1]!.from, node.to));
  return false;
}

function touchesCursorLines(a: EditorState, b: EditorState) {
  const lines = (s: EditorState) => [s.doc.lineAt(s.selection.main.from).number, s.doc.lineAt(s.selection.main.to).number];
  const [a1, a2] = lines(a);
  const [b1, b2] = lines(b);
  return a1 !== b1 || a2 !== b2;
}

const renderField = StateField.define<Decorations>({
  create: build,
  update(value, tr) {
    const treeChanged = syntaxTree(tr.startState) !== syntaxTree(tr.state);
    const inlineChanged = tr.startState.facet(inlineRender) !== tr.state.facet(inlineRender);
    if (tr.docChanged || treeChanged || inlineChanged) return build(tr.state);
    if (tr.selection && tr.state.facet(inlineRender) && touchesCursorLines(tr.startState, tr.state)) return build(tr.state);
    return value;
  },
  provide: (f) => [EditorView.decorations.from(f, (v) => v.content), gutterLineClass.from(f, (v) => v.gutter)],
});

/** Marks a line with .ln-flash; null clears it. */
export const flashEffect = StateEffect.define<number | null>();

const flashDeco = Decoration.line({ class: "ln-flash" });
const flashField = StateField.define<number | null>({
  create: () => null,
  update(pos, tr) {
    for (const e of tr.effects) if (e.is(flashEffect)) return e.value;
    return pos === null || !tr.docChanged ? pos : tr.changes.mapPos(pos);
  },
  provide: (f) => [
    EditorView.decorations.from(f, (pos) => (pos === null ? Decoration.none : Decoration.set(flashDeco.range(pos)))),
    gutterLineClass.from(f, (pos) => (pos === null ? RangeSet.empty : RangeSet.of(gutterMarker("ln-flash").range(pos)))),
  ],
});

const flashTimers = new WeakMap<EditorView, ReturnType<typeof setTimeout>>();

function clampLine(view: EditorView, line: number) {
  return view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines)));
}

/** Flashes a 1-based line without moving the selection. */
export function flashLine(view: EditorView, line: number, ms = 1400) {
  view.dispatch({ effects: flashEffect.of(clampLine(view, line).from) });
  clearTimeout(flashTimers.get(view));
  flashTimers.set(view, setTimeout(() => view.dispatch({ effects: flashEffect.of(null) }), ms));
}

/** Scrolls to a 1-based line, puts the cursor there and flashes it. */
export function locateLine(view: EditorView, line: number) {
  const target = clampLine(view, line);
  view.dispatch({ selection: { anchor: target.from }, effects: EditorView.scrollIntoView(target.from, { y: "center" }) });
  flashLine(view, line);
}

export const renderExtensions = [renderField, flashField];
