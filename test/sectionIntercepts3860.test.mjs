// TASKS.csv #3860 (Scottie Gold review) — a section of vein gold on a sheet: the grade bars were a hair wide (each bar's share of the section's highest
// value), the grade labels were single samples ('150 g/t Au', no length), and the key listed bare rock codes. Synthetic values only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gradeBarAxis, gradeBarFrac, sectionIntercepts } from "../src/lib/sectionIntercepts.js";
import { withLithoMeanings, groupSectionLegend } from "../src/lib/sectionLegend.js";
import { setLithologyMeanings } from "../src/lib/layers.js";

const au = (hole_id, from, to, value) => ({ hole_id, assay: { sym: "Au", from, to, value, u: "ppm", idx: 0 } });

test("grade bars: a log axis over two decades, so a 0.5 g/t bar is not a pixel beside a 150 g/t one; linear under two decades", () => {
  const ax = gradeBarAxis([0.004, 0.04, 0.5, 8, 90, 150]);
  assert.deepEqual(ax, { log: true, lo: 0.004, hi: 150 });
  assert.equal(gradeBarFrac(150, ax), 1);
  assert.ok(gradeBarFrac(0.5, ax) > 0.4, `0.5 g/t is about half the bar (${gradeBarFrac(0.5, ax).toFixed(2)}), not 0.3 %`);
  assert.equal(gradeBarFrac(0.004, ax), 0.06, "the lowest still shows");
  assert.equal(gradeBarFrac(0, ax), 0);
  const fe = gradeBarAxis([14, 30, 58.9]);
  assert.equal(fe.log, false);
  assert.ok(Math.abs(gradeBarFrac(29.45, fe) - 0.5) < 1e-12, "linear as before");
});

test("the best intercepts on the section, by Best intercepts' rule: '2.70 m @ 89.4 g/t Au', not single samples", () => {
  const pts = [au("SYN-1", 40.5, 41.5, 0.4), au("SYN-1", 41.5, 42.5, 150), au("SYN-1", 42.5, 43.5, 90), au("SYN-1", 43.5, 44.2, 2.1), au("SYN-1", 44.2, 45.2, 0.3),
    au("SYN-2", 20, 22, 1.5), au("SYN-2", 22, 23, 0.2), au("SYN-2", 23, 25, 3), { hole_id: "SYN-2", md: 5, color: "#000" } /* a point, not an assay */];
  const r = sectionIntercepts(pts, { cutoffs: { Au: 1 } });
  assert.equal(r[0].text, "2.70 m @ 89.4 g/t Au");
  assert.deepEqual([r[0].hole_id, r[0].from, r[0].to], ["SYN-1", 41.5, 44.2]);
  assert.ok(r.some((c) => c.hole_id === "SYN-2" && c.from === 20 && c.to === 25), "1 m of internal dilution bridged");
  assert.ok(r.every((c) => c.cutoff === 1));
  // blank: the P90 of the section's values, as Best intercepts suggests
  const p = sectionIntercepts(pts, { cutoffs: { Au: "" } });
  assert.ok(p.length >= 1 && p[0].cutoff > 1);
  // pXRF readings are not intercepts
  assert.deepEqual(sectionIntercepts([{ hole_id: "X", assay: { sym: "Au", from: 0, to: 1, value: 5, u: "ppm", pxrf: true } }], { cutoffs: { Au: 1 } }), []);
});

test("the key names a code from the project's dictionary, cut to the key's row", () => {
  setLithologyMeanings({ altx: { code: "ALTX", desc: "altered, sheared and veined porphyry" }, and: { code: "AND", desc: "andesite" } });
  const payload = { intervals: [{ layer: "litho", code: "ALTX", label: "Lithology: ALTX" }, { layer: "litho", code: "AND", label: "Lithology: AND" }, { layer: "litho", code: "SLT", label: "Lithology: SLT" }],
    legendItems: [["Lithology: AND", "#f00"], ["Lithology: ALTX", "#0f0", null, 627], ["Lithology: SLT", "#00f"], ["Alteration: SER", "#999"]] };
  const out = withLithoMeanings(payload);
  assert.deepEqual(out.legendItems.map((it) => it[0]), ["Lithology: AND — andesite", "Lithology: ALTX — altered", "Lithology: SLT", "Alteration: SER"]); // #3945: the description's first clause, not all of it
  assert.equal(out.legendItems[1][3], 627, "its pattern kept");
  assert.equal(payload.legendItems[0][0], "Lithology: AND", "the input is not changed");
  const rows = groupSectionLegend(out.legendItems).map((r) => r[0]);
  assert.ok(rows.includes("ALTX — altered"), "listed, not counted as too long: " + rows.join(" | "));
  setLithologyMeanings({});
  assert.equal(withLithoMeanings(payload), payload, "no dictionary: as it was");
});

test("wiring: the section window's choice, the bars, the brackets; the payload in ViewerModule", () => {
  const w = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(w, /localStorage\.getItem\("geostrix\.sectionGradeLabels"\) === "intercepts"/);
  assert.match(w, /const intercepts = gradeLabels\?\.mode === "intercepts" \? sectionIntercepts\(points, \{ cutoffs: gradeLabels\.cutoffs \|\| \{\} \}\) : \[\];/);
  assert.match(w, /gradeBarFrac\(a\.value, barAxis\[a\.sym\]\) \* BAR_MAX/);
  assert.match(w, /floatLabels\.push\(\{ key: `bi_\$\{i\}`, text: c\.text/);
  assert.match(w, /tr\("Grade bars on a log scale: \{list\}"/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /openSectionWindow\(withLithoMeanings\(withSectionPatterns\(/);
});
