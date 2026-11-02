import mermaid from "mermaid";
import type { DiagramTheme } from "./engines";

const FONT = "-apple-system,BlinkMacSystemFont,'PingFang SC','Noto Sans SC',sans-serif";

// Dew's colors on the base theme: white nodes on a blue rule, as the code block artboard draws them.
const THEMES: Record<DiagramTheme, Record<string, unknown>> = {
  white: {
    background: "#FFFFFF", primaryColor: "#FFFFFF", primaryBorderColor: "#9DB2E6", primaryTextColor: "#1D1D1F",
    secondaryColor: "#FFF5E8", tertiaryColor: "#F2F6FD", lineColor: "#6B7FB8", textColor: "#3A3A3E",
    edgeLabelBackground: "#FFFFFF", clusterBkg: "#F7F7F8", clusterBorder: "#D9DEE8",
  },
  paper: {
    background: "#F4ECDA", primaryColor: "#FBF6EA", primaryBorderColor: "#C9B48A", primaryTextColor: "#3A2E20",
    secondaryColor: "#EFD9B3", tertiaryColor: "#EADFC8", lineColor: "#8A7350", textColor: "#4A3C2A",
    edgeLabelBackground: "#F4ECDA", clusterBkg: "#EFE6D2", clusterBorder: "#DFD1B5",
  },
  night: {
    darkMode: true,
    background: "#1E1E20", primaryColor: "#2C2C2F", primaryBorderColor: "#4A6BB5", primaryTextColor: "#DCDCE0",
    secondaryColor: "#352A18", tertiaryColor: "#1D2738", lineColor: "#8DA2D8", textColor: "#C8C8CD",
    edgeLabelBackground: "#1E1E20", clusterBkg: "#252527", clusterBorder: "#38383C",
  },
};

let renders = 0;
let queue: Promise<unknown> = Promise.resolve();

export function renderMermaid(source: string, theme: DiagramTheme): Promise<string> {
  // The theme is global configuration, so renders take turns rather than overlap.
  const run = queue.then(async () => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      // Labels as SVG text rather than HTML: the lightbox can search them, and
      // saved SVG files and pasted documents show them without a browser.
      htmlLabels: false,
      theme: "base",
      fontFamily: FONT,
      themeVariables: { ...THEMES[theme], useGradient: false, fontFamily: FONT, fontSize: "14px" },
    });
    const { svg } = await mermaid.render(`dew-mermaid-${++renders}`, source);
    return svg;
  });
  queue = run.catch(() => {});
  return run;
}
