// TASKS.csv #666 — the add-on installer: a failed write is a plain error (not an uncaught exception blamed on the
// checksum), and a disk without room for the zip + the unpacked add-on is refused before downloading.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Writable } from "node:stream";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const { createAddonManager } = require("../electron/addons.js");

const realPlatform = process.platform;
function harness({ failWrite = false, freeBytes = 1e13 } = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "gs-addon-"));
  const app = { isPackaged: true, getPath: () => userData, getVersion: () => "0.0.0" };
  const net = { request: () => {
    const req = new EventEmitter();
    req.abort = () => {};
    req.end = () => setImmediate(() => {
      const res = new EventEmitter();
      res.statusCode = 200; res.headers = { "content-length": "30" }; res.pause = () => {}; res.resume = () => {};
      req.emit("response", res);
      setImmediate(() => { for (const b of [1, 2, 3]) res.emit("data", Buffer.alloc(10, b)); res.emit("end"); });
    });
    return req;
  } };
  const realCreate = fs.createWriteStream, realStatfs = fs.statfsSync;
  if (failWrite) fs.createWriteStream = () => new Writable({ write(_c, _e, cb) { const e = new Error("ENOSPC: no space left on device, write"); e.code = "ENOSPC"; cb(e); } });
  fs.statfsSync = () => ({ bavail: freeBytes / 4096, bsize: 4096 });
  Object.defineProperty(process, "platform", { value: "linux" }); // skip the Windows MAX_PATH pre-check for the temp path
  const restore = () => { fs.createWriteStream = realCreate; fs.statfsSync = realStatfs; Object.defineProperty(process, "platform", { value: realPlatform }); fs.rmSync(userData, { recursive: true, force: true }); };
  return { mgr: createAddonManager({ app, net, send: () => {} }), restore };
}

test("a full disk while downloading is reported in plain words, with no uncaught exception", async () => {
  const { mgr, restore } = harness({ failWrite: true });
  let uncaught = null;
  const onUncaught = (e) => { uncaught = e; };
  process.on("uncaughtException", onUncaught);
  try {
    await assert.rejects(mgr.install("geoml"), (e) => /disk is full/i.test(e.message) && !/checksum/i.test(e.message));
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(uncaught, null);
    assert.equal(mgr.status("geoml").installing, false, "a later install can start again");
  } finally { process.off("uncaughtException", onUncaught); restore(); }
});

test("not enough free space is refused before anything is downloaded", async () => {
  const { mgr, restore } = harness({ freeBytes: 1e9 });
  try {
    await assert.rejects(mgr.install("geoml"), (e) => /needs about .* GB free/.test(e.message));
  } finally { restore(); }
});
