import katex from "katex";
import type { Env, MarkdownIt, StateBlock, StateInline, Token } from "markdown-it";

export interface RenderEnv extends Env {
  /** Footnote numbers and rendered definitions by label. */
  footnotes?: Map<string, { n: number; html: string }>;
  resolveImage?: (src: string) => string;
  /** MathML only, for places that cannot load KaTeX's fonts. */
  mathml?: boolean;
}

export function renderMath(tex: string, displayMode: boolean, env: RenderEnv): string {
  return katex.renderToString(tex, {
    displayMode,
    throwOnError: false,
    output: env.mathml ? "mathml" : "htmlAndMathml",
  });
}

const isSpace = (c: number | undefined) => c === 0x20 || c === 0x09 || c === 0x0a;
const isDigit = (c: number | undefined) => c !== undefined && c >= 0x30 && c <= 0x39;

/** `$…$` inline math (pandoc's rules: no space inside the dollars, no digit after the closing one), `$$…$$` display math in a paragraph, and `$$` blocks on lines of their own. */
export function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.before("escape", "math_inline", (state: StateInline, silent: boolean) => {
    const src = state.src;
    const start = state.pos;
    if (src.charCodeAt(start) !== 0x24) return false;
    if (start > 0 && src.charCodeAt(start - 1) === 0x5c) return false;
    const display = src.charCodeAt(start + 1) === 0x24;
    const open = display ? 2 : 1;
    if (isSpace(src.charCodeAt(start + open)) || start + open >= state.posMax) return false;
    let end = start + open;
    for (;;) {
      end = src.indexOf(display ? "$$" : "$", end);
      if (end < 0 || end >= state.posMax) return false;
      if (src.charCodeAt(end - 1) === 0x5c) {
        end += 1;
        continue;
      }
      if (!display && (isSpace(src.charCodeAt(end - 1)) || isDigit(src.charCodeAt(end + 1)))) {
        end += 1;
        continue;
      }
      break;
    }
    if (end === start + open) return false;
    if (!silent) {
      const token = state.push("math_inline", "math", 0);
      token.content = src.slice(start + open, end);
      token.markup = display ? "$$" : "$";
    }
    state.pos = end + open;
    return true;
  });

  md.block.ruler.before(
    "fence",
    "math_block",
    (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
      let pos = state.bMarks[startLine]! + state.tShift[startLine]!;
      let max = state.eMarks[startLine]!;
      if (state.sCount[startLine]! - state.blkIndent >= 4) return false;
      if (state.src.slice(pos, pos + 2) !== "$$") return false;
      const firstLine = state.src.slice(pos + 2, max);
      if (silent) return true;
      let content: string;
      let nextLine = startLine;
      const oneLine = firstLine.trim().endsWith("$$") && firstLine.trim().length > 2;
      if (oneLine) {
        content = firstLine.trim().slice(0, -2);
      } else {
        const lines = firstLine.trim() ? [firstLine] : [];
        let closed = false;
        while (++nextLine < endLine) {
          pos = state.bMarks[nextLine]! + state.tShift[nextLine]!;
          max = state.eMarks[nextLine]!;
          if (pos < max && state.sCount[nextLine]! < state.blkIndent) break;
          const line = state.src.slice(pos, max);
          if (line.trimEnd().endsWith("$$")) {
            lines.push(line.trimEnd().slice(0, -2));
            closed = true;
            break;
          }
          lines.push(state.src.slice(state.bMarks[nextLine]!, max));
        }
        if (!closed) nextLine = endLine - 1;
        content = lines.join("\n");
      }
      state.line = nextLine + 1;
      const token = state.push("math_block", "math", 0);
      token.block = true;
      token.content = content.trim();
      token.markup = "$$";
      token.map = [startLine, state.line];
      return true;
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );

  md.renderer.rules.math_inline = (tokens, idx, _o, env?: RenderEnv) =>
    renderMath(tokens[idx]!.content, tokens[idx]!.markup === "$$", env ?? {});
  md.renderer.rules.math_block = (tokens, idx, _o, env?: RenderEnv) =>
    `<div class="mblk">${renderMath(tokens[idx]!.content, true, env ?? {})}</div>\n`;
}

const FOOTNOTE_DEF = /^\[\^([^\]\s]+)\]:[ \t]?/;

