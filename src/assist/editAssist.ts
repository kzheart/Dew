import type { Extension } from "@codemirror/state";
import { slashMenu } from "./slashMenu";
import { wrapPairs } from "./wrap";

/** The typing aids both editors share: the source editor and live mode's block editor. */
export function editAssist(): Extension {
  return [slashMenu(), wrapPairs];
}
