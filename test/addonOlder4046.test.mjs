// TASKS.csv #4046 — an add-on older than the one this build's release.json names (GeoStrix updated, the add-on not yet) still counts
// as installed and is the one that runs: only the folder of release.json's version used to count, so an installed 0.1.5 looked
// missing once release.json said 0.1.6 and the user was sent to a 550 MB download to keep modelling.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const { createAddonManager, versionCompare } = require("../electron/addons.js");
const release = JSON.parse(fs.readFileSync(new URL("../addons/geoml/release.json", import.meta.url), "utf8"));

function setup(versions) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "gs-addon4046-"));
  for (const v of versions) {
    const exe = path.join(userData, "addons", "geoml", v, release.exe);
    fs.mkdirSync(path.dirname(exe), { recursive: true });
    fs.writeFileSync(exe, "not a program");
    fs.writeFileSync(path.join(path.dirname(exe), "SOURCE.txt"), `add-on ${v}`);
  }
  const app = { isPackaged: true, getPath: () => userData, getVersion: () => "0.0.0" };
  const mgr = createAddonManager({ app, net: { request: () => { throw new Error("no network in this test"); } }, send: () => {} });
  return { mgr, userData, done: () => fs.rmSync(userData, { recursive: true, force: true }) };
}

test("#4046 versions compare by number, not as text", () => {
  assert.ok(versionCompare("0.1.10", "0.1.9") > 0);
  assert.ok(versionCompare("0.1.5", "0.1.6") < 0);
  assert.equal(versionCompare("0.1.5", "0.1.5"), 0);
  assert.ok(versionCompare("0.2", "0.1.9") > 0);
});

test("#4046 an older add-on still counts as installed, says which version it is, and offers the update", () => {
  const h = setup(["0.0.1", "0.0.3", "0.0.2"]);
  try {
    const s = h.mgr.status("geoml");
    assert.equal(s.installed, true);
    assert.equal(s.version, "0.0.3"); // the newest one installed
    assert.equal(s.latestVersion, release.version);
    // offered once release.json names that version's download (not between steps 1 and 3 of the add-on workflow)
    assert.equal(s.update, !!(release.url && release.sha256 && release.url.includes(`-${release.version}-`)));
    const n = h.mgr.notices("geoml"); // Help > Licences reads the files of the add-on that runs
    assert.equal(n.installed, true);
    assert.equal(n.version, "0.0.3");
    assert.equal(n.source, "add-on 0.0.3");
  } finally { h.done(); }
});

test("#4046 the update is offered when release.json's download is its own version's, not while it still names the previous zip", () => {
  const res = fs.mkdtempSync(path.join(os.tmpdir(), "gs-addon4046-res-"));
  const realRes = process.resourcesPath;
  const h = setup(["0.0.1"]);
  try {
    process.resourcesPath = res; // an installed GeoStrix reads release.json from its resources first
    fs.mkdirSync(path.join(res, "addons", "geoml"), { recursive: true });
    const write = (version, zipVersion) => fs.writeFileSync(path.join(res, "addons", "geoml", "release.json"), JSON.stringify({ ...release, version,
      url: `https://example.invalid/addon-geoml-v${zipVersion}/geostrix-geoml-addon-${zipVersion}-win.zip`, sha256: "a".repeat(64) }));
    write("0.0.2", "0.0.2");
    let s = h.mgr.status("geoml");
    assert.deepEqual([s.installed, s.version, s.latestVersion, s.update], [true, "0.0.1", "0.0.2", true]);
    write("0.0.2", "0.0.1"); // step 1 of the add-on workflow: the version bumped, the url not yet
    s = h.mgr.status("geoml");
    assert.deepEqual([s.installed, s.version, s.update], [true, "0.0.1", false]);
  } finally { process.resourcesPath = realRes; fs.rmSync(res, { recursive: true, force: true }); h.done(); }
});

test("#4046 the add-on of release.json's version wins, and then nothing is offered", () => {
  const h = setup(["0.0.1", release.version]);
  try {
    const s = h.mgr.status("geoml");
    assert.equal(s.installed, true);
    assert.equal(s.version, release.version);
    assert.equal(s.update, false);
  } finally { h.done(); }
});

test("#4046 nothing installed, or only folders that are not versions or hold no program: not installed", () => {
  const h = setup([]);
  try {
    fs.mkdirSync(path.join(h.userData, "addons", "geoml", "0.0.4"), { recursive: true }); // an unpack that failed: no program
    fs.mkdirSync(path.join(h.userData, "addons", "geoml", "old-copy", path.dirname(release.exe)), { recursive: true });
    fs.writeFileSync(path.join(h.userData, "addons", "geoml", "old-copy", release.exe), "x");
    fs.writeFileSync(path.join(h.userData, "addons", "geoml", "addon.log"), "log");
    const s = h.mgr.status("geoml");
    assert.equal(s.installed, false);
    assert.equal(s.version, release.version);
    assert.equal(s.update, false);
  } finally { h.done(); }
});
