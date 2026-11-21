// TASKS.csv #3944 (Matt's first-time test, 2026-11-21: "lithology is being categorized with the wrong field. in this example I have it mapped to unit but
// still chooses a different field") — a Lithology log with per-cent component columns whose shares sum to 100 (lith1_pct 100, lith2_pct 0, lith3_pct 0 on a
// log of one lithology per interval) was read as a composition (#3052): each interval coded by its dominant component, so every one of the 282 rows got
// "LITH1" over the Value column the user had chosen. The code column the user chose always wins now; the composition is offered in the dialog's box and
// applied only when the user picks it. Made-up data (hole ids DH-23-xxx); nothing of the user's database is in here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mineralPlan, perMineralChoice, perMineralOffer, codeColumnChosen, singleMineralRows } from "../src/lib/perMineralColumns.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const UNITS = ["AND", "BAS", "TUFF", "SED"];
const headers = ["hole_id", "from_m", "to_m", "unit", "lith1_pct", "lith2_pct", "lith3_pct", "logged_tstamp"];
const rows = [];
for (let h = 1; h <= 4; h++) for (let i = 0; i < 15; i++) rows.push({ hole_id: `DH-23-00${h}`, from_m: i * 4, to_m: i * 4 + 4, unit: UNITS[(i + h) % 4], lith1_pct: 100, lith2_pct: 0, lith3_pct: 0, logged_tstamp: `2024-03-0${1 + (i % 9)}` });
const mapped = { hole_id: "hole_id", from: "from_m", to: "to_m", value: "unit" };
const modalOf = (extra = {}, mapping = mapped) => ({ target: "litho", headers, allRows: rows, mapping, ...extra });
const planOf = (modal) => mineralPlan("litho", headers, rows, modal.mapping, modal);

test("#3944 the bug: Value = unit, three per-cent components summing to 100 -> the composition was applied and every interval was coded LITH1", () => {
  // the box still offers the composition (it is detected) ...
  const offer = perMineralOffer("litho", headers, rows, mapped);
  assert.ok(offer?.composition, "the composition is detected and offered");
  // ... but it is not applied over the chosen code column
  assert.equal(planOf(modalOf()), null);
  assert.equal(perMineralChoice(modalOf(), offer).mode, "off");
});

test("#3944 the user can still choose the composition (single, or one layer per component beside the chosen log)", () => {
  const single = planOf(modalOf({ mineralMode: "single" }));
  assert.equal(single?.mode, "single");
  assert.ok(single.composition);
  const out = singleMineralRows(rows, mapped, single, single.colourBy);
  assert.deepEqual([...new Set(out.rows.map((r) => r[out.mapping.value]))], ["LITH1"], "what the user asked for in that case: the dominant component");
  const layers = planOf(modalOf({ mineralMode: "layers", mineralCols: ["lith1_pct", "lith2_pct"] }));
  assert.equal(layers?.mode, "layers");
});

test("#3944 no code column mapped: the composition is the layer's codes as before (#3052)", () => {
  const none = { hole_id: "hole_id", from: "from_m", to: "to_m" };
  const plan = planOf(modalOf({}, none));
  assert.equal(plan?.mode, "single");
  assert.ok(plan.composition);
  assert.equal(perMineralChoice(modalOf({}, none), perMineralOffer("litho", headers, rows, none)).mode, "single");
});

test("#3944 a guessed column is not a choice (#2889), and neither is a component column", () => {
  assert.equal(codeColumnChosen({ mapping: mapped, valueGuess: { col: "unit", codes: 4 } }, []), false);
  assert.ok(planOf(modalOf({ valueGuess: { col: "unit", codes: 4 } })), "a guess does not stop the composition");
  assert.equal(codeColumnChosen({ mapping: { ...mapped, value: "lith1_pct" } }, [{ col: "lith1_pct" }]), false);
  assert.equal(codeColumnChosen({ mapping: mapped }, [{ col: "lith1_pct" }]), true);
  assert.equal(codeColumnChosen({ mapping: { hole_id: "h" } }, []), false);
});

test("#3944 a log with one numeric lith1 column and a unit code: the codes come from unit (no composition at all)", () => {
  const h = ["hole_id", "from_m", "to_m", "unit", "lith1", "logged_tstamp", "desurvey_lith_int"];
  const r = rows.map((x, i) => ({ hole_id: x.hole_id, from_m: x.from_m, to_m: x.to_m, unit: x.unit, lith1: 100, logged_tstamp: x.logged_tstamp, desurvey_lith_int: i }));
  assert.equal(mineralPlan("litho", h, r, mapped, { target: "litho", allRows: r, mapping: mapped }), null);
});

test("#3944 the dialog's box offers the choice; the commit passes the dialog's own data, and a database reload records it", () => {
  const box = read("../src/components/MineralPercentBox.jsx");
  assert.match(box, /name="mineralMode" checked=\{off\} onChange=\{\(\) => onChange\(\{ \.\.\.modal, mineralMode: "off" \}\)\}/);
  assert.match(box, /tr\("Keep the \{col\} codes, not the components"/);
  assert.match(box, /checked=\{mode === "layers"\}/);
  const pipe = read("../src/modules/viewer/importPipelineImpl.js");
  assert.match(pipe, /perMineralLib\.mineralPlan\(tg, data\.headers \|\| Object\.keys\(data\.allRows\?\.\[0\] \|\| \{\}\), data\.allRows \|\| \[\], data\.mapping \|\| \{\}, data\)/);
  // the reload runs commitImportData with the recorded choices: mineralMode rides with them (dbImportRecord keeps every key of the dialog's data)
  assert.match(pipe, /recordAs: data/);
  assert.match(read("../src/lib/dbImports.js"), /for \(const \[k, v\] of Object\.entries\(modalData \|\| \{\}\)\) \{ if \(SKIP\.has\(k\)/);
});

test("#3944 the new line is in es / pt / fr / ar", () => {
  for (const l of ["es", "pt", "fr", "ar"]) {
    const o = JSON.parse(read(`../src/locales/${l}.json`));
    assert.ok(o["Keep the {col} codes, not the components"], l);
  }
});
