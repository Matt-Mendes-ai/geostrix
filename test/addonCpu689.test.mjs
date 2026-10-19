// TASKS.csv #689 — the add-on manager asks Windows whether the processor has AVX before a download
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import os from "node:os";
const require = createRequire(import.meta.url);
const { createAddonManager } = require("../electron/addons.js");

test("cpuCheck answers true / false on Windows, null elsewhere, and is cached", async () => {
  const mgr = createAddonManager({ app: { isPackaged: true, getPath: () => os.tmpdir(), getVersion: () => "0.0.0" }, net: {}, send: () => {} });
  const a = await mgr.cpuCheck();
  if (process.platform === "win32") assert.equal(typeof a.avx, "boolean");
  else assert.equal(a.avx, null);
  assert.equal(mgr.cpuCheck(), mgr.cpuCheck());
});
