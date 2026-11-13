// TASKS.csv #3204 (#3195, Galore Creek) — 17 tables of a logging-database export dropped at once: 8 dialogs could not be accepted (the value column
// not recognized) and geotechnical test tables were guessed as Lithology / Structure planes / Veins. Synthetic tables with the same kind of column
// names (an acQuire-style export), not the review's files.
import test from "node:test";
import assert from "node:assert/strict";
import { guessTargetFor, guessMapping, schemaSatisfied } from "../src/lib/layers.js";
import { codeColumnGuess } from "../src/lib/valueGuess.js";

const kind = (name, headers) => { const t = guessTargetFor(headers, name); return { t, m: guessMapping(t, headers) }; };

test("the value columns the review saw refused are read", () => {
  const al = kind("SYN_Alteration.csv", ["HOLE_ID", "FROM", "TO", "AL_CHL", "AL_HT_ASSEMB", "AL_LT_ASSEMB", "AL_INTENSITY"]);
  assert.deepEqual([al.t, al.m.value, al.m.intensity], ["alt", "AL_HT_ASSEMB", "AL_INTENSITY"]);
  const ms = kind("SYN_Mag Sus.csv", ["HOLE_ID", "FROM", "TO", "MS_READING", "MS_NOTE"]);
  assert.deepEqual([ms.t, ms.m.value], ["magsusc", "MS_READING"]);
  const sg = kind("SYN_Specific Gravity.csv", ["Hole", "From", "To", "Weight Air (g)", "Weight Water (g)", "CALC-SG"]);
  assert.deepEqual([sg.t, sg.m.value], ["sg", "CALC-SG"]);
  for (const k of [al, ms, sg]) assert.ok(schemaSatisfied(k.t, k.m));
});

test("geotechnical test tables and an overburden log go to a custom layer, asked, not to Lithology / Structure planes / Veins", () => {
  for (const [n, h] of [["SYN_Lock Angles.csv", ["Hole", "From (m)", "To (m)", "Lock Angle", "Lithology"]], ["SYN_Pocket Penetrometer.csv", ["Hole", "Depth (m)", "Reading (kg/cm2)", "Structure"]],
    ["SYN_Point Load Testing.csv", ["Hole", "Depth", "To (m)", "Test Type", "Reading (MPa)"]], ["SYN_Overburden.csv", ["Hole", "From", "To", "Unit", "Structure"]], ["ucs_results.csv", ["HOLE_ID", "FROM", "TO", "UCS_MPA"]]]) {
    assert.equal(guessTargetFor(h, n), "custom", n);
  }
  assert.equal(guessTargetFor(["HOLE_ID", "FROM", "TO", "LITH"], "SYN_Lithology.csv"), "litho", "a lithology log stays one");
});

test("a numeric layer whose value no name matched: its one number column left is the guess, said as one; two or none, no guess", () => {
  const rows = [{ HOLE_ID: "A", FROM: "0", TO: "1", KAPPA: "0.12", NOTE: "fresh" }, { HOLE_ID: "A", FROM: "1", TO: "2", KAPPA: "0.40", NOTE: "" }];
  assert.deepEqual(codeColumnGuess("magsusc", ["HOLE_ID", "FROM", "TO", "KAPPA", "NOTE"], rows, { hole_id: "HOLE_ID", from: "FROM", to: "TO" }), { col: "KAPPA", numeric: true });
  const two = rows.map((r) => ({ ...r, SECOND: "3" }));
  assert.equal(codeColumnGuess("sg", ["HOLE_ID", "FROM", "TO", "KAPPA", "SECOND"], two, { hole_id: "HOLE_ID", from: "FROM", to: "TO" }), null);
  assert.equal(codeColumnGuess("sg", ["HOLE_ID", "FROM", "TO", "KAPPA"], rows, { hole_id: "HOLE_ID", from: "FROM", to: "TO", value: "KAPPA" }), null, "a value already found: no guess");
  assert.equal(codeColumnGuess("geotech", ["HOLE_ID", "FROM", "TO", "SAMPLE_ID"], [{ HOLE_ID: "A", FROM: "0", TO: "1", SAMPLE_ID: "123" }], { hole_id: "HOLE_ID", from: "FROM", to: "TO" }), null, "an id column is never the value");
});

test("a point table of oriented structures (From = To, numbers in every row) is structure planes, not a downhole log", () => {
  const h = ["HOLEID", "GEOLFROM", "GEOLTO", "PRIORITY", "PS_STR_TYPE", "PS_ALPHA", "PS_BETA", "PS_NOTES"];
  const rows = Array.from({ length: 30 }, (_, i) => ({ HOLEID: "H1", GEOLFROM: String(5 + i * 2.5), GEOLTO: String(5 + i * 2.5), PRIORITY: String(1 + (i % 3)), PS_STR_TYPE: ["FLT", "VN", "JT"][i % 3], PS_ALPHA: String(20 + i), PS_BETA: String((i * 31) % 360), PS_NOTES: "" }));
  assert.equal(guessTargetFor(h, "SYN_Point Structures.csv", rows), "structure");
  // a real point log (a channel named, no type or orientation) is still a log
  const log = Array.from({ length: 30 }, (_, i) => ({ HOLEID: "H1", GEOLFROM: String(i * 0.1), GEOLTO: String(i * 0.1), Density_Best: String(2.5 + (i % 5) / 10) }));
  assert.equal(guessTargetFor(["HOLEID", "GEOLFROM", "GEOLTO", "Density_Best"], "density.csv", log), "custom");
});
