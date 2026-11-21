// TASKS.csv #3882 follow-up — a compact cluster of collars far above the terrain (ground mined since the holes were drilled: Century's pit under GLO-30)
// is named whatever the project-wide median. SYNTHETIC terrain and collars only (an invented 4 x 4 km plain with a 250 m pit).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarClusterAbove, collarClusterNote, collarTerrainOffset } from "../src/lib/terrainCheck.js";
import { runDataQC } from "../src/lib/dataQC.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// a plain at 150 m over 500000-504000 E, 5500000-5504000 N, 201 x 201 nodes (20 m), with a bowl: a circular pit 250 m deep, 600 m across, at (501350, 5501450)
const N = 201, X0 = 500000, Y0 = 5500000, SIDE = 4000, D = SIDE / (N - 1), PIT = { x: 501350, y: 5501450, r: 300, depth: 250 };
const grid = (withPit) => {
  const el = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = X0 + i * D, y = Y0 + SIDE - j * D, d = Math.hypot(x - PIT.x, y - PIT.y); // row 0 north
    el[j * N + i] = 150 + 0.002 * (x - X0) + (withPit && d < PIT.r ? -PIT.depth * (1 - d / PIT.r) : 0);
  }
  return { bbox: [X0, Y0, X0 + SIDE, Y0 + SIDE], gridW: N, gridH: N, elevations: el, noDataMask: null, name: "Synthetic terrain", source: { service: "Copernicus DEM GLO-30 (ESA, surface model ~30 m)", nodeM: D } };
};
const ground = (x) => 150 + 0.002 * (x - X0); // the pre-pit ground, what the collars were surveyed on
// 16 collars on the plain, 21 inside the pit's footprint (a ring and centre, 60 m apart or so), all surveyed on the pre-pit ground
const plain = Array.from({ length: 16 }, (_, k) => { const x = 500300 + (k % 4) * 700, y = 5500400 + Math.floor(k / 4) * 700 + (k % 2) * 90; return { hole_id: `DH-23-${100 + k}`, x, y, z: ground(x) + (k % 3) - 1 }; });
const inPit = Array.from({ length: 21 }, (_, k) => { const a = (k / 21) * Math.PI * 2, r = 40 + (k % 5) * 45, x = PIT.x + r * Math.cos(a), y = PIT.y + r * Math.sin(a); return { hole_id: `DH-23-${200 + k}`, x, y, z: ground(x) }; });

test("#3882 follow-up: 21 collars in a pit sit far above the terrain: named, with their count, size and range", () => {
  const t = grid(true), cl = collarClusterAbove([...plain, ...inPit], t);
  assert.ok(cl, "the cluster is found");
  assert.equal(cl.n, 21); assert.equal(cl.of, 37);
  assert.ok(cl.hi > 150 && cl.hi <= 255 && cl.lo >= 50, `range ${cl.lo.toFixed(0)}-${cl.hi.toFixed(0)}`);
  assert.ok(cl.widthM < 700 && cl.heightM < 700, "one compact footprint");
  const note = collarClusterNote(cl, t);
  assert.match(note, /^21 collars in one area \(\d+ × \d+ m\) sit \d+ to \d+ m above this terrain: the ground may have been mined or excavated since they were drilled\./);
  assert.match(note, /Copernicus GLO-30\) shows the ground of 2011-2015: try the AWS Terrain Tiles \(SRTM, 2000\) or your own survey\./);
  // the project-wide median is moderate: the existing check (a median over 100 m) would not have fired
  const dz = collarTerrainOffset([...plain, ...inPit], t);
  assert.ok(Math.abs(dz.median) < 100, `median ${dz.median.toFixed(0)} m`);
});

test("#3882 follow-up: the same collars over the pre-pit terrain, a plain project, a steady datum shift, scattered misfits and a coarse grid: no cluster", () => {
  assert.equal(collarClusterAbove([...plain, ...inPit], grid(false)), null, "the older terrain agrees with them");
  assert.equal(collarClusterAbove(plain, grid(true)), null, "no collars over the pit");
  assert.equal(collarClusterAbove([...plain, ...inPit].map((c) => ({ ...c, z: c.z + 80 })), grid(false)), null, "every collar 80 m above: a datum problem, not a cluster");
  const scattered = plain.map((c, k) => (k % 5 === 0 ? { ...c, z: c.z + 120 } : c)); // single bad collars, far apart
  assert.equal(collarClusterAbove(scattered, grid(false)), null, "scattered misfits are Data QC's per-hole warnings");
  const t = grid(true); t.source.nodeM = 150; // a 150 m grid: 3 nodes = 450 m: 250 m of pit is within what grid smoothing can explain
  assert.equal(collarClusterAbove([...plain, ...inPit], t), null, "a coarse grid does not name a cluster");
  assert.equal(collarClusterAbove([...plain.slice(0, 2)], grid(true)), null, "too few collars");
  assert.equal(collarClusterAbove([], grid(true)), null);
});

test("#3882 follow-up: the advice fits the terrain's source", () => {
  const cl = { n: 5, of: 20, lo: 60, hi: 90, widthM: 400, heightM: 300 };
  assert.match(collarClusterNote(cl, { source: { service: "AWS Terrain Tiles (Terrarium): SRTM blended with national DEMs (CDEM in Canada)" } }), /mostly SRTM, from 2000: check the collar elevations, or try Copernicus GLO-30 \(2011-2015\)/);
  assert.match(collarClusterNote(cl, { source: null }), /Check the collar elevations, or try another terrain source or your own survey\./);
  assert.equal(collarClusterNote(null, {}), "");
});

test("#3882 follow-up: Data QC names it under Collar vs terrain, and the fetch says it after the new terrain", () => {
  const t = grid(true);
  const qc = runDataQC({ project: {}, collars: [...plain, ...inPit], survey: [], terrain: t, layers: {}, boundaries: [], assays: [] });
  const issue = (qc.issues || []).find((i) => i.category === "Collar vs terrain" && /collars in one area/.test(i.message));
  assert.ok(issue, "Data QC raises the cluster");
  assert.equal(issue.severity, "warning");
  const g = read("../src/modules/GeophysicsModule.jsx");
  assert.match(g, /const cluster = collarClusterAbove\(collars, parsed, \{ nodeM: parsed\.source\?\.nodeM \}\); if \(cluster\) misfitNote \+= " " \+ collarClusterNote\(cluster, parsed\);/);
  assert.match(g, /Copernicus GLO-30 shows the ground of 2011-2015: ground mined since reads lower than older terrain, and older collars can sit above it\./);
  const h = read("../src/help/pages/geophysics.js");
  assert.match(h, /it shows the ground as it was in 2011-2015, so ground mined since reads lower than in older terrain, and older collars can sit above it/);
  assert.match(h, /collars in one area \(1,300 × 850 m\) sit 200 to 280 m above this terrain/);
});
