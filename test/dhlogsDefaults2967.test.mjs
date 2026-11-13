// TASKS.csv #2967 (WA iron review #2876) — the Downhole logs pane's defaults: the log with the most readings first (built-in and imported logs
// in one list, a layer's fields kept together), the project's lead commodity as the element, and the log scale chosen PER LOG with an
// Automatic that can be chosen again (an imported log's Automatic follows its readings).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { orderLogSources, logScaleFor } from "../src/lib/downholeLogs.js";
import { numericSourceChoices } from "../src/lib/numericSources.js";

test("the most readings first, built-in and imported logs together, a layer's value / min / max kept together", () => {
  const rec = Array.from({ length: 3408 }, (_, i) => ({ hole_id: `D${i % 134}`, from: i, to: i + 1, value: 80 + (i % 20) }));
  const bins = (n, k) => Array.from({ length: n }, (_, i) => ({ hole_id: `H${i % 50}`, from: i * 0.5, to: i * 0.5 + 0.5, value: k + (i % 7), min: k, max: k + 9, n: 5 }));
  const custom = [
    { id: "dens", name: "log: Density_Best", unit: "g/cc", binM: 0.5, rows: bins(4758, 2.5) },
    { id: "gam", name: "log: Gamma_Best", unit: "cps", binM: 0.5, rows: bins(4845, 40) },
  ];
  const ordered = orderLogSources(numericSourceChoices({ layers: { recovery: rec }, customLayers: custom, models: false }));
  assert.deepEqual(ordered.map((s) => s.label), ["log: Gamma_Best", "log: Gamma_Best › min", "log: Gamma_Best › max", "log: Density_Best", "log: Density_Best › min", "log: Density_Best › max", "Recovery"].filter((l) => ordered.some((s) => s.label === l)));
  assert.equal(ordered[0].label, "log: Gamma_Best", "it opened on Recovery (3,408)");
  assert.equal(ordered.at(-1).layerKey, "recovery");
  // ties keep the list's own order
  assert.deepEqual(orderLogSources([{ key: "a", n: 5, layerKey: "a" }, { key: "b", n: 5, layerKey: "b" }]).map((s) => s.key), ["a", "b"]);
  assert.deepEqual(orderLogSources(null), []);
});

test("the scale per log: Automatic follows the readings (imported logs too), a linear built-in stays linear, a kept choice wins", () => {
  const gamma = [0.1, 3, 40, 900, 49900], density = [2.4, 2.9, 3.6];
  const imported = { key: "custom:gam:value", layerId: "gam", logScale: false }, rqd = { key: "log:geotech", layerKey: "geotech", logScale: false }, susc = { key: "log:magsusc", layerKey: "magsusc", logScale: true };
  assert.deepEqual(logScaleFor(imported, gamma, undefined), { log: true, auto: true, autoLog: true }); // was linear whatever its readings
  assert.deepEqual(logScaleFor(imported, density, undefined), { log: false, auto: true, autoLog: false }); // under a decade
  assert.equal(logScaleFor(rqd, [1, 50, 1000], undefined).log, false, "#2245 — RQD stays linear on Automatic");
  assert.equal(logScaleFor(susc, [0.001, 0.05, 2], undefined).log, true);
  assert.deepEqual(logScaleFor(imported, gamma, "linear"), { log: false, auto: false, autoLog: true });
  assert.deepEqual(logScaleFor(rqd, [1, 50, 1000], "log"), { log: true, auto: false, autoLog: false });
  assert.equal(logScaleFor(imported, [0, 5, 50], undefined).log, false, "a zero keeps it linear");
});

test("the pane: the ordered list, the per-log scale kept with Automatic, the lead commodity as the element", () => {
  const p = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  assert.match(p, /const sources = useMemo\(\(\) => orderLogSources\(numericSourceChoices\(/);
  assert.match(p, /useKeptState\(keptScope, "dhlogs\.scaleBy", \{\}\)/);
  assert.match(p, /if \(v === "auto"\) delete n\[source\.key\]; else n\[source\.key\] = v;/);
  assert.match(p, /<option value="auto">\{scale\.autoLog \? tr\("Automatic \(logarithmic\)"\) : tr\("Automatic \(linear\)"\)\}<\/option>/);
  assert.match(p, /const lead = useLeadCommodity\(\);/);
  assert.match(p, /const el = symbols\.includes\(element\) \? element : symbols\.includes\(lead\) \? lead : symbols\[0\] \|\| "";/);
  assert.doesNotMatch(p, /dhlogs\.logChoice/);
});
