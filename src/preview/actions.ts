import { createContext } from "react";
import type { DiagramTheme } from "../diagram/engines";
import type { Block, DiagramEngine } from "../markdown/parse";

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
  /** The background diagrams are drawn for. */
  theme: DiagramTheme;
  onToggleLineNumbers(): void;
  onToggleTask(line: number): void;
  onZoom(target: LightboxTarget): void;
  onExportSvg(svg: string, engine: DiagramEngine): void;
  /** Live mode only: rewrites a table's source, returning the new source. */
  onEditTable?(block: TableBlock, change: (src: string) => string): string;
}

export const BlockActionsContext = createContext<BlockActions>({
  interactive: false,
  showLineNumbers: true,
  theme: "white",
  onToggleLineNumbers() {},
  onToggleTask() {},
  onZoom() {},
  onExportSvg() {},
});
