import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import type { Extension } from "@codemirror/state";
import { Tag, styleTags, tags as t } from "@lezer/highlight";
import type { BlockContext, BlockParser, Element, InlineContext, LeafBlock, Line, MarkdownConfig } from "@lezer/markdown";

const mathTag = Tag.define();
/** Nodes that decorations colour, so the highlighter must leave them alone. */
const decorated = Tag.define();
const fmKey = Tag.define();
const fmValue = Tag.define();
const fmPunct = Tag.define();

const DOLLAR = 36;
const isSpace = (c: number) => c === 32 || c === 9 || c === 10;
const isDigit = (c: number) => c >= 48 && c <= 57;

/** `$…$` and `$$…$$`, with the same delimiter rules as the preview's markdown-it plugin. */
function parseInlineMath(cx: InlineContext, next: number, pos: number): number {
  if (next !== DOLLAR) return -1;
  const open = cx.char(pos + 1) === DOLLAR ? 2 : 1;
  const text = cx.slice(pos, cx.end);
  if (text.length <= open || isSpace(text.charCodeAt(open))) return -1;
  let i = open;
  for (;;) {
    i = text.indexOf(open === 2 ? "$$" : "$", i);
    if (i < 0) return -1;
    if (text.charCodeAt(i - 1) === 92 || (open === 1 && (isSpace(text.charCodeAt(i - 1)) || isDigit(text.charCodeAt(i + 1))))) {
      i++;
      continue;
    }
    break;
  }
  if (i === open) return -1;
  const end = pos + i + open;
  return cx.addElement(
    cx.elt("InlineMath", pos, end, [cx.elt("InlineMathMark", pos, pos + open), cx.elt("InlineMathMark", end - open, end)]),
  );
}

const blockMath: BlockParser = {
  name: "BlockMath",
  before: "FencedCode",
  parse(cx: BlockContext, line: Line) {
    if (line.indent - line.baseIndent >= 4 || !line.text.startsWith("$$", line.pos)) return false;
    const from = cx.lineStart + line.pos;
    const children: Element[] = [cx.elt("BlockMathMark", from, from + 2)];
    const rest = line.text.slice(line.pos + 2).trimEnd();
    let to = cx.lineStart + line.text.length;
    if (rest.trim().length > 2 && rest.endsWith("$$")) {
      to = from + 2 + rest.length;
      children.push(cx.elt("BlockMathMark", to - 2, to));
      cx.nextLine();
    } else {
      while (cx.nextLine()) {
        children.push(...line.markers);
        const text = line.text.trimEnd();
        to = cx.lineStart + text.length;
        if (text.endsWith("$$")) {
          children.push(cx.elt("BlockMathMark", to - 2, to));
          cx.nextLine();
          break;
        }
      }
    }
    cx.addElement(cx.elt("BlockMath", from, to, children));
    return true;
  },
};

const FM_KEY = /^\s*(?:-\s+)?([\w.-]+\s*:)/;
const FM_SCALAR = /^\s*(\d{4}-\d\d-\d\d(?:[ T][\d:.+-Z]+)?|-?\d+(?:\.\d+)?|true|false|null)\s*$/;

function frontMatterLine(cx: BlockContext, text: string, at: number): Element[] {
  const out: Element[] = [];
  const key = FM_KEY.exec(text);
  let pos = 0;
  if (key) {
    pos = key[0].length;
    out.push(cx.elt("FrontMatterKey", at + pos - key[1]!.length, at + pos));
  }
  const value = text.slice(pos);
  if (FM_SCALAR.test(value)) {
    const lead = value.length - value.trimStart().length;
    out.push(cx.elt("FrontMatterValue", at + pos + lead, at + pos + value.trimEnd().length));
    return out;
  }
  for (let i = pos; i < text.length; i++) {
    if ("[]{}".includes(text[i]!)) out.push(cx.elt("FrontMatterPunct", at + i, at + i + 1));
  }
  return out;
}

/**
 * A YAML block that opens the document. The line after the fence must look
 * like a key, so a leading horizontal rule stays a horizontal rule.
 */
const frontMatter: BlockParser = {
  name: "FrontMatter",
  before: "HorizontalRule",
  parse(cx: BlockContext, line: Line) {
    if (cx.lineStart !== 0 || line.text.trimEnd() !== "---" || !FM_KEY.test(cx.peekLine())) return false;
    const children: Element[] = [cx.elt("FrontMatterMark", 0, 3)];
    let to = 3;
    while (cx.nextLine()) {
      const at = cx.lineStart;
      to = at + line.text.length;
      if (/^(---|\.\.\.)\s*$/.test(line.text)) {
        children.push(cx.elt("FrontMatterMark", at, at + 3));
        cx.nextLine();
        break;
      }
      children.push(...frontMatterLine(cx, line.text, at));
    }
    cx.addElement(cx.elt("FrontMatter", 0, to, children));
    return true;
  },
};

