// TASKS.csv #3679 — the block estimate searches as the grade shell does: along the plane of the samples at a cut-off (the element's grade
// shell's, else their 90th percentile), an ellipsoid with the volume of the proposed sphere; the element's closed grade shell is proposed
// as the volume to restrict to. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sameVolumeMajorM, gradeShellOf, planeCutoff, estimatePlane, ellipsoidAxesM } from "../src/lib/estimatePlane.js";
import { trendBasis } from "../src/lib/trend.js";

test("sameVolumeMajorM: the long axis that keeps the sphere's volume (60 m at 6 : 2.8 : 1 -> 141 x 66 x 23 m)", () => {
  const r = { max: 6, int: 2.8, min: 1 }, a = sameVolumeMajorM(60, r), ax = ellipsoidAxesM(a, r);
  assert.ok(Math.abs(a - 140.56) < 0.05, `${a}`);
  assert.deepEqual(ax.map(Math.round), [141, 66, 23]);
  assert.ok(Math.abs(ax[0] * ax[1] * ax[2] - 60 ** 3) / 60 ** 3 < 0.01, "the same volume");
  assert.equal(sameVolumeMajorM(60, { max: 1, int: 1, min: 1 }), 60, "a sphere stays a sphere");
  assert.equal(sameVolumeMajorM(0, r), 0);
});

// a closed box (12 triangles) as a modelled solid
const box = (id, name, params) => {
  const P = [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10];
  const I = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  return { id, name, positions: Float64Array.from(P), indices: Uint32Array.from(I), params };
};

test("gradeShellOf: the newest closed grade shell of the element; another element's, an open one and a unit volume are not", () => {
  const open = { ...box("o", "Zn open", { tool: "numeric grade shell", element: "Zn", cutoff: 3 }) }; open.indices = open.indices.slice(0, 30);
  const shells = [box("a", "Zn > 1 shell", { tool: "numeric grade shell", element: "Zn", cutoff: 1 }), box("b", "Zn > 2 shell", { tool: "numeric grade shell", element: "Zn", cutoff: 2 }),
    open, box("c", "Pb > 1 shell", { tool: "numeric grade shell", element: "Pb", cutoff: 1 }), box("d", "Unit A", { tool: "unit volume" })];
  const gz = gradeShellOf(shells, "Zn");
  assert.deepEqual([gz.id, gz.name, gz.cutoff], ["b", "Zn > 2 shell", 2]);
  assert.ok(Math.abs(gz.volumeM3 - 1000) < 1, "#3706: its volume, for the default line");
  assert.equal(gradeShellOf(shells, "Pb").id, "c");
  assert.equal(gradeShellOf(shells, "Ag"), null);
  assert.equal(gradeShellOf([], "Zn"), null);
});

test("planeCutoff: the grade shell's cut-off, else the samples' 90th percentile", () => {
  const pts = Array.from({ length: 101 }, (_, i) => ({ value: i / 10 }));
  assert.deepEqual(planeCutoff(pts, { cutoff: 2, name: "S" }), { value: 2, from: "shell", name: "S" });
  const c = planeCutoff(pts, null);
  assert.equal(c.from, "p90"); assert.ok(Math.abs(c.value - 9) < 0.11, `${c.value}`);
  assert.equal(planeCutoff([{ value: 0 }], null), null);
});

