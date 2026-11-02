import { useEffect, useState } from "react";
import type { Block, DiagramEngine } from "../markdown/parse";
import type { Prefs } from "../mygo";
import { normalizeSvg } from "./svg";

/** Diagrams take the colors of the background they are drawn on. */
export type DiagramTheme = Prefs["bg"];

export interface Engine {
  label: string;
  /** Said next to the label when the chart is drawn somewhere other than this machine. */
  note?: string;
  render(source: string, theme: DiagramTheme): Promise<string>;
}

// Each engine loads only when a document first shows one of its diagrams.
export const engines: Record<DiagramEngine, Engine> = {
  mermaid: {
    label: "Mermaid",
    render: async (source, theme) => (await import("./mermaid")).renderMermaid(source, theme),
  },
  "vega-lite": {
    label: "Vega-Lite",
    render: async (source, theme) => (await import("./vegaLite")).renderVegaLite(source, theme),
  },
  plantuml: {
    label: "PlantUML",
    note: "由 plantuml.com 在线渲染",
    render: async (source, theme) => (await import("./plantuml")).renderPlantuml(source, theme),
  },
};

export type DiagramResult = { status: "loading" } | { status: "ok"; svg: string } | { status: "error"; message: string };

const LOADING: DiagramResult = { status: "loading" };

interface Entry {
  promise: Promise<DiagramResult>;
  result?: DiagramResult;
}

const cache = new Map<string, Entry>();

const keyOf = (engine: DiagramEngine, source: string, theme: DiagramTheme) => `${engine}\n${theme}\n${source}`;

/** A diagram's render, started once per engine, theme and source. A failed one is tried again when asked to retry. */
function load(engine: DiagramEngine, source: string, theme: DiagramTheme, retry = false): Entry {
  const key = keyOf(engine, source, theme);
  const cached = cache.get(key);
  if (cached && !(retry && cached.result?.status === "error")) return cached;
  const entry: Entry = {
    promise: engines[engine].render(source, theme).then(
      (svg): DiagramResult => ({ status: "ok", svg: normalizeSvg(svg) }),
      (err): DiagramResult => ({ status: "error", message: err instanceof Error ? err.message : String(err) }),
    ),
  };
  void entry.promise.then((r) => (entry.result = r));
  cache.set(key, entry);
  return entry;
}

/** The diagram's render as it stands, rendering it if no one has; an error left by an earlier try is tried again. */
export function useDiagram(engine: DiagramEngine, source: string, theme: DiagramTheme): DiagramResult {
  const key = keyOf(engine, source, theme);
  const [state, setState] = useState(() => ({ key, result: cache.get(key)?.result ?? LOADING }));
  useEffect(() => {
    let live = true;
    void load(engine, source, theme, true).promise.then((result) => live && setState({ key, result }));
    return () => {
      live = false;
    };
  }, [key]);
  return state.key === key ? state.result : cache.get(key)?.result ?? LOADING;
}

/** Renders every diagram among blocks, so a static render of them (an export) finds each one finished. */
export async function renderDiagrams(blocks: Block[], theme: DiagramTheme): Promise<void> {
  await Promise.all(
    blocks.flatMap((b) => (b.kind === "code" && b.view.kind === "diagram" ? [load(b.view.engine, b.code, theme, true).promise] : [])),
  );
}
