# CLAUDE.md — working notes for Claude Code on GeoStrix

This file is for you (Claude, working in this repo via Claude Code). It's project-specific
memory: read it at the start of every session before touching code. `README.md` is the
user-facing doc (install/run/build); this file is the *how work actually gets done here* doc.

## What this is

GeoStrix is a free, MIT-licensed desktop app for 3D drillhole visualization and geochemistry —
Electron + React + three.js, built for Matt Mendes, a geologist doing VMS/epithermal exploration
in BC's Golden Triangle. Think "a lightweight, purpose-built alternative to Leapfrog/Micromine,
integrated with geophysics and geochemical analysis," not a general CAD tool.

## How this project has been developed so far

The early versions were built in Claude in Cowork mode (a cloud sandbox); since then it has been
developed in Claude Code on Matt's own machine, as a git repository with CI and tagged releases,
working through a backlog tracked in `TASKS.csv` and new requests Matt makes in chat, with a
specific delivery/verification discipline (below). That discipline is the main thing worth carrying
forward — it's what keeps a large codebase (the biggest file, `ViewerModule.jsx`, is ~860 KB /
~11,000 lines as of 2026-09-24) coherent and low-regression despite near-continuous feature work.

## TASKS.csv — read this before starting anything

`TASKS.csv` (repo root) is both the backlog AND the changelog. Columns:
`id, module, feature, priority, status, Approved, notes`. Status is one of `Planned` / `Done`
(occasionally `Blocked` or similar — check current values, don't assume). It has ~450 rows spanning
the whole project history (rows #331-#453 came from the #330 full-app specialist review).
**It is gitignored — local only, never committed.** Update it alongside each commit, but don't expect
it in `git status` or in a fresh clone.

**Before starting new work:**
1. Read `TASKS.csv` (it's large — grep/filter rather than loading it all into context at once,
   e.g. `python3 -c "import csv; ..."` filtering to `status == 'Planned'`, sorted by priority).
2. If Matt asks for something new that isn't in there yet, **add a row for it first**, before
   writing any code — he's asked for this explicitly in the past ("add them to the file first so
   we don't lose them"). Don't wait until the work is done to log it if there's any risk of losing
   context (running low on turns, a big multi-part request, etc).
3. Pick up existing `Planned` rows in roughly the order given unless Matt says otherwise — priority
   column is `High`/`Medium`/`Low`, but recency and what he's actively asking about should weigh in
   too.

**When you finish a unit of work:** update that row's `status` to `Done` (or add a new row if it
started as an ad hoc request) with a **detailed** `notes` entry — not just "fixed it." Past entries
in this file are the model to follow: verbatim user request quoted, root cause explained, exact
files/functions touched, and a full verification writeup (what you tested, how, and what you saw).
Future-you (or a fresh Claude Code session) relies entirely on these notes to understand *why*
something is the way it is — the codebase's inline comments constantly reference TASKS.csv ids
(e.g. `// TASKS.csv #195 —`) as the source of truth for a decision's rationale, so keep that
pattern going in new code too.

**Never leave work half-logged.** If you're cut off mid-task (context limit, Matt has to step
away), get *something* into TASKS.csv describing what's done vs. still open, even a rough note —
don't let work disappear.

## Verification discipline (the thing that's kept this codebase reliable)

This project has a strong "prove it works before calling it done" habit. Keep doing this:

1. **Syntax-check every touched/new file** before wiring it into the UI:
   `npx esbuild <file> --loader:.jsx=jsx --bundle=false --outfile=/tmp/check_X.js`
2. **Hand-verify pure logic/math** in Node before UI wiring, wherever a function has a checkable
   input/output (coordinate transforms, desurvey math, grade calculations, etc) — write a small
   throwaway script, don't just eyeball it.
3. **Playwright-verify against a real running dev server** (`npm run dev`, or `vite` alone if you
   only need the browser-fallback path) with screenshots for visual confirmation, checking for zero
   new console/page errors.
4. **Reproduce bugs before fixing them.** Don't trust a plausible-sounding theory about root cause —
   write a Playwright script that actually triggers the reported bug first, confirm it fails, apply
   the fix, confirm the *same* script now passes. This caught real, non-obvious bugs this session
   (a theme-apply side effect that only showed up via a specific Layout-viewport workflow, plus a
   second bug hiding behind the first one) that pure code-reading would have missed or misdiagnosed.
5. Watch for **stale dev-server flakiness**: a `vite` server's very first request after a restart
   can be slow enough to throw off fixed Playwright wait times, producing a false failure. If a test
   fails right after restarting the dev server, re-run once against the warm server before trusting
   the failure.

## What's newly possible in Claude Code that wasn't in Cowork

The previous cloud-sandbox setup could only run a **browser-only Vite preview** — `window.desktop`
was always `null`, so every Electron IPC call (`src/lib/desktop.js`) hit its browser-fallback branch
("requires the desktop app"). That meant entire features could only be *code-reviewed*, never
actually run:

