const RISE = 300;
const STAGGER = 24;
const MAX_STAGGERED = 10;

/**
 * Settles the blocks on screen into place, one after another, as the article changes mode. Only
 * those in view move: animating the whole article made WebKit composite a layer as long as the document.
 */
export function playEntrance(scroller: HTMLElement) {
  if (document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const view = scroller.getBoundingClientRect();
  const article = scroller.querySelector("article");
  if (!article) return;
  let i = 0;
  for (const el of article.children) {
    const r = el.getBoundingClientRect();
    if (r.bottom < view.top) continue;
    if (r.top > view.bottom) break;
    el.animate([{ opacity: 0.25, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], {
      duration: RISE,
      delay: Math.min(i++, MAX_STAGGERED) * STAGGER,
      easing: "cubic-bezier(.2,.8,.2,1)",
      fill: "backwards",
    });
  }
}
