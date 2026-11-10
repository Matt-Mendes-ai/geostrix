// TASKS.csv #2160 (WA review #2148; Matt's decision 2026-11-09) — downhole log channels: one numeric layer each, units from the names, binned
// only above the memory budget
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { logChannelColumns, looksLikeLogTable, unitFromHeader, logChannelRows, defaultLogChannels, defaultLogBin, needsBinning, LOG_RAW_BUDGET } from "../src/lib/downholeLogChannels.js";
import { guessTargetFor } from "../src/lib/layers.js";

// the WA iron log's shape (Density_Best, Gamma_Best, Suscep_Best) and the uranium one (Raw_cps, eU3O8_cased_ppm)
const iron = ["HOLEID", "DEPTH", "Density_Best", "Gamma_Best", "Suscep_Best"];
const uran = ["Hole_ID", "Depth", "Raw_cps", "eU3O8_cased_ppm"];

test("the WA logs are recognized as logs (they went to Specific gravity and Lithology), intervals and SG tables are not", () => {
  assert.equal(looksLikeLogTable(iron), true);
  assert.equal(looksLikeLogTable(uran), true);
  assert.equal(guessTargetFor(iron, "geophysics.csv"), "custom");
  assert.equal(guessTargetFor(uran, "gamma.csv"), "custom");
  assert.equal(looksLikeLogTable(["HOLEID", "FROM", "TO", "Density"]), false); // an SG interval table
  assert.equal(looksLikeLogTable(["HOLEID", "DEPTH", "SG"]), false); // one SG reading per depth: the SG layer
  assert.equal(looksLikeLogTable(["HOLEID", "DEPTH", "MagSus"]), false); // a single susceptibility channel: the mag-susc layer
});

test("units from the column names", () => {
  assert.equal(unitFromHeader("Raw_cps"), "cps");
  assert.equal(unitFromHeader("eU3O8_cased_ppm"), "ppm");
  assert.equal(unitFromHeader("Density (g/cc)"), "g/cc");
  assert.equal(unitFromHeader("Suscep_SI"), "SI");
  assert.equal(unitFromHeader("GR_API"), "API");
  assert.equal(unitFromHeader("Gamma_Best"), "");
});

test("the channels: numeric columns but the hole and depth, the named ones ticked first", () => {
  const rows = [{ HOLEID: "A", DEPTH: 1, Density_Best: 2.9, Gamma_Best: 40, Suscep_Best: 0.002, Note: "x" }, { HOLEID: "A", DEPTH: 1.1, Density_Best: 3.0, Gamma_Best: 42, Suscep_Best: 0.003, Note: "y" }];
  const ch = logChannelColumns([...iron, "Note"], rows, { hole_id: "HOLEID", depth: "DEPTH" });
  assert.deepEqual(ch.map((c) => c.col), ["Density_Best", "Gamma_Best", "Suscep_Best"]);
  assert.deepEqual(defaultLogChannels(ch), ["Density_Best", "Gamma_Best", "Suscep_Best"]);
  assert.equal(defaultLogChannels([{ col: "V1", named: false }]), null);
});

test("raw readings, or bins of mean / min / max per hole", () => {
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push({ H: "A", D: i * 0.1, G: i }); // 0.0 .. 1.9 m
  rows.push({ H: "B", D: 0.2, G: 5 }, { H: "B", D: 0.3, G: "" });
  const raw = logChannelRows(rows, { hole_id: "H", depth: "D" }, "G");
  assert.equal(raw.rows.length, 21); assert.equal(raw.skipped, 1); assert.equal(raw.binned, false);
  const b = logChannelRows(rows, { hole_id: "H", depth: "D" }, "G", 0.5);
  assert.deepEqual(b.rows.map((r) => [r.hole_id, r.from, r.to, r.n]), [["A", 0, 0.5, 5], ["A", 0.5, 1, 5], ["A", 1, 1.5, 5], ["A", 1.5, 2, 5], ["B", 0, 0.5, 1]]);
  assert.equal(b.rows[0].value, 2); assert.equal(b.rows[0].min, 0); assert.equal(b.rows[0].max, 4);
  assert.equal(b.readings, 21);
});

test("binning is proposed only above the budget (the WA iron log: 2.58 M readings x 3 channels)", () => {
  assert.equal(needsBinning(2_584_475, 3), true);
  assert.equal(defaultLogBin(2_584_475, 3), 0.5);
  assert.equal(needsBinning(50_000, 3), false);
  assert.equal(defaultLogBin(50_000, 3), null);
  assert.equal(LOG_RAW_BUDGET, 1_000_000);
});

test("the dialog box and the commit are wired", () => {
  assert.match(readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8"), /<LogChannelsBox modal=\{modal\} onChange=\{onChange\} sel=\{sel\} \/>/);
  const u = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(u, /const out = logChannelRows\(allRows, mapping, col, binM, nd\?\.values \|\| null\);/ /* nd: the no-data codes left out, #2332 */);
  assert.match(u, /const binNote = out\.binned \? `Binned on import to \$\{binM\} m: mean of/); // #2329: the note is joined with the interval-middle one
});

test("an oriented-core structure log's Gamma is an angle, not a gamma-ray channel (#604's Woodjam event log)", () => {
  assert.equal(looksLikeLogTable(["Hole number", "Depth", "Structure_Type", "Alpha", "Beta", "Gamma", "Comments"]), false);
});

test("with channels ticked, the value column is not required (the dialog's button, its pre-check and the commit ask the same function)", async () => {
  const { logChannelsFor } = await import("../src/lib/downholeLogChannels.js");
  const rows = [{ HOLEID: "A", DEPTH: 1, Density_Best: 2.9, Gamma_Best: 40 }];
  assert.deepEqual(logChannelsFor("custom", ["HOLEID", "DEPTH", "Density_Best", "Gamma_Best"], rows, { hole_id: "HOLEID", depth: "DEPTH" }), ["Density_Best", "Gamma_Best"]);
  assert.equal(logChannelsFor("custom", ["HOLEID", "DEPTH", "Density_Best"], rows, { hole_id: "HOLEID", depth: "DEPTH" }, []), null); // all unticked: one layer, as before
  assert.equal(logChannelsFor("litho", ["HOLEID", "DEPTH", "Gamma_Best"], rows, { depth: "DEPTH" }), null);
  const m = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  assert.match(m, /!\(logOn && f\.key === "value"\)/);
  assert.match(readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8"), /!\(logChans && f\.key === "value"\)/);
});

test("a binned log's unit, bin and notes are kept in the saved project (the store's mirror of the custom layers)", async () => {
  const { mirrorCustomLayers } = await import("../src/lib/viewerDirty.js");
  const rows = [{ hole_id: "A", from: 0, to: 0.5, value: 1 }];
  const m = mirrorCustomLayers([], [{ id: "c1", name: "log: Gamma", rows, group: {}, unit: "cps", binM: 0.5, notes: "Binned on import to 0.5 m" }]);
  assert.deepEqual(m, [{ id: "c1", name: "log: Gamma", rows, unit: "cps", binM: 0.5, notes: "Binned on import to 0.5 m" }]);
  assert.equal(mirrorCustomLayers(m, [{ id: "c1", name: "log: Gamma", rows, group: {}, unit: "cps", binM: 0.5, notes: "Binned on import to 0.5 m" }]), m); // unchanged: the same list
  assert.deepEqual(mirrorCustomLayers([], [{ id: "c2", name: "SWIR", rows }]), [{ id: "c2", name: "SWIR", rows }]); // a plain layer as before
});