const FOOTNOTE_DEF = /^\[\^[^\]\s]+\]:/;

/** `[^1]: text`, which would otherwise read as a link reference whose text is its URL. */
const footnoteDefinition: BlockParser = {
  name: "FootnoteDefinition",
  before: "LinkReference",
  leaf(_cx: BlockContext, leaf: LeafBlock) {
    if (!FOOTNOTE_DEF.test(leaf.content)) return null;
    return {
      nextLine: () => false,
      finish(cx: BlockContext, leaf: LeafBlock) {
        const n = FOOTNOTE_DEF.exec(leaf.content)![0].length;
        cx.addLeafElement(
          leaf,
          cx.elt("FootnoteDefinition", leaf.start, leaf.start + leaf.content.length, [
            cx.elt("FootnoteLabel", leaf.start, leaf.start + n),
            ...cx.parser.parseInline(leaf.content.slice(n), leaf.start + n),
          ]),
        );
        return true;
      },
    };
  },
};

const extensions: MarkdownConfig = {
  defineNodes: [
    { name: "InlineMath", style: mathTag },
    { name: "InlineMathMark", style: t.processingInstruction },
    { name: "BlockMath", block: true, style: mathTag },
    { name: "BlockMathMark", style: t.processingInstruction },
    { name: "FrontMatter", block: true },
    { name: "FrontMatterMark", style: t.meta },
    { name: "FrontMatterKey", style: fmKey },
    { name: "FrontMatterValue", style: fmValue },
    { name: "FrontMatterPunct", style: fmPunct },
    { name: "FootnoteDefinition", block: true },
    { name: "FootnoteLabel", style: t.labelName },
  ],
  parseInline: [{ name: "InlineMath", parse: parseInlineMath, before: "Emphasis" }],
  parseBlock: [frontMatter, blockMath, footnoteDefinition],
  props: [styleTags({ "CodeInfo TaskMarker CodeText": decorated, "TableHeader/...": t.content })],
};

const codeTokens = [
  { tag: t.keyword, class: "tk-kw" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: "tk-fn" },
  { tag: [t.typeName, t.className], class: "tk-ty" },
  { tag: [t.string, t.regexp], class: "tk-str" },
  { tag: [t.number, t.bool, t.null], class: "tk-num" },
  { tag: t.comment, class: "tk-com" },
  { tag: [t.attributeName, t.tagName], class: "tk-attr" },
  { tag: t.meta, class: "tk-meta" },
  { tag: fmKey, class: "tk-key" },
  { tag: fmValue, class: "tk-num" },
  { tag: fmPunct, class: "tk-pun" },
];

/** Source mode: the prototype's tk-* token classes. */
const sourceHighlight = HighlightStyle.define([
  { tag: t.processingInstruction, class: "tk-mark" },
  { tag: t.contentSeparator, class: "tk-meta" },
  { tag: t.heading, class: "tk-h" },
  { tag: t.strong, class: "tk-b" },
  { tag: t.emphasis, class: "tk-i" },
  { tag: t.strikethrough, class: "tk-done" },
  { tag: t.monospace, class: "tk-code" },
  { tag: t.quote, class: "tk-q" },
  { tag: [t.link, t.url, t.labelName], class: "tk-link" },
  { tag: mathTag, class: "tk-math" },
  ...codeTokens,
]);

/** Live blocks keep the block's typography; markup shows as .mk. */
const liveHighlight = HighlightStyle.define([
  { tag: [t.processingInstruction, t.url, t.labelName, t.contentSeparator], class: "mk" },
  { tag: t.strong, class: "tk-b" },
  { tag: t.emphasis, class: "tk-i" },
  { tag: t.strikethrough, class: "lv-del" },
  { tag: t.monospace, class: "ic" },
  { tag: t.link, class: "lv-a" },
  { tag: mathTag, class: "msrc" },
  ...codeTokens,
]);

const markdownSupport = () => markdown({ base: markdownLanguage, codeLanguages: languages, extensions });

export function markdownSyntax(): Extension {
  return [markdownSupport(), syntaxHighlighting(sourceHighlight)];
}

export function liveSyntax(): Extension {
  return [markdownSupport(), syntaxHighlighting(liveHighlight)];
}
