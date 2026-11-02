#!/usr/bin/env bun
/**
 * Drives the real app through mygo's automation plugin on copies of
 * samples/版本说明.md and samples/超级代码块.md, checks what the user would
 * see and what lands on disk, and captures PNGs along the way.
 *
 *   bun scripts/e2e.ts [out-dir]
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

const root = resolve(import.meta.dir, "..");
const out = resolve(process.argv[2] ?? join(root, "e2e-out"));
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

console.log("building…");
await $`bun run build:web`.cwd(root).quiet();
// DEW_E2E_APP gives parallel runs (e.g. from two worktrees) their own app data.
const appName = process.env.DEW_E2E_APP ?? "DewE2E";
const ldflags = [
  "-X github.com/egoist/mygo.packageFileExtensions=md,markdown",
  `-X github.com/egoist/mygo.packageName=${appName}`,
  `-X github.com/egoist/mygo.packageIdentifier=com.example.dew.e2e.${appName.toLowerCase()}`,
].join(" ");
await $`go build -tags e2e -ldflags ${ldflags} -o dew-e2e .`.cwd(root);

interface Session {
  page<T = any>(script: string): Promise<T>;
  capture(name: string): Promise<void>;
  menu(...path: string[]): Promise<unknown>;
  text(selector: string): Promise<string>;
}

const settle = () => Bun.sleep(450);

/** Opens path in a fresh launch of the app, runs steps against its window, and quits it. */
async function session(path: string, steps: (s: Session) => Promise<void>) {
  // Its own settings, reset, so every run starts in the default mode.
  await rm(join(homedir(), "Library/Application Support", appName), { recursive: true, force: true });
  await rm(socket, { force: true });
  const proc = Bun.spawn([join(root, "dew-e2e"), path], {
    env: { ...process.env, MYGO_AUTOMATION: socket, DEW_E2E_SAVE_DIR: work },
    stdout: "inherit",
    stderr: "inherit",
  });
  let app: Automation | undefined;
  try {
    app = await Automation.connect(socket);
    const { windows } = await waitFor("a window", async () => {
      const r = await app!.request<{ windows: { id: number; title: string }[] }>("windows");
      return r.windows.length ? r : null;
    });
    const win = windows[0]!.id;
    const page = <T = any>(script: string) => app!.eval<T>(script, win);
    await waitFor("the page", () => page<boolean>(`return !!document.querySelector(".stat")`));
    await steps({
      page,
      capture: (name) => app!.capture(join(out, `${name}.png`), win),
      menu: (...path) => app!.request("menu", { window: win, path }),
      text: (selector) => page<string>(`return document.querySelector(${JSON.stringify(selector)})?.textContent ?? ""`),
    });
  } catch (err) {
    check(`the run on ${basename(path)} finished`, false, String(err));
  } finally {
    app?.close();
    proc.kill();
    await proc.exited;
    await rm(socket, { force: true });
  }
}

await session(file, async ({ page, capture, menu, text }) => {
  const content = () => page<string>(`return await mygo.call("Doc.Content")`);

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
});

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
    await waitFor("the save", async () => (await page<string>(`return document.querySelector(".gtitle").textContent`)).includes("已保存"));
    await menu("文件", "导出为 PDF…");
    const pdf = join(work, "辅助编辑.pdf");
    await waitFor("the PDF", async () => existsSync(pdf) && (await Bun.file(pdf).size) > 0, 20000);
    await Bun.sleep(500);
    const images = (await $`pdfimages -list ${pdf}`.text()).trim().split("\n").slice(2);
    check("the PDF export embeds the pasted image", images.some((l) => /\s320\s+120\s/.test(l)), images.join(" / ") || "no images");
  });
}

await editAssistChecks();

await shareTableChecks();

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
    await waitFor("the save", async () => (await text(".gtitle")).includes("已保存"));
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

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed; captures in ${out}`);
process.exit(failed.length ? 1 : 0);
