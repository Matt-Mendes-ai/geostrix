// TASKS.csv #1265 launch switches; #1263 profiles in a file; #1266 protected folders; #1213 small grades; #1229 no volume for an open sheet
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { profilesFromFile } from "../src/lib/dbProfiles.js";

const { refusedSwitches } = createRequire(import.meta.url)("../electron/launchGuard.js");
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("#1265 the debugging and redirecting switches are refused, a project path is not", () => {
  assert.deepEqual(refusedSwitches(["GeoStrix.exe", "--remote-debugging-port=9222"]), ["--remote-debugging-port=9222"]);
  assert.equal(refusedSwitches(["x", "--remote-debugging-pipe"]).length, 1);
  assert.equal(refusedSwitches(["x", "--user-data-dir=C:/a"]).length, 1);
  assert.equal(refusedSwitches(["x", "--proxy-server=1.2.3.4"]).length, 1);
  assert.deepEqual(refusedSwitches(["GeoStrix.exe", "C:/projects/--remote-debugging.geostrix.json", "project.json"]), []);
  assert.match(read("electron/main.js"), /app\.isPackaged \? require\("\.\/launchGuard"\)/);
});

test("#1263 a current file adds no database profiles; an old one's lose their risky flags", () => {
  const planted = [{ name: "x", host: "evil", sslInsecure: true, rememberPassword: true }];
  assert.deepEqual(profilesFromFile({ version: 20, dbConnections: planted }), []);
  assert.deepEqual(profilesFromFile({ version: 21, dbConnections: planted }), []);
  assert.deepEqual(profilesFromFile({ dbConnections: planted }), [], "no version: not trusted");
  const old = profilesFromFile({ version: 19, dbConnections: planted });
  assert.equal(old[0].host, "evil");
  assert.equal(old[0].sslInsecure, undefined);
  assert.equal(old[0].rememberPassword, undefined);
  assert.deepEqual(profilesFromFile({ version: 19 }), []);
});

test("#1266 Local AppData and the registry hive are protected, Temp is not", () => {
  const s = read("electron/main.js");
  assert.match(s, /process\.env\.LOCALAPPDATA/);
  assert.match(s, /\/\^ntuser\/i/);
  assert.match(s, /app\.getPath\("temp"\)/);
});

test("#1213 half-detection values keep their figures; ordinary ones keep three decimals", () => {
  const src = read("src/components/GradeStatistics.jsx");
  const line = /export const gradeText = ([^\n]*)/.exec(src)[1].replace(/;\s*$/, "");
  const f = new Function(`return ${line}`)();
  assert.equal(f(0.0005), "0.0005");
  assert.equal(f(0.001234), "0.00123");
  assert.equal(f(1.23456), "1.235");
  assert.equal(f(0), "0.000");
  assert.equal(f(NaN), "—");
});

test("#1229 an open sheet shows no volume", () => {
  assert.match(read("src/modules/ViewerModule.jsx"), /\{expandedSurfaceVolume\.watertight && <div[^\n]*tr\("Volume:"\)/);
});

test("#1214 a block model's file name keeps its decimal point", () => {
  assert.match(read("src/modules/GeophysicsModule.jsx"), /const base = safeFileName\(model\.name/);
});
