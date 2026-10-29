// TASKS.csv #1072 (review #1016) — the chunked OBJ / DXF writers give exactly the text the old ones did, much faster.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { exportSurfaceOBJ, exportSurfaceDXF, sceneVertsToWorld, provenanceLines } from "../src/lib/meshExport.js";

// the writers as they were before #1072 (verbatim apart from the names)
const sanitizeName = (name) => String(name || "surface").replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 64) || "surface";
function oldOBJ(name, geometry, origin, provenance = null, extra = {}) {
  const { vertices, indices } = sceneVertsToWorld(geometry, origin);
  const lines = [`# ${name} — exported from GeoStrix`];
  provenanceLines(name, provenance, extra).forEach((l) => lines.push(`# ${l}`));
  lines.push(`o ${sanitizeName(name)}`);
  for (const [x, y, z] of vertices) lines.push(`v ${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}`);
  for (let t = 0; t + 2 < indices.length; t += 3) lines.push(`f ${indices[t] + 1} ${indices[t + 1] + 1} ${indices[t + 2] + 1}`);
  return lines.join("\n") + "\n";
}
function oldDXF(name, geometry, origin, provenance = null, extra = {}) {
  const { vertices, indices } = sceneVertsToWorld(geometry, origin);
  const layer = sanitizeName(name).slice(0, 255) || "SURFACE";
  const lines = [];
  provenanceLines(name, provenance, extra).forEach((l) => lines.push("999", l));
  lines.push("0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "0", "ENDSEC"); // #1114 — the R12 header both DXF writers now share
  lines.push("0", "SECTION", "2", "ENTITIES");
  const fmt = (n) => n.toFixed(4);
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = vertices[indices[t]], b = vertices[indices[t + 1]], c = vertices[indices[t + 2]];
    lines.push("0", "3DFACE", "8", layer, "10", fmt(a[0]), "20", fmt(a[1]), "30", fmt(a[2]), "11", fmt(b[0]), "21", fmt(b[1]), "31", fmt(b[2]), "12", fmt(c[0]), "22", fmt(c[1]), "32", fmt(c[2]), "13", fmt(c[0]), "23", fmt(c[1]), "33", fmt(c[2]));
  }
  lines.push("0", "ENDSEC", "0", "EOF");
  return lines.join("\n") + "\n";
}

const grid = (n) => {
  const pos = [], idx = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) pos.push(i * 2.5, Math.sin(i / 7) * 10 + j * 0.01, -j * 2.5);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i; idx.push(a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return g;
};
const T = (s) => (typeof s === "string" ? s : new TextDecoder().decode(s)).replace(/Exported: [^\n]+/g, "Exported: T"); // the export time differs between two calls
const origin = { x: 612345.678, y: 5789012.345, z: 950 };
const prov = { tool: "test", cutoff: 0.3 };

test("#1072 OBJ and DXF text identical to the previous writers (with chunk boundaries crossed)", () => {
  const g = grid(170); // 57,800 triangles, 29,241 vertices: more than one 50k chunk of faces
  assert.equal(T(exportSurfaceOBJ("Shell A", g, origin, prov)), T(oldOBJ("Shell A", g, origin, prov)));
  assert.equal(T(exportSurfaceDXF("Shell A", g, origin, prov)), T(oldDXF("Shell A", g, origin, prov)));
  const bytes = exportSurfaceDXF("Shell A", g, origin, prov, {}, { bytes: true });
  assert.equal(T(bytes), T(oldDXF("Shell A", g, origin, prov)));
  const empty = new THREE.BufferGeometry(); empty.setAttribute("position", new THREE.Float32BufferAttribute([], 3)); empty.setIndex([]);
  assert.equal(T(exportSurfaceDXF("e", empty, origin)), T(oldDXF("e", empty, origin)));
  assert.equal(T(exportSurfaceOBJ("e", empty, origin)), T(oldOBJ("e", empty, origin)));
});

test("#1072 the DXF of ~500k triangles is written in seconds", () => {
  const g = grid(500); // 500,000 triangles
  const t0 = performance.now();
  const b = exportSurfaceDXF("big", g, origin, null, {}, { bytes: true });
  const ms = performance.now() - t0;
  assert.ok(b.length > 50e6);
  assert.ok(ms < 8000, `${ms.toFixed(0)} ms`); // the old writer: ~12 s at this size (24 s at 1M, review #1016)
});
