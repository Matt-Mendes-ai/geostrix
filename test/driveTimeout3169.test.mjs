// TASKS.csv #3169 — scripts/drive-electron.mjs: a command that gets no answer exits 3 after CDP_TIMEOUT_MS instead of waiting for ever, and `evalnow` evaluates
// without awaitPromise. Checked from the source (the harness needs a running Electron). A real end-to-end run is in the row's note.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const s = fs.readFileSync(new URL("../scripts/drive-electron.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("timeout and evalnow", () => {
  assert.match(s, /const TIMEOUT_MS = Number\(process\.env\.CDP_TIMEOUT_MS \|\| 60000\);/);
  assert.match(s, /process\.exit\(3\)/);
  assert.match(s, /if \(cmd === "eval" \|\| cmd === "evalnow"\) \{\n\s*const r = await send\("Runtime\.evaluate", \{ expression: arg, awaitPromise: cmd === "eval", returnByValue: true \}\);/);
  assert.match(s, /clearTimeout\(timer\); resolve\(d\);/);
});
