#!/usr/bin/env bun
/**
 * Clicks through the view modes of a running verify-dew instance and reports, per click, how long
 * the page blocks before it can paint, how much of the next two seconds it spends in dropped frames,
 * and when the last dropped frame ends.
 *
 *   bun scripts/clicks.ts [--rounds 3] [--suite modes|more] [--out file.json]
 *
 * `more` covers the 设置 inspector, the reading background and the first diagram's 源码/图表 toggle.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Automation } from "./automation";

const { values: args } = parseArgs({
  options: { rounds: { type: "string", default: "3" }, suite: { type: "string", default: "modes" }, out: { type: "string" } },
});
const root = resolve(import.meta.dir, "..");
const base = join(root, "e2e-out/verify");
const run = process.env.DEW_VERIFY_RUN ?? (await readFile(join(base, "last"), "utf8").catch(() => "")).trim();
const state = run ? JSON.parse(await readFile(join(base, run, "state.json"), "utf8")) : null;
if (!state?.socket) throw new Error("no verify-dew run; start one with dewctl up");

const app = await Automation.connect(state.socket);
const { windows } = await app.request<{ windows: { id: number; focused: boolean }[] }>("windows");
const win = (windows.find((w) => w.focused) ?? windows[0]!).id;

const segment = (group: string, label: string) => `[...document.querySelectorAll('[aria-label="${group}"] button')].find(b => b.textContent.includes("${label}"))`;
const suites: Record<string, [string, string][]> = {
  modes: [
    ["→preview", segment("视图", "预览")],
    ["→source", `document.querySelector(".src-btn")`],
    ["→split", segment("源码布局", "分栏")],
    ["→inline", `document.querySelector(".tog")`],
    ["→inline off", `document.querySelector(".tog")`],
    ["→single", segment("源码布局", "单栏")],
    ["→live", segment("视图", "实时")],
  ],
  more: [
    ["open 设置", `document.querySelector('.gbtn[aria-label="设置"]')`],
    ["→暗夜", `document.querySelector('.sdot[aria-label="暗夜"]')`],
    ["→羊皮纸", `document.querySelector('.sdot[aria-label="羊皮纸"]')`],
    ["→纯白", `document.querySelector('.sdot[aria-label="纯白"]')`],
    ["close 设置", `document.querySelector('[aria-label="关闭设置"]')`],
    ["→preview", segment("视图", "预览")],
    ["diagram 源码", segment("显示方式", "源码")],
    ["diagram 图表", segment("显示方式", "图表")],
    ["→live", segment("视图", "实时")],
  ],
};
const steps = suites[args.suite!];
if (!steps) throw new Error(`no suite ${args.suite}`);

type Sample = { block: number; paint: number; worstFrame: number; longFrames: number; jank: number; settled: number };
const results: Record<string, Sample[]> = {};
for (let r = 0; r < Number(args.rounds); r++) {
  for (const [name, find] of steps) {
    const s = await app.eval<Sample>(
      `
      const btn = ${find};
      if (!btn) throw new Error("no button for ${name}");
      // A hidden window gets no animation frames worth timing.
      if (document.hidden) throw new Error("the window is hidden (covered or on another Space); bring it on screen to measure");
      await new Promise((r) => setTimeout(r, 600));
      const t0 = performance.now();
      btn.click();
      const block = performance.now() - t0;
      await new Promise((r) => requestAnimationFrame(() => r()));
      const paint = performance.now() - t0;
      let last = performance.now(), worstFrame = 0, longFrames = 0, jank = paint, settled = paint;
      while (performance.now() - t0 < 2000) {
        await new Promise((r) => requestAnimationFrame(() => r()));
        const now = performance.now(), gap = now - last;
        last = now;
        worstFrame = Math.max(worstFrame, gap);
        if (gap > 34) {
          longFrames++;
          jank += gap - 16.7;
          settled = now - t0;
        }
      }
      return { block, paint, worstFrame, longFrames, jank, settled };
    `,
      win,
    );
    (results[name] ??= []).push(s);
  }
}

const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const table = Object.fromEntries(
  Object.entries(results).map(([k, xs]) => [
    k,
    {
      blockMs: Math.round(median(xs.map((x) => x.block))),
      paintMs: Math.round(median(xs.map((x) => x.paint))),
      worstFrameMs: Math.round(median(xs.map((x) => x.worstFrame))),
      longFrames: median(xs.map((x) => x.longFrames)),
      jankMs: Math.round(median(xs.map((x) => x.jank))),
      settledMs: Math.round(median(xs.map((x) => x.settled))),
    },
  ]),
);
console.table(table);
if (args.out) await writeFile(args.out, JSON.stringify({ table, results }, null, 2));
app.close();
