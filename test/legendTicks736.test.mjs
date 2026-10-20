// TASKS.csv #736 — ramp tick labels: measured widths, not 6 px per character; end labels in the ticks' format.
import test from "node:test";
import assert from "node:assert/strict";
import { rampTickLabels, legendScale, stopsAreLogSpaced } from "../src/lib/legendScale.js";

const exo = (s) => [...String(s)].reduce((w, c) => w + (c === "1" ? 4.0 : c === "." ? 2.5 : 6.1), 0); // Exo 2 at 10 px, roughly

test("1-10,000 ohm.m: '1000' clears '10000' and is kept", () => {
  const ticks = [{ at: 0.25, label: "10" }, { at: 0.5, label: "100" }, { at: 0.75, label: "1000" }];
  assert.deepEqual(rampTickLabels(ticks, "1", "10000", 180, exo).map((t) => t.label), ["10", "100", "1000"]);
});

test("a label that would touch an end label or its neighbour is left out", () => {
  assert.deepEqual(rampTickLabels([{ at: 0.04, label: "100" }], "50", "900", 180, exo), []);
  const crowded = [{ at: 0.4, label: "1000" }, { at: 0.45, label: "10000" }, { at: 0.6, label: "100000" }];
  assert.deepEqual(rampTickLabels(crowded, "1", "9", 180, exo).map((t) => t.label), ["1000", "100000"]);
});

test("the ramp's end labels use the same formatter as its ticks", () => {
  const model = { stops: [1, 10, 100, 1000, 10000].map((value, i) => ({ value, color: ["#000", "#333", "#666", "#999", "#ccc"][i] })) };
  assert.ok(stopsAreLogSpaced(model.stops));
  const L = legendScale(model, 1, 10000);
  assert.equal(L.minLabel, "1");
  assert.equal(L.maxLabel, "10000");
  assert.deepEqual(L.ticks.map((t) => t.label), ["10", "100", "1000"]);
});
