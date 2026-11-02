import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { useEffect, useRef, type Ref } from "react";
import { diff } from "../markdown/source";
import { inlineRender, renderExtensions } from "./render";
import { markdownSyntax } from "./syntax";

export interface Cursor {
  line: number;
  col: number;
}

/** Changes that came from the document, not from typing, so they are not echoed back. */
export const external = Annotation.define<boolean>();

interface Props {
  text: string;
  inline: boolean;
  focus: boolean;
  wide: boolean;
  viewRef?: Ref<EditorView | null>;
  onChange(text: string): void;
  onCursor(cursor: Cursor): void;
  onScroll?(): void;
}

export function SourceEditor({ text, inline, focus, wide, viewRef, onChange, onCursor, onScroll }: Props) {
  const parent = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const inlineConf = useRef(new Compartment());
  const callbacks = useRef({ onChange, onCursor, onScroll });
  callbacks.current = { onChange, onCursor, onScroll };

  useEffect(() => {
    const report = (state: EditorState) => {
      const head = state.selection.main.head;
      const line = state.doc.lineAt(head);
      callbacks.current.onCursor({ line: line.number, col: head - line.from + 1 });
    };
    const v = new EditorView({
      parent: parent.current!,
      state: EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          markdownSyntax(),
          renderExtensions,
          inlineConf.current.of(inlineRender.of(inline)),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.scrollMargins.of(() => ({ top: 84, bottom: 80 })),
          EditorView.contentAttributes.of({ "aria-label": "Markdown 源码", spellcheck: "false", autocorrect: "off", autocapitalize: "off" }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !u.transactions.some((tr) => tr.annotation(external))) {
              callbacks.current.onChange(u.state.doc.toString());
            }
            if (u.docChanged || u.selectionSet) report(u.state);
          }),
        ],
      }),
    });
    v.scrollDOM.addEventListener("scroll", () => callbacks.current.onScroll?.(), { passive: true });
    view.current = v;
    assignRef(viewRef, v);
    report(v.state);
    return () => {
      assignRef(viewRef, null);
      view.current = null;
      v.destroy();
    };
    // The view is created once; later props are applied by the effects below.
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const change = diff(v.state.doc.toString(), text);
    if (change) v.dispatch({ changes: change, annotations: external.of(true) });
  }, [text]);

  useEffect(() => {
    view.current?.dispatch({ effects: inlineConf.current.reconfigure(inlineRender.of(inline)) });
  }, [inline]);

  return <div ref={parent} className={`ed${focus ? " focus" : ""}${wide ? " wide" : ""}`} />;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}
