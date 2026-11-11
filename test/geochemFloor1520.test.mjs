// TASKS.csv #1517 / #1520 — protolith guesses from Lawyers' codes; a censoring floor counted as <DL and turned into a detection limit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guessProtolith } from "../src/lib/geochemDiagrams.js";
import { censoringFloor, suggestDetectionLimit } from "../src/lib/qaqc.js";

test("#1517 Intermed codes guess andesite; sediments and cover never guess a volcanic protolith", () => {
  for (const c of ["V-Hbl-Intermed", "V-Vcl-Intermed", "V-Qtz-Intermed", "I-Intermed", "Intermediate Dyke", "Latite", "ANDS", "andesite"]) assert.equal(guessProtolith(c), "andesite", c);
  for (const c of ["Sand", "Sandstone", "Dolomite", "LMST", "OVB", "SED"]) assert.equal(guessProtolith(c), null, c);
  assert.equal(guessProtolith("dolerite"), "basalt"); assert.equal(guessProtolith("BSL"), "basalt"); assert.equal(guessProtolith("Felsic Dyke"), "rhyolite");
});

test("#1520 a repeated minimum holding 20 % of the values is a floor: twice it is the limit", () => {
  const au = [...Array(538).fill(0.0005), ...Array.from({ length: 2166 }, (_, i) => 0.001 + i * 0.0001)];
  const f = censoringFloor(au);
  assert.equal(f.floor, 0.0005); assert.equal(f.dl, 0.001); assert.ok(Math.abs(f.share - 538 / 2704) < 1e-9);
  assert.equal(censoringFloor([0.001, 0.002, 0.003, ...Array(5).fill(0.0005)]), null, "a few repeats are not a floor");
  const assays = au.map((v) => ({ values: { Au: v } }));
  const s = suggestDetectionLimit(assays, "Au");
  assert.deepEqual([s.basis, s.limit, s.floor], ["floor", 0.001, 0.0005]);
  const lt = suggestDetectionLimit([...assays, { values: { Au: 0.0025 }, qualifiers: { Au: "<" } }], "Au");
  assert.equal(lt.basis, "lt", "a lab's '<' result still wins");
});

test("#1520 wired: Thresholds counts the floor as <DL and says so; QAQC offers twice the floor", () => {
  const t = readFileSync(new URL("../src/components/ThresholdToolkit.jsx", import.meta.url), "utf8");
  assert.match(t, /censoredOf: \(s\) => flaggedLt\(s\) \|\| \(floor != null/); // #2503: flaggedLt = the bdl list or the drill '<' qualifier
  assert.match(t, /const flaggedLt = \(s\) => !!s\.bdl\?\.includes\(symbol\)/);
  assert.match(t, /probably half the detection limit \{dl\} substituted before import/);
  const q = readFileSync(new URL("../src/components/QAQCPanel.jsx", import.meta.url), "utf8");
  assert.match(q, /dlSuggestion\.basis === "floor"/);
});
