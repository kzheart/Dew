import { isolateHistory } from "@codemirror/commands";
import { EditorState, Prec, StateEffect, StateField, type Extension, type TransactionSpec } from "@codemirror/state";
import { EditorView, keymap, showTooltip, type Tooltip, type TooltipView } from "@codemirror/view";
import { inLiteral } from "./literal";
import { insertion, matchCommands, slashQuery, type SlashCommand } from "./slash";

/** An open menu: where its `/` is and which item is picked. The query is the text after the `/`. */
export interface SlashMenu {
  from: number;
  selected: number;
}

const select = StateEffect.define<number>();
const close = StateEffect.define<null>();

/** The query of an open menu, or null once its line no longer reads `/query` up to the caret. */
function queryOf(state: EditorState, menu: SlashMenu): string | null {
  const sel = state.selection.main;
  if (!sel.empty || sel.head <= menu.from || state.sliceDoc(menu.from, menu.from + 1) !== "/") return null;
  const line = state.doc.lineAt(menu.from);
  if (sel.head > line.to) return null;
  return slashQuery(state.sliceDoc(line.from, sel.head), state.sliceDoc(sel.head, line.to));
}

export function menuItems(state: EditorState): SlashCommand[] {
  const menu = state.field(slashField, false);
  const query = menu && queryOf(state, menu);
  return query == null ? [] : matchCommands(query);
}

export const slashField = StateField.define<SlashMenu | null>({
  create: () => null,
  update(menu, tr) {
    if (tr.effects.some((e) => e.is(close))) return null;
    if (menu) {
      const next = { from: tr.changes.mapPos(menu.from), selected: tr.docChanged ? 0 : menu.selected };
      for (const e of tr.effects) if (e.is(select)) next.selected = e.value;
      const query = queryOf(tr.state, next);
      return query != null && matchCommands(query).length ? next : null;
    }
    if (!tr.isUserEvent("input.type")) return null;
    const head = tr.state.selection.main.head;
    const line = tr.state.doc.lineAt(head);
    const before = tr.state.sliceDoc(line.from, head);
    if (slashQuery(before, tr.state.sliceDoc(head, line.to)) !== "" || inLiteral(tr.state, head)) return null;
    return { from: head - 1, selected: 0 };
  },
});

/** The transaction that writes a command in place of the menu's `/query` line. */
export function insertCommand(state: EditorState, command: SlashCommand): TransactionSpec {
  const menu = state.field(slashField)!;
  const line = state.doc.lineAt(menu.from);
  const lineText = (n: number) => (n >= 1 && n <= state.doc.lines ? state.doc.line(n).text.trim() !== "" : false);
  const { text, caret } = insertion(command, {
    indent: state.sliceDoc(line.from, menu.from),
    textAbove: lineText(line.number - 1),
    textBelow: lineText(line.number + 1),
  });
  return {
    changes: { from: line.from, to: line.to, insert: text },
    selection: { anchor: line.from + caret },
    effects: close.of(null),
    annotations: isolateHistory.of("full"),
    userEvent: "input.slash",
    scrollIntoView: true,
  };
}

function run(view: EditorView, fn: (menu: SlashMenu, items: SlashCommand[]) => TransactionSpec | null): boolean {
  const menu = view.state.field(slashField);
  if (!menu) return false;
  const spec = fn(menu, menuItems(view.state));
  if (spec) view.dispatch(spec);
  return true;
}

const move = (delta: number) => (view: EditorView) =>
  run(view, (menu, items) => ({ effects: select.of((menu.selected + delta + items.length) % items.length) }));
const pick = (view: EditorView) => run(view, (menu, items) => (items[menu.selected] ? insertCommand(view.state, items[menu.selected]!) : null));

const SVG_NS = "http://www.w3.org/2000/svg";

function iconOf(command: SlashCommand): HTMLElement {
  const box = document.createElement("span");
  box.className = "smi-ico";
  if ("glyph" in command.icon) {
    box.textContent = command.icon.glyph;
    box.classList.add("glyph");
    return box;
  }
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [k, v] of Object.entries({ width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) {
    svg.setAttribute(k, v);
  }
  svg.innerHTML = command.icon.svg;
  box.append(svg);
  return box;
}

function itemOf(command: SlashCommand, on: boolean): HTMLElement {
  const el = document.createElement("div");
  el.className = `smi${on ? " on" : ""}`;
  el.setAttribute("role", "option");
  el.setAttribute("aria-selected", String(on));
  const text = document.createElement("span");
  text.className = "smi-text";
  const name = document.createElement("b");
  name.textContent = command.name;
  const desc = document.createElement("small");
  desc.textContent = command.desc;
  text.append(name, desc);
  const token = document.createElement("kbd");
  token.textContent = command.token;
  el.append(iconOf(command), text, token);
  return el;
}

function menuView(view: EditorView): TooltipView {
  const dom = document.createElement("div");
  dom.className = "slash";
  const list = document.createElement("div");
  list.className = "slash-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "插入块");
  const foot = document.createElement("div");
  foot.className = "slash-foot";
  for (const hint of ["↑↓ 选择", "Enter 插入", "Esc 关闭"]) foot.append(Object.assign(document.createElement("span"), { textContent: hint }));
  dom.append(list, foot);
  // Keep the caret in the editor while the pointer works the menu.
  dom.addEventListener("mousedown", (e) => e.preventDefault());

  let shown: SlashCommand[] = [];
  let selected = -1;
  const render = () => {
    const menu = view.state.field(slashField);
    const items = menuItems(view.state);
    if (!menu || (items.length === shown.length && items.every((c, i) => c === shown[i]) && menu.selected === selected)) return;
    shown = items;
    selected = menu.selected;
    list.replaceChildren(
      ...items.map((command, i) => {
        const el = itemOf(command, i === selected);
        el.addEventListener("pointermove", () => {
          if (view.state.field(slashField)?.selected !== i) view.dispatch({ effects: select.of(i) });
        });
        el.addEventListener("click", () => view.dispatch(insertCommand(view.state, command)));
        return el;
      }),
    );
    list.children[selected]?.scrollIntoView({ block: "nearest" });
  };
  render();
  return { dom, offset: { x: -10, y: 6 }, update: render };
}

const menuTooltip = showTooltip.compute([slashField], (state): Tooltip | null => {
  const menu = state.field(slashField);
  // Live mode's block editor is a few lines tall inside the article's scroller, with scroll margins
  // taller than itself, so CodeMirror's clipping would hide the menu there.
  return menu ? { pos: menu.from, create: menuView, clip: false } : null;
});

/**
 * Typing `/` on an empty line opens a menu of blocks to insert; typing on
 * filters it, ↑↓ pick, Enter or a click inserts, Esc or leaving the line
 * closes it.
 */
export function slashMenu(): Extension {
  return [
    slashField,
    menuTooltip,
    Prec.highest(
      keymap.of([
        { key: "ArrowDown", run: move(1) },
        { key: "ArrowUp", run: move(-1) },
        { key: "Enter", run: pick },
        { key: "Tab", run: pick },
        { key: "Escape", run: (view) => run(view, () => ({ effects: close.of(null) })) },
      ]),
    ),
    EditorView.focusChangeEffect.of((state, focusing) => (!focusing && state.field(slashField) ? close.of(null) : null)),
  ];
}
