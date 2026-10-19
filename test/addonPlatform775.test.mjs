// TASKS.csv #775 — an add-on whose zip is built for another OS (release.json "platform") is reported as not available
// on this computer instead of offering a download it couldn't run; a development override still runs anywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const { createAddonManager } = require("../electron/addons.js");
const info = JSON.parse(fs.readFileSync(new URL("../addons/geoml/release.json", import.meta.url), "utf8"));

function harness(platform) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "gs-platform-"));
  const app = { isPackaged: true, getPath: () => userData, getVersion: () => "0.0.0" };
  return { mgr: createAddonManager({ app, net: {}, send: () => {}, platform }), done: () => fs.rmSync(userData, { recursive: true, force: true }) };
}

test("geoML's published zip is the Windows build", () => {
  assert.equal(info.platform, "win32");
});

test("Windows: offered for download as before", () => {
  const h = harness("win32");
  try {
    const st = h.mgr.status("geoml");
    assert.equal(st.otherPlatform, undefined);
    assert.equal(st.url, info.url);
  } finally { h.done(); }
});

test("macOS: not built for this computer — no download, install and start refuse", async () => {
  const h = harness("darwin");
  try {
    const st = h.mgr.status("geoml");
    assert.equal(st.otherPlatform, true);
    assert.equal(st.installed, false);
    assert.equal(st.url, null);
    assert.match(st.reason, /only built for Windows/);
    await assert.rejects(h.mgr.install("geoml"), /only built for Windows/);
    await assert.rejects(h.mgr.ensure("geoml"), /only built for Windows/);
  } finally { h.done(); }
});

test("macOS with a development override: runs from source as before", () => {
  const h = harness("darwin");
  process.env.GEOSTRIX_ADDON_GEOML_EXE = "python3|run_addon.py";
  try {
    const st = h.mgr.status("geoml");
    assert.equal(st.otherPlatform, undefined);
    assert.equal(st.dev, true);
    assert.equal(st.installed, true);
  } finally { delete process.env.GEOSTRIX_ADDON_GEOML_EXE; h.done(); }
});
