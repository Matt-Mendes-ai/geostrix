// TASKS.csv #2386 / #2427 (review #2325, WA uranium) — 34 spellings of 26 units went to the modelling tools as 33 codes (Dcb / DCB /
// DCb, DWS / Dws / DWs / dws, I / i): Litho groups proposed nothing (#2386), and Estimation / Variogram made each spelling its own
// domain, capped and searched apart (#2427).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { caseVariantGroups, foldKey } from "../src/lib/lithoGroups.js";
import { foldDomainRows, domainOfInterval } from "../src/lib/domainLayers.js";

const rows = [];
const add = (v, n) => { for (let i = 0; i < n; i++) rows.push({ hole_id: "H" + (rows.length % 7), from: i, to: i + 1, value: v }); };
add("Dcb", 161); add("DCB", 116); add("DCb", 3); add("DWS", 247); add("Dws", 114); add("DWs", 1); add("dws", 1); add("I", 337); add("i", 1); add("SST", 90); add(" SST", 2);

test("#2386 — spellings that differ by case or spaces are proposed as one group each, the most logged spelling first", () => {
  assert.equal(foldKey("  dWs "), "DWS");
  const g = caseVariantGroups(rows);
  assert.deepEqual(g.map((x) => x.name), ["DWS", "I", "Dcb", "SST"], "largest first");
  const dcb = g.find((x) => x.name === "Dcb");
  assert.deepEqual(dcb.codes, ["Dcb", "DCB", "DCb"]);
  assert.equal(dcb.total, 280);
  assert.deepEqual(g.find((x) => x.name === "SST").codes, ["SST", " SST"], "a leading space is a spelling too");
  // codes already in a group are not proposed again
  assert.ok(!caseVariantGroups(rows, [{ id: "g", name: "Basement", codes: ["DCB"] }]).some((x) => x.name === "Dcb"));
});

test("#2427 — domain rows fold to the most logged spelling, and say what was folded", () => {
  const { rows: f, folded } = foldDomainRows(rows);
  assert.equal(new Set(f.map((r) => r.value)).size, 4);
  assert.ok(folded.some((x) => x.codes.join(" = ") === "Dcb = DCB = DCb"));
  const dom = domainOfInterval(f);
  const one = f.find((r) => r.value === "Dcb" && rows[f.indexOf(r)].value === "DCb");
  assert.equal(dom({ hole_id: one.hole_id, from: one.from, to: one.to }) !== null, true);
  const plain = [{ hole_id: "A", from: 0, to: 1, value: "X" }, { hole_id: "A", from: 1, to: 2, value: "Y" }];
  assert.deepEqual(foldDomainRows(plain), { rows: plain, folded: [] }, "nothing to fold: the same rows");
});

test("the panes and dialogs use them", () => {
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /const sug = caseVariantGroups\(layers\.litho \|\| \[\], lithoGroups\);/);
  assert.match(p, /const add = \(s\) => addLithoGroup\(\{ name: s\.name, codes: s\.codes \}\);/);
  const g = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(g, /const domainRowsSel = domainFold \? domainFold\.rows : null;/);
  const v = readFileSync(new URL("../src/components/VariogramModal.jsx", import.meta.url), "utf8");
  assert.match(v, /const domainChoice = domainChoice0 && domainFold \? \{ \.\.\.domainChoice0, rows: domainFold\.rows \} : domainChoice0;/);
  const lib = readFileSync(new URL("../src/lib/domainLayers.js", import.meta.url), "utf8");
  assert.match(lib, /export function domainLayerChoices/, "the shared chooser is unchanged (Isocon, Downhole logs)");
});