- **Postgres connections** (`DatabaseConnectModal.jsx`, `DbBrowserPanel.jsx`, the `db-*` IPC
  handlers in `electron/main.js`) — never actually connected to a real database.
- **Filesystem browsing** (`fs-list-dir`/`fs-list-drives`/`fs-read-file` IPC) — never actually
  listed a real folder.
- **Native file dialogs**, autosave-to-userData-dir, the Python sidecar spawn/kill lifecycle,
  packaging/installer builds (`electron-builder`) — none of these have ever been exercised for
  real, only reasoned about.

**You can now do all of this for real.** Run `npm run dev` (from repo root) — it launches the
actual Electron window via `concurrently`, not just the Vite dev server. Use it to click through
IPC-dependent features directly, or drive the real window with Playwright/Electron's own testing
hooks if you set that up. When picking up a task in `TASKS.csv` that was previously verified only
"via code-trace review" or "couldn't be exercised end-to-end in this sandbox" (search the notes for
that phrasing), that's a flag this task deserves a *real* verification pass now that you can.

## Repo layout

- `electron/main.js` — main process: IPC handlers (file dialogs, autosave, SRTM tile proxy, the
  persistent-DB-connection Map, filesystem browsing, Python sidecar lifecycle), window/menu setup.
- `electron/preload.js` — the `window.desktop` bridge exposed to the renderer.
- `src/lib/desktop.js` — renderer-side wrappers around every IPC call, each with a browser-fallback
  branch (this is what made the app also runnable as a plain Vite page in the old sandbox).
- `src/lib/store.jsx` — the single React Context store (project state, all the persisted
  collections: collars/survey/layers/themes/rasters/voxelModels/etc, save/load/autosave).
- `src/modules/*.jsx` — one file per top-level tab (`ViewerModule` handles View/Modeling/Targeting
  via a `mode` prop — see its own header comments for why; `GeophysicsModule`, `RasterModule`,
  `GeochemModule`, `LayoutModule`). **`ViewerModule.jsx` is huge (~860 KB, ~11k lines)** — use targeted
  Read/Grep rather than reading it front-to-back, and lean on its extensive inline comments (many
  reference specific TASKS.csv ids) to orient before editing.
- `src/components/*` — modals, panels, and small reusable pieces.
- `src/lib/*.js` — pure logic: geometry/desurvey math, shapefile/GeoPackage/OMF parsing,
  reprojection, geochem stats, voxel handling, etc. These are the easiest things to unit-verify in
  plain Node before touching any UI.
- `sample_data/` — a synthetic 6-hole dataset exercising every import type, plus
  `sample_data/harry_property/` — a real 37-hole dataset extracted from BC's public ARIS/BCGS
  drillhole database (report #37584), with a small number of layer types (alteration, veins,
  geotech, etc — the source DB has no such tables) synthesized around the real assay anomalies.
  Each has its own README explaining exactly what's real vs. synthetic — read those before
  reusing this data for anything, and don't present the synthesized parts as real to anyone.
- `python-sidecar/` — optional local Python server for scipy-backed geoprocessing (interpolation
  now, GemPy-based implicit modelling planned per TASKS.csv). Electron spawns/kills it.

## Conventions worth knowing

- Comments throughout the codebase cite `TASKS.csv #<id>` liberally — when you see one, that's
  telling you *why* code is shaped the way it is; check that row's notes before assuming you
  understand the constraint well enough to change it.
- Persisted-vs-session-only state is a recurring, deliberate distinction: project data goes in the
  `.geostrix.json` save file (via `store.jsx`); personal UI/workspace preferences (sidebar widths,
  Browser-panel favorites/recent folders, etc) go in `localStorage` instead, via small dedicated
  hooks (`useSidebarWidth.js`, `useBrowserPanelHeight.js`, `useBrowserPanelPrefs.js`) — follow that
  pattern for new UI-only state rather than adding it to the project file.
- Security-sensitive copy is taken seriously and shouldn't regress: e.g. Postgres passwords are
  explicitly "session only, never saved to disk or the project file" — this is now a *live*
  connection held in `electron/main.js`'s in-memory `liveDbConnections` Map for the app session,
  not a fresh connection per query, but the "never touches disk" guarantee must hold regardless of
  future changes there.
- **Design tokens (colour + type).** `src/styles/app.css`'s `:root` block is the single source of
  truth for both, mirrored value-for-value in `src/lib/theme.js` (`colors`, `fontSizes`). Reach for
  `var(--color-*)` / `var(--font-size-*)` by default — they work in class rules AND in the inline
  `style={{}}` objects the app is built from. The JS constants are only for places a `var()` is
  meaningless: three.js, canvas 2D, SVG *presentation attributes*, and anything serialized out of
  the document into a standalone `.svg`/`.png` export. **Seven files are deliberately excluded from
  both migrations** (StripLog, SectionWindow, StereonetModal, FenceDiagramModal,
  DownholeStructurePlot, GeochemModule, `lib/striplogSvg.js`) — read theme.js's header before
  "finishing" what looks like an unfinished sweep there; it isn't one. The type scale is FIVE steps
  (xs 10 / sm 11 / base 12 / lg 14 / xl 17) and there is deliberately no sixth — TASKS.csv #305 has
  the measurements that produced it.
