// TASKS.csv #4066 — the Browser panel picks an ER Mapper header (.ers); its data file has NO extension, which fs-read-file's extension allow-list refuses, so the main
// process allows it the way it allows a GOCAD Voxet's side files (#2725): only as named by an .ers it has itself read, a bare name in that .ers's own folder.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ersSideNames, createErsSideRegistry, createVoxetSideRegistry } = require("../electron/voxetSideFiles.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s3-ers-"));
for (const f of ["grid1", "grid1.ers", "line.ers", "line.dat", "other", "custom.bin"]) fs.writeFileSync(path.join(tmp, f), "x");
fs.writeFileSync(path.join(tmp, "secret.txt"), "s");
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const at = (n) => path.join(tmp, n);

test("#4066 the names an .ers header allows: its own stem, stem.dat and the header's DataFile", () => {
  assert.deepEqual(ersSideNames("C:\\x\\grid1.ers", "DatasetHeader Begin\r\nEnd"), ["grid1", "grid1.dat"]);
  assert.deepEqual(ersSideNames("/x/grid1.ERS", 'DatasetHeader Begin\n\tDataFile\t= "custom.bin"\nEnd'), ["grid1", "grid1.dat", "custom.bin"]);
  assert.deepEqual(ersSideNames("/x/g.ers", "\tDataFile = other\n").slice(2), ["other"]);
});

test("#4066 a data file is readable only after its .ers was read, and only that .ers's own", async () => {
  const reg = createErsSideRegistry();
  assert.equal(reg.has(at("grid1")), false, "nothing allowed before an .ers is read");
  await reg.note(at("grid1.ers"), "DatasetHeader Begin\nEnd");
  assert.equal(reg.has(at("grid1")), true);
  assert.equal(reg.has(at("other")), false, "a neighbour the header does not name");
  assert.equal(reg.has(at("secret.txt")), false);
  await reg.note(at("line.ers"), "DatasetHeader Begin\nEnd");
  assert.equal(reg.has(at("line.dat")), true);
  await reg.note(at("grid1.ers"), 'DatasetHeader Begin\n DataFile = "custom.bin"\nEnd');
  assert.equal(reg.has(at("custom.bin")), true);
  // a DataFile with a folder part, a drive or a stream is not allowed
  for (const bad of ['"../secret.txt"', '"sub\\y.bin"', '"C:\\x.txt"', '"grid1:hidden"']) {
    const r = createErsSideRegistry();
    await r.note(at("grid1.ers"), `DatasetHeader Begin\n DataFile = ${bad}\nEnd`);
    assert.equal(r.has(at("secret.txt")), false, bad);
  }
  // the voxet registry is unchanged: an .ers is not a .vo
  const v = createVoxetSideRegistry();
  await v.note(at("grid1.ers"), "DatasetHeader Begin\nEnd");
  assert.equal(v.has(at("grid1")), false);
});

test("#4066 main.js reads .ers and notes its data file; the Browser panel's list is a subset of what it reads", () => {
  const m = fs.readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
  assert.ok(/READABLE_EXT = new Set\(\[[^\]]*"\.ers"/.test(m.replace(/\/\/[^\n]*/g, "")), ".ers is read");
  assert.ok(m.includes('const ersSides = require("./voxetSideFiles.js").createErsSideRegistry();'));
  assert.ok(m.includes("!voxetSides.has(filePath) && !ersSides.has(filePath)"));
  assert.ok(m.includes('if (ext === ".ers") await ersSides.note(filePath, buf.toString("latin1"));'));
});
