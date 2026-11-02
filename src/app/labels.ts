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

export interface TitleStatus {
  /** Another app changed the file under unsaved edits: the glass offers to keep either. */
  conflict: boolean;
  text: string;
}

/** What the title glass warns of, or null: the dock's tear shows a file's save state. */
export function titleStatus(s: DocumentState): TitleStatus | null {
  if (s.conflict) return { conflict: true, text: "磁盘上的文件已被其他应用修改" };
  if (s.deleted) return { conflict: false, text: "文件已被删除 · 保存将重新写入" };
  if (s.readOnly) return { conflict: false, text: "只读" };
  return null;
}
