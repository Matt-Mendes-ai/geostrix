// TASKS.csv #1832 (review #1646, Kodiak) — a cutoff that only hides air is not a target band; the check names the band's range.
// TASKS.csv #1761 (review #1645, Copley) — a new raster drapes on a loaded terrain by default.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isTargetModel, hiddenShare, targetBandText } from "../src/lib/plannedHoleChecks.js";

// Kodiak's chargeability: 200 air cells at -1, real values from -0.035 to 23.1
const cells = [...Array.from({ length: 200 }, () => ({ value: -1 })), ...Array.from({ length: 1000 }, (_, i) => ({ value: -0.035 + (23.135 * i) / 999 }))];
const chg = { id: "c", name: "3dmesh_utm", property: "Chargeability (mV/V)", cells, min: -1, max: 23.1 };

test("#1832 the imported cutoff (-0.035 over -1 air) is no band; Min = 10 is; the line names the range", () => {
  assert.equal(hiddenShare({ ...chg, threshold: -0.035, rangeMax: 23.1 }), 0);
  assert.equal(isTargetModel({ ...chg, threshold: -0.035, rangeMax: 23.1 }), false);
  // the saved Kodiak copy: 439 mixed cells between -0.75 and 0 among 76,000 real ones, cutoff -0.035: 0.6 % hidden, no band
  const mixed = { ...chg, cells: [...chg.cells, ...Array.from({ length: 6 }, (_, i) => ({ value: -0.75 + 0.1 * i }))] };
  assert.equal(isTargetModel({ ...mixed, threshold: -0.035, rangeMax: 23.1 }), false);
  assert.ok(hiddenShare({ ...chg, threshold: 10, rangeMax: 23.1 }) > 0.4, "about 43 % of the real cells sit below 10");
  assert.equal(isTargetModel({ ...chg, threshold: 10, rangeMax: 23.1 }), true);
  assert.equal(isTargetModel({ ...chg, threshold: -0.035, rangeMax: 15 }), true);
  assert.equal(targetBandText({ ...chg, threshold: 10, rangeMax: 23.1 }), "chargeability 10–23.1 mV/V");
  assert.equal(targetBandText({ ...chg, property: null, threshold: 2, rangeMax: 3.5 }), "2–3.5");
  const p = readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8");
  assert.ok(p.includes('tr("{m} m in the {band} band of \\"{model}\\""'));
});

test("#1761 a new raster drapes on the terrain when one is loaded", () => {
  const s = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.ok(s.includes('drapeMode: terrainRef.current ? "terrain" : "flat", ...raster, id'));
  assert.ok(s.indexOf("const terrainRef = useRef(null);") < s.indexOf("const addRaster = useCallback"));
});
