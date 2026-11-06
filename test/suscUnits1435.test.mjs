// TASKS.csv #1435 — the susceptibility log's unit was left to the user with no hint, although Silvertip's readings (0-100, median 0.111)
// cannot be SI. The pane now says what the numbers point to and warns when the chosen unit puts the log above any rock.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { suscUnitHint, SUSC_UNITS, PHYSICAL_MAX_SI } from "../src/lib/drillholeConstraints.js";

test("the likely unit from the readings", () => {
  assert.equal(suscUnitHint([0, 0.0001, 0.0003, 0.002, 0.9]).likely, "si");
  assert.equal(suscUnitHint([0, 0.05, 0.111, 5.6, 100]).likely, "e3"); // a handheld KT-10
  assert.equal(suscUnitHint([20, 150, 800, 4000]).likely, "e5");
  assert.equal(suscUnitHint([0, 0.001, 0.002, 30]).likely, "e3"); // SI would put 30 SI in the ground
  assert.equal(suscUnitHint([]), null);
  assert.deepEqual(Object.keys(SUSC_UNITS).sort(), ["e3", "e5", "si"]);
});

test("Silvertip's bundled log points to x10^-3 SI, and SI would pass the physical ceiling", () => {
  const rows = Papa.parse(readFileSync(new URL("../sample_data/silvertip/magsusc.csv", import.meta.url), "utf8"), { header: true, skipEmptyLines: true }).data;
  const col = "mag_reading";
  const h = suscUnitHint(rows.map((r) => r[col]));
  assert.equal(h.likely, "e3", JSON.stringify(h));
  assert.ok(h.max * SUSC_UNITS.si.factor > PHYSICAL_MAX_SI);
  assert.ok(h.max * SUSC_UNITS.e3.factor <= PHYSICAL_MAX_SI);
});

test("the inversion pane shows the hint and the warning", () => {
  const s = readFileSync(new URL("../src/components/InversionPanel.jsx", import.meta.url), "utf8");
  assert.match(s, /tr\("The log reads \{lo\} to \{hi\}, median \{med\}: most likely \{unit\}\."/);
  assert.match(s, /suscHint\.max \* SUSC_UNITS\[dh\.units\]\.factor > PHYSICAL_MAX_SI/);
});
