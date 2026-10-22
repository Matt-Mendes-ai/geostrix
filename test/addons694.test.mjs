// TASKS.csv #694 — electron/addons.js paths that had no test: the add-on's port (the first free one of the fixed range,
// #645), the SHA-256 pin (a download that does not match release.json is refused and nothing is left behind, #638),
// and status() for an add-on this build does not know / not yet installed / installed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const { createAddonManager, ADDON_PORTS, pickPort } = require("../electron/addons.js");
const release = JSON.parse(fs.readFileSync(new URL("../addons/geoml/release.json", import.meta.url), "utf8"));

const listen = (port) => new Promise((resolve, reject) => { const s = net.createServer(); s.once("error", reject); s.listen(port, "127.0.0.1", () => resolve(s)); });
const close = (s) => new Promise((r) => s.close(r));

test("#694 the add-on takes its preferred port when free, else the next free one of the range", async () => {
  // find a preferred port of the range that is free right now (another program may hold one on this machine)
  const free = [];
  for (const p of ADDON_PORTS) { try { await close(await listen(p)); free.push(p); } catch { /* in use */ } }
  if (free.length < 2) return; // nothing to test with on this machine
  assert.equal(await pickPort(free[0]), free[0]);
  const held = await listen(free[0]);
  try {
    const got = await pickPort(free[0]);
    assert.ok(ADDON_PORTS.includes(got) && got !== free[0], `got ${got}`);
  } finally { await close(held); }
});

function manager(body = Buffer.alloc(30, 7)) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "gs-addon694-"));
  const app = { isPackaged: true, getPath: () => userData, getVersion: () => "0.0.0" };
  const fakeNet = { request: () => {
    const req = new EventEmitter();
    req.abort = () => {};
    req.end = () => setImmediate(() => {
      const res = new EventEmitter();
      res.statusCode = 200; res.headers = { "content-length": String(body.length) }; res.pause = () => {}; res.resume = () => {};
      req.emit("response", res);
      setImmediate(() => { res.emit("data", body); res.emit("end"); });
    });
    return req;
  } };
  const events = [];
  const realStatfs = fs.statfsSync, realPlatform = process.platform;
  fs.statfsSync = () => ({ bavail: 1e13 / 4096, bsize: 4096 });
  Object.defineProperty(process, "platform", { value: "linux" }); // skip the Windows MAX_PATH pre-check for the temp path
  const restore = () => { fs.statfsSync = realStatfs; Object.defineProperty(process, "platform", { value: realPlatform }); fs.rmSync(userData, { recursive: true, force: true }); };
  return { mgr: createAddonManager({ app, net: fakeNet, send: (e) => events.push(e) }), userData, events, restore };
}

test("#694 a download that does not match the pinned SHA-256 is refused, never unpacked, and leaves nothing behind", async () => {
  const h = manager();
  try {
    await assert.rejects(h.mgr.install("geoml"), /doesn't match its published checksum/);
    const left = fs.readdirSync(path.join(h.userData, "addons", "geoml"));
    assert.deepEqual(left, [], `left behind: ${left.join(", ")}`); // no .zip.part, no version folder
    assert.ok(!h.events.some((e) => e.phase === "unpack" || e.phase === "done"));
    assert.equal(h.mgr.status("geoml").installing, false, "a failed install does not stay 'installing'");
  } finally { h.restore(); }
});

test("#694 status(): unknown add-on, not installed, installed", () => {
  const h = manager();
  try {
    const unknown = h.mgr.status("no-such-addon");
    assert.equal(unknown.available, false);
    const s = h.mgr.status("geoml");
    assert.equal(s.available, true);
    assert.equal(s.installed, false);
    assert.equal(s.version, release.version);
    assert.equal(s.downloadBytes, release.bytes);
    const exe = path.join(h.userData, "addons", "geoml", release.version, release.exe);
    fs.mkdirSync(path.dirname(exe), { recursive: true });
    fs.writeFileSync(exe, "");
    assert.equal(h.mgr.status("geoml").installed, true);
    assert.equal(h.mgr.status("geoml").running, false);
  } finally { h.restore(); }
});