- A lot of past bugs turned out to be state-synchronization races between local component state and
  the shared store (mount-time hydration effects, restore-after-side-effect flows) rather than
  logic errors — when something "resets" unexpectedly after a tab switch or an async operation,
  suspect this class of bug first and reproduce it with Playwright before theorizing further.

## First actions in a new Claude Code session on this repo

1. `git status` / `git log --oneline -5` — the repo is on `master` with a GitHub remote; commits are
   small and end with the Co-Authored-By line. Don't push or tag a release unless Matt asks.
2. Confirm `node_modules/` exists (`npm install` otherwise) and run `npm test` (Node's built-in test
   runner over `test/*.test.mjs`, also run in CI) as a baseline.
3. Read `TASKS.csv`'s current `Planned` rows before doing anything else Matt hasn't explicitly
   scoped in the current message.

## Current facts worth knowing (2026-09-24)

- **Tests:** `npm test` = `node --test test/*.test.mjs` (pure-logic tests: import/desurvey, geochem,
  reprojection, DXF, rasters, network guard, ZIP caps…). Python sidecar tests: `python
  tests/test_potential.py` (plain script) and `tests/test_jobs_api.py <port> <token>` against a
  running server (see its header). There is no pytest in the venv.
- **Python sidecar:** frozen with PyInstaller `--onedir` (`python-sidecar/dist/geostrix-sidecar/`,
  exe beside `_internal/`); dependencies pinned in `requirements.txt` + the full-tree
  `constraints.txt` (#363) — install with `-c constraints.txt`. The desktop app starts it on FIRST
  USE (IPC `sidecar-ensure`, #440), not at launch; the status bar shows `Py: idle` until then.
  BLAS threads are capped at half the cores (max 4).
- **CSP** is injected at BUILD time only (vite.config.js `cspPlugin`, #347); the dev server has none
  (Electron's "insecure CSP" warning in dev is expected).
- **Local packaging inside OneDrive:** `npm run build:dir` into `release/` can fail with EPERM renaming
  `win-unpacked.tmp` (OneDrive locks the folder); build with
  `-c.directories.output=<a folder outside OneDrive>`. CI is unaffected.
- **Verifying against the real Electron app:** start it with
  `electron . --remote-debugging-port=9333` (NODE_ENV=development to load the Vite dev server, unset
  to load `dist/`), then drive the page over the DevTools protocol (Runtime.evaluate,
  Page.captureScreenshot). A hidden browser pane pauses requestAnimationFrame, so anything that waits
  on rAF (focus trap, the render loop, the splash) must be checked in a visible window.
- Vite occasionally caches an EMPTY module if it reads a big file mid-write (symptom: "does not provide
  an export named 'default'"); `touch` the file and reload.

## Suggestions for getting the most out of Claude Code here (Matt asked for these)

- **Git + GitHub.** Done: public repo, CI (`npm test` + build) and tagged releases via
  `.github/workflows/release.yml` (TASKS.csv #39).
- **A verification hook.** Ask Claude Code to set up a `PostToolUse` hook (via `.claude/settings.json`
  or the `/hooks` command — let Claude Code wire this up itself, since it knows its own current hook
  schema better than a stale doc would) that automatically runs the `esbuild --bundle=false` syntax
  check from the verification discipline above whenever a `.js`/`.jsx` file is edited. This turns a
  manual habit into something that can't be skipped by accident.
- **Custom slash commands** (already added under `.claude/commands/` — see below) to make the
  standing workflow one command away instead of re-explained every session.
- **Plan Mode** for anything touching `ViewerModule.jsx` in more than one place, or any multi-file
  feature — worth sketching the approach before editing, given how much cross-file state threading
  this codebase has (store.jsx <-> module components <-> IPC).
- **A review pass before marking things `Done`** — for anything non-trivial, consider a second
  Claude Code look (fresh context, or Plan Mode's review-oriented framing) at the diff before
  updating TASKS.csv, especially for anything touching security-sensitive paths (the DB connection
  handling, file dialogs) or `store.jsx`'s save/load/autosave logic.

## Custom commands available in this repo

- `/next-task` — reads TASKS.csv, picks the next reasonable `Planned` item, implements it with the
  full verification discipline above, and updates TASKS.csv.
- `/log-task` — appends a completed (or explicitly-deferred) unit of work to TASKS.csv in the
  established format, without doing any new implementation work.
- `/verify` — runs the full syntax-check + Playwright verification pass against currently
  uncommitted changes, without assuming anything is "done" yet.

(See each command's file under `.claude/commands/` for exactly what it does.)
