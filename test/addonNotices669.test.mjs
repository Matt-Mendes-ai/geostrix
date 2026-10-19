// TASKS.csv #669 — Help > Licences reads an installed add-on's SOURCE.txt / THIRD-PARTY-LICENCES.txt / LICENSE
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const { createAddonManager } = require("../electron/addons.js");
const info = JSON.parse(fs.readFileSync(new URL("../addons/geoml/release.json", import.meta.url), "utf8"));

function harness() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "gs-notices-"));
  const app = { isPackaged: true, getPath: () => userData, getVersion: () => "0.0.0" };
  const mgr = createAddonManager({ app, net: {}, send: () => {} });
  const exe = path.join(userData, "addons", "geoml", info.version, info.exe);
  return { mgr, exe, dir: path.dirname(exe), done: () => fs.rmSync(userData, { recursive: true, force: true }) };
}

test("not installed: says so and reads nothing", () => {
  const h = harness();
  try {
    const n = h.mgr.notices("geoml");
    assert.equal(n.available, true);
    assert.equal(n.installed, false);
    assert.equal(n.licences, undefined);
  } finally { h.done(); }
});

test("installed: returns the files written next to the program, null for a missing one", () => {
  const h = harness();
  try {
    fs.mkdirSync(h.dir, { recursive: true });
    fs.writeFileSync(h.exe, "");
    fs.writeFileSync(path.join(h.dir, "SOURCE.txt"), "Source code: https://example.invalid/addons/geoml\n");
    fs.writeFileSync(path.join(h.dir, "LICENSE"), "GNU GENERAL PUBLIC LICENSE\n");
    const n = h.mgr.notices("geoml");
    assert.equal(n.installed, true);
    assert.match(n.source, /addons\/geoml/);
    assert.match(n.licenceText, /GNU GENERAL PUBLIC LICENSE/);
    assert.equal(n.licences, null); // a 0.1.0 install has no component list
    fs.writeFileSync(path.join(h.dir, "THIRD-PARTY-LICENCES.txt"), "tensorflow 2.21.0 Apache-2.0\n");
    assert.match(h.mgr.notices("geoml").licences, /tensorflow/);
  } finally { h.done(); }
});
