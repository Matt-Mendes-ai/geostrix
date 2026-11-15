// TASKS.csv #3595 (Fireweed rehearsal, Macpass) — densities in the tonnes: regressed densities were called 'measured SG', the one-click density
// was the whole project's mean in a Tom West model, and nothing said a tonnage rested on densities 42 % calculated. sgSummary counts the file's
// method column; the grade-tonnage table's one-click SG is over the model's own holes (params.holeIds); the density range is 1-8 t/m3.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sgSummary } from "../src/lib/gradeTonnage.js";
import { sgMethodsText } from "../src/lib/sgMethodsText.js";
import { parseTableText } from "../src/lib/tabular.js";
import { DENSITY_RANGE } from "../src/lib/densityFromModel.js";

test("sgSummary: the method column counted (measured / calculated / other); no method column: null", () => {
  const r = (v, method) => ({ hole_id: "A", from: 0, to: 1, value: v, ...(method !== undefined ? { method } : {}) });
  const s = sgSummary([r(2.8, "MEAS"), r(3.1, "REG"), r(2.9, "LAB-SPG04"), r(3.0, "pycnometer"), r(2.7, "calculated"), r(2.75, "XRF?")]);
  assert.deepEqual(s.methods, { field: "method", measured: 3, calculated: 2, other: 1 });
  assert.equal(sgSummary([r(2.8), r(3.0)]).methods, undefined, "no method column: the summary as before");
  assert.equal(sgMethodsText(s.methods), 'By the file\'s "method" column: 3 measured, 2 calculated (33 %), 1 other.');
  assert.equal(sgMethodsText(null), "");
  assert.deepEqual(DENSITY_RANGE, [1, 6], "Matt's #3587: 1-6 by default (a project setting will raise it)");
});

test("Macpass: Tom West's densities 42 % regressed; its own mean against the whole project's", () => {
  const read = (f) => parseTableText(readFileSync(new URL(`../sample_data/yk_macpass/${f}.csv`, import.meta.url), "utf8")).rows;
  const tw = new Set(read("collars").filter((c) => c.prospect === "Tom West").map((c) => c.hole_id));
  const sg = read("sg").map((r) => ({ hole_id: r.hole_id, from: +r.from, to: +r.to, value: r.sg === "" ? null : +r.sg, method: r.method }));
  const all = sgSummary(sg), own = sgSummary(sg.filter((r) => tw.has(r.hole_id)));
  assert.deepEqual(own.methods, { field: "method", measured: 2479, calculated: 1760, other: 0 }, "Tom West: 1,760 of 4,239 regressed");
  assert.equal(Math.round((100 * own.methods.calculated) / own.n), 42);
  assert.ok(Math.abs(own.mean - all.mean) > 0.05, `Tom West's own mean ${own.mean} against the whole project's ${all.mean}`);
});

test("wiring: the estimate keeps its holes; the table's SG over them, with the methods; the surface tonnage says what the densities are", () => {
  const e = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(e, /holeIds: \[\.\.\.new Set\(points\.map\(\(p\) => p\.hole_id\)\)\], \/\/ TASKS\.csv #3595/);
  assert.match(e, /if \(!m\.params\.holeIds\) m\.params\.holeIds = params\.holeIds;/);
  const g = readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8");
  assert.match(g, /sgSummary\(modelHoles \? \(layers\?\.sg \|\| \[\]\)\.filter\(\(r\) => modelHoles\.has\(r\.hole_id\)\) : layers\?\.sg\)/);
  assert.match(g, /tr\("Use the SG of this model's holes \(\{v\}\)"/);
  const s = readFileSync(new URL("../src/modules/viewer/SurfaceTonnage.jsx", import.meta.url), "utf8");
  assert.match(s, /\{from\.methods \? " " \+ sgMethodsText\(from\.methods\) : ""\}/);
});
