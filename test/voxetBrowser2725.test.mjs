// TASKS.csv #2725 — a GOCAD Voxet picked in the Browser panel: the panel passes the file's path, and importBrowserFile reads the
// PROP_FILE side files from the .vo's own folder (desktop.js readSiblingFiles) into the same importVoxet the drop uses.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const reads = [];
globalThis.window = globalThis.window || {};
globalThis.window.desktop = {
  isDesktop: true,
  fsReadFile: async (p) => {
    reads.push(p);
    if (/rock_density@@$/.test(p)) return { ok: true, data: new Uint8Array([1, 2, 3, 4]), name: "rock_density@@" };
    if (/huge@@$/.test(p)) return { ok: true, big: true, size: 300 * 1048576, name: "huge@@" };
    if (/capped@@$/.test(p)) return { ok: false, error: "capped@@ is 300 MB — over the 200 MB import limit. Crop or thin it first." };
    return { ok: false, error: `ENOENT: no such file or directory, stat '${p}'` }; // main.js passes err.message on
  },
};
const { readSiblingFiles } = await import("../src/lib/desktop.js");

test("readSiblingFiles reads each named file from the file's own folder; one not there is left out", async () => {
  reads.length = 0;
  const out = await readSiblingFiles("C:\\data\\vox\\model.vo", ["rock_density@@", "rock_density@@", "sub/rock_density@@", "missing@@", "", null]);
  assert.deepEqual(reads, ["C:\\data\\vox\\rock_density@@", "C:\\data\\vox\\missing@@"]); // the same name once; a folder part or a blank: not looked for
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "rock_density@@");
  assert.deepEqual([...new Uint8Array(await out[0].arrayBuffer())], [1, 2, 3, 4]);
  reads.length = 0;
  await readSiblingFiles("/home/u/vox/model.vo", ["rock_density@@"]);
  assert.deepEqual(reads, ["/home/u/vox/rock_density@@"]);
});

test("only bare names are looked for; a file there but refused comes back with the reason", async () => {
  reads.length = 0;
  const out = await readSiblingFiles("C:\\v\\m.vo", ["C:\\other\\rock_density@@", "..\\rock_density@@", "sub/x@@", "..", "capped@@"]);
  assert.deepEqual(reads, ["C:\\v\\capped@@"]);
  assert.equal(out.length, 1);
  await assert.rejects(out[0].arrayBuffer(), /over the 200 MB import limit/);
});

test("a side file over the read limit comes back as a file whose read says to drag the files instead", async () => {
  const [f] = await readSiblingFiles("C:\\v\\m.vo", ["huge@@"]);
  assert.equal(f.name, "huge@@");
  await assert.rejects(f.arrayBuffer(), /300 MB.*drag the \.vo and its files onto the 3D View/);
});

test("wiring: the panel passes the path; importBrowserFile's .vo branch hands importVoxet a side-file resolver", () => {
  const panel = fs.readFileSync(new URL("../src/components/DbBrowserPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /onImportFile\(file, entry\.path\)/);
  const pipe = fs.readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(pipe, /const importBrowserFile = async \(file, filePath\)/);
  assert.match(pipe, /if \(\/\\\.vo\$\/\.test\(name\)\) \{ await importVoxet\(file, filePath \? \(h\) => readSiblingFiles\(filePath, h\.props\.map\(\(p\) => p\.file\)\) : \[file\], !!filePath\); return; \}/);
  assert.match(pipe, /all = typeof allIn === "function" \? await allIn\(h\) : allIn/);
  assert.match(pipe, /Not found beside the \.vo in its folder, so not read/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(fs.readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(j["Not found beside the .vo in its folder, so not read: {list}."], l);
    assert.ok(j["{name} is {mb} MB, more than the Browser panel reads whole: drag the .vo and its files onto the 3D View instead."], l);
  }
});
