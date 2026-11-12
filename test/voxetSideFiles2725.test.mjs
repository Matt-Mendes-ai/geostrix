// TASKS.csv #2725 — the main process reads a GOCAD Voxet's side files only as named by a .vo it has itself read: bare names in the
// .vo's own folder whose real path stays there (electron/voxetSideFiles.js, used by main.js fs-read-file).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { propFileNames, bareName, voxetSidePaths, createVoxetSideRegistry, MAX_VO } = require("../electron/voxetSideFiles.js");

const header = (...files) => ["GOCAD Voxet 1", "HEADER {", "name: m", "}", ...files.map((f, i) => `PROPERTY ${i + 1} p${i + 1}\r\nPROP_FILE ${i + 1} ${f}`), "END"].join("\r\n");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s6-voxet-"));
const vox = path.join(tmp, "vox"); fs.mkdirSync(vox); fs.mkdirSync(path.join(vox, "sub"));
for (const f of ["rock_density@@", "model.vo", "sub/y.bin"]) fs.writeFileSync(path.join(vox, f), "x");
fs.writeFileSync(path.join(tmp, "secret.txt"), "s");
const vo = path.join(vox, "model.vo");
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test("PROP_FILE names are read from the header; only bare names pass", () => {
  assert.deepEqual(propFileNames(header("rock_density@@", '"q d@@"')), ["rock_density@@", "q d@@"]);
  assert.equal(bareName("rock_density@@"), "rock_density@@");
  for (const bad of ["../secret.txt", "..", ".", "C:\\x.txt", "C:x.txt", "\\\\server\\share\\x", "/etc/passwd", "sub\\y.bin", "sub/y.bin", "", "a\0b"]) assert.equal(bareName(bad), null, bad);
});

test("Main's hardenings: ':' anywhere (an NTFS alternate data stream) and Windows device names are refused", () => {
  for (const bad of ["rock@@:hidden", "rock_density@@:$DATA", "a:b", "x.bin:", ":x"]) assert.equal(bareName(bad), null, bad);
  for (const bad of ["CON", "con", "PRN", "aux", "NUL", "nul.txt", "COM1", "com9.bin", "LPT1", "lpt3.dat", "CON.", "nul .txt", "Aux.tar.gz", "COM¹"]) assert.equal(bareName(bad), null, bad);
  for (const ok of ["CONSOLE@@", "con_density@@", "nullable.bin", "COM10", "lpt0", "auxiliary@@", "PRN2@@", "rock_density@@"]) assert.equal(bareName(ok), ok, ok);
});

test("an ADS or device name in a PROP_FILE is never allowed by the registry", async () => {
  const reg = createVoxetSideRegistry();
  await reg.note(vo, header("rock_density@@:hidden", "NUL", "con.bin", "rock_density@@"));
  assert.equal(reg.has(path.join(vox, "rock_density@@:hidden")), false);
  assert.equal(reg.has(path.join(vox, "NUL")), false);
  assert.equal(reg.has(path.join(vox, "con.bin")), false);
  assert.equal(reg.has(path.join(vox, "rock_density@@")), true);
});

test("a plain same-folder rock_density@@ is allowed; ../secret.txt, absolute paths and sub\\y.bin are refused", async () => {
  const got = await voxetSidePaths(vo, header("rock_density@@", "../secret.txt", path.join(tmp, "secret.txt"), "C:\\x.txt", "sub\\y.bin", "sub/y.bin", "missing@@"));
  assert.deepEqual(got, [path.join(vox, "rock_density@@")]); // a missing file is not allowed either
});

test("a side file whose real path leaves the folder (a link) is refused", async () => {
  const real = async (p) => (path.basename(p) === "link@@" ? path.join(tmp, "secret.txt") : fs.promises.realpath(p)); // a link, as realpath sees it
  fs.writeFileSync(path.join(vox, "link@@"), "x");
  assert.deepEqual(await voxetSidePaths(vo, header("link@@", "rock_density@@"), real), [path.join(vox, "rock_density@@")]);
  // and a real symbolic link where this machine allows making one (Windows needs Developer Mode or admin)
  try { fs.symlinkSync(path.join(tmp, "secret.txt"), path.join(vox, "sym@@"), "file"); } catch { return; }
  assert.deepEqual(await voxetSidePaths(vo, header("sym@@")), []);
});

test("the registry: nothing before a .vo is read; then only its side files; bounded to the last few .vo files", async () => {
  const reg = createVoxetSideRegistry();
  const side = path.join(vox, "rock_density@@");
  assert.equal(reg.has(side), false);
  await reg.note(vo, header("rock_density@@", "../secret.txt"));
  assert.equal(reg.has(side), true);
  assert.equal(reg.has(side.toUpperCase()), true); // Windows paths: case-insensitive, as main.js dirKey
  assert.equal(reg.has(path.join(tmp, "secret.txt")), false);
  assert.equal(reg.has(path.join(vox, "sub", "y.bin")), false);
  // other .vo files push the first out
  for (let i = 0; i < MAX_VO; i++) { const v = path.join(vox, `o${i}.vo`); fs.writeFileSync(v, "x"); await reg.note(v, header()); }
  assert.equal(reg.size(), MAX_VO);
  assert.equal(reg.has(side), false);
});

test("main.js: .vo / .pl readable, side files only through the registry, every other check after it", () => {
  const m = fs.readFileSync(new URL("../electron/main.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /"\.vo", "\.pl"\]\);/);
  assert.match(m, /if \(!READABLE_EXT\.has\(ext\) && !voxetSides\.has\(filePath\)\) return/);
  assert.match(m, /if \(ext === "\.vo"\) await voxetSides\.note\(filePath, buf\.toString\("latin1"\)\);/);
  const h = m.slice(m.indexOf('ipcMain.handle("fs-read-file"'));
  const order = ["voxetSides.has(filePath)", "listedDirs.has(path.dirname(full))", "inProtectedFolder(filePath)", "st.size > READ_MAX_BYTES)", "voxetSides.note("].map((t) => h.indexOf(t));
  assert.ok(order.every((v) => v > 0), String(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order); // the registry is noted only after the .vo passed every check and was read
});
