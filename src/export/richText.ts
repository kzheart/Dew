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
export async function inlineStyled(articleHtml: string, bg: string): Promise<string> {
  const host = document.createElement("div");
  host.className = `pv bg-${bg}`;
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:820px;pointer-events:none";
  host.innerHTML = articleHtml;
  document.body.append(host);
  try {
    host.querySelectorAll(".fn-pop").forEach((el) => el.remove());
    await Promise.all([...host.querySelectorAll<SVGSVGElement>(".dia-svg > svg")].map(asImage));
    host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((box) => box.replaceWith(box.checked ? "☑ " : "☐ "));
    const root = host.firstElementChild as HTMLElement;
    root.style.margin = "0";
    // The article spaces its blocks with a flex column's gap, of which only
    // display would be copied, laying the blocks out in a row. Margins paste.
    const gap = getComputedStyle(root).rowGap;
    root.style.display = "block";
    [...root.children].slice(1).forEach((el) => ((el as HTMLElement).style.marginTop = gap));
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

/**
 * Swaps a chart for a picture of it. A chart styles itself through its
 * classes and its own <style>, which pasting strips, and most editors drop
 * inline SVG anyway; a PNG pastes nearly everywhere.
 */
async function asImage(svg: SVGSVGElement) {
  const { width, height } = svg.getBoundingClientRect();
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  const img = document.createElement("img");
  img.width = Math.round(width);
  img.height = Math.round(height);
  img.alt = svg.parentElement?.getAttribute("aria-label") ?? "";
  try {
    const picture = new Image();
    picture.src = src;
    await picture.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width * 2;
    canvas.height = img.height * 2;
    canvas.getContext("2d")!.drawImage(picture, 0, 0, canvas.width, canvas.height);
    img.src = canvas.toDataURL("image/png");
  } catch {
    img.src = src;
  }
  svg.replaceWith(img);
}
