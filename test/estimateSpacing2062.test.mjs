// TASKS.csv #2062 (review #2013, Woodjam) — the estimation dialog's hole-spacing line is over the holes carrying the chosen element,
// and the header says how many holes have it and how many QC samples are left out.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holeSpacingSummary } from "../src/lib/holeSpacing.js";
const g = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("two assayed holes 67 m apart among a grid of 80 m district collars: the assayed pair decides", () => {
  const district = []; for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) district.push({ hole_id: `H${i}_${j}`, x: 5000 + i * 80, y: 5000 + j * 80, z: 900 });
  const assayed = [{ hole_id: "DH24-120", x: 0, y: 0, z: 900 }, { hole_id: "DH24-125", x: 67, y: 0, z: 900 }];
  const all = holeSpacingSummary([...district, ...assayed]), mine = holeSpacingSummary(assayed);
  assert.ok(all.sites > 2 && Math.abs(all.medianM - 80) < 1, JSON.stringify(all));
  assert.equal(mine.sites, 2);
  assert.ok(Math.abs(mine.nearestM - 67) < 1e-6, JSON.stringify(mine));
});

test("the dialog takes the holes with the element (QC excluded as the run does), falling back to every collar", () => {
  assert.match(g, /const assayedHoles = useMemo\(\(\) => \{ const s = new Set\(\); for \(const a of srcAssays\) if \(Number\.isFinite\(a\.values\?\.\[symbol\]\)\) s\.add\(a\.hole_id\); return s; \}, \[srcAssays, symbol\]\);/);
  assert.match(g, /const spacingCollars = useMemo\(\(\) => \{ const c = collars\.filter\(\(x\) => assayedHoles\.has\(x\.hole_id\)\); return c\.length \? c : collars; \}/);
  assert.match(g, /const spacing = useMemo\(\(\) => holeSpacingSummary\(spacingCollars\), \[spacingCollars\]\);/);
  assert.match(g, /\{h\} of the holes have \{symbol\} values\{v\}\./);
  assert.ok(g.indexOf("const spacing = useMemo") > g.indexOf("const srcAssays = useMemo"), "defined after the QC-filtered rows");
});
