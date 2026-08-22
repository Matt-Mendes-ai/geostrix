---
description: Pick up the next Planned item in TASKS.csv, implement it, and log it
---

Read `TASKS.csv` at the repo root (it's large — filter/grep rather than loading it whole, e.g.
`python3 -c "import csv; ..."` filtering to `status == 'Planned'`) and pick the next reasonable
item to work on:

1. Prefer whatever Matt is actively asking about in the current conversation over the backlog.
2. Otherwise, pick from `Planned` rows roughly in priority order (`High` > `Medium` > `Low`), but
   weight recency too — a recently-added row often reflects what matters most right now.
3. Tell Matt which row you picked (id + feature) before starting, in case he'd rather you pick
   something else.

Then implement it end to end, following `CLAUDE.md`'s verification discipline:

- Syntax-check every touched/new file with esbuild (`--bundle=false`).
- Hand-verify any pure logic/math in Node before wiring it into the UI.
- Reproduce bugs with a real Playwright script BEFORE attempting a fix, if this is a bug fix —
  don't trust a plausible theory about root cause without seeing it fail first.
- Verify against a real running dev server (`npm run dev` for full Electron IPC coverage, or
  `vite` alone if the feature doesn't need IPC) with screenshots, checking for zero new
  console/page errors.
- Watch for stale-dev-server flakiness right after a restart — rerun once against a warm server
  before trusting an unexpected failure.

When done, update that row's `status` to `Done` (or add a new row if this was an ad hoc request
not already tracked) with a detailed `notes` entry: the verbatim request, root cause (for bugs),
exactly which files/functions changed, and a full verification writeup — what you tested, how,
and what you saw. Follow the style of existing entries in the file as the model to match.

If you get cut off partway through, get *something* into TASKS.csv describing what's done vs.
still open before stopping — never leave a unit of work untracked.
