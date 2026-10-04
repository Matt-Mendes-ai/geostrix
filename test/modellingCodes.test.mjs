// TASKS.csv #599 — modelling codes (per-interval codes, correlation between holes, contacts from code changes)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rowKey, effectiveCode, codedRuns, topsForCode, autoNumber, connectIntervals, codesInUse, EMPTY_MODELLING_CODES } from "../src/lib/modellingCodes.js";

const r = (hole_id, from, to, value) => ({ hole_id, from, to, value });
// one hole: casing, then dacite / andesite alternating three times, an intrusion, more dacite
const H1 = [r("H1", 0, 5, "CAS"), r("H1", 5, 20, "DAC"), r("H1", 20, 22, "DAC"), r("H1", 22, 40, "AND"), r("H1", 40, 55, "DAC"),
  r("H1", 55, 70, "AND"), r("H1", 70, 80, "DAC"), r("H1", 80, 85, "INT"), r("H1", 85, 100, "DAC")];
const H2 = [r("H2", 0, 3, "CAS"), r("H2", 3, 30, "DAC"), r("H2", 30, 45, "AND"), r("H2", 50, 60, "DAC")]; // gap 45-50

test("#599 default code = logged code (or lithology group), overrides by interval, keyed by hole + depths", () => {
  const groupOf = (v) => (v === "AND" ? "ANDGRP" : null);
  assert.equal(effectiveCode(H1[1], EMPTY_MODELLING_CODES), "DAC");
  assert.equal(effectiveCode(H1[3], EMPTY_MODELLING_CODES, groupOf), "ANDGRP");
  const mc = { ...EMPTY_MODELLING_CODES, assign: { [rowKey(H1[4])]: "DAC2" } };
  assert.equal(effectiveCode(H1[4], mc), "DAC2");
  assert.equal(effectiveCode({ ...H1[4], value: "DACX" }, mc), "DAC2"); // relogged code: the override stays
});

test("#599 runs merge row splits; tops only below a younger stratigraphic unit (not casing, intrusion, hole start, gap)", () => {
  const roles = (n) => ({ CAS: "overburden", INT: "intrusion" }[n] || "stratigraphic");
  const mc = { ...EMPTY_MODELLING_CODES, codes: [{ name: "CAS", role: "overburden" }, { name: "INT", role: "intrusion" }] };
  const runs = codedRuns([...H1, ...H2], mc);
  const dacH1 = runs.filter((x) => x.hole_id === "H1" && x.code === "DAC");
  assert.deepEqual(dacH1.map((x) => [x.from, x.to]), [[5, 22], [40, 55], [70, 80], [85, 100]]); // 5-20 + 20-22 merged
  const { tops, skipped } = topsForCode(runs, "DAC", mc, roles);
  // H1: 5 (below casing) no; 40 (below AND) yes; 70 (below AND) yes; 85 (below the intrusion) no.
  // H2: 3 (below casing) no; 50 (below a gap) no.
  assert.deepEqual(tops.map((t) => `${t.hole_id}@${t.from}`), ["H1@40", "H1@70"]);
  assert.deepEqual(skipped, { holeStart: 0, gap: 1, belowRole: 3, olderAbove: 0 });
  assert.equal(topsForCode(runs, "CAS", mc, roles).skipped.holeStart, 2);
});

test("#599 auto-number alternations per hole, then connect a flow across holes (tie + code), pile order respected", () => {
  const roles = (n) => ({ CAS: "overburden", INT: "intrusion" }[n] || "stratigraphic");
  let mc = { ...EMPTY_MODELLING_CODES, codes: [{ name: "CAS", role: "overburden" }, { name: "INT", role: "intrusion" }] };
  mc = { ...mc, assign: autoNumber([...H1, ...H2], ["DAC", "AND"], mc) };
  const codeOf = (row) => effectiveCode(row, mc);
  assert.deepEqual(H1.map(codeOf), ["CAS", "DAC1", "DAC1", "AND1", "DAC2", "AND2", "DAC3", "INT", "DAC4"]);
  assert.deepEqual(H2.map(codeOf), ["CAS", "DAC1", "AND1", "DAC2"]);
  // the geologist decides H2's 50-60 dacite is the SAME flow as H1's 70-80 (DAC3), not DAC2
  mc = connectIntervals(mc, H1[6], H2[3], [...H1, ...H2]);
  assert.equal(effectiveCode(H2[3], mc), "DAC3");
  assert.deepEqual(mc.ties, [{ a: rowKey(H1[6]), b: rowKey(H2[3]) }]);
  assert.ok(mc.codes.some((c) => c.name === "DAC3"));
  // connecting the same pair again doesn't duplicate the tie
  assert.equal(connectIntervals(mc, H1[6], H2[3], [...H1, ...H2]).ties.length, 1);
  // pile order: DAC2 (order 3) below AND1 (order 2) is a top; with AND1 placed BELOW DAC2 it is not
  const runs = codedRuns([...H1, ...H2], mc);
  const ordered = { ...mc, codes: [...mc.codes, { name: "AND1", order: 2 }, { name: "DAC2", order: 3 }] };
  assert.equal(topsForCode(runs, "DAC2", ordered, roles).tops.length, 1);
  const flipped = { ...mc, codes: [...mc.codes, { name: "AND1", order: 4 }, { name: "DAC2", order: 3 }] };
  assert.equal(topsForCode(runs, "DAC2", flipped, roles).skipped.olderAbove, 1);
  const inUse = codesInUse([...H1, ...H2], ordered, null, roles).map((c) => c.name);
  assert.deepEqual(inUse.slice(0, 2), ["AND1", "DAC2"]); // placed codes first, in pile order
});

test("#599 on the real Harry log: DACT tops under casing / intrusions / hole starts are no longer contacts", () => {
  const lines = readFileSync(new URL("../sample_data/harry_property/litho.csv", import.meta.url), "utf8").trim().split(/\r?\n/).slice(1);
  const rows = lines.map((l) => { const [hole_id, from, to, value] = l.split(","); return { hole_id, from: Number(from), to: Number(to), value }; });
  const roles = (n) => ({ CAS: "overburden", OVB: "overburden", MINT: "intrusion", FINT: "intrusion" }[n] || "stratigraphic");
  const mc = { ...EMPTY_MODELLING_CODES, codes: Object.entries({ CAS: "overburden", OVB: "overburden", MINT: "intrusion", FINT: "intrusion" }).map(([name, role]) => ({ name, role })) };
  const runs = codedRuns(rows, mc);
  const all = runs.filter((x) => x.code === "DACT").length;
  const { tops, skipped } = topsForCode(runs, "DACT", mc, roles);
  console.log(`Harry DACT: ${all} runs -> ${tops.length} tops; skipped`, skipped);
  assert.ok(tops.length <= 25, `the review counted at most 25 real DACT contacts, got ${tops.length}`);
  assert.equal(tops.length + skipped.holeStart + skipped.gap + skipped.belowRole + skipped.olderAbove, all);
});
