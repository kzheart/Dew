import type { Prefs } from "./mygo";

export const defaultPrefs: Prefs = {
  mw: 720, fs: 16, lh: 1.75, pg: 1, ff: "sans", bg: "white",
  base: "live", source: "off", inline: false, showLn: true,
  cardBg: "blue", watermark: "",
  pageGuard: { code: true, table: true, chart: true, image: false },
  keep: 50, glass: 4, pairs: true, slash: true,
};
