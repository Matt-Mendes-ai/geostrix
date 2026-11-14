// TASKS.csv #2891 (review #2876, WA bedded iron) — recovery.csv gives Coreloss and Metres_Drilled, no percentage: the Recovery % dialog
// matched no Value and Import stayed disabled. The dialog now offers Recovery % computed from them, the import computes it and says so.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recoveryColumns, recoveryPct } from "../src/lib/recoveryCalc.js";

const H = ["Hole_id", "Depth From", "Depth To", "Projectcode", "PRIORITY", "Cavity", "Coreloss", "Metres_Drilled", "Cmnts_Core_Recovery", "Lithology"];
const m = { hole_id: "Hole_id", from: "Depth From", to: "Depth To" };

test("the WA iron recovery table: core loss and metres drilled", () => {
  assert.deepEqual(recoveryColumns(H), { loss: "Coreloss", recovered: null, drilled: "Metres_Drilled" });
  const c = recoveryColumns(H);
  assert.equal(recoveryPct({ "Depth From": "13.85", "Depth To": "15.45", Coreloss: "0", Metres_Drilled: "1.6" }, c, m), 100);
  assert.equal(recoveryPct({ Coreloss: "0.4", Metres_Drilled: "1.6" }, c, m), 75);
  assert.ok(Number.isNaN(recoveryPct({ Coreloss: "", Metres_Drilled: "1.6" }, c, m)), "no loss logged: no value");
  assert.ok(Number.isNaN(recoveryPct({ Coreloss: "0.1", Metres_Drilled: "0" }, c, m)), "no run: no value");
  // a loss larger than the run gives a negative %, which the import's range check then names (-42.86 in the review)
  assert.ok(Math.abs(recoveryPct({ Coreloss: "2", Metres_Drilled: "1.4" }, c, m) - -42.857) < 0.001);
});

test("recovered length, and From / To as the run when no drilled column", () => {
  const c = recoveryColumns(["HOLEID", "FROM", "TO", "Recovered_m"]);
  assert.deepEqual(c, { loss: null, recovered: "Recovered_m", drilled: null });
  assert.equal(recoveryPct({ FROM: 10, TO: 12, Recovered_m: 1.5 }, c, { from: "FROM", to: "TO" }), 75);
  assert.equal(recoveryColumns(["HOLEID", "FROM", "TO", "Recovery_pct"]), null, "a table with a percentage needs no formula");
});

test("the dialog offers it, the commit computes it and says so", () => {
  const d = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  assert.match(d, /const recOn = modal\.target === "recovery" && !modal\.mapping\.value && !modal\.recoveryCalcOff && !!recoveryColumns\(modal\.headers\);/);
  assert.match(d, /!\(recOn && f\.key === "value"\)/);
  const u = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(u, /const recCalc = target === "recovery" && !mapping\.value && !data\.recoveryCalcOff \? recoveryColumns\(Object\.keys\(allRows\[0\] \|\| \{\}\)\) : null;/);
  assert.match(u, /if \(recCalc\) r\.value = recoveryPct\(raw, recCalc, mapping\); \/\/ #2891/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["No recovery column: compute Recovery % from {loss} and {run}, as (run − loss) / run × 100.", "Recovery % computed from {loss} and {run}: (run − loss) / run × 100.", "To − From"]) assert.ok(j[k], `${l}: ${k}`);
  }
});

test("the columns it was computed from are not listed as 'not imported'", () => {
  const u = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(u, /leftOutText\(data, allRows, \[\.\.\.\(sib\?\.codes \|\| \[\]\), \.\.\.\(recCalc \? \[recCalc\.loss, recCalc\.recovered, recCalc\.drilled\]\.filter\(Boolean\) : \[\]\)\]\)/);
});
