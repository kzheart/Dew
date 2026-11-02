#!/usr/bin/env bun
/**
 * Drives the real app through mygo's automation plugin on a copy of
 * samples/版本说明.md, checks what the user would see and what lands on disk,
 * and captures PNGs along the way.
 *
 *   bun scripts/e2e.ts [out-dir]
 *
 * Captures go to out-dir (default ./e2e-out); exported files and the edited
 * copy of the sample go to out-dir/work.
 */
import { $ } from "bun";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Automation } from "./automation";

const root = resolve(import.meta.dir, "..");
const out = resolve(process.argv[2] ?? join(root, "e2e-out"));
const work = join(out, "work");
const file = join(work, "版本说明.md");
// Unix socket paths are limited to about 100 bytes, too few for most out dirs.
const socket = join(tmpdir(), `dew-e2e-${process.pid}.sock`);

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

async function waitFor<T>(what: string, probe: () => Promise<T | null | undefined | false>, timeoutMs = 8000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await probe().catch(() => undefined);
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await Bun.sleep(100);
  }
}

await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });
await copyFile(join(root, "samples/版本说明.md"), file);
const original = await readFile(file, "utf8");

console.log("building…");
await $`bun run build:web`.cwd(root).quiet();
const ldflags = [
  "-X github.com/egoist/mygo.packageFileExtensions=md,markdown",
  "-X github.com/egoist/mygo.packageName=DewE2E",
  "-X github.com/egoist/mygo.packageIdentifier=com.example.dew.e2e",
].join(" ");
await $`go build -tags e2e -ldflags ${ldflags} -o dew-e2e .`.cwd(root);

// Its own settings, reset, so every run starts in the default mode.
await rm(join(homedir(), "Library/Application Support/DewE2E"), { recursive: true, force: true });
await rm(socket, { force: true });
const proc = Bun.spawn([join(root, "dew-e2e"), file], {
  env: { ...process.env, MYGO_AUTOMATION: socket, DEW_E2E_SAVE_DIR: work },
  stdout: "inherit",
  stderr: "inherit",
});