/** `[^label]` references and `[^label]: text` definitions, which stay where the source has them so that blocks keep the source's order. */
export function footnotePlugin(md: MarkdownIt): void {
  md.block.ruler.before(
    "reference",
    "footnote_def",
    (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
      const pos = state.bMarks[startLine]! + state.tShift[startLine]!;
      if (state.sCount[startLine]! - state.blkIndent >= 4) return false;
      const m = FOOTNOTE_DEF.exec(state.src.slice(pos, state.eMarks[startLine]!));
      if (!m) return false;
      if (silent) return true;
      const lines = [state.src.slice(pos + m[0].length, state.eMarks[startLine]!)];
      let nextLine = startLine + 1;
      while (nextLine < endLine) {
        const begin = state.bMarks[nextLine]!;
        const max = state.eMarks[nextLine]!;
        if (state.isEmpty(nextLine) || state.sCount[nextLine]! < state.blkIndent + 2) break;
        lines.push(state.src.slice(begin, max).trim());
        nextLine++;
      }
      state.line = nextLine;
      const token = state.push("footnote_def", "", 0);
      token.block = true;
      token.meta = { label: m[1] };
      token.content = lines.join("\n");
      token.map = [startLine, nextLine];
      return true;
    },
    { alt: ["paragraph"] },
  );

  md.inline.ruler.before("link", "footnote_ref", (state: StateInline, silent: boolean) => {
    const src = state.src;
    const start = state.pos;
    if (src.charCodeAt(start) !== 0x5b || src.charCodeAt(start + 1) !== 0x5e) return false;
    const end = src.indexOf("]", start + 2);
    if (end < 0 || end >= state.posMax) return false;
    const label = src.slice(start + 2, end);
    if (!label || /\s/.test(label)) return false;
    if (!silent) {
      const token = state.push("footnote_ref", "", 0);
      token.meta = { label };
    }
    state.pos = end + 1;
    return true;
  });

  md.renderer.rules.footnote_ref = (tokens, idx, _o, env?: RenderEnv) => {
    const label = tokenLabel(tokens[idx]!);
    const fn = env?.footnotes?.get(label);
    if (!fn) return md.utils.escapeHtml(`[^${label}]`);
    return (
      `<a class="fn-ref" href="#fn-${fn.n}" aria-label="脚注 ${fn.n}">${fn.n}` +
      `<span class="fn-pop" role="tooltip"><b>脚注 ${fn.n}</b>${fn.html}</span></a>`
    );
  };
  md.renderer.rules.footnote_def = () => "";
}

/** Task list markers become checkboxes that name their source line, wherever the list is. */
export function taskPlugin(md: MarkdownIt): void {
  md.core.ruler.after("inline", "task_items", (state) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      const inline = tokens[i]!;
      if (inline.type !== "inline" || tokens[i - 1]!.type !== "paragraph_open") continue;
      if (tokens[i - 2]!.type !== "list_item_open") continue;
      const task = taskMarker(inline.content);
      if (task === null) continue;
      const item = tokens[i - 2]!;
      item.meta = { ...item.meta, task };
      const first = inline.children?.[0];
      if (first?.type === "text") first.content = first.content.replace(TASK_MARKER, "");
      inline.content = inline.content.replace(TASK_MARKER, "");
    }
  });
  md.renderer.rules.list_item_open = (tokens, idx, options, _env, self) => {
    const token = tokens[idx]!;
    const task = tokenTask(token);
    if (task === undefined) return self.renderToken(tokens, idx, options);
    const line = token.map ? token.map[0] + 1 : 0;
    return `<li class="task-item"><input type="checkbox" data-task-line="${line}"${task ? " checked" : ""}> `;
  };
}

export const tokenLabel = (t: Token) => String(t.meta?.label ?? "");
export const tokenTask = (t: Token) => t.meta?.task as boolean | undefined;

export const TASK_MARKER = /^\[([ xX])\][ \t]+/;

export function taskMarker(content: string): boolean | null {
  const m = TASK_MARKER.exec(content);
  return m ? m[1] !== " " : null;
}

/** Links open in the browser, images resolve against the document, and code in a sentence gets the inline code style. */
export function presentationPlugin(md: MarkdownIt): void {
  md.renderer.rules.code_inline = (tokens, idx) =>
    `<code class="ic">${md.utils.escapeHtml(tokens[idx]!.content)}</code>`;
  const linkOpen = md.renderer.rules.link_open;
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!;
    if (/^https?:/i.test(String(token.attrGet("href") ?? ""))) {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noreferrer");
    }
    return linkOpen ? linkOpen(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
  };
  const image = md.renderer.rules.image!;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!;
    const src = token.attrGet("src");
    const resolve = (env as RenderEnv | undefined)?.resolveImage;
    if (src && resolve) token.attrSet("src", resolve(String(src)));
    token.attrSet("loading", "lazy");
    return image(tokens, idx, options, env, self);
  };
}
