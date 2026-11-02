import type { Extension } from "@codemirror/state";
import { slashMenu } from "./slashMenu";
import { smartPaste, type PasteHost } from "./smartPaste";
import { wrapPairs } from "./wrap";

/** The typing aids both editors share: the source editor and live mode's block editor. Settings turn the slash menu and pair wrapping off. */
export function editAssist(host: PasteHost, { slash = true, pairs = true }: { slash?: boolean; pairs?: boolean } = {}): Extension {
  return [slash ? slashMenu() : [], pairs ? wrapPairs : [], smartPaste(host)];
}