test("estimatePlane: a dipping zone of high grade in low-grade drilling comes back as its plane; too few samples give no plane", () => {
  const B = trendBasis({ dip: 55, dipAzimuth: 230, pitch: 20 });
  let s = 11; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
  const pts = [];
  for (let h = 0; h < 30; h++) {
    for (let k = 0; k < 60; k++) {
      const a = r() * 300, b = r() * 120, c = r() * 100; // the hole's samples spread through the block
      const high = Math.abs(c) < 6; // within 6 m of the plane
      pts.push({ hole_id: `H${h}`, x: a * B.major.x + b * B.semiMajor.x + c * B.minor.x, y: a * B.major.y + b * B.semiMajor.y + c * B.minor.y, z: a * B.major.z + b * B.semiMajor.z + c * B.minor.z, value: high ? 5 + r() : 0.2 + r() * 0.1 });
    }
  }
  const p = estimatePlane(pts, { cutoff: 2, name: "Zn > 2 shell" });
  assert.equal(p.cutoff.from, "shell");
  assert.ok(p.trend && Math.abs(p.trend.dip - 55) < 3 && Math.abs(p.trend.dipAzimuth - 230) < 3, JSON.stringify(p.trend));
  assert.ok(p.trend.ratios.max <= 6 && p.trend.ratios.min === 1);
  const few = estimatePlane(pts.slice(0, 40), { cutoff: 2, name: "S" });
  assert.equal(few.trend, null, "under 30 samples from 4 holes");
});

test("the dialog: the plane is the default without a trend, the radius keeps the sphere's volume under an ellipsoid, the grade shell is proposed", () => {
  const e = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(e, /localStorage\.getItem\("geostrix\.estimatePlaneSearch"\) !== "0"/);
  assert.match(e, /const planeOn = planePref && !modelTrend && !flatTrend/);
  assert.match(e, /const ellTrend = modelTrend \|\| planeTrend;/);
  assert.match(e, /\(ellTrend \? Math\.round\(sameVolumeMajorM\(sphereFromSpacing, ellTrend\.ratios\)\) : sphereFromSpacing\)/);
  assert.match(e, /\.\.\.\(ellTrend && !flatTrend \? \{ metric: \{ basis: trendBasis\(ellTrend\)/, "the reach count searches the same ellipsoid");
  assert.match(e, /searchPlane: \{ fittedTo:/);
  assert.match(e, /\{gradeShell && !shellId && \(/);
  // #3684 — a radius and a cell the dialog chose stay its own (proposed again, refitted) when it is reopened; a typed one is kept and said
  assert.match(e, /searchTyped: searchTouched\.current/);
  assert.match(e, /cellAuto: autoCell != null && cellSize === autoCell/);
  assert.match(e, /useState\(\(\) => \(saved && saved\.cellAuto \? saved\.cellSize : null\)\)/);
  assert.match(e, /tr\("Search radius \{r\} m as typed; from these holes' spacing it would be \{p\} m\."/);
  assert.match(e, /onClick=\{\(\) => \{ setShellPick\(""\); setShellDefaultOff\(false\); \}\}[^>]*>\{tr\("Restrict to it"\)\}/); // #3706: with the default off, the proposal turns it back on
});

test("shellComparison: an unrestricted model beside its element's newest grade shell, at the shell's cut-off; a restricted model gets none", async () => {
  const { shellComparison } = await import("../src/lib/shellCompare.js");
  const solid = (id, el, cutoff) => { const b = box(id, `${el} > ${cutoff} shell`, { tool: "numeric grade shell", element: el, cutoff }); return { id, name: b.name, vertices: b.positions, indices: b.indices, params: b.params }; };
  const cells = [{ value: 3, dx: 10, dy: 10, dz: 10 }, { value: 2, dx: 10, dy: 10, dz: 10 }, { value: 1, dx: 10, dy: 10, dz: 10 }];
  const model = { cells, params: { element: "Zn" } };
  const r = shellComparison(model, [solid("a", "Zn", 1), solid("b", "Zn", 2), solid("c", "Pb", 2)]);
  assert.deepEqual([r.id, r.cutoff, r.modelM3, Math.round(r.shellM3)], ["b", 2, 2000, 1000]);
  assert.equal(shellComparison({ cells, params: { element: "Zn", restrictedToVolumeName: "Zn > 2 shell" } }, [solid("b", "Zn", 2)]), null);
  assert.equal(shellComparison({ cells, params: { element: "Ag" } }, [solid("b", "Zn", 2)]), null);
  const g = readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8");
  assert.match(g, /\{shellCmp && !solid && \(/);
  assert.match(g, /onClick=\{\(\) => setSolidId\(shellCmp\.id\)\}[^>]*>\{tr\("Report inside it"\)\}/);
});
