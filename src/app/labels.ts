import type { DocumentState } from "../platform";

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
