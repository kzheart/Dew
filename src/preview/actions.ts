import { createContext } from "react";
import type { Block } from "../markdown/parse";

export type CodeBlock = Extract<Block, { kind: "code" }>;
export type TableBlock = Extract<Block, { kind: "table" }>;

/** What the lightbox enlarges. */
export type LightboxTarget =
  | { kind: "code"; block: CodeBlock }
  | { kind: "table"; block: TableBlock }
  | { kind: "diagram"; block: CodeBlock; svg: string };

export interface BlockActions {
  /** False when rendering for an export: no buttons, everything open. */
  interactive: boolean;
  showLineNumbers: boolean;
  onToggleLineNumbers(): void;
  onToggleTask(line: number): void;
  onZoom(target: LightboxTarget): void;
}

export const BlockActionsContext = createContext<BlockActions>({
  interactive: false,
  showLineNumbers: true,
  onToggleLineNumbers() {},
  onToggleTask() {},
  onZoom() {},
});
