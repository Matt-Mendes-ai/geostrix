// TASKS.csv #2192 — the #1680 rule (g/t for a precious metal stored in ppm) in the three places it had not reached
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gradeUnitLabel } from "../src/lib/geochem.js";

const rd = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("gold in ppm is labelled g/t, a base metal keeps ppm", () => {
  assert.equal(gradeUnitLabel("Au", "ppm"), "g/t");
  assert.equal(gradeUnitLabel("Cu", "ppm"), "ppm");
});

test("Compositing's cap audit, Grade stats' probability plot and every QAQC label use the label unit", () => {
  assert.ok(rd("../src/components/CompositingModal.jsx").includes("<CapAuditHint assays={compAssays} symbol={symbol} unit={unit} unitLabel={unitL}"));
  const gs = rd("../src/components/GradeStatistics.jsx"); // #3236 — dispLabel: the chosen display unit, else the label unit (g/t for gold in ppm)
  assert.ok(gs.includes('tr("Log-probability plot — {symbol} ({v}){v2}", { symbol, v: dispLabel'));
  assert.ok(gs.includes("const dispLabel = shownUnit || gradeUnitLabel(symbol, storedUnit);"));
  const q = rd("../src/components/QAQCPanel.jsx");
  assert.ok(q.includes("const unitL = gradeUnitLabel(symbol, unit);"));
  for (const s of ['tr("Detection limit ({unit})", { unit: unitL })', "multiple of the detection limit ({dl} {unit})\", { dl: formatLimit(dl), unit: unitL })" /* #2503 */, "(5x DL)\", { unit: unitL })", 'tr("Ignore pairs with a mean below ({unit}){v}", { unit: unitL,', "cert={cert} unit={unitL}"]) assert.ok(q.includes(s), s);
});
