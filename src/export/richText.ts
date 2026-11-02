/** Properties copied inline, enough for editors that drop stylesheets (公众号, 飞书, mail). */
const PROPS = [
  "color", "background-color", "font-family", "font-size", "font-weight", "font-style", "text-decoration-line",
  "line-height", "text-align", "white-space", "vertical-align", "list-style-type", "display",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-top", "border-right", "border-bottom", "border-left", "border-radius",
];

const isDefault = (v: string) =>
  !v || v === "normal" || v === "none" || v === "0px" || v === "rgba(0, 0, 0, 0)" || v.startsWith("0px none") || v === "auto";

/**
 * The article markup with each element's computed style written inline and
 * classes dropped. It is laid out off screen under the app's own stylesheet,
 * so it pastes looking like the preview.
 */
export function inlineStyled(articleHtml: string, bg: string): string {
  const host = document.createElement("div");
  host.className = `pv bg-${bg}`;
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:820px;pointer-events:none";
  host.innerHTML = articleHtml;
  document.body.append(host);
  try {
    host.querySelectorAll(".fn-pop").forEach((el) => el.remove());
    host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((box) => box.replaceWith(box.checked ? "☑ " : "☐ "));
    const root = host.firstElementChild as HTMLElement;
    root.style.margin = "0";
    const all = [root, ...root.querySelectorAll<HTMLElement>("*")];
    const styles = all.map((el) => {
      const cs = getComputedStyle(el);
      return PROPS.flatMap((p) => {
        const v = cs.getPropertyValue(p);
        return isDefault(v) ? [] : [`${p}:${v}`];
      }).join(";");
    });
    all.forEach((el, i) => {
      for (const a of [...el.attributes]) if (a.name === "class" || a.name.startsWith("data-") || a.name === "style") el.removeAttribute(a.name);
      if (styles[i]) el.setAttribute("style", styles[i]!);
    });
    return root.outerHTML;
  } finally {
    host.remove();
  }
}
