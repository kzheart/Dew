import { expect, test } from "bun:test";
import { normalizeSvg, svgSize } from "./svg";

// Root tags as each engine writes them.
const mermaid = `<svg id="m1" width="100%" xmlns="http://www.w3.org/2000/svg" class="flowchart" style="max-width: 360px;" viewBox="4 4 360 660.5" role="graphics-document document"><style>#m1{fill:#333}</style><g/></svg>`;
const plantuml = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" version="1.1" style="width:256px;height:278px;background:#FFFFFF;" width="256px" height="278px" viewBox="0 0 256 278" preserveAspectRatio="none"><g/></svg>`;
const vega = `<svg class="marks" width="407" height="229"><g/></svg>`;

test("a chart's size comes from its viewBox, else its px width and height", () => {
  expect(svgSize(mermaid)).toEqual({ width: 360, height: 660.5 });
  expect(svgSize(plantuml)).toEqual({ width: 256, height: 278 });
  expect(svgSize(vega)).toEqual({ width: 407, height: 229 });
  expect(svgSize(`<svg width="100%"></svg>`)).toBeNull();
});

test("a normalized chart is a file of its own: xmlns, px size, no backdrop or size in its style", () => {
  const m = normalizeSvg(mermaid);
  expect(m.startsWith("<svg ")).toBe(true);
  expect(m).toContain('width="360" height="660.5"');
  expect(m).not.toContain("max-width");
  expect(m).not.toContain('width="100%"');
  expect(m).toContain("<style>#m1{fill:#333}</style>");

  const p = normalizeSvg(plantuml);
  expect(p.startsWith("<svg ")).toBe(true);
  expect(p).not.toContain("background");
  expect(p).not.toContain("style=");
  expect(p).toContain('preserveAspectRatio="none"');

  expect(normalizeSvg(vega)).toContain('xmlns="http://www.w3.org/2000/svg"');
  expect(svgSize(normalizeSvg(vega))).toEqual({ width: 407, height: 229 });
});
