import type { ReactNode } from "react";
import type { Align } from "../markdown/table";

const Line = ({ d }: { d: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const aligns: { align: Exclude<Align, null>; label: string; icon: ReactNode }[] = [
  { align: "left", label: "左对齐", icon: <Line d="M4 6h16M4 12h10M4 18h13" /> },
  { align: "center", label: "居中", icon: <Line d="M4 6h16M7 12h10M5.5 18h13" /> },
  { align: "right", label: "右对齐", icon: <Line d="M4 6h16M10 12h10M7 18h13" /> },
];

export interface TableActions {
  align: Align;
  onAlign(a: Exclude<Align, null>): void;
  onAddRow(): void;
  onAddColumn(): void;
  onDelete(): void;
}

/** The glass toolbar over an active table; its buttons keep the editor's focus. */
export function TableTools({ align, onAlign, onAddRow, onAddColumn, onDelete }: TableActions) {
  return (
    <div className="tbl-tools glass" role="toolbar" aria-label="表格工具" onMouseDown={(e) => e.preventDefault()}>
      {aligns.map((a) => (
        <button key={a.align} aria-label={a.label} title={a.label} aria-pressed={align === a.align} onClick={() => onAlign(a.align)}>
          {a.icon}
        </button>
      ))}
      <span className="vsep" />
      <button onClick={onAddRow}>+ 行</button>
      <button onClick={onAddColumn}>+ 列</button>
      <span className="vsep" />
      <button aria-label="删除表格" title="删除表格" onClick={onDelete}>
        <Line d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
      </button>
    </div>
  );
}
