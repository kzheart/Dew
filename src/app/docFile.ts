/**
 * The URL Go serves an image at that a document names by a path relative
 * to its own folder, or null for a URL, an absolute path, or a path that
 * climbs out of the folder, which Go would refuse anyway.
 */
export function docFileURL(src: string): string | null {
  if (!src || src.startsWith("/") || src.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(src)) return null;
  const parts: string[] = [];
  for (const segment of src.split(/[?#]/)[0]!.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment !== "..") parts.push(segment);
    else if (!parts.pop()) return null;
  }
  return parts.length ? `docfile://localhost/${parts.join("/")}` : null;
}
