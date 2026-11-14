// TASKS.csv #3271 (Galore Creek review) — in a Cu + Au + Ag set only copper was top-cut: gold (CV 237 %) and silver were estimated uncapped,
// said only in a tooltip, while a run on gold alone opens capped at its P99. Each member takes the single-run rule now, shown and editable,
// and the result gives each member's cap and its composite / nearest-neighbour / estimate means.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { valuesCV, memberCapProposal, CAP_CV_PCT } from "../src/lib/memberCaps.js";
import { lengthWeightedPercentile } from "../src/lib/geochem.js";

const assays = (vals, sym) => vals.map((v, i) => ({ hole_id: "H1", from: i, to: i + 1, values: { [sym]: v } }));

test("valuesCV: sample stdev / mean in %, as the dialog's elementCV; null under 3 values or a mean of 0", () => {
  const a = assays([1, 2, 3, 4], "Cu");
  const mean = 2.5, sd = Math.sqrt(((1.5 ** 2) * 2 + (0.5 ** 2) * 2) / 3);
  assert.ok(Math.abs(valuesCV(a, "Cu") - (sd / mean) * 100) < 1e-9);
  assert.equal(valuesCV(assays([1, 2], "Cu"), "Cu"), null);
  assert.equal(valuesCV(assays([0, 0, 0], "Cu"), "Cu"), null);
});

test("memberCapProposal: the length-weighted P99 when the CV is over 150 %, else not capped", () => {
  const skew = [...Array(200).fill(0.05), 0.4, 0.9, 2.5, 7.59]; // a gold-like tail
  const a = assays(skew, "Au");
  const p = memberCapProposal(a, "Au", "ppm", { Au: "ppm" });
  assert.ok(p.cv > CAP_CV_PCT);
  assert.equal(p.proposed, Number(lengthWeightedPercentile(a, "Au", "ppm", { Au: "ppm" }, 99).toPrecision(4)));
  const flat = memberCapProposal(assays([10, 11, 12, 13, 14], "Ag"), "Ag", "ppm", { Ag: "ppm" });
  assert.ok(flat.cv < CAP_CV_PCT); assert.equal(flat.proposed, null);
});

test("wiring: the members' top cuts in the dialog, used in the run, recorded, checked and said in the result; keys", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /const memberCapOf = \(el\) => \(el in memberCaps \? memberCaps\[el\] : memberProposals\[el\]\?\.proposed \?\? ""\);/);
  assert.match(m, /const mCapN = Number\(memberCapOf\(el\)\), mCap = mCapN > 0 \? mCapN : null;/);
  assert.match(m, /compositeDownholeSliced\(rows, el, u, elementUnits, \{ length: compositeLength, minCoverage, capValue: mCap, domainRows: domainRowsSel \}, \{ signal: ac\.signal \}\) \/\* #3105 \*\/ : rawSampleIntervals\(rows, el, u, elementUnits, \{ capValue: mCap \}\)/);
  assert.match(m, /element: el, unit: u, capValue: mCap, capUnit: mCap != null \? u : null, \.\.\.\(mAudit \? \{ capAudit: mAudit \} : \{\}\)/);
  assert.match(m, /const mNn = method === "nn" \? null : await runEstimation\("block", mp, nnOpts, \{ signal: ac\.signal, checkOnly: true \}\);/);
  assert.match(m, /const nnEst = method === "nn" \? est : await runEstimation\("block", estPts, nnOpts, \{/);
  assert.match(m, /aria-label=\{tr\("Top cut of the other elements"\)\}/);
  assert.match(m, /tr\("check: composites \{c\}, nearest neighbour \{nn\}, estimate \{e\} \{unit\} \(\{d\} against the nearest neighbour\)"/);
  assert.match(m, /tr\("\{el\} capped at \{cap\} \{unit\} before estimating\."/);
  assert.ok(!m.includes("The top cut and a typed variogram apply to {symbol} only"));
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Top cut of the other elements", "Top cut for {el}", "its P99: the CV is over 150 %", "typed", "not capped, though the CV is over 150 %", "not capped: the CV is 150 % or under",
      "{el} capped at {cap} {unit} before estimating.", "capped at {cap} {unit} ({k} of {n} samples)", "not capped",
      "check: composites {c}, nearest neighbour {nn}, estimate {e} {unit} ({d} against the nearest neighbour)", "Coefficient of variation of the assays (standard deviation / mean)", "Element", "CV", "Top cut"]) assert.ok(d[k], `${l}: ${k}`);
  }
});
