# Dew

A cross-platform desktop Markdown editor (macOS today, Windows planned): a Go shell on mygo (`*.go`) around a React + CodeMirror page (`src/`).

## Checks before a commit

- `bun run typecheck` and `bun test src` pass.
- A change to anything a user can see or do runs the e2e section that covers it, and updates that section in the same commit when the behavior changed on purpose. A commit that changes behavior and leaves its e2e checks asserting the old behavior breaks the suite for every other session.

  | Section | Covers |
  | --- | --- |
  | `document` | modes, typing, saving and the dock's tear, tasks, PDF/HTML export, the lightbox, the share card, reloads on disk changes, the 设置 inspector |
  | `code` | diffs, folding long code blocks, diagrams and their SVG export, the table lightbox, charts in the PDF |
  | `assist` | the slash menu, paired symbols, smart pastes, live block kind changes |
  | `share` | live table controls, the share card dialog, PDF page protection |
  | `tabs` | several files as tabs, the dock, the light table and its recently closed files, reopening where a file was read, ⌘P 快速打开 |
  | `welcome` | the welcome window while no file is open: its 最近 list, palette and light table, 新建 |

  ```sh
  bun scripts/e2e.ts tabs            # one section, ~1 min
  bun scripts/e2e.ts --no-build tabs # rerun without rebuilding
  bun scripts/e2e.ts                 # all of them, ~4 min
  ```

  Set `DEW_E2E_APP=<name>` when another e2e run may be going at the same time; the app name keys its settings directory.

- To prove a change in the running app step by step, drive an isolated build through mygo's automation socket with the client in `scripts/automation.ts`, the way `scripts/e2e.ts` does.

## Commits and releases

- Messages follow [Conventional Commits](https://www.conventionalcommits.org/) with a Chinese description: `feat(tabs): 新增 ⌘P 快速打开`, `fix(live): …`, `perf: …`, `docs: …`, `test(e2e): …`, `chore: …`, `ci: …`. The scope is optional and names the area (`editor`, `live`, `preview`, `export`, `tabs`, …).
- `feat` and `fix` commits on `main` become the next release's notes: release-please keeps a release PR open that bumps `package.json`, the `version` line in `mygo.config.ts` and `CHANGELOG.md`. Merging it tags `vX.Y.Z` and the release workflow attaches the `.dmg`. Don't edit the version or the changelog by hand.

## e2e conventions

- Assert what a user sees through stable handles: `aria-label`, `data-src`, roles. A class name or a `title` attribute changes with the design.
- Wait for the state with `waitFor`, never read it once: tab switches, saves and animations take a moment, longer on a loaded machine.
- Don't depend on the app being the system's key window; the person at the machine may be using another app.
- A failing check should say what it saw, so a red run explains itself.
