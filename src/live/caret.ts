/** How far ahead in the source a rendered character may be found; markup between them is skipped. */
const WINDOW = 200;

/**
 * The source offset matching the end of renderedPrefix, the text a reader saw
 * before the click. Rendered characters are found in order in the source,
 * skipping markup; whitespace is ignored, and characters the source lacks
 * nearby (numbering, generated labels) are passed over.
 */
export function sourceOffsetFor(source: string, renderedPrefix: string): number {
  let at = 0;
  for (const ch of renderedPrefix) {
    if (/\s/.test(ch)) continue;
    const found = source.indexOf(ch, at);
    if (found >= 0 && found - at <= WINDOW) at = found + ch.length;
  }
  return at;
}

/** Text that is chrome rather than content, or that renders differently from its source. */
const SKIP = ".cb-head,.cb-ln,.callout-h,.katex,.fn-pop,button,input";

/** The rendered text of block before point (x, y), or null when the point is not on its text. */
export function renderedPrefixAt(block: HTMLElement, x: number, y: number): string | null {
  const range = document.caretRangeFromPoint?.(x, y);
  if (!range || range.startContainer.nodeType !== Node.TEXT_NODE || !block.contains(range.startContainer)) return null;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let out = "";
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n === range.startContainer) return out + n.textContent!.slice(0, range.startOffset);
    out += n.textContent;
  }
  return null;
}