const app = await Automation.connect(socket);
try {
  const { windows } = await waitFor("a window", async () => {
    const r = await app.request<{ windows: { id: number; title: string }[] }>("windows");
    return r.windows.length ? r : null;
  });
  const win = windows[0]!.id;
  const page = <T = any>(script: string) => app.eval<T>(script, win);
  const capture = (name: string) => app.capture(join(out, `${name}.png`), win);
  const menu = (...path: string[]) => app.request("menu", { window: win, path });
  const text = (selector: string) => page<string>(`return document.querySelector(${JSON.stringify(selector)})?.textContent ?? ""`);
  const content = () => page<string>(`return await mygo.call("Doc.Content")`);
  const settle = () => Bun.sleep(450);

  await waitFor("the page", () => page<boolean>(`return !!document.querySelector(".stat")`));
  check("the window shows the file's name and state", (await text(".gtitle")).includes("版本说明.md") && (await text(".gtitle")).includes("已保存 · 与磁盘同步"), await text(".gtitle"));
  const inset = await page<string>(`return getComputedStyle(document.documentElement).getPropertyValue("--mygo-titlebar-inset-left")`);
  check("the header leaves room for the traffic lights", parseFloat(inset) > 0, `inset ${inset.trim()}`);

  const modes: [string, string, string][] = [
    ["实时", "live", "实时编辑"],
    ["预览", "preview", "预览"],
    ["源码", "edit", "源码"],
    ["源码分栏", "split", "源码 · 分栏"],
  ];
  for (const [item, name, label] of modes) {
    await menu("视图", item);
    await settle();
    const stat = await text(".stat");
    check(`视图 › ${item} switches the mode`, stat.endsWith(label), stat);
    await capture(`e2e-${name}`);
  }

  await page(`document.querySelector('[aria-label="排版设置"]').click()`);
  await settle();
  check("the Aa popover opens", await page<boolean>(`return !!document.querySelector(".pop-aa")`));
  await capture("e2e-popover-aa");
  await page(`document.querySelector('[aria-label="导出与分享"]').click()`);
  await settle();
  check("the export popover opens", await page<boolean>(`return !!document.querySelector(".pop-exp")`));
  await capture("e2e-popover-export");
  await page(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);

  await menu("视图", "实时");
  await settle();
  await page(`
    const p = document.querySelector('article p[data-src="10"]');
    const r = p.getBoundingClientRect();
    p.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.right - 2, clientY: r.top + r.height / 2 }));
  `);
  await waitFor("the live editor", () => page<boolean>(`return !!document.querySelector(".act .cm-content")`));
  const typed = "（e2e 实时输入）";
  await page(`
    const el = document.querySelector(".act .cm-content");
    // CodeMirror keeps its view on the content element (what EditorView.findFromDOM reads).
    const view = el.cmTile.root.view;
    view.dispatch({ changes: { from: view.state.doc.length, insert: ${JSON.stringify(typed)} } });
  `);
  await settle();
  check("typing in live mode reaches Doc.content()", (await content()).includes(`真正对齐。${typed}`));
  check("the title says the document is edited", (await text(".gtitle")).includes("已编辑"), await text(".gtitle"));
  await capture("e2e-live-typing");
  await menu("文件", "保存");
  await waitFor("the save", async () => (await text(".gtitle")).includes("已保存"));
  check("文件 › 保存 writes the typed text to disk", (await readFile(file, "utf8")).includes(`真正对齐。${typed}`));

  await page(`document.querySelector(".act .cm-content").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
  await page(`document.querySelector("article .tasks li:nth-child(3) input").click()`);
  await settle();
  const lines = (await content()).split("\n");
  check("toggling a task rewrites its source line", lines[18] === "- [x] PDF 导出分页保护", lines[18]);

  await menu("文件", "导出为 PDF…");
  const pdf = join(work, "版本说明.pdf");
  await waitFor("the PDF", async () => existsSync(pdf) && (await Bun.file(pdf).size) > 0, 20000);
  const head = Buffer.from(await Bun.file(pdf).slice(0, 5).arrayBuffer()).toString("latin1");
  check("文件 › 导出为 PDF… saves a PDF", head === "%PDF-", `${head}, ${await Bun.file(pdf).size} bytes`);

  await menu("文件", "导出为 HTML…");
  const html = join(work, "版本说明.html");
  await waitFor("the HTML", async () => existsSync(html) && (await Bun.file(html).size) > 0, 10000);
  const saved = await readFile(html, "utf8");
  check("文件 › 导出为 HTML… saves a standalone file", saved.includes("data-dew-export") && saved.includes("data:font/woff2"), `${saved.length} chars`);

  await menu("视图", "预览");
  await settle();
  await page(`document.querySelector('[aria-label="放大查看"]').click()`);
  await settle();
  await page(`
    const input = document.querySelector("#lbq");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "src");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  `);
  await settle();
  check("the code lightbox opens and counts search hits", (await text(".lb-search")).includes("3 处匹配"), await text(".lb-search"));
  await capture("e2e-lightbox");
  await page(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
  await settle();
  check("Escape closes the lightbox", !(await page<boolean>(`return !!document.querySelector(".lb")`)));

  // The share card writes its PNG to the clipboard as well as to the file.
  await page(`
    const p = document.querySelector('article p[data-src="47"]');
    getSelection().selectAllChildren(p);
  `);
  await menu("文件", "将选区生成分享卡片…");
  const card = join(work, "版本说明-分享卡片.png");
  await waitFor("the share card", async () => existsSync(card) && (await Bun.file(card).size) > 0, 10000);
  const sig = Buffer.from(await Bun.file(card).slice(0, 8).arrayBuffer()).toString("hex");
  check("文件 › 将选区生成分享卡片… saves a PNG", sig === "89504e470d0a1a0a", `${await Bun.file(card).size} bytes`);
  await copyFile(card, join(out, "e2e-share-card.png"));

  // Another app changes the file while the page has no unsaved edits: the page reloads it.
  await menu("文件", "保存");
  await waitFor("the save", async () => (await text(".gtitle")).includes("已保存"));
  await writeFile(file, (await readFile(file, "utf8")) + "\n外部修改的一行。\n");
  await waitFor("the reload", async () => (await text("article")).includes("外部修改的一行"));
  check("a change on disk reloads the document", true);

  // With unsaved edits it is a conflict, which the title glass offers to settle.
  await page(`document.querySelector("article .tasks li:nth-child(1) input").click()`);
  await settle();
  await writeFile(file, original);
  await waitFor("the conflict", async () => (await text(".gtitle")).includes("磁盘上的文件已被其他应用修改"));
  const buttons = await page<string>(`return [...document.querySelectorAll(".gtitle button")].map((b) => b.textContent).join("/")`);
  check("a conflicting change offers keep-mine and revert", buttons.includes("保留我的") && buttons.includes("还原"), buttons);
  await capture("e2e-conflict");
  await page(`[...document.querySelectorAll(".gtitle button")].find((b) => b.textContent.includes("保留我的")).click()`);
  await waitFor("keep mine", async () => (await text(".gtitle")).includes("已保存"));
  check("保留我的 writes the page's text over the other app's", (await readFile(file, "utf8")).includes("- [ ] 分栏像素级同步滚动"));
} catch (err) {
  check("the run finished", false, String(err));
} finally {
  app.close();
  proc.kill();
  await proc.exited;
  await rm(socket, { force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed; captures in ${out}`);
process.exit(failed.length ? 1 : 0);
