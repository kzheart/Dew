import type { ParsedDocument } from "../markdown/parse";

/** The front matter title, else the file name without its extension. */
export function documentTitle(doc: ParsedDocument, fileName: string): string {
  const title = doc.frontMatter?.find((e) => e.key.toLowerCase() === "title")?.value;
  if (typeof title === "string" && title.trim()) return title.trim();
  return baseName(fileName);
}

export function baseName(fileName: string): string {
  const name = fileName.replace(/\.(md|markdown)$/i, "");
  return name || "未命名";
}
