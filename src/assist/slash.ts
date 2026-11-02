import { formatTable } from "../markdown/tableLayout";

export interface Insertion {
  text: string;
  /** Offset of the caret within text. */
  caret: number;
}

/**
 * Blank lines a block needs so it neither merges with its neighbours nor
 * changes them: `---` under a paragraph makes it a heading, and a paragraph
 * under a table or a quote joins it.
 */
type Spacing = "before" | "around";

export interface SlashCommand {
  id: string;
  name: string;
  desc: string;
  /** The Markdown the item writes, shown as a key cap. */
  token: string;
  /** Inner markup of a 24 × 24 stroked SVG, or a short glyph. */
  icon: { svg: string } | { glyph: string };
  aliases: readonly string[];
  /** Items offered only once a query names them, so the full menu stays short. */
  hidden?: boolean;
  spacing?: Spacing;
  insert(): Insertion;
}

const at = (text: string, marker = "|"): Insertion => {
  const caret = text.indexOf(marker);
  return caret < 0 ? { text, caret: text.length } : { text: text.slice(0, caret) + text.slice(caret + 1), caret };
};

const callout = (variant: string): Insertion => at(`> [!${variant}]\n> `);

const starterTable = (): Insertion => {
  const text = formatTable(Array.from({ length: 4 }, () => ["", "", ""]));
  return { text, caret: 2 };
};

const svg = (s: string) => ({ svg: s });

export const slashCommands: readonly SlashCommand[] = [
  {
    id: "code",
    name: "代码块",
    desc: "带语言标记，可设行高亮",
    token: "```",
    icon: svg('<path d="M8 8l-4 4 4 4M16 8l4 4-4 4"/>'),
    aliases: ["code", "codeblock", "fence", "daima", "dmk"],
    spacing: "around",
    insert: () => at("```|\n\n```"),
  },
  {
    id: "table",
    name: "表格",
    desc: "3 × 3 起步，可再增删行列",
    token: "|",
    icon: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M10 4v16"/>'),
    aliases: ["table", "biaoge", "bg"],
    spacing: "around",
    insert: starterTable,
  },
  {
    id: "note",
    name: "提示框",
    desc: "NOTE · TIP · WARNING",
    token: "> [!",
    icon: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    aliases: ["note", "callout", "admonition", "tishi", "tsk"],
    spacing: "around",
    insert: () => callout("NOTE"),
  },
  {
    id: "math",
    name: "数学公式块",
    desc: "块级 LaTeX 公式",
    token: "$$",
    icon: { glyph: "∑" },
    aliases: ["math", "latex", "formula", "gongshi", "gs"],
    spacing: "around",
    insert: () => at("$$\n|\n$$"),
  },
  {
    id: "task",
    name: "任务列表",
    desc: "可在预览中直接勾选",
    token: "- [ ]",
    icon: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>'),
    aliases: ["todo", "task", "checkbox", "renwu", "rw"],
    insert: () => at("- [ ] "),
  },
  {
    id: "h1",
    name: "标题 1",
    desc: "一级标题",
    token: "#",
    icon: { glyph: "H1" },
    aliases: ["h1", "heading", "title", "biaoti", "bt"],
    insert: () => at("# "),
  },
  {
    id: "h2",
    name: "标题 2",
    desc: "二级标题",
    token: "##",
    icon: { glyph: "H2" },
    aliases: ["h2", "heading", "title", "biaoti", "bt"],
    insert: () => at("## "),
  },
  {
    id: "h3",
    name: "标题 3",
    desc: "三级标题",
    token: "###",
    icon: { glyph: "H3" },
    aliases: ["h3", "heading", "title", "biaoti", "bt"],
    insert: () => at("### "),
  },
  {
    id: "ul",
    name: "无序列表",
    desc: "以圆点开头的列表",
    token: "-",
    icon: svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
    aliases: ["ul", "bullet", "list", "liebiao", "wuxu"],
    insert: () => at("- "),
  },
  {
    id: "ol",
    name: "有序列表",
    desc: "以编号开头的列表",
    token: "1.",
    icon: svg('<path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1v5M3.5 14.5a1.5 1.5 0 0 1 3 .5L3.5 19h3"/>'),
    aliases: ["ol", "ordered", "numbered", "list", "liebiao", "youxu"],
    insert: () => at("1. "),
  },
  {
    id: "quote",
    name: "引用",
    desc: "引述一段文字",
    token: ">",
    icon: svg('<path d="M10 7H6a2 2 0 0 0-2 2v3h5v5H4M20 7h-4a2 2 0 0 0-2 2v3h5v5h-5"/>'),
    aliases: ["quote", "blockquote", "yinyong", "yy"],
    insert: () => at("> "),
  },
  {
    id: "hr",
    name: "分割线",
    desc: "分隔上下两部分",
    token: "---",
    icon: svg('<path d="M3 12h18"/><path d="M8 7h8M8 17h8" opacity=".4"/>'),
    aliases: ["hr", "divider", "line", "fengexian", "fgx"],
    spacing: "before",
    insert: () => at("---\n"),
  },
  {
    id: "mermaid",
    name: "Mermaid 图表",
    desc: "流程图、时序图等，预览中直接绘制",
    token: "```mermaid",
    icon: svg('<rect x="3" y="3" width="7" height="6" rx="1.5"/><rect x="14" y="15" width="7" height="6" rx="1.5"/><path d="M6.5 9v3.5a2 2 0 0 0 2 2H17.5V15"/>'),
    aliases: ["mermaid", "diagram", "chart", "flowchart", "tubiao"],
    spacing: "around",
    insert: () => at("```mermaid\nflowchart TD\n  A[开始] --> B[结束]|\n```"),
  },
  {
    id: "tip",
    name: "提示框 · 技巧",
    desc: "TIP",
    token: "> [!TIP]",
    icon: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/>'),
    aliases: ["tip", "jiqiao"],
    hidden: true,
    spacing: "around",
    insert: () => callout("TIP"),
  },
  {
    id: "warning",
    name: "提示框 · 警告",
    desc: "WARNING",
    token: "> [!WARNING]",
    icon: svg('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>'),
    aliases: ["warning", "warn", "jinggao"],
    hidden: true,
    spacing: "around",
    insert: () => callout("WARNING"),
  },
];

/** The items a query after `/` offers: names containing it, or aliases starting with it. */
export function matchCommands(query: string, commands: readonly SlashCommand[] = slashCommands): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands.filter((c) => !c.hidden);
  return commands.filter((c) => c.name.toLowerCase().includes(q) || c.aliases.some((a) => a.startsWith(q)));
}

/** The query typed after a `/` that opens a line holding nothing else, or null. */
export function slashQuery(beforeCaret: string, afterCaret: string): string | null {
  const m = /^\s*\/(\S*)$/.exec(beforeCaret);
  return m && !afterCaret.trim() ? m[1]! : null;
}

export interface LineContext {
  /** The whitespace the `/` line starts with, which every inserted line keeps. */
  indent: string;
  /** Whether the lines just above and below hold text. */
  textAbove: boolean;
  textBelow: boolean;
}

/** What a command writes in place of its `/` line, with blank lines where the block needs them. */
export function insertion(command: SlashCommand, { indent, textAbove, textBelow }: LineContext): Insertion {
  const { text, caret } = command.insert();
  const indented = (s: string) => s.replace(/\n/g, `\n${indent}`);
  const before = command.spacing && textAbove ? "\n" : "";
  const after = command.spacing === "around" && textBelow ? "\n" : "";
  const head = before + indent + indented(text.slice(0, caret));
  return { text: head + indented(text.slice(caret)) + after, caret: head.length };
}
