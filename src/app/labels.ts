import { languageLabel } from "../markdown/highlight";
import type { Block } from "../markdown/parse";
import type { DocumentState } from "../platform";

/** What the status bar calls a block, as the prototype names its blocks. */
export function blockLabel(b: Block): string {
  switch (b.kind) {
    case "frontmatter":
      return "属性（YAML）";
    case "heading":
      return `标题 ${b.level}`;
    case "paragraph":
      return b.hasMath ? "段落 · 行内公式" : b.hasFootnoteRef ? "段落 · 脚注引用" : "段落";
    case "image":
      return "图片";
    case "callout":
      return b.variant === "note" ? "提示框" : `提示框 · ${b.title}`;
    case "list":
      return b.tasksOnly ? "任务列表" : b.ordered ? "有序列表" : "列表";
    case "quote":
      return "引用";
    case "code":
      return `代码块 · ${languageLabel(b.lang)}`;
    case "table":
      return "表格";
    case "math":
      return "公式块";
    case "footnotes":
      return "脚注";
    case "hr":
      return "分隔线";
    case "html":
      return "HTML";
  }
}

export type TitleStatus =
  | { kind: "conflict"; text: string }
  | { kind: "plain"; text: string; warn?: boolean };

/** The line under the file name in the title glass. */
export function titleStatus(s: DocumentState): TitleStatus {
  if (s.conflict) return { kind: "conflict", text: "磁盘上的文件已被其他应用修改" };
  if (s.deleted) return { kind: "plain", text: "文件已被删除 · 保存将重新写入", warn: true };
  if (s.readOnly) return { kind: "plain", text: "只读", warn: true };
  if (!s.path) return { kind: "plain", text: s.edited ? "未保存 · 已编辑" : "未保存" };
  if (s.edited) return { kind: "plain", text: "已编辑" };
  return { kind: "plain", text: "已保存 · 与磁盘同步" };
}
