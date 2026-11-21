// TASKS.csv #3813 (Matt's decision, 2026-11-21) — after 'Evaluate onto the drillholes' the on-hole layer starts on the SAME scale as the model it came
// from (linear or log), switchable in the layer's Style; its legend says 'log scale' when log; the strip log's bar follows it. (A second evaluation
// replacing the layer and the notice's routes are side 3's 7db00ecc, test scottieGeophys3812.) SYNTHETIC rows.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { customScale, customLegendGroups } from "../src/lib/customColour.js";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// chargeability-like values spanning two decades: the auto rule alone draws them on a log ramp
const rows = Array.from({ length: 50 }, (_, i) => ({ hole_id: "DH-23-001", from: i * 2, to: i * 2 + 2, value: 0.5 + i * 1.2, numeric: true, modelled: true }));
const layer = (scale) => ({ id: `l_${scale}`, name: "On holes: Synthetic model", rows, ...(scale ? { defaultRampScale: scale } : {}) });

test("#3813 the on-hole layer starts on its model's scale; the layer's Style still decides", () => {
  assert.equal(customScale(layer(null), "value", undefined).log, true, "no model scale: the auto rule (over a decade: log), as before");
  assert.equal(customScale(layer("linear"), "value", undefined).log, false, "a linear model: a linear ramp");
  assert.equal(customScale(layer("log"), "value", undefined).log, true);
  assert.equal(customScale(layer("linear"), "value", { rampScale: "log" }).log, true, "the Style's Scale overrides the model's");
  assert.equal(customScale(layer("log"), "value", { rampScale: "linear" }).log, false);
  assert.equal(customScale(layer("linear"), "other", undefined).numeric, false, "another field: not the model's scale");
});

test("#3813 the legend says 'log scale' when the ramp is log", () => {
  const [lin] = customLegendGroups([layer("linear")]), [lg] = customLegendGroups([layer("log")]);
  assert.equal(lin.label, "On holes: Synthetic model");
  // a ramp: the legend's renderers add ' · log scale' from ramp.log themselves; in the label too it read '· log scale · log scale' (seen live)
  assert.equal(lg.label, "On holes: Synthetic model");
  assert.equal(lg.ramp.log, true); assert.equal(lin.ramp.log, false);
  const rd = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  assert.match(rd("components/ViewportFigureOverlay.jsx"), /g\.ramp\.log \? tr\(" · log scale"\) : ""/);
  assert.match(rd("modules/LayoutModule.jsx"), /opt\.ramp\.log \? tr\(" · log scale"\) : ""/);
  // classes: no ramp, so the label says it
  const [cl] = customLegendGroups([layer("log")], {}, { "custom:l_log": { classes: 4 } });
  assert.equal(cl.ramp, undefined); assert.equal(cl.label, "On holes: Synthetic model · log scale");
  const [cn] = customLegendGroups([layer("linear")], {}, { "custom:l_linear": { classes: 4 } });
  assert.equal(cn.label, "On holes: Synthetic model");
});

test("#3813 wiring: the evaluation stores the model's scale; the Style shows it as its default; the strip log's bar follows it", () => {
  const g = read("modules/GeophysicsModule.jsx");
  assert.match(g, /const scale = discrete \? undefined : stopsAreLogSpaced\(model\.stops\) \? "log" : "linear";/);
  assert.equal((g.match(/defaultRampScale: scale/g) || []).length, 2, "a new layer and a replaced one");
  assert.match(read("components/LayerStyleModal.jsx"), /customLayer\?\.defaultRampScale \? tr\("as the model: \{scale\}"/);
  assert.match(read("components/StripLog.jsx"), /\.\.\.\(ml\.defaultRampScale === "log" && pos\.length \? \{ logOk: true, minPos: pos\.reduce\(\(a, b\) => Math\.min\(a, b\)\) \} : \{\}\)/);
});
