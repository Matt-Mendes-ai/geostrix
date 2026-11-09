// TASKS.csv #1991 — Leapfrog .msh mesh import (text [index] header, binary int32 triangles + float64 vertices).
import test from "node:test";
import assert from "node:assert/strict";
import { parseLeapfrogMsh, parseMshIndex, writeLeapfrogMsh, looksLikeUbcMesh } from "../src/lib/leapfrogMsh.js";
import { parseSolidFile, parseSolidFileStream } from "../src/lib/solidImport.js";
import { SOLID_IMPORT_EXTENSIONS } from "../src/lib/solidImportMeta.js";

// a closed box (8 vertices, 12 triangles) at real coordinates
const E = 612345.5, N = 5781234.25, Z = 1210;
const pos = new Float64Array([0, 0, 0, 10, 0, 0, 10, 20, 0, 0, 20, 0, 0, 0, 5, 10, 0, 5, 10, 20, 5, 0, 20, 5].map((v, i) => v + [E, N, Z][i % 3]));
const idx = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);

test("#1991 index lines: names, types, counts (with and without ';')", () => {
  const b = parseMshIndex("%% x\n[index]\nTri Integer 3 12;\nLocation Double 3 8\nNormal Float 3 8;\n[binary]\n");
  assert.deepEqual(b.map((k) => [k.name, k.bytes, k.width, k.count]), [["Tri", 4, 3, 12], ["Location", 8, 3, 8], ["Normal", 4, 3, 8]]);
});

test("#1991 a written mesh reads back exactly, with 0, 3 and 12 bytes before the first block", () => {
  for (const gap of [0, 3, 12]) {
    const m = parseLeapfrogMsh(writeLeapfrogMsh(pos, idx, { gap }), { name: "box" });
    assert.equal(m.triangleCount, 12); assert.equal(m.vertexCount, 8);
    assert.deepEqual(Array.from(m.parts[0].indices), Array.from(idx));
    assert.deepEqual(Array.from(m.parts[0].positions), Array.from(pos));
    assert.equal(m.parts[0].layer, "box");
  }
});

test("#1991 an extra block (normals) after the vertices is skipped by its size; 1-based indices are shifted", () => {
  const head = "%% Leapfrog mesh\n[index]\nTri Integer 3 12;\nLocation Double 3 8;\nNormal Double 3 8;\n[binary]\n";
  const out = new Uint8Array(head.length + 12 * 12 + 8 * 24 * 2);
  for (let i = 0; i < head.length; i++) out[i] = head.charCodeAt(i);
  const v = new DataView(out.buffer); let o = head.length;
  for (const k of idx) { v.setInt32(o, k + 1, true); o += 4; }
  for (const p of pos) { v.setFloat64(o, p, true); o += 8; }
  for (let i = 0; i < 24; i++) { v.setFloat64(o, i % 3 === 2 ? 1 : 0, true); o += 8; }
  const m = parseLeapfrogMsh(out);
  assert.equal(m.oneBased, true);
  assert.deepEqual(Array.from(m.parts[0].indices), Array.from(idx));
  assert.deepEqual(m.skipped, ["Normal"]);
});

test("#1991 a UBC tensor mesh and a broken file are refused with a reason", () => {
  const ubc = new TextEncoder().encode("412 558 182\r\n420231.25 6242468.75 2268.75\r\n12.5 12.5 12.5\r\n");
  assert.equal(looksLikeUbcMesh(ubc), true);
  assert.throws(() => parseLeapfrogMsh(ubc), /UBC-GIF tensor mesh/);
  assert.throws(() => parseLeapfrogMsh(new TextEncoder().encode("hello")), /\[binary\]/);
  const bad = writeLeapfrogMsh(pos, idx); new DataView(bad.buffer).setInt32(bad.length - 8 * 24 - 4, 99, true); // a triangle corner past the vertices
  assert.throws(() => parseLeapfrogMsh(bad), /do not point at the vertices/);
});

test("#1991 the solid import takes .msh (accept list, in-memory and streamed)", async () => {
  assert.match(SOLID_IMPORT_EXTENSIONS, /\.msh/);
  const bytes = writeLeapfrogMsh(pos, idx, { gap: 4 });
  const s = await parseSolidFileStream(new File([bytes], "Domain_A.msh"));
  assert.equal(s.format, "Leapfrog MSH"); assert.equal(s.triangleCount, 12); assert.equal(s.parts[0].layer, "Domain_A");
  const m = parseSolidFile("x.msh", bytes);
  assert.equal(m.vertexCount, 8);
});
