// TASKS.csv #1163 — the crash-recovery check runs once per window, however often <App> re-mounts (language changes)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { oncePerWindow } from "../src/lib/oncePerWindow.js";

test("#1163 one run, shared by every mount; settled by the user's choice", async () => {
  let runs = 0;
  const check = oncePerWindow(async () => { runs++; return { data: "snapshot" }; });
  const a = await check(), b = await check();
  assert.equal(runs, 1);
  assert.equal(a, b, "a re-mount sees the same answer, so the banner can show again without a second check");
  check.settle(null);
  assert.equal(await check(), null, "after Restore / Discard / Dismiss a re-mount shows no banner");
  assert.equal(runs, 1);
  check.reset();
  await check();
  assert.equal(runs, 2);
});

test("#1163 App.jsx runs its recovery check through oncePerWindow, and settles it on every way out of the banner", () => {
  const src = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(src, /const recoveryCheck = oncePerWindow\(/);
  assert.ok(!/useEffect\(\(\) => \{\s*let cancelled = false;\s*checkAutosave\(\)/.test(src), "no direct checkAutosave() in a mount effect");
  assert.ok((src.match(/recoveryCheck\.settle\(null\)/g) || []).length >= 3, "restore, discard and dismiss");
  assert.match(src, /const uncleanExitCheck = oncePerWindow\(/, "the unclean-exit banner too: dismissed stays dismissed across a language change");
  assert.ok((src.match(/uncleanExitCheck\.settle\(null\)/g) || []).length >= 1);
});
