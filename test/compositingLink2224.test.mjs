// TASKS.csv #2224 (review #2174, WA lode gold) — Estimation and the grade shell composite the raw assays themselves and never referred to
// Geochem > Compositing: a geologist who built 1 m capped composites there got 2 m uncapped ones here unless they retyped every setting.
// Both now say they use the same routine, and offer Compositing's last settings in this window (same project, same element) in one click.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rememberCompositing, lastCompositing, sameCompositing, forgetCompositing } from "../src/lib/lastCompositing.js";

const tokA = { tabId: "t1", seq: 3 }, tokB = { tabId: "t1", seq: 4 };
const sameAs = (tok) => (t) => !!t && t.tabId === tok.tabId && t.seq === tok.seq; // the store's isSameProject

test("Compositing's settings are offered for the same project and element only", () => {
  forgetCompositing();
  assert.equal(lastCompositing(sameAs(tokA), "Au"), null);
  rememberCompositing(tokA, { symbol: "Au", length: 1, minCoverage: 0.75, cap: 19.5, domain: "Lithology" });
  assert.deepEqual(lastCompositing(sameAs(tokA), "Au"), { symbol: "Au", length: 1, minCoverage: 0.75, cap: 19.5, domain: "Lithology", token: tokA });
  assert.equal(lastCompositing(sameAs(tokA), "Cu"), null, "another element");
  assert.equal(lastCompositing(sameAs(tokB), "Au"), null, "another project (or the same tab reloaded)");
  rememberCompositing(tokA, { symbol: "Au", length: 0 });
  assert.equal(lastCompositing(sameAs(tokA), "Au"), null, "no composites: nothing to offer");
});

test("matching settings: the button gives way to 'the same as here'", () => {
  const g = { length: 2, minCoverage: 0.5, cap: null };
  assert.ok(sameCompositing(g, { length: 2, minCoverage: 0.5, cap: NaN }), "no cap = NaN / blank / null");
  assert.ok(sameCompositing(g, { length: "2", minCoverage: 0.5, cap: "" }));
  assert.ok(!sameCompositing(g, { length: 2, minCoverage: 0.5, cap: 19.5 }));
  assert.ok(!sameCompositing({ ...g, length: 1 }, { length: 2, minCoverage: 0.5, cap: null }));
  assert.ok(!sameCompositing(null, { length: 2 }));
});

test("Compositing remembers; Estimation and the grade shell show the note and take the settings", () => {
  const cm = readFileSync(new URL("../src/components/CompositingModal.jsx", import.meta.url), "utf8");
  assert.match(cm, /if \(results\.length\) rememberCompositing\(getProjectToken\?\.\(\), \{ symbol, length: Number\(length\), minCoverage: Number\(minCoverage\), cap: capValue === "" \? null : Number\(capValue\)/);
  const ge = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(ge, /\{useComposites && <GeochemCompositingNote symbol=\{symbol\} length=\{compositeLength\} minCoverage=\{minCoverage\} cap=\{capValue\}/);
  assert.match(ge, /setCompositeLength\(g\.length\); setMinCoverage\(g\.minCoverage\); setCapValue\(g\.cap \?\? NaN\); setCapAuto\(false\);/);
  const mp = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(mp, /\{numericUseComposites && !numSrc && <GeochemCompositingNote symbol=\{sym\} length=\{numericCompositeLength\} minCoverage=\{numericMinCoverage\} cap=\{numericCapValue\}/);
  assert.match(mp, /setNumericCompositeLength\(g\.length\); setNumericMinCoverage\(g\.minCoverage\); setNumericCapValue\(g\.cap \?\? NaN\);/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Composited here from the raw assays, with the same routine as Geochem > Compositing; composites made there are not reused.", "Geochem > Compositing in this session: {len} m, min coverage {cov}%, {cap}{dom}.", "Use these settings", "no cap"]) assert.ok(d[k], `${l}: ${k}`);
  }
});
