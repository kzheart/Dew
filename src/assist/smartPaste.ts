import { isolateHistory } from "@codemirror/commands";
import type { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { imageFile } from "./image";
import { inLiteral } from "./literal";
import { classifyPaste, onOwnLines, pasteNotice, type Notice } from "./paste";

export interface NoticeAction {
  label: string;
  run(): void;
}

/** A toast to show: its text, the button it offers, and what to do once it is gone. */
export interface ToastSpec extends Notice {
  action?: NoticeAction;
  onClose?(): void;
}

/** Where a pasted image was saved, as Markdown links it, or why it was not. */
export type SavedImage = { path: string } | { reason: string };

export interface PasteHost {
  /** Shows a toast; the function it returns takes the toast away. */
  notify(toast: ToastSpec): () => void;
  saveImage(image: File): Promise<SavedImage>;
  reveal(path: string): void;
}

/** A converted paste whose toast still offers 撤销: where its Markdown sits now, and what a plain paste gives. */
interface Undoable {
  from: number;
  to: number;
  markdown: string;
  plain: string;
  dismiss(): void;
}

const pasted = { userEvent: "input.paste", annotations: isolateHistory.of("full"), scrollIntoView: true } as const;

/**
 * Pastes that mean more than their text: a URL over a selection becomes a
 * link, rich text becomes Markdown, spreadsheet cells become an aligned
 * table, and a screenshot is saved beside the document and linked. Each is
 * one undo step; a conversion's toast offers 撤销 to what an ordinary paste
 * would have given. Everything else, and anything pasted into code, is the
 * editor's ordinary paste.
 */
export function smartPaste(host: PasteHost): Extension {
  const tracker = ViewPlugin.fromClass(
    class {
      undoable = new Set<Undoable>();
      update(u: ViewUpdate) {
        if (!u.docChanged) return;
        for (const p of this.undoable) {
          p.from = u.changes.mapPos(p.from, 1);
          p.to = u.changes.mapPos(p.to, -1);
          // Undone with ⌘Z or edited since: there is nothing left for 撤销 to swap.
          if (u.state.sliceDoc(p.from, p.to) !== p.markdown) p.dismiss();
        }
      }
      destroy() {
        // 撤销 needs this editor; live mode drops it when the block is left.
        for (const p of this.undoable) p.dismiss();
      }
    },
  );

  const revert = (view: EditorView, p: Undoable) => {
    view.plugin(tracker)?.undoable.delete(p);
    if (view.state.sliceDoc(p.from, p.to) !== p.markdown) return;
    view.dispatch({ changes: { from: p.from, to: p.to, insert: p.plain }, selection: { anchor: p.from + p.plain.length }, ...pasted });
  };

  const pasteImage = async (view: EditorView, image: File) => {
    const saved = await host.saveImage(image).catch((e: unknown) => ({ reason: e instanceof Error ? e.message : String(e) }));
    if ("reason" in saved) {
      host.notify({ icon: "warn", title: "截图未转存", detail: saved.reason });
      return;
    }
    // The caret may have moved while a save dialog was up; the image goes where it is now. Live mode
    // may have closed the block meanwhile, leaving only the file.
    if (view.dom.isConnected) view.dispatch({ ...view.state.replaceSelection(`![](${saved.path})`), ...pasted });
    host.notify({ icon: "image", title: "截图已转存", detail: saved.path, action: { label: "在访达中显示", run: () => host.reveal(saved.path) } });
  };

  return [
    tracker,
    EditorView.domEventHandlers({
      paste(event, view) {
        const data = event.clipboardData;
        const sel = view.state.selection.main;
        if (!data || inLiteral(view.state, sel.from)) return false;
        const text = data.getData("text/plain");
        const image = imageFile(data);
        const paste = classifyPaste({ text, html: data.getData("text/html"), hasImage: !!image }, view.state.sliceDoc(sel.from, sel.to));
        if (paste.kind === "plain") return false;
        event.preventDefault();
        if (paste.kind === "image") {
          void pasteImage(view, image!);
          return true;
        }
        const { state } = view;
        const markdown = onOwnLines(paste.markdown, state.sliceDoc(state.doc.lineAt(sel.from).from, sel.from), state.sliceDoc(sel.to, state.doc.lineAt(sel.to).to));
        view.dispatch({ ...state.replaceSelection(markdown), ...pasted });
        const p: Undoable = { from: sel.from, to: sel.from + markdown.length, markdown, plain: paste.plain.replace(/\r\n?/g, "\n"), dismiss: () => {} };
        const undoable = view.plugin(tracker)!.undoable;
        undoable.add(p);
        p.dismiss = host.notify({ ...pasteNotice(paste), action: { label: "撤销", run: () => revert(view, p) }, onClose: () => undoable.delete(p) });
        return true;
      },
    }),
  ];
}
