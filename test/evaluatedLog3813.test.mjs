// TASKS.csv #3813 (Matt's decision, 2026-11-21: "the notice points where the values really appear (or Downhole logs shows the evaluated layer)")
// — a project with assays and no numeric log: Downhole logs answered 'No downhole log yet' after 'Evaluate onto the drillholes'. The evaluated
// layer is now listed as a log, after every real log (#2558: it never opens over one), on its model's scale, and never against itself. A
// repeat evaluation finds its layer by the model, else by the name. SYNTHETIC rows (made-up hole DH-23-001).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withEvaluatedLogs, orderLogSources, onHolesRoutes, logScaleFor } from "../src/lib/downholeLogs.js";
import { numericSourceChoices } from "../src/lib/numericSources.js";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const rowsOf = (n, f) => Array.from({ length: n }, (_, i) => ({ hole_id: "DH-23-001", from: i, to: i + 1, ...f(i) }));
const model = { id: "custom_1", name: "On holes: Synthetic chg", sourceModel: "vox_1", rows: rowsOf(400, (i) => ({ value: 1 + i * 0.1, numeric: true, modelled: true })), defaultRampScale: "linear" };
const sgLog = { id: "custom_2", name: "SG log", unit: "g/cm3", rows: rowsOf(60, (i) => ({ value: 2.6 + (i % 7) * 0.05 })) };
const modelIds = new Set([model.id]);
const sourcesOf = (customLayers) => withEvaluatedLogs(
  orderLogSources(numericSourceChoices({ layers: {}, customLayers, models: false }).filter((s) => s.layerId == null || !modelIds.has(s.layerId))),
  numericSourceChoices({ customLayers: customLayers.filter((l) => modelIds.has(l.id)), models: true }), (id) => customLayers.find((c) => c.id === id)?.defaultRampScale);

test("#3813 with no real log, the evaluated model is the log Downhole logs opens on", () => {
  const s = sourcesOf([model]);
  assert.equal(s.length, 1);
  assert.equal(s[0].layerId, "custom_1"); assert.equal(s[0].label, "On holes: Synthetic chg"); assert.equal(s[0].evaluated, true); assert.equal(s[0].n, 400);
});

test("#3813 the evaluated log opens on its model's scale (Automatic follows it); a kept choice still wins", () => {
  const values = model.rows.map((r) => r.value); // 1 to 40.9: over a decade, all above zero, so the readings alone would say log
  const [lin] = sourcesOf([model]), [lg] = sourcesOf([{ ...model, defaultRampScale: "log" }]), [none] = sourcesOf([{ ...model, defaultRampScale: undefined }]);
  assert.equal(lin.modelScale, "linear"); assert.equal(logScaleFor(lin, values, null).log, false);
  assert.equal(logScaleFor(lg, values, null).log, true);
  assert.equal(none.modelScale, undefined); assert.equal(logScaleFor(none, values, null).log, true, "no model scale: the readings decide, as before");
  assert.equal(logScaleFor(lin, values, "log").log, true, "the pane's Scale overrides");
});

test("#3813 a real log still opens first, whatever the model's reading count (#2558)", () => {
  const s = sourcesOf([model, sgLog]);
  assert.deepEqual(s.map((x) => x.layerId), ["custom_2", "custom_1"], "the 60-reading log before the 400-row model");
  assert.equal(s[0].evaluated, undefined);
  assert.deepEqual(withEvaluatedLogs(null, null), []);
  assert.deepEqual(withEvaluatedLogs([], [{ key: "custom:x:min", field: "min" }]), [], "only the model's value, not its other fields");
});

test("#3813 the notice: with assays and no log, Downhole logs is named too", () => {
  assert.equal(onHolesRoutes([{ hole_id: "DH-23-001" }], {}), " For a cross-plot against an assay: Downhole logs (listed there as a log) or Geochem › X–Y scatter.");
});

test("#3813 wiring: the pane lists it, keeps the model's scale, never pairs it with itself; a repeat says Updated", () => {
  const p = read("components/DownholeLogsPane.jsx");
  assert.match(p, /const sources = useMemo\(\(\) => withEvaluatedLogs\(orderLogSources\(/);
  assert.match(p, /numericSourceChoices\(\{ customLayers: customLayers\.filter\(\(l\) => modelIds\.has\(l\.id\)\), models: true \}\),/);
  assert.match(p, /models: true \}\), \(id\) => customLayers\.find\(\(c\) => c\.id === id\)\?\.defaultRampScale\)/);
  assert.match(p, /const onHolesVs = useMemo\(\(\) => onHoles\.filter\(\(l\) => String\(l\.id\) !== String\(source\?\.layerId\)\)/);
  assert.match(p, /const modelLayer = onHolesVs\.find/);
  assert.match(p, /source\?\.evaluated && <div style=\{note\}>\{tr\("\\"\{name\}\\" is a block model evaluated onto the holes/);
  const g = read("modules/GeophysicsModule.jsx");
  assert.match(g, /String\(l\.name\) === `On holes: \$\{model\.name\}`/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const loc = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["\"{name}\" is a block model evaluated onto the holes, read here as a log.",
      "Updated \"On holes: {name}\" (same layer, style kept): {rows} cell crossing(s) along {holes} hole(s).{routes}"]) assert.ok(loc[k], `${lang}: ${k.slice(0, 40)}`);
  }
});
