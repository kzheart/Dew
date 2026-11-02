import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

/** Code, math and raw HTML take what is typed or pasted literally. */
const LITERAL = new Set(["FencedCode", "CodeBlock", "InlineCode", "BlockMath", "InlineMath", "HTMLBlock", "CommentBlock", "FrontMatter"]);

export function inLiteral(state: EditorState, pos: number): boolean {
  for (let n: ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]> | null = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    if (LITERAL.has(n.name)) return true;
  }
  return false;
}
