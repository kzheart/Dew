#!/usr/bin/env bun
/**
 * Drives the real app through mygo's automation plugin on copies of
 * samples/版本说明.md and samples/超级代码块.md, checks what the user would
 * see and what lands on disk, and captures PNGs along the way.
 *
 *   bun scripts/e2e.ts [out-dir] [--no-build] [section ...]
 *
 * Sections are document, code, assist, share, tabs and welcome; with none named, all
 * of them run. Each starts its own launch on its own copies, so one can run
 * alone: after changing the dock, `bun scripts/e2e.ts tabs`. --no-build reuses
 * the last dist/ and dew-e2e, for reruns with no code changed in between.
 *
 * Captures go to out-dir (default ./e2e-out); exported files and the edited
 * copies of the samples go to out-dir/work.
 */
import { $ } from "bun";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { classifyPaste } from "../src/assist/paste";
import { slashCommands } from "../src/assist/slash";
import { Automation } from "./automation";

const sections: Record<string, () => Promise<void>> = {
  document: documentChecks,
  code: codeChecks,
  assist: editAssistChecks,
  share: shareTableChecks,
  tabs: tabChecks,
  welcome: welcomeChecks,
};
const args = process.argv.slice(2);
const noBuild = args.includes("--no-build");
const isSection = (a: string) => Object.hasOwn(sections, a);
const named = args.filter(isSection);
const unknown = args.filter((a) => a.startsWith("-") && a !== "--no-build");
if (unknown.length) throw new Error(`unknown flags ${unknown.join(" ")}; sections are ${Object.keys(sections).join(", ")}`);
const outArg = args.find((a) => a !== "--no-build" && !isSection(a));

const root = resolve(import.meta.dir, "..");
const out = resolve(outArg ?? join(root, "e2e-out"));
const work = join(out, "work");
const file = join(work, "版本说明.md");
const superFile = join(work, "超级代码块.md");
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
await copyFile(join(root, "samples/超级代码块.md"), superFile);
const original = await readFile(file, "utf8");

if (!noBuild) console.log("building…");
if (!noBuild) await $`bun run build:web`.cwd(root).quiet();
// DEW_E2E_APP gives parallel runs (e.g. from two worktrees) their own app data.
const appName = process.env.DEW_E2E_APP ?? "DewE2E";
const ldflags = [
  "-X github.com/egoist/mygo.packageFileExtensions=md,markdown",
  `-X github.com/egoist/mygo.packageName=${appName}`,
  `-X github.com/egoist/mygo.packageIdentifier=com.example.dew.e2e.${appName.toLowerCase()}`,
].join(" ");
if (!noBuild) await $`go build -tags e2e -ldflags ${ldflags} -o dew-e2e .`.cwd(root);
else if (!existsSync(join(root, "dew-e2e"))) throw new Error("--no-build, but there is no dew-e2e to reuse");

interface AppWindow {
  id: number;
  title: string;
  bounds: { x: number; y: number; width: number; height: number };
}

interface Session {
  page<T = any>(script: string): Promise<T>;
  capture(name: string): Promise<void>;
  menu(...path: string[]): Promise<unknown>;
  text(selector: string): Promise<string>;
  /** The same, for another window of the app. */
  at(win: number): Session;
  windows(): Promise<AppWindow[]>;
}

const settle = () => Bun.sleep(450);

/** Where the native title bar puts the close button, and how much of the window it leaves (TabsProbe in e2e_tabs_darwin.go). */
interface TitleBar {
  closeX: number;
  closeY: number;
  contentHeight: number;
  tabBarVisible: boolean;
  selected: boolean;
}
const titleBar = (page: Session["page"]) => page<TitleBar>(`return await mygo.call("TabsProbe.TitleBar", mygo.windowId)`);
let singleTitleBar: TitleBar | undefined;

interface DockFile {
  name: string;
  tip: string;
  tear: "saved" | "dirty" | "empty";
  current: boolean;
  trembling: boolean;
}

/** The files a page's dock shows, but those fading out. */
const dock = (page: Session["page"]) =>
  page<DockFile[]>(`return [...document.querySelectorAll(".dock .dk:not(.closing)")].map((d) => ({
    name: d.querySelector(".nm").textContent,
    tip: d.querySelector(".dk-btn").getAttribute("aria-label"),
    tear: ["dirty", "empty"].find((s) => d.querySelector(".tear").classList.contains(s)) ?? "saved",
    current: d.querySelector(".dk-btn").getAttribute("aria-current") === "page",
    trembling: d.querySelector(".m18").classList.contains("trem"),
  }))`);
const currentFile = async (page: Session["page"]) => (await dock(page)).find((f) => f.current);
const isSaved = async (page: Session["page"]) => (await currentFile(page))?.tear === "saved";

/** Opens paths in a fresh launch of the app, runs steps against the first one's window, and quits it. */
async function session(paths: string | string[], steps: (s: Session) => Promise<void>) {
  const files = [paths].flat();
  // Its own settings, reset, so every run starts in the default mode.
  await rm(join(homedir(), "Library/Application Support", appName), { recursive: true, force: true });
  await rm(socket, { force: true });
  const proc = Bun.spawn([join(root, "dew-e2e"), ...files], {
    env: { ...process.env, MYGO_AUTOMATION: socket, DEW_E2E_SAVE_DIR: work },
    stdout: "inherit",
    stderr: "inherit",
  });
  let app: Automation | undefined;
  try {
    app = await Automation.connect(socket);
    const windows = async () => (await app!.request<{ windows: AppWindow[] }>("windows")).windows;
    const all = await waitFor("the windows", async () => {
      const ws = await windows();
      return ws.length >= files.length ? ws : null;
    });
    const at = (win: number): Session => {
      const page = <T = any>(script: string) => app!.eval<T>(script, win);
      return {
        page,
        capture: (name) => app!.capture(join(out, `${name}.png`), win),
        menu: (...path) => app!.request("menu", { window: win, path }),
        text: (selector) => page<string>(`return document.querySelector(${JSON.stringify(selector)})?.textContent ?? ""`),
        at,
        windows,
      };
    };
    for (const w of all) await waitFor("the page", () => at(w.id).page<boolean>(`return !!document.querySelector(".stat")`));
    await steps(at(all[0]!.id));
  } catch (err) {
    check(`the run on ${files.map((f) => basename(f)).join(", ")} finished`, false, String(err));
  } finally {
    app?.close();
    proc.kill();
    await proc.exited;
    await rm(socket, { force: true });
  }
}

