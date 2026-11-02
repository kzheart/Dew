import { parse, View } from "vega";
import { compile, type Config } from "vega-lite";
import type { DiagramTheme } from "./engines";

const FONT = "-apple-system,BlinkMacSystemFont,'PingFang SC','Noto Sans SC',sans-serif";

const INKS: Record<DiagramTheme, { text: string; muted: string; grid: string; rule: string; mark: string }> = {
  white: { text: "#3A3A3E", muted: "#6E6E73", grid: "rgba(0,0,0,.08)", rule: "rgba(0,0,0,.28)", mark: "#0A66D8" },
  paper: { text: "#3A2E20", muted: "#6B5B45", grid: "rgba(90,61,14,.12)", rule: "rgba(90,61,14,.35)", mark: "#2F5DB8" },
  night: { text: "#DCDCE0", muted: "#9C9CA2", grid: "rgba(255,255,255,.1)", rule: "rgba(255,255,255,.3)", mark: "#3D8FF0" },
};

/** Recessive axes in Dew's text colors on a transparent ground; a spec's own config still wins. */
function config(theme: DiagramTheme): Config {
  const ink = INKS[theme];
  return {
    background: "transparent",
    font: FONT,
    view: { stroke: null },
    mark: { color: ink.mark },
    axis: {
      labelColor: ink.muted, titleColor: ink.text, gridColor: ink.grid, domainColor: ink.rule, tickColor: ink.rule,
      labelFontSize: 11, titleFontSize: 11, titleFontWeight: 600,
    },
    legend: { labelColor: ink.muted, titleColor: ink.text },
    title: { color: ink.text, subtitleColor: ink.muted },
  };
}

export async function renderVegaLite(source: string, theme: DiagramTheme): Promise<string> {
  let spec;
  try {
    spec = JSON.parse(source);
  } catch (e) {
    throw new Error(`JSON 格式有误：${e instanceof Error ? e.message : e}`);
  }
  const view = new View(parse(compile(spec, { config: config(theme) }).spec), { renderer: "none" });
  try {
    return await view.toSVG();
  } finally {
    view.finalize();
  }
}
