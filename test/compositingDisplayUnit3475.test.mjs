// TASKS.csv #3475 (#3236 / #3290) — Compositing reads the project's display unit: the cap is typed in it and converted back before use, the averages are shown in it, the
// CSV stays in the stored unit and says so. SYNTHETIC assays (Cu in ppm, shown in %).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compositeDownhole, capAudit } from "../src/lib/geochem.js";
import { displayUnitOf, toDisplay, fromDisplay } from "../src/lib/displayUnits.js";
const units = { Cu: "ppm" };
const assays = [0, 1, 2, 3].map((i) => ({ hole_id: "H1", from: i, to: i + 1, values: { Cu: [1000, 2000, 30000, 4000][i] } }));
test("a cap typed in % (2) is 20,000 ppm stored: the 30,000 sample is capped, the audit counts it", () => {
  const shown = displayUnitOf({ displayUnits: { Cu: "%" } }, "Cu", "ppm");
  assert.equal(shown, "%");
  const capStored = fromDisplay(2, "ppm", shown); assert.equal(capStored, 20000);
  const [c] = compositeDownhole(assays, "Cu", "ppm", units, { length: 4, minCoverage: 0.5, capValue: capStored });
  assert.equal(c.avgGrade, (1000 + 2000 + 20000 + 4000) / 4);
  assert.equal(toDisplay(c.avgGrade, "ppm", shown), 0.675, "the average shown in %");
  assert.equal(capAudit(assays, "Cu", "ppm", units, capStored).nCapped, 1);
});
test("the wiring: capStored everywhere the cap is used, the CSV in the stored unit with its stamp line, the hint converts for display", () => {
  const m = fs.readFileSync(new URL("../src/components/CompositingModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.ok(m.includes('const capStored = capValue === "" ? null : fromDisplay(Number(capValue), unit, shownUnit);'));
  assert.ok(m.includes("capValue: capStored,") && m.includes("cap: capStored, domain:") && m.includes("capAudit(compAssays, symbol, unit, elementUnits, capStored)"));
  assert.ok(m.includes("fmt[symbol](sh(r.avgGrade))") /* #3579: one number of decimals per column */ && m.includes("Display unit: ${symbol} is shown in ${shownUnit} on screen; every value in this file is in ${unit} (as stored)"));
  assert.ok(m.includes("capValue={capStored} toShown={sh}") && m.includes("setCapValue(String(Number(sh(v).toPrecision(4))))"));
  const c = fs.readFileSync(new URL("../src/components/CapAuditHint.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.ok(c.includes("fmt(toShown(pcts.p975))") && c.includes("capValue: +toShown(audit.capValue).toPrecision(6)"));
});
