// TASKS.csv #2241 (review #2174) — each GeoStrix starts its Python engine on the first free port from 8765, and the window asks which
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { portFree, pickSidecarPort } = require("../electron/sidecarPort.js");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("#2241 a taken port is skipped; the first free one is used", async () => {
  const base = 48765; // far from 8765: never touches a running GeoStrix engine
  const held = createServer(); await new Promise((r) => held.listen(base, "127.0.0.1", r));
  try {
    assert.equal(await portFree(base), false);
    assert.equal(await pickSidecarPort(base, 5), base + 1);
  } finally { await new Promise((r) => held.close(r)); }
  assert.equal(await pickSidecarPort(base, 5), base); // free again: the start port, as a single GeoStrix
});

test("#2241 wiring: main passes the port to the engine, preload exposes it, the renderer asks for it, the frozen engine reads it", () => {
  const m = read("electron/main.js");
  assert.match(m, /"--port", String\(sidecarPort\)/);
  assert.match(m, /GEOSTRIX_SIDECAR_PORT: String\(sidecarPort\)/);
  assert.match(m, /ipcMain\.handle\("sidecar-port", \(\) => sidecarPort\)/);
  assert.match(read("electron/preload.js"), /getSidecarPort: \(\) => ipcRenderer\.invoke\("sidecar-port"\)/);
  const d = read("src/lib/desktop.js");
  assert.doesNotMatch(d, /PY_SIDECAR_BASE/);
  assert.match(d, /const sidecarBase = async \(\) => `http:\/\/127\.0\.0\.1:\$\{await sidecarPort\(\)\}`;/);
  assert.match(read("python-sidecar/run_frozen.py"), /port=int\(os\.environ\.get\("GEOSTRIX_SIDECAR_PORT", "8765"\)\)/);
});
