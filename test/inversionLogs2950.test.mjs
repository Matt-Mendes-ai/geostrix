// TASKS.csv #2950 (review #2876, WA iron) — the inversion's drillhole constraint and the geology-model test read the built-in Mag. susc. / SG
// layers only, so the project's susceptibility and density logs, imported by the log route as custom layers, were '0 rows'.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inversionLogSources, defaultLogSource, logReadingCounts } from "../src/lib/inversionLogSources.js";
import { constraintSamples } from "../src/lib/drillholeConstraints.js";

const collars = [0, 1, 2].map((i) => ({ hole_id: `H${i}`, x: 1000 * i, y: 0, z: 400, azimuth: 0, dip: 90, length: 40 }));
const bins = (f) => collars.flatMap((c) => Array.from({ length: 20 }, (_, k) => ({ hole_id: c.hole_id, from: k * 2, to: k * 2 + 2, value: f(k) })));
const wa = [
  { id: 11, name: "downhole_logs: Gamma_Best", unit: "cps", binM: 2, rows: bins((k) => 40 + k) },
  { id: 12, name: "downhole_logs: Suscep_Best", unit: "SI", binM: 2, rows: bins((k) => 0.001 * (k + 1)) },
  { id: 13, name: "downhole_logs: Density_Best", unit: "g/cc", binM: 2, rows: bins((k) => 2.5 + k / 40) },
];

test("a project with logs only as custom layers: they are offered, the one named for the property is the default", () => {
  const mag = inversionLogSources({ layers: {}, customLayers: wa }, "mag");
  assert.equal(mag[0].label, "downhole_logs: Suscep_Best", "the log named for susceptibility first");
  assert.ok(mag.some((s) => s.label === "downhole_logs: Gamma_Best"), "any numeric log can be chosen");
  assert.equal(defaultLogSource(mag).label, "downhole_logs: Suscep_Best");
  const grav = inversionLogSources({ layers: {}, customLayers: wa }, "grav");
  assert.equal(defaultLogSource(grav).label, "downhole_logs: Density_Best");
  // its rows feed the constraint as the built-in layer's do
  const r = constraintSamples({ collars, survey: [], rows: defaultLogSource(mag).rows(), method: "mag", units: "si", background: 0, desurveyMethod: "minimum_curvature", step: 2 });
  assert.equal(r.holes, 3);
  assert.equal(r.points.length, 60);
  const g = constraintSamples({ collars, survey: [], rows: defaultLogSource(grav).rows(), method: "grav", units: "", background: 2.67, desurveyMethod: "minimum_curvature", step: 2 });
  assert.ok(g.points.length === 60 && g.points.every((p) => Math.abs(p[3]) < 1), "density contrast from the background");
});

test("the built-in layer stays the default when it has readings; nothing named means the user picks", () => {
  const layers = { magsusc: [{ hole_id: "H0", from: 0, to: 2, value: 0.01 }, { hole_id: "H0", from: 2, to: 4, value: 0.02 }] };
  const s = inversionLogSources({ layers, customLayers: wa }, "mag");
  assert.equal(s[0].builtIn, true);
  assert.equal(defaultLogSource(s).builtIn, true);
  assert.equal(defaultLogSource(inversionLogSources({ layers: {}, customLayers: [wa[0]] }, "mag")), null, "a gamma log is offered but not assumed");
  assert.deepEqual(inversionLogSources({ layers: {}, customLayers: [] }, "grav"), []);
  // a model evaluated onto the holes is not a log (numericSourceChoices models: false)
  assert.equal(inversionLogSources({ layers: {}, customLayers: [{ id: 9, name: "On holes: MVI susceptibility", sourceModel: 3, rows: bins(() => 0.01) }] }, "mag").length, 0);
});

test("the empty state and the status line count the custom logs named for the property", () => {
  assert.deepEqual(logReadingCounts({ layers: {}, customLayers: wa }), { ms: 60, sg: 60 });
  assert.deepEqual(logReadingCounts({ layers: { sg: [{}, {}] }, customLayers: [] }), { ms: 0, sg: 2 });
});

test("wired: the panel's Log choice (kept per method), its rows into the constraint and the geology test; the counts", () => {
  const p = readFileSync(new URL("../src/components/InversionPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /const dhSources = useMemo\(\(\) => \(method \? inversionLogSources\(\{ layers, customLayers \}, method\) : \[\]\)/);
  assert.match(p, /const dhPick = dh\[`source_\$\{method\}`\];/);
  assert.match(p, /const dhRows = useMemo\(\(\) => \(dhSource \? dhSource\.rows\(\) : \[\]\), \[dhSource\]\);/);
  assert.match(p, /aria-label=\{tr\("Log that constrains the inversion"\)\}/);
  assert.match(p, /\{ ms: logCounts\.ms\.toLocaleString\(\), sg: logCounts\.sg\.toLocaleString\(\) \}/);
  assert.doesNotMatch(p, /const dhRows = layers\[dhLayer\]/);
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const \{ ms, sg \} = logReadingCounts\(\{ layers, customLayers \}\);/);
});
