#!/usr/bin/env bun
/**
 * Types into a long, math-heavy document in the real app and reports how long
 * each keystroke takes to paint in the editor and to reach the preview.
 *
 *   bun scripts/perf.ts [--no-build] [--inline] [--full] [--keys 40] [--out file.json]
 *
 * It types in the split source, or with --full in the source alone, where the preview updates hidden.
 */
import { $ } from "bun";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Automation } from "./automation";

const { values: args } = parseArgs({
  options: { "no-build": { type: "boolean" }, inline: { type: "boolean" }, full: { type: "boolean" }, keys: { type: "string", default: "40" }, out: { type: "string" } },
});
const root = resolve(import.meta.dir, "..");
const appName = "DewPerf";
const socket = join(tmpdir(), `dew-perf-${process.pid}.sock`);

function document(sections: number): string {
  const parts = ["# 性能基准", ""];
  for (let i = 0; i < sections; i++) {
    parts.push(
      `## 第 ${i} 节`,
      "",
      `能量 $E_${i}=mc^2$ 与 $\\int_0^\\infty e^{-x^2}dx=\\frac{\\sqrt\\pi}{2}$ 的关系，第 ${i} 段。`,
      "",
      "$$",
      `\\sum_{n=1}^{\\infty}\\frac{1}{n^{${i % 5 + 2}}}`,
      "$$",
      "",
      "```ts",
      `const value${i} = compute(${i});`,
      "```",
      "",
      `- 列表项 ${i}`,
      `- [ ] 任务 ${i}`,
      "",
    );
    if (i === Math.floor(sections / 2)) parts.push("TARGET 段落", "");
  }
  return parts.join("\n");
}

if (!args["no-build"]) {
  console.log("building…");
  await $`bun run build:web`.cwd(root).quiet();
  const ldflags = [
    "-X github.com/egoist/mygo.packageFileExtensions=md,markdown",
    `-X github.com/egoist/mygo.packageName=${appName}`,
    `-X github.com/egoist/mygo.packageIdentifier=me.kzheart.dew.e2e.${appName.toLowerCase()}`,
  ].join(" ");
  await $`go build -tags e2e -ldflags ${ldflags} -o dew-e2e .`.cwd(root);
}

const work = await mkdtemp(join(tmpdir(), "dew-perf-"));
const file = join(work, "perf.md");
const text = document(200);
await writeFile(file, text);
await rm(join(homedir(), "Library/Application Support", appName), { recursive: true, force: true });

const proc = Bun.spawn([join(root, "dew-e2e"), file], {
  env: { ...process.env, MYGO_AUTOMATION: socket, DEW_E2E_SAVE_DIR: work },
  stdout: "ignore",
  stderr: "inherit",
});

async function waitFor<T>(what: string, probe: () => Promise<T | null | undefined | false>, timeoutMs = 15000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await probe().catch(() => undefined);
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await Bun.sleep(100);
  }
}

const quantile = (xs: number[], q: number) => xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))]!;
const summary = (xs: number[]) => ({ p50: quantile(xs, 0.5), p95: quantile(xs, 0.95), min: Math.min(...xs), max: Math.max(...xs) });

let app: Automation | undefined;
try {
  app = await Automation.connect(socket);
  const { windows } = await waitFor("a window", async () => {
    const r = await app!.request<{ windows: { id: number }[] }>("windows");
    return r.windows.length ? r : null;
  });
  const win = windows[0]!.id;
  const page = <T = any>(script: string) => app!.eval<T>(script, win);
  await waitFor("the page", () => page<boolean>(`return !!document.querySelector(".stat")`));
  await waitFor("the source editor", async () => {
    await app!.request("menu", { window: win, path: ["视图", args.full ? "源码" : "源码分栏"] });
    await Bun.sleep(500);
    return page<boolean>(`return !!document.querySelector(".ed .cm-content")`);
  });
  if (args.inline) await app.request("menu", { window: win, path: ["视图", "行内渲染"] });
  await Bun.sleep(1500);

  const result = await page<{ input: number[]; preview: number[]; state: number[]; dispatch: number[]; typed: string; tocScans: number; renderedLines: number }>(`
    const v = document.querySelector(".ed .cm-content").cmTile.root.view;
    const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const doc = v.state.doc.toString();
    const at = doc.indexOf("TARGET 段落") + "TARGET 段落".length;
    v.focus();
    v.dispatch({ selection: { anchor: at }, scrollIntoView: true });
    await frame(); await frame();
    const target = () => [...document.querySelectorAll("article p")].find((p) => p.textContent.includes("TARGET"));
    const input = [], preview = [], state = [], dispatch = [];
    let typed = "", tocScans = 0;
    const qsa = Element.prototype.querySelectorAll;
    Element.prototype.querySelectorAll = function (sel) {
      if (sel === "[data-sec]") tocScans++;
      return qsa.call(this, sel);
    };
    for (let i = 0; i < ${Number(args.keys)}; i++) {
      const ch = "abcdefghij"[i % 10];
      const { from, to } = v.state.selection.main;
      const t0 = performance.now();
      const tr = v.state.update({ changes: { from, to, insert: ch }, selection: { anchor: from + 1 }, userEvent: "input.type" });
      // A transaction computes its state, and so the editor's decorations, only when asked.
      tr.state;
      state.push(performance.now() - t0);
      v.dispatch(tr);
      dispatch.push(performance.now() - t0);
      typed += ch;
      await frame();
      input.push(performance.now() - t0);
      const deadline = t0 + 5000;
      while (!(target()?.textContent ?? "").includes("TARGET 段落" + typed)) {
        if (performance.now() > deadline) throw new Error("preview never showed " + typed + ", saw " + JSON.stringify(target()?.textContent));
        await frame();
      }
      preview.push(performance.now() - t0);
      await frame();
    }
    Element.prototype.querySelectorAll = qsa;
    return { input, preview, state, dispatch, typed, tocScans, renderedLines: document.querySelectorAll(".ed .cm-line.lv-h2").length };
  `);

  await waitFor("the typed text in Doc.Content", async () =>
    (await page<string>(`return await mygo.call("Doc.Content")`)).includes(`TARGET 段落${result.typed}`),
  );
  const report = {
    lines: text.split("\n").length,
    formulas: 200 * 3,
    inline: !!args.inline,
    layout: args.full ? "full" : "split",
    keys: result.input.length,
    inputMs: summary(result.input),
    previewMs: summary(result.preview),
    stateMs: summary(result.state),
    dispatchMs: summary(result.dispatch),
    tocScans: result.tocScans,
    renderedLines: result.renderedLines,
    raw: { input: result.input, preview: result.preview },
  };
  console.log(JSON.stringify({ ...report, raw: undefined }, null, 2));
  if (args.out) await writeFile(args.out, JSON.stringify(report, null, 2));
} finally {
  app?.close();
  proc.kill();
  await proc.exited;
  await rm(socket, { force: true });
  await rm(work, { recursive: true, force: true });
}
