// TASKS.csv #3920 (Matt, 2026-11-20: "we should have barren as default for unsampled core") — barren is the default reading of the unsampled
// metres inside a sampled hole, at half the lowest positive grade; the guided Grade model never stops on the question. Synthetic data.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { barrenDefault, defaultUnsampledMode, unsampledReady, fillUnsampled } from "../src/lib/unsampledFill.js";
import { getUnsampledChoice, setUnsampledChoice } from "../src/lib/unsampledChoices.js";
import { GRADE } from "../src/modules/viewer/guided/guidedTools.js";

// two holes sampled with gaps (10-20 m and 30-40 m unsampled), Zn in %
const collars = [{ hole_id: "A", x: 0, y: 0, z: 0, max_depth: 50 }, { hole_id: "B", x: 50, y: 0, z: 0, max_depth: 50 }];
const assays = ["A", "B"].flatMap((h, i) => [[0, 10, 0.8 + i], [20, 30, 2.4], [40, 50, 0.06]].map(([from, to, v]) => ({ hole_id: h, from, to, values: { Zn: v } })));

test("barren by default at half the lowest positive grade; 0 when none is positive", () => {
  assert.equal(defaultUnsampledMode(0.2), "barren");
  assert.equal(defaultUnsampledMode(0.9), "barren");
  assert.deepEqual(barrenDefault(assays, "Zn"), { value: 0.03, lowest: 0.06 });
  assert.deepEqual(barrenDefault([{ values: { Zn: 0 } }], "Zn"), { value: 0, lowest: null });
  assert.ok(unsampledReady("barren", String(barrenDefault(assays, "Zn").value)));
  // the gaps of the holes are filled at that value (20 m in each of the 2 holes)
  const f = fillUnsampled(assays, collars, "Zn", "%", { Zn: "%" }, 0.03);
  assert.equal(f.filledM, 40); assert.equal(f.holesFilled, 2);
});

test("the dialogs: the default with its reason, a typed or saved value kept, the sampled-metres line kept", () => {
  const u = readFileSync(new URL("../src/components/UnsampledChoice.jsx", import.meta.url), "utf8");
  assert.match(u, /const byDefault = mode === "barren" && \(saved\?\.value == null/);
  assert.match(u, /const value = byDefault \? String\(dflt\.value\) : saved\?\.value \?\? "";/);
  assert.match(u, /Read as barren by default, at half the lowest \{symbol\} grade/);
  assert.match(u, /are sampled \(\{p\} %\)\./);
  assert.doesNotMatch(u, /none is chosen for you|Under 60 % are sampled/);
  assert.match(readFileSync(new URL("../src/lib/unsampledChoices.js", import.meta.url), "utf8"), /\{ \.\.\.\(choices\.get\(k\) \|\| \{ mode: null \}\), \.\.\.patch \}/); // no value until typed
});

test("the guided Grade model: an unfinished choice goes back to the default, a finished one is kept, the card says which", () => {
  const api = { numeric: { now: [], set: Array.from({ length: 6 }, () => () => {}) } };
  setUnsampledChoice("gradeShell", "Zn", { mode: "barren", value: "" }); // a cleared value: the old dialog would stop the run
  GRADE.prepare(api, { list: ["Zn", 1, 10, 5, 60, 2] });
  assert.equal(getUnsampledChoice("gradeShell", "Zn").value, undefined); // the default fills it
  setUnsampledChoice("gradeShell", "Zn", { mode: "unknown" });
  GRADE.prepare(api, { list: ["Zn", 1, 10, 5, 60, 2] });
  assert.equal(getUnsampledChoice("gradeShell", "Zn").mode, "unknown"); // the user's choice is kept
  setUnsampledChoice("gradeShell", "Zn", { mode: "barren", value: undefined });
  const r = GRADE.auto({ collars, assays, assayElements: [{ symbol: "Zn", unit: "%" }], hasDensity: false, gradeTrend: false }, "Zn");
  const line = r.ok ? r.reasons.find((x) => x.field === "unsampled")?.text : "";
  assert.ok(!r.ok || /read as barren at 0\.03 %: half the lowest Zn grade \(0\.06 %\)/.test(line), line);
});
