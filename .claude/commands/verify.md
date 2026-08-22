---
description: Run the full syntax-check + Playwright verification pass against uncommitted changes
---

Run the full verification discipline from `CLAUDE.md` against whatever is currently uncommitted
(`git diff` / `git status` to see what's changed) — do NOT assume anything is "done" yet, and do
NOT update `TASKS.csv` as part of this command (that's `/log-task`'s job once this passes).

1. **List what changed.** `git status` / `git diff --stat` against the last commit (or against
   `HEAD` if mid-work) to enumerate every touched/new file.
2. **Syntax-check every touched `.js`/`.jsx` file**:
   `npx esbuild <file> --loader:.jsx=jsx --bundle=false --outfile=/tmp/check_<name>.js`
   Fix anything that fails before continuing.
3. **Hand-verify pure logic/math changes in Node** wherever there's a checkable input/output
   (coordinate transforms, desurvey math, grade calculations, reprojection, etc) — write a small
   throwaway script and actually run it, don't eyeball the diff.
4. **Start (or confirm) a real dev server** — `npm run dev` for full Electron IPC coverage, or
   plain `vite` if the change doesn't touch IPC — and drive it with Playwright:
   - If this diff is a bug fix, first confirm you can reproduce the ORIGINAL bug against a clean
     checkout (or by temporarily reverting), then confirm the fix actually resolves it with the
     same script.
   - Take screenshots for visual confirmation of anything UI-facing.
   - Check for zero new console/page errors.
5. **If a test fails right after a dev-server (re)start**, rerun once against the now-warm server
   before treating it as a real regression — cold-start JIT/transform latency has produced false
   negatives before in this codebase.
6. Report a clear pass/fail summary: what was checked, how, and what you saw — including
   screenshots/console output if anything is ambiguous. If something fails, stop and fix it rather
   than reporting partial success.
