// TASKS.csv #4055 (Matt, 2026-11-24: "free on leaving the tab") — the geoML add-on is stopped (its worker and kept models freed) 3 minutes after the
// panel goes; coming back sooner keeps it; a model still running is never stopped; a run after a release says it trained again.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const calls = [];
let running = true, busy = false;
globalThis.window = { desktop: {
  addonStatus: async () => ({ id: "geoml", installed: true, running, version: "0.1.6" }),
  addonStop: async () => { calls.push("stop"); running = false; },
  addonEnsure: async () => ({ ok: true }), addonConnection: async () => ({ port: 1, token: null }),
} };
globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => (String(url).includes("/health") ? { ok: true, busy } : {}) });
const A = await import("../src/lib/geomlAddon.js");
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test("freed 3 minutes after the panel goes, not before", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    calls.length = 0; running = true; busy = false;
    A.addonRelease();
    mock.timers.tick(A.RELEASE_AFTER_MS - 1000); await flush();
    assert.deepEqual(calls, []);
    mock.timers.tick(1000); await flush();
    assert.deepEqual(calls, ["stop"]);
    assert.equal(A.RELEASE_AFTER_MS, 180000);
  } finally { mock.timers.reset(); }
});

test("back within the 3 minutes: kept", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    calls.length = 0; running = true;
    A.addonRelease();
    mock.timers.tick(120000); await flush();
    A.addonHold(); // the panel opened again
    mock.timers.tick(600000); await flush();
    assert.deepEqual(calls, []);
  } finally { mock.timers.reset(); }
});

test("a model still running is never stopped: the stop waits for it", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    calls.length = 0; running = true; busy = true;
    await A.addonReady(null, 1000).catch(() => {}); // a connection, as the panel has
    A.addonRelease();
    mock.timers.tick(A.RELEASE_AFTER_MS); await flush();
    assert.deepEqual(calls, [], "busy: not stopped");
    busy = false;
    mock.timers.tick(60000); await flush();
    assert.deepEqual(calls, ["stop"], "stopped once the model is done");
  } finally { mock.timers.reset(); }
});

test("not running: nothing to stop", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    calls.length = 0; running = false;
    A.addonRelease();
    mock.timers.tick(A.RELEASE_AFTER_MS); await flush();
    assert.deepEqual(calls, []);
  } finally { mock.timers.reset(); }
});

test("the panel holds on mount, releases on unmount, and a run after a release says it trained again", () => {
  const p = readFileSync(new URL("../src/components/PredictivePanel.jsx", import.meta.url), "utf8");
  assert.match(p, /useEffect\(\(\) => \{ addonHold\(\); return \(\) => addonRelease\(\); \}, \[\]\);/);
  assert.match(p, /takeFreedNote\(\) \? ` \$\{tr\("Trained again: the add-on had been freed\."\)\}`/);
  const g = readFileSync(new URL("../src/lib/geomlAddon.js", import.meta.url), "utf8");
  assert.match(g, /if \(s\.state === "done"\) \{ const r = await jobResult\(job\.id\); ranSinceRelease = true; return r; \}/);
  assert.match(g, /if \(ranSinceRelease\) freedAfterRun = true;/);
  assert.equal(A.takeFreedNote(), false);
});