/** The sample in each mode: typing, saving, tasks, exports, the lightbox, the share card, reloads and conflicts. */
async function documentChecks() {
  await session(file, async ({ page, capture, menu, text }) => {
    const content = () => page<string>(`return await mygo.call("Doc.Content")`);

    const alone = await dock(page);
    const chrome = await page<{ title: boolean; closable: boolean }>(`return { title: !!document.querySelector(".gtitle"), closable: !!document.querySelector(".dk-x") }`);
    check(
      "the dock shows the window's one file with a full tear, and no title glass or close button",
      alone.length === 1 && alone[0]!.current && alone[0]!.tip === "版本说明.md，已保存 · 与磁盘同步" && alone[0]!.tear === "saved" && !chrome.title && !chrome.closable,
      JSON.stringify({ alone, chrome }),
    );
    await capture("e2e-dock");
    singleTitleBar = await titleBar(page);
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

    // 设置 edits the defaults: a changed row shows a drop that resets it, and a search finds rows across groups.
    await page(`document.querySelector('[aria-label="排版设置"]').click()`);
    await waitFor("the Aa popover's link", () => page<boolean>(`return !!document.querySelector(".pop-aa .aa-more")`));
    await page(`document.querySelector(".pop-aa .aa-more").click()`);
    const inspector = await waitFor("the settings inspector", () =>
      page<{ rows: string[]; shifted: boolean } | null>(`
        const i = document.querySelector('aside[aria-label="设置"]');
        return i && !document.querySelector(".pop-aa") ? { rows: [...i.querySelectorAll(".srow .k")].map((k) => k.textContent), shifted: document.querySelector(".app").classList.contains("set-on") } : null;
      `),
    ).catch(() => null);
    check(
      "the Aa popover's 在设置中调整所有文档的默认值 opens 设置 on 外观, and the page makes room",
      !!inspector && inspector.shifted && inspector.rows.join() === "阅读背景,正文字体,字号,行高,段落间距,版心宽度,玻璃质感",
      JSON.stringify(inspector),
    );
    const setInput = (sel: string, v: string) =>
      page(`
        const i = document.querySelector(${JSON.stringify(sel)});
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, ${JSON.stringify(v)});
        i.dispatchEvent(new Event("input", { bubbles: true }));
      `);
    await setInput("#s-fs", "19");
    const drop = await waitFor("the drop by 字号", () => page<string | null>(`return document.querySelector('aside[aria-label="设置"] .modb')?.getAttribute("aria-label") ?? null`)).catch(() => null);
    const storedFs = await waitFor("the saved font size", async () => (await page<{ fs: number }>(`return await mygo.call("Prefs.Get")`)).fs === 19).catch(() => false);
    check("changing 字号 there marks the row with a drop and saves it as the default", drop === "恢复默认 16 pt" && storedFs && (await page<string>(`return getComputedStyle(document.querySelector("article")).fontSize`)) === "19px", String(drop));
    await capture("e2e-settings");
    await page(`document.querySelector('aside[aria-label="设置"] .modb').click()`);
    const reset = await waitFor("the reset", () => page<boolean>(`return !document.querySelector('aside[aria-label="设置"] .modb') && document.querySelector("#s-fs").value === "16"`)).catch(() => false);
    check("the drop resets 字号 to its default", reset);
    await setInput('aside[aria-label="设置"] .ssearch input', "水印");
    const found = await waitFor("the search", () =>
      page<string | null>(`return [...document.querySelectorAll('aside[aria-label="设置"] [role="group"]')].map((g) => g.getAttribute("aria-label") + ":" + [...g.querySelectorAll(".srow .k")].map((k) => k.textContent).join()).join("|") || null`),
    ).catch(() => null);
    await setInput('aside[aria-label="设置"] .ssearch input', "主题");
    const none = await waitFor("no match", () => page<string | null>(`return document.querySelector(".snone")?.textContent ?? null`)).catch(() => null);
    check("searching 设置 finds rows across groups, and says when none match", found?.endsWith("导出:分享卡片水印") === true && none === "没有找到与「主题」相关的设置", `${found}; ${none}`);
    await page(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await waitFor("the inspector to close", () => page<boolean>(`return !document.querySelector('aside[aria-label="设置"]')`)).catch(() => {});

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
    const edited = await currentFile(page);
    check("the tear runs low and trembles while the document is edited", edited?.tear === "dirty" && edited.trembling && edited.tip === "版本说明.md，有未保存的修改", JSON.stringify(edited));
    await capture("e2e-live-typing");
    await menu("文件", "保存");
    await waitFor("the save", () => isSaved(page));
    check("saving fills the tear and ripples a ring off it", await page<boolean>(`return document.querySelector(".dk.on .tear").classList.contains("ripple")`));
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
    check("the code lightbox opens and counts search hits", (await text(".lb-count")) === "1 / 3", await text(".lb-count"));
    await capture("e2e-lightbox");
    await page(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await settle();
    check("Escape closes the lightbox", !(await page<boolean>(`return !!document.querySelector(".lb")`)));

    // The share card opens on the selection, and 保存… writes its PNG.
    await page(`
      const p = document.querySelector('article p[data-src="47"]');
      getSelection().selectAllChildren(p);
    `);
    await menu("文件", "将选区生成分享卡片…");
    await waitFor("the share card dialog", () => page<boolean>(`return !!document.querySelector(".share-save")`));
    await page(`document.querySelector(".share-save").click()`);
    const card = join(work, "版本说明-分享卡片.png");
    await waitFor("the share card", async () => existsSync(card) && (await Bun.file(card).size) > 0, 10000);
    const sig = Buffer.from(await Bun.file(card).slice(0, 8).arrayBuffer()).toString("hex");
    check("文件 › 将选区生成分享卡片… opens the card, whose 保存… saves a PNG", sig === "89504e470d0a1a0a", `${await Bun.file(card).size} bytes`);
    await copyFile(card, join(out, "e2e-share-card.png"));
    await page(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await settle();

    // Another app changes the file while the page has no unsaved edits: the page reloads it.
    await menu("文件", "保存");
    await waitFor("the save", () => isSaved(page));
    await writeFile(file, (await readFile(file, "utf8")) + "\n外部修改的一行。\n");
    const reloaded = await waitFor("the reload", async () => (await text("article")).includes("外部修改的一行")).catch(() => false);
    const held = reloaded || { tear: (await currentFile(page))?.tear, inDoc: (await content()).includes("外部修改的一行") };
    check("a change on disk reloads the document", reloaded, reloaded ? "" : `after 8 s the page still shows the old text: ${JSON.stringify(held)}`);

    // With unsaved edits it is a conflict, which the title glass offers to settle.
    await page(`document.querySelector("article .tasks li:nth-child(1) input").click()`);
    await settle();
    await writeFile(file, original);
    await waitFor("the conflict", async () => (await text(".gtitle")).includes("磁盘上的文件已被其他应用修改"));
    const buttons = await page<string>(`return [...document.querySelectorAll(".gtitle button")].map((b) => b.textContent).join("/")`);
    check("a conflicting change offers keep-mine and revert", buttons.includes("保留我的") && buttons.includes("还原"), buttons);
    await capture("e2e-conflict");
    await page(`[...document.querySelectorAll(".gtitle button")].find((b) => b.textContent.includes("保留我的")).click()`);
    await waitFor("keep mine", async () => (await isSaved(page)) && !(await page<boolean>(`return !!document.querySelector(".gtitle")`)));
    check("保留我的 writes the page's text over the other app's and puts the title glass away", (await readFile(file, "utf8")).includes("- [ ] 分栏像素级同步滚动"));
  });

  // A blank document says where to write, and a click anywhere on the page writes there.
  const blank = join(work, "空白.md");
  await writeFile(blank, "");
  await session(blank, async ({ page, capture }) => {
    const HINT = "开始书写，或输入 / 插入标题、列表、代码块…";
    const state = () =>
      page<{ editing: boolean; placeholder: string; hint: string; line: string | null }>(`return {
        editing: !!document.querySelector(".act .cm-content"),
        placeholder: document.querySelector(".act .cm-placeholder")?.textContent ?? "",
        hint: document.querySelector(".art-hint")?.textContent ?? "",
        line: document.querySelector(".act")?.dataset.line ?? null,
      }`);
    const clickBlank = () =>
      page(`const s = document.querySelector(".pv-scroll"), r = s.getBoundingClientRect();
        s.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.left + 30, clientY: r.bottom - 60 }))`);

    const opened = await waitFor("the placeholder", async () => ((await state()).placeholder === HINT ? state() : null)).catch(state);
    check("a blank document opens with the caret on its first line and a hint where the text goes", opened.editing && opened.placeholder === HINT, JSON.stringify(opened));
    await capture("e2e-blank");

    await page(`document.querySelector(".act .cm-content").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))`);
    const left = await waitFor("the page hint", async () => ((await state()).hint === HINT ? state() : null)).catch(state);
    check("leaving the blank document keeps the hint on the page", !left.editing && left.hint === HINT, JSON.stringify(left));

    await clickBlank();
    const back = await waitFor("the editor", async () => ((await state()).editing ? state() : null)).catch(state);
    check("a click on the blank page beside the column starts writing", back.editing, JSON.stringify(back));

    await page(`const v = document.querySelector(".act .cm-content").cmTile.root.view; v.dispatch(v.state.replaceSelection("第一段\\n\\n第二段"))`);
    const typed = await waitFor("the text", async () => ((await page<string>(`return await mygo.call("Doc.Content")`)) === "第一段\n\n第二段" ? state() : null)).catch(state);
    check("typing replaces the hint", typed.placeholder === "" && typed.hint === "", JSON.stringify(typed));

    await page(`document.querySelector(".act .cm-content").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))`);
    await waitFor("the rendered blocks", async () => !(await state()).editing);
    await clickBlank();
    const below = await waitFor("the last block", async () => ((await state()).line ? state() : null)).catch(state);
    check("a click below the text edits the last block", below.line === "3", JSON.stringify(below));
  });
}

/** 超级代码块.md: code blocks, diffs, diagrams and their toolbars. */
async function codeChecks() {
  await session(superFile, async ({ page, capture, menu }) => {
    await menu("视图", "预览");
    await settle();
    // The script that finds a code block by the label in its header.
    const block = (label: string) => `[...document.querySelectorAll("article .cb")].find((b) => b.querySelector(".cb-lang")?.textContent === ${JSON.stringify(label)})`;
    const show = (label: string) => page(`${block(label)}.scrollIntoView({ block: "start" }); document.querySelector(".pv-scroll").scrollTop -= 80`);

    const diff = await page<{ add: string; del: string; numbered: boolean }>(`
      const b = ${block("Diff")};
      const numbers = [...b.querySelectorAll(".dl-context")].map((r) => [...r.querySelectorAll(".dl-no")].map((n) => n.textContent));
      return { add: b.querySelector(".df-add").textContent, del: b.querySelector(".df-del").textContent, numbered: numbers.length > 0 && numbers.every((n) => n.length === 2 && n[0] && n[1]) };
    `);
    check("the diff counts +4 −2 and numbers its old and new lines", diff.add === "+4" && diff.del === "−2" && diff.numbered, JSON.stringify(diff));
    await show("Diff");
    await settle();
    await capture("e2e-super-diff");

    const fold = () => page<{ rows: number; pill: string; meta: string; top: number }>(`
      const b = ${block("Python")};
      return { rows: b.querySelectorAll(".cl").length, pill: b.querySelector(".cb-pill")?.textContent ?? "", meta: b.querySelector(".cb-meta")?.textContent ?? "", top: Math.round(b.getBoundingClientRect().top) };
    `);
    const folded = await fold();
    check("a long block opens on 8 of its 46 lines", folded.rows === 8 && folded.pill === "展开剩余 38 行" && folded.meta.includes("共 46 行"), JSON.stringify(folded));
    await show("Python");
    await settle();
    await capture("e2e-super-folded");
    await page(`${block("Python")}.querySelector(".cb-pill").click()`);
    await settle();
    const expanded = await fold();
    check("展开剩余 shows every line", expanded.rows === 46 && expanded.pill === "收起", JSON.stringify(expanded));
    await page(`document.querySelector(".pv-scroll").scrollTop += 600`);
    await settle();
    await capture("e2e-super-expanded");
    await page(`${block("Python")}.querySelector(".cb-pill").click()`);
    await Bun.sleep(900);
    const collapsed = await fold();
    check("收起 folds the block and brings its header back into view", collapsed.rows === 8 && collapsed.top >= 0, JSON.stringify(collapsed));

    const chart = (label: string) => page<string>(`
      const b = ${block(label)};
      return b.querySelector(".dia-svg svg") ? "svg" : b.querySelector(".dia-err") ? "error: " + b.querySelector(".dia-err pre").textContent : "";
    `);
    for (const label of ["Mermaid", "Vega-Lite"]) {
      const drawn = await waitFor(`the ${label} chart`, () => chart(label), 20000).catch(String);
      check(`a ${label} fence is drawn as an SVG chart`, drawn === "svg", drawn);
    }
    const puml = await waitFor("the PlantUML chart", () => chart("PlantUML"), 25000).catch(String);
    check("a PlantUML fence is drawn by plantuml.com, or says why it is not", puml === "svg" || puml.startsWith("error: "), puml === "svg" ? "rendered" : puml);
    await show("Mermaid");
    await settle();
    await capture("e2e-super-mermaid");
    await show("Vega-Lite");
    await settle();
    await capture("e2e-super-vega-plantuml");

    const view = () => page<{ svg: boolean; rows: number }>(`const b = ${block("Mermaid")}; return { svg: !!b.querySelector(".dia-svg svg"), rows: b.querySelectorAll(".cl").length }`);
    const toggle = (to: string) => page(`[...${block("Mermaid")}.querySelectorAll(".cb-seg button")].find((x) => x.textContent === ${JSON.stringify(to)}).click()`);
    await toggle("源码");
    await settle();
    const source = await view();
    await toggle("图表");
    await settle();
    const back = await view();
    check("图表 / 源码 switches between the chart and its source", !source.svg && source.rows === 8 && back.svg && back.rows === 0, JSON.stringify({ source, back }));

    await page(`[...${block("Mermaid")}.querySelectorAll(".cb-btn")].find((x) => x.textContent.includes("导出 SVG")).click()`);
    const svgFile = join(work, "超级代码块-mermaid.svg");
    await waitFor("the SVG", async () => existsSync(svgFile) && (await Bun.file(svgFile).size) > 0, 10000);
    const svgHead = (await readFile(svgFile, "utf8")).slice(0, 40);
    check("导出 SVG saves the chart", svgHead.startsWith("<svg") || svgHead.startsWith("<?xml"), `${svgHead}…, ${await Bun.file(svgFile).size} bytes`);

    await page(`document.querySelector(".tbl-zoom").click()`);
    await settle();
    await page(`
      const input = document.querySelector("#lbq");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "预览");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    `);
    await settle();
    await page(`document.querySelector("#lbq").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`);
    await settle();
    const lightbox = await page<{ label: string; meta: string; count: string; marks: number }>(`return {
      label: document.querySelector(".lb")?.getAttribute("aria-label") ?? "",
      meta: document.querySelector(".lb-title")?.textContent ?? "",
      count: document.querySelector(".lb-count")?.textContent ?? "",
      marks: document.querySelectorAll(".lb-tbl mark").length,
    }`);
    check("the table lightbox counts its search hits and steps through them", lightbox.label === "表格放大查看" && lightbox.meta.includes("4 列 × 8 行") && lightbox.count === "2 / 5" && lightbox.marks === 5, JSON.stringify(lightbox));
    await capture("e2e-super-table-lightbox");
    await page(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await settle();
    const closed = await page<{ open: boolean; focus: string }>(`return { open: !!document.querySelector(".lb"), focus: document.activeElement?.className ?? "" }`);
    check("Escape closes the table lightbox and returns focus to its button", !closed.open && closed.focus.includes("tbl-zoom"), JSON.stringify(closed));

    await menu("文件", "导出为 PDF…");
    const pdf = join(work, "超级代码块.pdf");
    await waitFor("the PDF", async () => existsSync(pdf) && (await Bun.file(pdf).size) > 0, 40000);
    await Bun.sleep(500);
    // pdftotext spells some CJK characters as Kangxi radicals (⽂ for 文), which NFKC folds back.
    const printed = (await $`pdftotext ${pdf} -`.text()).normalize("NFKC");
    // Drawn charts print their labels; a chart that fell back to its source would print the fence's code.
    const drawn = printed.includes("打开 .md 文件") && printed.includes("模式") && !printed.includes("flowchart TD") && !printed.includes("$schema");
    check("the PDF export prints the charts, not their source", drawn, `${await Bun.file(pdf).size} bytes${printed.includes("@startuml") ? ", PlantUML as source" : ""}`);
    await $`pdftoppm -r 60 -png ${pdf} ${join(out, "e2e-super-pdf")}`;
  });
}

/**
 * 斜杠命令, 成对符号包裹 and 智能剪贴板 on another copy of 版本说明.md. Typing
 * goes through CodeMirror's own input path (its input handlers, then an
 * input.type transaction), keys are keydown events on the editor, and pastes
 * are paste events carrying a DataTransfer built in the page: the app is not
 * frontmost while it runs, so neither real keystrokes nor 编辑 › 粘贴 reach it.
 */
async function editAssistChecks() {
  const assistFile = join(work, "辅助编辑.md");
  await copyFile(join(root, "samples/版本说明.md"), assistFile);
  const fixture = (name: string) => readFile(join(root, "src/assist/fixtures", name), "utf8");
  const fx = { safariHtml: await fixture("safari.html"), safariText: await fixture("safari.txt"), excelHtml: await fixture("excel.html"), excelText: await fixture("excel.txt") };
  const expected = (html: string, text: string) => {
    const p = classifyPaste({ text, html, hasImage: false }, "");
    return p.kind === "plain" || p.kind === "image" ? "" : p.markdown;
  };
  const starter = slashCommands.find((c) => c.id === "table")!.insert().text;

  await session(assistFile, async ({ page, capture, menu }) => {
    const live = ".act .cm-content";
    const source = ".ed .cm-content";
    await page(`
      const view = (sel) => document.querySelector(sel).cmTile.root.view;
      window.e2e = {
        view,
        doc: (sel) => view(sel).state.doc.toString(),
        line: (sel) => { const v = view(sel); return v.state.doc.lineAt(v.state.selection.main.head).text; },
        select(sel, text) { const v = view(sel); const i = v.state.doc.toString().indexOf(text); v.focus(); v.dispatch({ selection: { anchor: i, head: i + text.length } }); },
        newLine(sel) { const v = view(sel); const end = v.state.doc.length; v.focus(); v.dispatch({ changes: { from: end, insert: "\\n\\n" }, selection: { anchor: end + 2 } }); },
        type(sel, text) {
          const v = view(sel);
          for (const ch of text) {
            const { from, to } = v.state.selection.main;
            const insert = () => v.state.update({ changes: { from, to, insert: ch }, selection: { anchor: from + ch.length }, userEvent: "input.type", scrollIntoView: true });
            if (!v.state.facet(v.constructor.inputHandler).some((h) => h(v, from, to, ch, insert))) v.dispatch(insert());
          }
        },
        key: (sel, key, mods = {}) => document.querySelector(sel).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods })),
        paste(sel, data, image) {
          const dt = new DataTransfer();
          for (const [k, v] of Object.entries(data)) dt.setData(k, v);
          if (image) dt.items.add(image);
          const e = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
          document.querySelector(sel).dispatchEvent(e);
          return e.defaultPrevented;
        },
        menu: () => [...document.querySelectorAll(".cm-tooltip.slash .smi")].map((i) => (i.getAttribute("aria-selected") === "true" ? "*" : "") + i.querySelector("b").textContent),
        toasts: () => [...document.querySelectorAll(".toast:not(.out)")].map((t) => [t.querySelector("b").textContent, t.querySelector("small").textContent, t.querySelector(".toast-act")?.textContent ?? ""].join(" | ")),
        act: (label) => [...document.querySelectorAll(".toast-act")].findLast((b) => b.textContent === label).click(),
      };
    `);
    const e2e = <T = any>(call: string) => page<T>(`return e2e.${call}`);
    const undo = (sel: string) => e2e(`key(${JSON.stringify(sel)}, "z", { metaKey: true })`);

    // 斜杠命令 in live mode: "/" on a new line of a block, filtered to 表格, Enter inserts it.
    await menu("视图", "实时");
    await settle();
    const tables = await page<number>(`return document.querySelectorAll("article table").length`);
    await page(`
      const p = document.querySelector('article p[data-src="10"]');
      const r = p.getBoundingClientRect();
      p.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.right - 2, clientY: r.top + r.height / 2 }));
    `);
    await waitFor("the live editor", () => page<boolean>(`return !!document.querySelector(".act .cm-content")`));
    // The block editor places its caret once it has mounted; typing before that races it.
    await settle();
    await e2e(`newLine(${JSON.stringify(live)})`);
    await e2e(`type(${JSON.stringify(live)}, "/")`);
    await settle();
    const opened = await e2e<string[]>("menu()");
    check("/ on an empty line of a live block opens the slash menu", opened.length === 13 && opened[0] === "*代码块" && opened.includes("表格") && opened.includes("Mermaid 图表"), opened.join(" "));
    await capture("edit-e2e-slash-live");
    await e2e(`type(${JSON.stringify(live)}, "tab")`);
    await settle();
    const filtered = await e2e<string[]>("menu()");
    check("typing tab filters the menu to 表格", filtered.join() === "*表格", filtered.join(" "));
    await capture("edit-e2e-slash-live-filter");
    await e2e(`key(${JSON.stringify(live)}, "Enter")`);
    await settle();
    const inserted = await page<{ doc: string; line: string; col: number; open: boolean }>(`
      const v = e2e.view(".act .cm-content");
      const head = v.state.selection.main.head;
      const line = v.state.doc.lineAt(head);
      return { doc: v.state.doc.toString(), line: line.text, col: head - line.from, open: !!document.querySelector(".cm-tooltip.slash") };
    `);
    check(
      "Enter inserts a 3 × 3 table with the caret in its first header cell",
      inserted.doc.includes(`\n\n${starter}`) && !inserted.doc.includes("/tab") && inserted.line === starter.split("\n")[0] && inserted.col === 2 && !inserted.open,
      JSON.stringify({ line: inserted.line, col: inserted.col, open: inserted.open }),
    );
    await e2e(`key(${JSON.stringify(live)}, "Escape")`);
    await settle();
    const drawn = await page<{ tables: number; empty: boolean }>(`
      const t = [...document.querySelectorAll("article table")];
      return { tables: t.length, empty: t.some((x) => x.querySelectorAll("th").length === 3 && x.querySelectorAll("tbody tr").length === 3 && !x.textContent.trim()) };
    `);
    check("leaving the block draws the new table", drawn.tables === tables + 1 && drawn.empty, JSON.stringify(drawn));

    // Typing changes the block's kind under the caret; the same editor carries on with the caret where the edit left it.
    await page(`
      const h = document.querySelector("article h2");
      const r = h.getBoundingClientRect();
      h.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.right - 2, clientY: r.top + r.height / 2 }));
    `);
    await waitFor("the live editor", () => page<boolean>(`return !!document.querySelector(".act .cm-content")`));
    await settle();
    await page(`window.e2eView = e2e.view(${JSON.stringify(live)}); return true`);
    // h3 to h6 have no line style of their own, so only the block's element tells them apart.
    const transitions: [string, number, string[], string][] = [
      ["## 本次待办", 2, ["#"], "h3 ###| 本次待办"],
      ["### 本次待办", 3, ["#"], "h4 ####| 本次待办"],
      ["#### 本次待办", 4, ["Backspace"], "h3 ###| 本次待办"],
      ["本次待办", 0, ["#", " "], "h1 # |本次待办"],
      ["# 本次待办", 2, ["Backspace", "Backspace"], "p |本次待办"],
      ["本次待办", 0, [">", " "], "quote > |本次待办"],
      ["> 本次待办", 2, ["Backspace", "Backspace"], "p |本次待办"],
    ];
    for (const [from, at, keys, expected] of transitions) {
      await page(`const v = e2e.view(${JSON.stringify(live)}); v.focus(); v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: ${JSON.stringify(from)} }, selection: { anchor: ${at} } })`);
      await settle();
      for (const k of keys) {
        await e2e(k.length > 1 ? `key(${JSON.stringify(live)}, ${JSON.stringify(k)})` : `type(${JSON.stringify(live)}, ${JSON.stringify(k)})`);
        await settle();
      }
      const got = await page<string>(`
        const act = document.querySelector(".act");
        const v = e2e.view(".act .cm-content");
        const s = v.state.selection.main.head;
        const kind = act.getAttribute("aria-level") ? "h" + act.getAttribute("aria-level") : act.classList.contains("quote") ? "quote" : "p";
        // Focus within the page: v.hasFocus also needs the window to be the system's key window.
        const notes = (v === window.e2eView ? "" : " (another editor)") + (v.root.activeElement === v.contentDOM ? "" : " (not focused)");
        return kind + " " + v.state.sliceDoc(0, s) + "|" + v.state.sliceDoc(s) + notes;
      `);
      check(`${keys.join(" ")} on "${from.slice(0, at)}|${from.slice(at)}" keeps the editor and its caret`, got === expected, got);
    }
    await page(`const v = e2e.view(${JSON.stringify(live)}); v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: "## 本次待办" } })`);
    await e2e(`key(${JSON.stringify(live)}, "Escape")`);
    await settle();

    // 斜杠命令 in source mode: ↓ moves the selection, Esc closes the menu and keeps the "/".
    await menu("视图", "源码");
    await settle();
    await e2e(`newLine(${JSON.stringify(source)})`);
    await e2e(`type(${JSON.stringify(source)}, "/")`);
    await e2e(`key(${JSON.stringify(source)}, "ArrowDown")`);
    await settle();
    const moved = await e2e<string[]>("menu()");
    check("the source editor's slash menu opens and ↓ selects the next item", moved.length === 13 && moved[1] === "*表格", moved.slice(0, 3).join(" "));
    await capture("edit-e2e-slash-source");
    await e2e(`key(${JSON.stringify(source)}, "Escape")`);
    await settle();
    const closedMenu = await page<{ open: boolean; line: string }>(`return { open: !!document.querySelector(".cm-tooltip.slash"), line: e2e.line(".ed .cm-content") }`);
    check("Esc closes the menu and leaves the typed /", !closedMenu.open && closedMenu.line === "/", JSON.stringify(closedMenu));
    await undo(source);

    // 成对符号包裹: each key wraps the selection, and one ⌘Z gives back the plain word.
    const word = "编辑与预览";
    const pairs: [string, string][] = [
      ["`", "`编辑与预览`"],
      ["*", "**编辑与预览**"],
      ["[", "[编辑与预览]()"],
      ["$", "$编辑与预览$"],
    ];
    for (const [key, wrapped] of pairs) {
      const before = await e2e<string>(`doc(${JSON.stringify(source)})`);
      await e2e(`select(${JSON.stringify(source)}, ${JSON.stringify(word)})`);
      await e2e(`type(${JSON.stringify(source)}, ${JSON.stringify(key)})`);
      const after = await page<{ doc: string; selected: string; caretAfter: string }>(`
        const v = e2e.view(".ed .cm-content");
        const s = v.state.selection.main;
        return { doc: v.state.doc.toString(), selected: v.state.sliceDoc(s.from, s.to), caretAfter: v.state.sliceDoc(s.head, s.head + 1) };
      `);
      if (key === "[") await capture("edit-e2e-wrap-link");
      await undo(source);
      const back = await page<{ doc: string; selected: string }>(`const v = e2e.view(".ed .cm-content"); const s = v.state.selection.main; return { doc: v.state.doc.toString(), selected: v.state.sliceDoc(s.from, s.to) }`);
      const placed = key === "[" ? after.selected === "" && after.caretAfter === ")" : after.selected === word;
      check(`${key} wraps the selection as ${wrapped} and ⌘Z unwraps it`, after.doc === before.replace(word, wrapped) && placed && back.doc === before && back.selected === word, JSON.stringify({ selected: after.selected, back: back.selected }));
    }

    // 智能剪贴板: a URL over a selection, rich text from Safari, a range from Excel, plain TSV.
    const url = "https://dew.app/sync";
    await e2e(`select(${JSON.stringify(source)}, ${JSON.stringify(word)})`);
    await e2e(`paste(${JSON.stringify(source)}, { "text/plain": ${JSON.stringify(url)} })`);
    await settle();
    const linked = await e2e<string>(`doc(${JSON.stringify(source)})`);
    const linkToast = await e2e<string[]>("toasts()");
    check("a URL pasted over a selection becomes a link, with a toast", linked.includes(`[${word}](${url})`) && linkToast.includes(`已合成链接 | [${word}](${url}) | 撤销`), linkToast.join(" / "));
    await e2e(`act("撤销")`);
    await settle();
    const unlinked = await e2e<string>(`doc(${JSON.stringify(source)})`);
    check("撤销 turns the link back into the pasted URL", unlinked.includes(`让${url}真正`) && !unlinked.includes(`](${url})`) && !(await e2e<string[]>("toasts()")).some((t) => t.startsWith("已合成链接")));

    const rich = expected(fx.safariHtml, fx.safariText);
    await e2e(`newLine(${JSON.stringify(source)})`);
    await e2e(`paste(${JSON.stringify(source)}, { "text/html": ${JSON.stringify(fx.safariHtml)}, "text/plain": ${JSON.stringify(fx.safariText)} })`);
    await settle();
    const richToast = await e2e<string[]>("toasts()");
    check("rich text from Safari is pasted as Markdown, with a toast", !!rich && (await e2e<string>(`doc(${JSON.stringify(source)})`)).endsWith(rich) && richToast.includes("富文本已转为 Markdown | 保留标题、列表、加粗与链接，清除内联样式 | 撤销"), richToast.join(" / "));
    await e2e(`act("撤销")`);
    await settle();
    const plainRich = await e2e<string>(`doc(${JSON.stringify(source)})`);
    check("撤销 pastes the rich text's plain text instead", plainRich.endsWith(fx.safariText.replace(/\r\n?/g, "\n")) && !plainRich.includes(rich));

    const sheet = expected(fx.excelHtml, fx.excelText);
    await e2e(`newLine(${JSON.stringify(source)})`);
    const beforeSheet = await e2e<string>(`doc(${JSON.stringify(source)})`);
    await e2e(`paste(${JSON.stringify(source)}, { "text/html": ${JSON.stringify(fx.excelHtml)}, "text/plain": ${JSON.stringify(fx.excelText)} })`);
    await settle();
    const sheetToast = (await e2e<string[]>("toasts()")).find((t) => t.startsWith("表格已转换并对齐")) ?? "";
    check("cells copied from Excel are pasted as an aligned table, with a toast", !!sheet && (await e2e<string>(`doc(${JSON.stringify(source)})`)) === beforeSheet + sheet && sheetToast.includes("来自 Excel · 4 列 × 5 行"), sheetToast);
    await undo(source);
    await settle();
    check("one ⌘Z takes the whole table back out", (await e2e<string>(`doc(${JSON.stringify(source)})`)) === beforeSheet && !(await e2e<string[]>("toasts()")).some((t) => t.startsWith("表格已转换并对齐")));

    await e2e(`paste(${JSON.stringify(source)}, { "text/plain": ${JSON.stringify(fx.excelText)} })`);
    await settle();
    const tsvToast = (await e2e<string[]>("toasts()")).find((t) => t.startsWith("表格已转换并对齐")) ?? "";
    check("tab-separated text is pasted as the same aligned table", (await e2e<string>(`doc(${JSON.stringify(source)})`)) === beforeSheet + sheet && tsvToast.includes("来自表格 · 4 列 × 5 行"), tsvToast);
    await capture("edit-e2e-paste-toasts");

    // A screenshot lands in assets/ beside the document and shows in the preview and the PDF.
    await e2e(`newLine(${JSON.stringify(source)})`);
    await page(`
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = 120;
      const g = c.getContext("2d");
      g.fillStyle = "#0A66D8";
      g.fillRect(0, 0, 320, 120);
      g.fillStyle = "#fff";
      g.font = "28px sans-serif";
      g.fillText("e2e 截图", 100, 70);
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      e2e.paste(".ed .cm-content", {}, new File([blob], "image.png", { type: "image/png" }));
    `);
    const imageToast = await waitFor("the image toast", async () => (await e2e<string[]>("toasts()")).find((t) => t.startsWith("截图已转存")), 10000).catch(() => "");
    const rel = /\.\/assets\/paste-\d{8}-\d{6}(-\d+)?\.png/.exec(imageToast)?.[0] ?? "";
    const png = rel ? join(work, rel) : "";
    const sig = png && existsSync(png) ? Buffer.from(await Bun.file(png).slice(0, 8).arrayBuffer()).toString("hex") : "";
    check(
      "a pasted screenshot is saved to assets/ beside the document and linked",
      !!rel && imageToast.endsWith("在访达中显示") && (await e2e<string>(`line(${JSON.stringify(source)})`)) === `![](${rel})` && sig === "89504e470d0a1a0a",
      imageToast,
    );
    await capture("edit-e2e-image-toast");
    await menu("视图", "预览");
    const shown = await waitFor(
      "the pasted image",
      () => page<string>(`const i = [...document.querySelectorAll("article img")].find((x) => x.src.startsWith("docfile:")); if (!i) return ""; i.scrollIntoView({ block: "center" }); return i.complete && i.naturalWidth ? i.src + " " + i.naturalWidth : "";`),
      10000,
    ).catch(String);
    check("the preview shows the pasted image from beside the document", shown.endsWith(" 320") && shown.includes(rel.slice(2)), shown);
    await settle();
    await capture("edit-e2e-image-preview");

    await menu("文件", "保存");
    await waitFor("the save", () => isSaved(page));
    await menu("文件", "导出为 PDF…");
    const pdf = join(work, "辅助编辑.pdf");
    await waitFor("the PDF", async () => existsSync(pdf) && (await Bun.file(pdf).size) > 0, 20000);
    await Bun.sleep(500);
    const images = (await $`pdfimages -list ${pdf}`.text()).trim().split("\n").slice(2);
    check("the PDF export embeds the pasted image", images.some((l) => /\s320\s+120\s/.test(l)), images.join(" / ") || "no images");
  });
}

for (const name of named.length ? named : Object.keys(sections)) await sections[name]!();

/** Live mode's table controls, the share card dialog and its clipboard image, and the PDF's page protection. */
async function shareTableChecks() {
  const md = join(work, "表格与分享.md");
  await writeFile(
    md,
    ["# 表格与分享", "", "| 名称 | 说明 | 数量 |", "| --- | --- | --- |", "| 苹果 | 红色的水果 | 3 |", "| 香蕉 | 黄色 | 12 |", "", "```ts", "export function sync(src: Pane) {", "  return src.top;", "}", "```", ""].join("\n"),
  );
  await session(md, async ({ page, capture, menu, text }) => {
    const content = () => page<string>(`return await mygo.call("Doc.Content")`);
    const table = async () => (await content()).split("\n").filter((l) => l.startsWith("|"));
    // Pointer events at a spot given relative to the table, which the controls read from the rendered table.
    const geometry = `
      const blk = document.querySelector(".tbl-blk");
      const box = blk.querySelector("table").getBoundingClientRect();
      const ths = [...blk.querySelectorAll("thead th")].map((t) => t.getBoundingClientRect());
      const head = blk.querySelector("thead").getBoundingClientRect();
      const move = (x, y) => blk.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y }));
    `;
    const aligned = (rows: string[]) => new Set(rows.map((r) => [...r].reduce((w, c) => w + (/[一-鿿]/.test(c) ? 2 : 1), 0))).size === 1;
    await page(`document.querySelector(".tbl-blk").scrollIntoView({ block: "center" })`);
    await settle();

    await page(`${geometry} move(ths[0].right, box.top - 10)`);
    await settle();
    await capture("e2e-table-plus-column");
    await page(`document.querySelector('.ta-plus[aria-label="在此插入列"]').click()`);
    await settle();
    const withColumn = await table();
    check("+ on the table's top edge inserts a column there, and the source stays aligned", withColumn.length === 4 && withColumn[0]!.split("|").length === 6 && withColumn[0]!.split("|")[2]!.trim() === "" && aligned(withColumn), withColumn[0]);

    await page(`${geometry} move(box.left - 8, head.bottom + 1)`);
    await settle();
    await page(`document.querySelector('.ta-plus[aria-label="在此插入行"]').click()`);
    await settle();
    const withRow = await table();
    check("+ on the table's left edge inserts a row there", withRow.length === 5 && withRow[2]!.replace(/[|\s]/g, "") === "" && withRow[3]!.includes("苹果") && aligned(withRow), withRow[2]);

    const before = withRow[1]!;
    await page(`${geometry} move(ths[0].right, (box.top + box.bottom) / 2)`);
    await settle();
    await page(`
      const b = document.querySelector(".ta-border").getBoundingClientRect();
      const x = b.left + b.width / 2, y = b.top + b.height / 2;
      document.querySelector(".ta-border").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: x, clientY: y }));
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: x + 30, clientY: y }));
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: x + 60, clientY: y }));
    `);
    await settle();
    const tip = await page<string>(`return document.querySelector(".ta-tip")?.textContent ?? ""`);
    await capture("e2e-table-resize");
    await page(`window.dispatchEvent(new PointerEvent("pointerup", {}))`);
    await settle();
    const resized = await table();
    const fixed = await page<boolean>(`return !!document.querySelector(".tbl-blk table.fixed colgroup")`);
    check("dragging a column border shows its width and rewrites the delimiter dashes", /^列宽 \d+px$/.test(tip) && resized[1] !== before && /-{4,}/.test(resized[1]!) && fixed && aligned(resized), `${tip}; ${before} → ${resized[1]}`);
    await capture("e2e-table-synced");

    await page(`
      const b = document.querySelector('[data-blk="code"]');
      b.scrollIntoView({ block: "center" });
      const lines = b.querySelectorAll(".cl");
      const r = document.createRange();
      r.setStartBefore(lines[0]);
      r.setEndAfter(lines[1]);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    `);
    await menu("文件", "将选区生成分享卡片…");
    await waitFor("the share card dialog", () => page<boolean>(`return !!document.querySelector(".share-card")`));
    await settle();
    const kind = await page<string>(`return document.querySelector(".share-card").getAttribute("aria-label")`);
    check("a code selection opens the share card dialog on a code card", kind === "代码分享卡片预览", kind);
    await capture("e2e-share-dialog");

    await page(`await mygo.call("ClipboardProbe.Clear")`);
    await page(`document.querySelector(".share-copy").click()`);
    await waitFor("已复制", () => page<boolean>(`return document.querySelector(".share-copy").textContent.includes("已复制")`));
    const png = await page<{ signature: string; width: number; height: number }>(`return await mygo.call("ClipboardProbe.PNG")`);
    const canvas = await page<{ width: number; height: number; css: number }>(`const c = document.querySelector(".share-card"); return { width: c.width, height: c.height, css: parseFloat(c.style.width) }`);
    check("复制图片 puts the card on the clipboard as a 2× PNG", png.signature === "89504e470d0a1a0a" && png.width === canvas.width && png.height === canvas.height && png.width >= 2 * 404, JSON.stringify({ png, canvas }));

    await page(`
      const input = document.querySelector("#share-wm");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "@e2e");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector('.share-sw[aria-label="墨绿渐变"]').click();
    `);
    await Bun.sleep(900);
    await page(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await settle();
    await menu("文件", "将选区生成分享卡片…");
    await waitFor("the share card dialog", () => page<boolean>(`return !!document.querySelector(".share-card")`));
    await settle();
    const reopened = await page<{ value: string; green: string | null }>(`return { value: document.querySelector("#share-wm").value, green: document.querySelector('.share-sw[aria-label="墨绿渐变"]').getAttribute("aria-pressed") }`);
    const stored = await page<{ watermark: string; cardBg: string }>(`return await mygo.call("Prefs.Get")`);
    check("the watermark and background persist in the preferences", reopened.value === "@e2e" && reopened.green === "true" && stored.watermark === "@e2e" && stored.cardBg === "green", JSON.stringify({ reopened, stored: { watermark: stored.watermark, cardBg: stored.cardBg } }));
    await capture("e2e-share-watermark");
    await page(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await menu("文件", "保存");
    await waitFor("the save", () => isSaved(page));
  });

  const exportPdf = async (menu: Session["menu"], pdf: string) => {
    await rm(pdf, { force: true });
    await menu("文件", "导出为 PDF…");
    await waitFor("the PDF", async () => existsSync(pdf) && (await Bun.file(pdf).size) > 0, 40000);
    await Bun.sleep(500);
  };
  // pdftotext spells some CJK characters as Kangxi radicals, which NFKC folds back; spaces vary, so they go.
  const pdfPages = async (pdf: string) => {
    const count = Number((await $`pdfinfo ${pdf}`.text()).match(/Pages:\s+(\d+)/)![1]);
    const pages: string[][] = [];
    for (let p = 1; p <= count; p++) pages.push((await $`pdftotext -f ${p} -l ${p} ${pdf} -`.text()).normalize("NFKC").split("\n").map((l) => l.replace(/\s+/g, "")));
    return pages;
  };

  // 分页保护 › 图片: off, a tall image is sliced across two pages; on, it moves whole to the next page.
  const imageDoc = join(work, "图片分页.md");
  await $`magick -size 600x820 gradient:#5B8DEF-#F2A385 ${join(work, "tall.png")}`;
  const filler = Array.from({ length: 6 }, (_, i) => `第 ${i + 1} 段填充文字，把图片推到第一页的下半部分，看它放不下时整体移到下一页还是从中间切开。`.repeat(2));
  await writeFile(imageDoc, ["# 图片分页", ...filler, "![高图](tall.png)", "图片之后的一段。", ""].join("\n\n"));
  await session(imageDoc, async ({ page, capture, menu }) => {
    const pdf = join(work, "图片分页.pdf");
    const imagePages = async () => (await $`pdfimages -list ${pdf}`.text()).split("\n").slice(2).filter(Boolean).map((l) => Number(l.trim().split(/\s+/)[0]));
    await exportPdf(menu, pdf);
    const off = await imagePages();
    await $`pdftoppm -r 40 -png ${pdf} ${join(out, "e2e-guard-image-off")}`;
    await page(`document.querySelector('[aria-label="导出与分享"]').click()`);
    await settle();
    await page(`[...document.querySelectorAll(".pg-chk")].find((b) => b.textContent === "图片").click()`);
    await settle();
    const popover = await page<{ open: boolean; summary: string }>(`return { open: !!document.querySelector(".pop-exp"), summary: document.querySelector(".pop-exp .mi small")?.textContent ?? "" }`);
    await capture("e2e-guard-popover");
    await page(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await Bun.sleep(600);
    await exportPdf(menu, pdf);
    const on = await imagePages();
    await $`pdftoppm -r 40 -png ${pdf} ${join(out, "e2e-guard-image-on")}`;
    const stored = await page<{ pageGuard: { image: boolean } }>(`return await mygo.call("Prefs.Get")`);
    check(
      "with 图片 unchecked a tall image splits across pages; checked, it moves whole to the next page",
      off.length === 2 && off[0] !== off[1] && on.length === 1 && popover.open && popover.summary === "代码块、表格、图表、图片分页保护" && stored.pageGuard.image,
      JSON.stringify({ off, on, popover }),
    );
  });

  // The defaults guard code, tables and charts: each that fits a page prints on one, and a heading stays with its chart.
  const guarded = join(work, "超级代码块-分页.md");
  await copyFile(join(root, "samples/超级代码块.md"), guarded);
  await session(guarded, async ({ menu }) => {
    const pdf = join(work, "超级代码块-分页.pdf");
    await exportPdf(menu, pdf);
    const pages = await pdfPages(pdf);
    const pageOf = (mark: string) => pages.findIndex((lines) => lines.some((l) => (mark.startsWith("=") ? l === mark.slice(1) : l.includes(mark)))) + 1;
    const units: Record<string, string[]> = {
      diff: ["@@-12,7", "offScroll"],
      "图表代码块 and its chart": ["=图表代码块", "打开.md文件", "继续阅读"],
      "Vega-Lite": ["=Vega-Lite", "占比(%)"],
      table: ["触发方式", "选中后右键"],
      "wide table": ["回到实时编辑", "灯箱搜索框里按"],
    };
    const at = Object.entries(units).map(([name, marks]) => ({ name, pages: marks.map(pageOf) }));
    const whole = at.every((u) => u.pages[0]! > 0 && u.pages.every((p) => p === u.pages[0]));
    check("code blocks, tables and charts that fit a page are not cut, and 图表代码块 shares its chart's page", whole, at.map((u) => `${u.name} p${[...new Set(u.pages)].join("/")}`).join(", "));
    await $`pdftoppm -r 50 -png ${pdf} ${join(out, "e2e-guard-super")}`;
  });
}

/**
 * Two files opened together become tabs of one window with the native tab
 * bar hidden; each page's dock shows the group, switches files, and sees
 * edits, saves, new files and closed ones; the light table lays them out.
 */
async function tabChecks() {
  const dir = join(work, "tabs");
  await mkdir(dir, { recursive: true });
  const first = join(dir, "版本说明.md");
  await copyFile(join(root, "samples/版本说明.md"), first);
  await copyFile(join(root, "samples/超级代码块.md"), join(dir, "超级代码块.md"));
  // Run alone, this section measures the single window that tabs are compared with itself.
  if (!singleTitleBar) await session(first, async ({ page }) => void (singleTitleBar = await titleBar(page)));

  await session([first, join(dir, "超级代码块.md")], async (s) => {
    const shown = async () => {
      const ids: number[] = [];
      for (const w of await s.windows()) if ((await s.at(w.id).page<string>("return document.visibilityState")) === "visible") ids.push(w.id);
      return ids;
    };
    // While a tab switches, no page or two may be shown for a moment.
    const front = () =>
      waitFor("exactly one page shown", async () => {
        const ids = await shown();
        const win = (await s.windows()).find((w) => w.id === ids[0]);
        return ids.length === 1 && win && { win, s: s.at(win.id) };
      });
    const docks = async () => Promise.all((await s.windows()).map(async (win) => ({ win, files: await dock(s.at(win.id).page) })));
    const summary = (ds: Awaited<ReturnType<typeof docks>>) => ds.map(({ win, files }) => `${win.title}: ${files.map((f) => `${f.current ? "*" : ""}${f.name}(${f.tear})`).join(" ")}`).join(" | ");
    const settled = <T>(what: string, probe: () => Promise<T | null | undefined | false>) => waitFor(what, probe).catch(() => null);
    const bars = async () => Promise.all((await s.windows()).map((w) => titleBar(s.at(w.id).page)));
    const asSingle = (t: TitleBar) => !!singleTitleBar && t.closeX === singleTitleBar.closeX && t.closeY === singleTitleBar.closeY && t.contentHeight === singleTitleBar.contentHeight;
    const checkTitleBars = async (when: string) => {
      const b = await bars();
      check(`${when}, the tab bar stays hidden and the traffic lights sit where a single window has them`, b.every(asSingle) && b.filter((t) => t.selected).length === 1, JSON.stringify({ single: singleTitleBar, tabs: b }));
    };

    const opened = await s.windows();
    const sameBounds = opened.every((w) => JSON.stringify(w.bounds) === JSON.stringify(opened[0]!.bounds));
    check("two files open as tabs of one window: the same bounds, one page shown", opened.length === 2 && sameBounds && (await shown()).length === 1, JSON.stringify({ bounds: opened.map((w) => w.bounds), shown: await shown() }));
    await checkTitleBars("with two files");
    const listed = await docks();
    check(
      "each page's dock lists both files, its own as the current one",
      listed.every(({ win, files }) => files.map((f) => f.name).join("/") === "版本说明.md/超级代码块.md" && files.filter((f) => f.current).map((f) => f.name).join() === win.title && files.every((f) => f.tear === "saved")),
      summary(listed),
    );

    let top = await front();
    await top.s.capture("e2e-tabs-dock");
    const hoverState = () =>
      top.s.page<{ tip: string; opacity: number; dock: number; plus: number }>(`
        const tip = document.querySelector(".dk:not(.on) .dk-tip");
        return {
          tip: tip.textContent,
          opacity: Number(getComputedStyle(tip).opacity),
          dock: document.querySelector(".dock").getBoundingClientRect().width,
          plus: document.querySelector('.dock [aria-label="新建文件"]').getBoundingClientRect().left,
        };
      `);
    // The dock unfolds after the window opens, and again as the other tabs report in; measure it once it has held still for a second.
    const widths: number[] = [];
    const before = await waitFor("the dock to settle", async () => {
      const h = await hoverState();
      widths.push(h.dock);
      await Bun.sleep(250);
      return widths.length >= 5 && widths.slice(-5).every((w) => w === h.dock) && h;
    }, 15000);
    // :hover can't be set from a script, so the drop gets a class that the :hover rules are copied to.
    await top.s.page(`
      for (const sheet of document.styleSheets) for (const r of [...sheet.cssRules]) if (r.selectorText?.includes(".dk-btn:hover")) sheet.insertRule(r.cssText.replaceAll(".dk-btn:hover", ".dk-btn.e2e-hover"), sheet.cssRules.length);
      document.querySelector(".dk:not(.on) .dk-btn").classList.add("e2e-hover");
    `);
    await Bun.sleep(1000);
    const hovered = await hoverState();
    const other = (await dock(top.s.page)).find((f) => !f.current)!.name;
    check(
      "hovering a background file's drop floats its name above it, and nothing in the dock moves",
      before.opacity === 0 && hovered.opacity === 1 && hovered.tip === other && hovered.dock === before.dock && hovered.plus === before.plus,
      JSON.stringify({ before, hovered }),
    );
    await top.s.capture("e2e-tabs-dock-hover");
    await top.s.page(`document.querySelector(".dk:not(.on) .dk-btn").classList.remove("e2e-hover")`);

    const was = top.win.id;
    await top.s.page(`document.querySelector(".dk:not(.on) .dk-btn").click()`);
    const flipped = await settled("the other file", async () => {
      const ids = await shown();
      return ids.length === 1 && ids[0] !== was;
    });
    check("clicking the other file in the dock shows its window instead", !!flipped, JSON.stringify(await shown()));
    await checkTitleBars("after switching files");

    top = await front();
    const editedName = top.win.title;
    await top.s.menu("视图", "源码");
    await settle();
    await top.s.page(`
      const v = document.querySelector(".ed .cm-content").cmTile.root.view;
      v.dispatch({ changes: { from: v.state.doc.length, insert: "\\n多文件 e2e 输入。\\n" } });
    `);
    const tearOf = (ds: Awaited<ReturnType<typeof docks>>, name: string) => ds.map(({ files }) => files.find((f) => f.name === name)?.tear);
    const dirty = await settled("both docks to see the edit", async () => {
      const ds = await docks();
      return tearOf(ds, editedName).every((t) => t === "dirty") && ds;
    });
    check(`typing in ${editedName} runs its tear low in both pages' docks`, !!dirty, summary(dirty || (await docks())));
    await top.s.menu("文件", "保存");
    const savedAll = await settled("both docks to see the save", async () => {
      const ds = await docks();
      return tearOf(ds, editedName).every((t) => t === "saved") && ds;
    });
    const rippled = await top.s.page<boolean>(`return document.querySelector(".dk.on .tear").classList.contains("ripple")`);
    check("saving fills its tear again in both docks, with a ripple where it was saved", !!savedAll && rippled && (await readFile(join(dir, editedName), "utf8")).includes("多文件 e2e 输入。"), summary(savedAll || (await docks())));

    await top.s.page(`document.querySelector('.dock [aria-label="新建文件"]').click()`);
    const three = await settled("the new file's window", async () => {
      const ws = await s.windows();
      return ws.length === 3 && ws;
    });
    const addedId = three ? three.find((w) => !opened.some((o) => o.id === w.id))?.id : undefined;
    // The window takes its document's name once mygo has told it the document's state.
    const added = addedId === undefined ? undefined : await settled("the new window's title", async () => {
      const name = (await currentFile(s.at(addedId).page).catch(() => undefined))?.name;
      return (await s.windows()).find((w) => w.id === addedId && w.title === name);
    });
    const withNew = await settled("every dock to list the new file", async () => {
      const ds = await docks();
      return ds.length === 3 && ds.every(({ files }) => files.length === 3 && files.some((f) => f.name === added?.title && f.tear === "empty")) && ds;
    });
    const newShown = (await shown()).join() === String(added?.id);
    check("新建文件 in the dock opens an untitled file as a new tab, an empty tear in every dock", !!withNew && newShown, summary(withNew || (await docks())));
    if (!added) return;
    // Its page clears from a mist where a drop lands on the first line, then leaves the page alone.
    const cleared = await settled("the new page's mist to clear", () =>
      s.at(added.id).page<boolean>(`return !document.querySelector("[data-condense]") && !!document.querySelector("main .art-hint, main .cm-placeholder")`),
    );
    check("a new file's page clears its mist and shows where to write", !!cleared, await s.at(added.id).page<string>(`return document.querySelector(".app").className`));
    await checkTitleBars("after a new file joins");

    const fresh = s.at(added.id);
    const order = (await dock(fresh.page)).map((f) => f.name);
    const next = order[(order.indexOf(added.title) + 1) % order.length];
    await fresh.menu("视图", "显示下一个文件");
    const wentNext = await settled("the next file", async () => (await front()).win.title === next);
    await (await front()).s.menu("视图", "显示上一个文件");
    const wentBack = await settled("the file before it", async () => (await front()).win.id === added.id);
    check("视图 › 显示下一个文件 and 显示上一个文件 step through the group's files", !!wentNext && !!wentBack, `${order.join(" → ")}; next ${next}`);

    await fresh.menu("视图", "灯桌总览");
    await settled("the light table", () => fresh.page<boolean>(`return !!document.querySelector(".lt")`));
    await Bun.sleep(1000);
    const table = await fresh.page<{ recent: boolean; pages: string[]; current: string; sketched: number[]; dimmed: boolean }>(`return {
      recent: !!document.querySelector('section[aria-label="最近关闭的文件"]'),
      pages: [...document.querySelectorAll(".ltp")].map((p) => p.getAttribute("aria-label")),
      current: document.querySelector(".ltp.cur .ltp-lbl")?.textContent ?? "",
      sketched: [...document.querySelectorAll(".ltp .pg")].map((p) => p.children.length),
      dimmed: document.querySelector(".app").classList.contains("lt-on"),
    }`);
    check(
      "视图 › 灯桌总览 lays out every file as a sketched page, the current one ringed",
      !table.recent && table.pages.length === 3 && order.every((n) => table.pages.some((p) => p.startsWith(`${n}，`))) && table.current === added.title && table.sketched.every((n) => n > 0) && table.dimmed,
      JSON.stringify(table),
    );
    await fresh.capture("e2e-tabs-light-table");
    await fresh.page(`
      const input = document.querySelector("#lt-q");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "超级");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    `);
    await settle();
    const filtered = await fresh.page<string[]>(`return [...document.querySelectorAll(".ltp .ltp-lbl")].map((l) => l.textContent)`);
    check("the light table's filter narrows the pages by name", filtered.join() === "超级代码块.md", filtered.join(" / "));
    await fresh.page(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await Bun.sleep(400);
    check("Escape puts the light table away", !(await fresh.page<boolean>(`return !!document.querySelector(".lt") || document.querySelector(".app").classList.contains("lt-on")`)));

    // An untitled file with text asks to be saved instead of closing; its text says what wrote it.
    const untitledText = await fresh.page<string>(`return await mygo.call("Doc.Content")`);
    await fresh.page(`document.querySelector(".dk.on .dk-x").click()`);
    const closed = await settled("the untitled file to close", async () => {
      const ds = await docks();
      return ds.length === 2 && ds.every(({ files }) => files.length === 2 && files.every((f) => f.tear === "saved")) && ds;
    });
    const shownAfter = await settled("one page shown", async () => (await shown()).length === 1);
    check(
      "the current file's ✕ in the dock closes it, and every dock drops it",
      !!closed && !!shownAfter,
      closed ? summary(closed) : `${summary(await docks())}; untitled text ${JSON.stringify(untitledText)}`,
    );

    // Dragging a page onto the light table's red zone closes its file.
    top = await front();
    await top.s.page(`document.querySelector('.dock [aria-label="新建文件"]').click()`);
    const again = await settled("another new file", async () => {
      const ws = await s.windows();
      return ws.length === 3 && ws.find((w) => !opened.some((o) => o.id === w.id));
    });
    if (!again) return check("another new file opens", false);
    const untitled = s.at(again.id);
    await waitFor("its page", () => untitled.page<boolean>(`return !!document.querySelector(".dock")`));
    await untitled.page(`document.querySelector('.dock [aria-label="灯桌总览"]').click()`);
    await Bun.sleep(1000);
    const hot = await untitled.page<string>(`
      const p = document.querySelector(".ltp.cur");
      const z = document.querySelector(".zone").getBoundingClientRect();
      const r = p.getBoundingClientRect();
      const ev = (type, x, y) => p.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: y }));
      ev("pointerdown", r.left + r.width / 2, r.top + r.height / 2);
      ev("pointermove", r.left + r.width / 2 + 20, r.top + r.height / 2 + 20);
      ev("pointermove", z.left + z.width / 2, z.top + z.height / 2);
      await new Promise((done) => setTimeout(done, 300));
      return document.querySelector(".zone").className;
    `);
    await untitled.page(`document.querySelector(".ltp.cur").dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, button: 0 }))`).catch(() => {});
    const dropped = await settled("the dragged file to close", async () => {
      const ds = await docks();
      return ds.length === 2 && ds.every(({ files }) => files.length === 2) && ds;
    });
    check("dragging a page onto the light table's red zone closes its file", hot.includes("hot") && !!dropped, `zone ${hot}; ${summary(dropped || (await docks()))}`);

    // Closing a file leaves it among the recent files with how far it was read; reopening it scrolls back there.
    top = await front();
    const readName = top.win.title;
    await top.s.page(`const el = document.querySelector(".pv-scroll"); el.scrollTop = 0.5 * (el.scrollHeight - el.clientHeight)`);
    await Bun.sleep(700);
    await top.s.page(`document.querySelector(".dk.on .dk-x").click()`);
    const left = await settled("the read file to close", async () => (await s.windows()).length === 1 && (await front()));
    if (!left) return check("closing a read file leaves one open", false, summary(await docks()));
    await left.s.page(`document.querySelector('.dock [aria-label="灯桌总览"]').click()`);
    const card = await settled("its card among the recent files", () =>
      left.s.page<string | null>(`return [...document.querySelectorAll(".vap .rc")].map((c) => c.getAttribute("aria-label")).find((l) => l.startsWith(${JSON.stringify(`${readName}，`)})) ?? null`),
    );
    const recentCards = await left.s.page<number>(`return document.querySelectorAll('section[aria-label="最近关闭的文件"] .rc').length`);
    check("a closed file lies in the light table's recent files under 刚刚关闭, read to 50%", !!card && card.includes("读到 50%") && recentCards === 1 && (await left.s.text(".vap .vlab")).startsWith("刚刚关闭"), `${card}; ${recentCards} shown`);
    await Bun.sleep(1200);
    await left.s.capture("e2e-tabs-vapor");
    await left.s.page(`document.querySelector(".vap .rc").click()`);
    // The file opens in whichever view new windows start in; the restore follows that view's scroller.
    let last: number | null = null;
    const back = await settled("the file to reopen where it was read", async () => {
      const f = await front();
      if (f.win.title !== readName) return null;
      const ratio = await f.s.page<number>(`const el = document.querySelector(".pv-scroll") ?? document.querySelector(".ed .cm-scroller"); return el.scrollTop / (el.scrollHeight - el.clientHeight)`);
      last = ratio;
      return Math.abs(ratio - 0.5) < 0.02 && { f, ratio };
    });
    check("clicking the card reopens the file as a tab of the group, scrolled back to 50%", !!back && (await dock(back.f.s.page)).length === 2, back ? `ratio ${back.ratio}` : `ratio ${last}; ${summary(await docks())}`);
    if (!back) return;

    // Weeks of closed files fold into stacks, with a scrubber to jump through them.
    const dayMs = 86400000;
    await back.f.s.page(`
      const now = Date.now();
      const files = Array.from({ length: 30 }, (_, i) => ({ path: "/tmp/dew-e2e/旧文件-" + i + ".md", closedAt: now - (2 + i * 1.5) * ${dayMs}, progress: 0.3, pinned: false }));
      await mygo.call("RecentProbe.Seed", files);
    `);
    await back.f.s.page(`document.querySelector('.dock [aria-label="灯桌总览"]').click()`);
    const folded = await settled("the stacks", () =>
      back.f.s.page<{ stacks: string[]; scrub: string[] } | null>(`
        const stacks = [...document.querySelectorAll(".vap .stk")].map((k) => k.getAttribute("aria-label"));
        return stacks.length ? { stacks, scrub: [...document.querySelectorAll(".scrub button")].map((b) => b.textContent) } : null;
      `),
    );
    check("older closed files fold into stacks by age, and a scrubber lists the ages", !!folded && folded.stacks.some((k) => k.startsWith("最近 30 天，")) && folded.scrub.includes("最近 30 天"), JSON.stringify(folded));
    await back.f.s.page(`document.querySelector('.vap .stk[aria-label^="最近 30 天"]').click()`);
    const opened30 = await settled("the 30-day block", () => back.f.s.page<boolean>(`return [...document.querySelectorAll(".vap .vlab")].some((l) => l.textContent.startsWith("最近 30 天") && l.textContent.endsWith("收起"))`));
    check("clicking a stack lays its files out as cards", !!opened30);
    await Bun.sleep(1200);
    await back.f.s.capture("e2e-tabs-vapor-stacks");
    await back.f.s.page(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await waitFor("the light table to go", () => back.f.s.page<boolean>(`return !document.querySelector(".lt")`));

    // ⌘P lists the group's files and the recent ones, and makes a file of a name that matches nothing.
    const palette = back.f.s;
    const typeQuery = (q: string) =>
      palette.page(`
        const i = document.querySelector("#qo-in");
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, ${JSON.stringify(q)});
        i.dispatchEvent(new Event("input", { bubbles: true }));
      `);
    await palette.menu("文件", "快速打开…");
    const shownInPalette = await settled<Record<string, string[]>>("the palette", () =>
      palette.page<Record<string, string[]> | null>(`
        const groups = [...document.querySelectorAll('.qlist [role="group"]')];
        return groups.length ? Object.fromEntries(groups.map((g) => [g.getAttribute("aria-label"), [...g.querySelectorAll(".qit")].map((r) => r.querySelector(".qn").textContent + (r.querySelector(".qbadge") ? "（当前）" : ""))])) : null;
      `),
    );
    check(
      "文件 › 快速打开… lists the group's files, the current one marked, then five recent ones",
      !!shownInPalette && shownInPalette["已打开"]?.length === 2 && shownInPalette["已打开"].includes(`${readName}（当前）`) && shownInPalette["最近"]?.length === 5,
      JSON.stringify(shownInPalette),
    );
    await Bun.sleep(1000);
    await palette.capture("e2e-tabs-quick-open");
    await typeQuery("超级");
    const narrowed = await settled("the query to narrow the list", () =>
      palette.page<string | null>(`const r = [...document.querySelectorAll(".qit")]; return r.length === 1 ? r[0].querySelector(".qn").innerHTML : null`),
    );
    check("typing narrows the palette and bolds the matched run", narrowed === "<b>超级</b>代码块.md", String(narrowed));
    await typeQuery("e2e 新笔记");
    const none = await settled("the no-match row", () => palette.page<string | null>(`return document.querySelector(".qnone")?.textContent ?? null`));
    await palette.page(`document.querySelector("#qo-in").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`);
    const made = await settled("the new file's tab", async () => (await s.windows()).find((w) => w.title === "e2e 新笔记.md"));
    check(
      "a name that matches nothing offers 新建, and ↩ makes that file beside the current one and opens it",
      none === "没有匹配的文件新建「e2e 新笔记.md」" && !!made && existsSync(join(dir, "e2e 新笔记.md")),
      `${none}; ${(await s.windows()).map((w) => w.title).join(" / ")}`,
    );
  });
}

/** The welcome window the app shows while no document is open: its 最近 list, palette and light table, and 新建. */
async function welcomeChecks() {
  const dir = join(work, "welcome");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "版本说明.md");
  await copyFile(join(root, "samples/版本说明.md"), path);

  await session(path, async (s) => {
    const settled = <T>(what: string, probe: () => Promise<T | null | undefined | false>) => waitFor(what, probe).catch(() => null);
    const isWelcome = (id: number) => s.at(id).page<boolean>(`return !!document.querySelector('main[aria-label="欢迎"]')`).catch(() => false);
    /** The one window open, once it is the welcome window. */
    const welcomeAlone = () =>
      settled("the welcome window alone", async () => {
        const ws = await s.windows();
        return ws.length === 1 && (await isWelcome(ws[0]!.id)) && ws[0]!;
      });
    const button = (label: string) => `[...document.querySelectorAll('main[aria-label="欢迎"] button')].find((b) => b.textContent.startsWith(${JSON.stringify(label)}))`;
    const describe = async () => JSON.stringify(await Promise.all(((await s.windows()) ?? []).map(async (w) => ({ title: w.title, welcome: await isWelcome(w.id) }))));

    const [doc] = await s.windows();
    await s.page(`const el = document.querySelector(".pv-scroll"); el.scrollTop = 0.5 * (el.scrollHeight - el.clientHeight)`);
    await Bun.sleep(700);
    await s.menu("文件", "关闭");
    const welcome = await welcomeAlone();
    if (!welcome) return check("closing the last file leaves the welcome window", false, await describe());
    const w = s.at(welcome.id);
    const rows = await settled("the 最近 list", () => w.page<string[] | null>(`const r = [...document.querySelectorAll('section[aria-label="最近"] button')].map((b) => b.getAttribute("aria-label")); return r.length ? r : null`));
    check(
      "closing the last file leaves the welcome window where the file was, its 最近 listing the file",
      JSON.stringify(welcome.bounds) === JSON.stringify(doc!.bounds) && rows?.join() === "重新打开 版本说明.md",
      JSON.stringify({ doc: doc!.bounds, welcome: welcome.bounds, rows }),
    );
    await Bun.sleep(1000);
    await w.capture("e2e-welcome");

    await w.menu("文件", "快速打开…");
    const groups = await settled("the palette", () =>
      w.page<Record<string, string[]> | null>(`
        const groups = [...document.querySelectorAll('.qlist [role="group"]')];
        return groups.length ? Object.fromEntries(groups.map((g) => [g.getAttribute("aria-label"), [...g.querySelectorAll(".qn")].map((n) => n.textContent)])) : null;
      `),
    );
    check("文件 › 快速打开… there lists only the recent files", JSON.stringify(groups) === JSON.stringify({ 最近: ["版本说明.md"] }), JSON.stringify(groups));
    await w.page(`document.querySelector("#qo-in").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await settled("the palette to go", () => w.page<boolean>(`return !document.querySelector('[role="dialog"][aria-label="快速打开"]')`));

    await w.page(`${button("灯桌")}.click()`);
    const table = await settled("the light table", () =>
      w.page<{ pages: number; cards: string[] } | null>(`
        const lt = document.querySelector('[role="dialog"][aria-label="灯桌总览"]');
        const cards = [...document.querySelectorAll('section[aria-label="最近关闭的文件"] button[aria-label$="点按重新打开"]')].map((c) => c.getAttribute("aria-label"));
        return lt && cards.length ? { pages: lt.querySelectorAll(".lt-grid button").length, cards } : null;
      `),
    );
    check("灯桌 there lays out the recent files alone, the file read to 50%", !!table && table.pages === 0 && table.cards.length === 1 && table.cards[0]!.includes("读到 50%"), JSON.stringify(table));
    await Bun.sleep(1200);
    await w.capture("e2e-welcome-light-table");
    await w.page(`[...document.querySelectorAll('[aria-label="灯桌总览"] button')].find((b) => b.textContent === "返回").click()`);
    const back = await settled("the light table to go", () => w.page<boolean>(`return !document.querySelector('[role="dialog"][aria-label="灯桌总览"]')`));
    check("its 返回 goes back to the welcome page", !!back);

    await w.page(`document.querySelector('section[aria-label="最近"] button').click()`);
    let ratio: number | null = null;
    const reopened = await settled("the file to reopen where it was read", async () => {
      const ws = await s.windows();
      if (ws.length !== 1 || ws[0]!.title !== "版本说明.md") return null;
      ratio = await s.at(ws[0]!.id).page<number>(`const el = document.querySelector(".pv-scroll"); return el ? el.scrollTop / (el.scrollHeight - el.clientHeight) : -1`);
      return Math.abs(ratio - 0.5) < 0.02 && ws[0]!;
    });
    check("its 最近 row reopens the file in the welcome window's place, scrolled back to 50%", !!reopened && JSON.stringify(reopened.bounds) === JSON.stringify(welcome.bounds), `ratio ${ratio}; ${await describe()}`);
    if (!reopened) return;

    await s.at(reopened.id).menu("文件", "关闭");
    const again = await welcomeAlone();
    if (!again) return check("closing the file again leaves the welcome window", false, await describe());
    await s.at(again.id).page(`${button("新建")}.click()`);
    const untitled = await settled("an untitled file in the welcome window's place", async () => {
      const ws = await s.windows();
      return ws.length === 1 && !(await isWelcome(ws[0]!.id)) && (await currentFile(s.at(ws[0]!.id).page).catch(() => undefined))?.tear === "empty" && ws[0]!;
    });
    check("新建 opens an untitled file, and the welcome window goes away", !!untitled, await describe());
    if (!untitled) return;

    await s.at(untitled.id).menu("文件", "关闭");
    const last = await welcomeAlone();
    if (!last) return check("closing the untitled file leaves the welcome window", false, await describe());
    await s.at(last.id).menu("文件", "关闭");
    await Bun.sleep(1500);
    const left = (await s.windows()) ?? [];
    check("文件 › 关闭 on the welcome window closes it for good, the app still running", left.length === 0, await describe());
  });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed; captures in ${out}`);
process.exit(failed.length ? 1 : 0);
