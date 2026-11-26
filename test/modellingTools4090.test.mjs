// TASKS.csv #4090 — six 3D Modelling side tools outside the 15 panes, trimmed: every control still reachable (its handler in the file), the cautions in view, the
// explanations behind a closed More. A short form whose answer updates as you type keeps its form (no forced steps).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const REACH = {
  "components/StructFitPanel.jsx": ["setUnc?.((u) => ({ ...u, floor:", "setUnc?.((u) => ({ ...u, percent:", "set({ props: { ...st.props, [u.id]:", "set({ resolve: e.target.checked })", "set({ surface: e.target.value })",
    "toggle(p.index)", "everyNth(surf.points, surf.name, 20)", "set({ picked: [] })", "set({ maxM:", "onClick={run}", "abort.current?.abort()", "onClick={show3d}", "onClick={runFit}", "onClick={runFittedVersion}", "onClick={saveFitCsv}"],
  "components/LongSectionGT.jsx": ["setMode(e.target.value)", "setAzText(", "setKind(e.target.value)", "setCell(", "setRadius(", "setSteps(", "setMethod(e.target.value)", "setShowSd(e.target.checked)", "setMaskKind(e.target.value)",
    "setMaskText(", "setLabels(e.target.checked)", "onClick={draw}", "onClick={savePng}", "onClick={savePdf}", "onClick={toLayout}", "onClick={saveCsv}"],
  "components/SculptPanel.jsx": ["sculpt.begin(surface.id)", "sculpt.setRadius(", "sculpt.setAxis(e.target.value)", "sculpt.setOffset(", "onClick={sculpt.apply}", "onClick={sculpt.cancelAnchor}", "sculpt.undo(surface.id)", "onClick={sculpt.end}"],
  "components/UnsampledChoice.jsx": ["set({ mode: e.target.value })", "set({ value:", "set({ alsoUnassayed: e.target.checked })", "set({ logKey: e.target.value, factor: \"\" })", "set({ factor:"],
  "modules/viewer/SurfaceTonnage.jsx": ["onDensity(v == null ? \"\" : v, null)", "onDensity(inside.mean, { kind: \"inside\"", "onDensity(whole.mean, { kind: \"layer\""],
  "components/SurfaceSolidsPanel.jsx": ["setRoles((p) => ({ ...p, [it.id]: e.target.value }))", "setCellIn(", "setCellZIn(", "setBaseIn(", "setExtend(e.target.checked)", "setCutGround(e.target.checked)", "onClick={build}", "setCellIn(String(thinCell))"],
};

test("#4090 every control of the six tools is still there", () => {
  for (const [f, list] of Object.entries(REACH)) { const s = read(f); assert.deepEqual(list.filter((k) => !s.includes(k)), [], f); }
});

// the text between a <MoreFold ...> and its </MoreFold>, for each fold in the file
const folds = (s) => [...s.matchAll(/<MoreFold[^>]*>([\s\S]*?)<\/MoreFold>/g)].map((m) => m[1]);
const folded = (s, phrase) => folds(s).some((b) => b.includes(phrase));

test("#4090 the cautions stay in view; the how is behind a closed More", () => {
  const sf = read("components/StructFitPanel.jsx");
  assert.ok(sf.includes('tr("Potential fields cannot fix a depth: this never says where a contact is.")') && !folded(sf, "Potential fields cannot fix a depth"));
  assert.ok(sf.includes("The result is one geometry that fits, not the answer.") && sf.includes('tr("Moves the seen points (at most {n}) to match the readings. The result is one geometry that fits, not the answer."'), "the caveat stays in view");
  for (const p of ["Points move vertically only.", "The floor is required and never assumed", "A contact is seen when the survey would notice", "Seen: the survey would notice a move", "Each round re-solves the model once per point", "The fit uses at most 32 cells a side", "Keep the entered values unless you know better"]) assert.ok(folded(sf, p), p);
  const ls = read("components/LongSectionGT.jsx");
  assert.match(ls, /<b>\{tr\("Not a resource estimate\."\)\}<\/b>/);
  assert.ok(!folded(ls, 'tr("Not a resource estimate.")'));
  assert.ok(folded(ls, "Ordinary kriging of the pierce points") && folded(ls, "Inverse-distance interpolation of the pierce points"), "the method sentence behind More");
  assert.ok(!folded(ls, "Against a typed vertical plane") && !folded(ls, "have no direction across their intercept"), "the thickness cautions in view");
  const st = read("modules/viewer/SurfaceTonnage.jsx");
  assert.ok(!folded(st, "Exploration target volume only") && !folded(st, "Public disclosure of a tonnage requires an estimate prepared by a Qualified Person."), "the resource caution in view");
  assert.ok(folded(st, "In-situ, dry, undiluted tonnes"));
  const sc = read("components/SculptPanel.jsx");
  assert.ok(sc.includes("This surface has been hand-edited.") && !folded(sc, "This surface has been hand-edited."), "the provenance in view");
  assert.ok(!folded(sc, "triangles are now inside out") && folded(sc, "Falloff is smooth to zero at the rim"));
  assert.match(read("components/UnsampledChoice.jsx"), /Read as barren by default, at half the lowest \{symbol\} grade/, "the stated default stays");
});

test("#4090 the short live forms keep their form: no steps", () => {
  for (const f of ["components/StructFitPanel.jsx", "components/SculptPanel.jsx", "components/UnsampledChoice.jsx", "modules/viewer/SurfaceTonnage.jsx", "components/LongSectionGT.jsx", "components/SurfaceSolidsPanel.jsx"]) assert.doesNotMatch(read(f), /StepDialog|StepPane/, f);
  assert.match(read("components/SurfaceSolidsPanel.jsx"), /\? <details style=\{\{ marginTop: 6 \}\}>/, "inline in the Result block: the surfaces and block settings behind a closed fold (#3988)");
});

test("#4090 the new words are in every language", () => {
  const keys = ["Potential fields cannot fix a depth: this never says where a contact is.", "Also re-solve the unit values within bounds", "Moves the seen points (at most {n}) to match the readings. The result is one geometry that fits, not the answer.",
    "{n} pierce point(s), {z} of them holes with no intercept (read as 0).", "Label with hole ids", "{vertices} vertices under the brush.", "Undo lasts this session only: once saved, an edit is permanent.",
    "Also the {n} hole(s) never assayed for {symbol}", "Enter a density, or use the SG above. There is no default.", "Enter a density for the tonnage. There is no default."];
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.deepEqual(keys.filter((k) => !j[k]), [], l);
  }
});
