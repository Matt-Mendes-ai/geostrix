// TASKS.csv #1987 (Stage A) — the TEM 1D panel's reference model (a typed table put on the layers), the height and rz solved for with a
// typed uncertainty, and the results' new columns (the posterior sd per layer, the solved height / rz) in the CSV and in a cancelled run's
// partial result. SYNTHETIC data only. The engine side is python-sidecar/tests/test_tem1d.py check_prior_geometry_1987.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readTemText } from "../src/lib/temLines.js";
import { buildTemRequest, modelsCsv, mergePartials, partialResult, parsePriorTable, priorOnLayers, layerThicknesses } from "../src/lib/temInvert.js";

const head = ["LINE_NO", "E_UTM12N", "N_UTM12N", "Ytopbathv2", "ALT", "T[0]", "T[1]", "T[2]", "T[3]", "D[0]", "D[1]", "D[2]", "D[3]"];
const rows = [];
for (let i = 0; i < 10; i++) rows.push(["100", 540000 + i * 30, 4930000, 2400 + i, 38 + i, 1e-4, 2e-4, 4e-4, 8e-4, 1e-9, 5e-10, 2e-10, 8e-11].join(","));
const data = readTemText([head.join(","), ...rows].join("\n"), "SYNTHETIC_lines.csv");
const g = data.groups.find((x) => x.role === "data") || data.groups[0];
const layers = { n: 5, first: 3, bottom: 60 };
const req = (opts) => buildTemRequest(data, { moments: [{ group: g, times: [0.1, 0.2, 0.4, 0.8], waveform: null, rampUs: 0 }], unit: "SI", system: { geom: "cloop", a: 10, r: 13, h: 30 }, layers, heightsCol: "ALT", ...opts });

test("#1987 the reference table: three numbers a line, a header skipped, the uncertainty required, depths increasing", () => {
  assert.deepEqual(parsePriorTable("depth,rho,sd\n0, 100, 0.5\n20 10 0.3\n"), { rows: [{ depth: 0, ohmm: 100, sd: 0.5 }, { depth: 20, ohmm: 10, sd: 0.3 }], error: null });
  assert.deepEqual(parsePriorTable(""), { rows: [], error: null });
  assert.match(parsePriorTable("0, 100").error, /three numbers/); // no uncertainty: nothing is assumed
  assert.match(parsePriorTable("0, 100, 0").error, /above 0/);
  assert.match(parsePriorTable("0, 0.01, 0.3").error, /Resistivity/);
  assert.match(parsePriorTable("10, 100, 0.3\n5, 10, 0.3").error, /increase/);
});

test("#1987 the table on the layers: the row in force at each layer's middle, none above the first depth, the half-space last", () => {
  const thick = layerThicknesses(5, 3, 60); // 4 layers and the half-space
  assert.equal(thick.length, 4);
  const mids = []; let top = 0; for (const t of thick) { mids.push(top + t / 2); top += t; }
  const p = priorOnLayers([{ depth: 2, ohmm: 100, sd: 0.5 }, { depth: 20, ohmm: 10, sd: 0.2 }], layers);
  assert.equal(p.condMs.length, 5); // one a layer, the half-space included (the engine's n)
  assert.equal(p.condMs[0], mids[0] >= 2 ? 10 : null); // the first layer's middle (1.5 m) is above the table: no prior
  assert.equal(p.sdLog[0], null);
  for (let k = 1; k < 4; k++) assert.equal(p.condMs[k], mids[k] >= 20 ? 100 : 10);
  assert.equal(p.condMs[4], 100); assert.equal(p.sdLog[4], 0.2); // the half-space: the last row
});

test("#1987 the request: the prior on the layers, the height and rz freed with their sd, nothing sent when unused", () => {
  const plain = req({}).request;
  assert.equal(plain.prior, undefined); assert.equal(plain.free, undefined);
  const r = req({ prior: [{ depth: 0, ohmm: 50, sd: 0.4 }], free: { height: 2.5, rz: 0.5 } }).request;
  assert.deepEqual(r.prior, { condMs: [20, 20, 20, 20, 20], sdLog: [0.4, 0.4, 0.4, 0.4, 0.4] });
  assert.deepEqual(r.free, { height: { sd: 2.5 }, rz: { sd: 0.5 } });
  assert.deepEqual(r.heights.slice(0, 3), [38, 39, 40]); // the prior means: the file's heights
  assert.deepEqual(req({ free: { height: null, rz: 0.5 } }).request.free, { rz: { sd: 0.5 } });
  // a central loop on the ground has no receiver above it to solve for
  const loop = buildTemRequest(data, { moments: [{ group: g, times: [0.1, 0.2, 0.4, 0.8], waveform: null, rampUs: 0 }], unit: "SI", system: { geom: "loop", a: 20, h: 0 }, layers, free: { rz: 0.5 } }).request;
  assert.equal(loop.free, undefined);
});

test("#1987 the CSV: the sd per layer, and the solved height and rz with their sd when they were solved for", () => {
  const { pick } = req({ every: 5 });
  assert.equal(pick.length, 2);
  const result = { thick: [3, 5], condMs: [[10, 100, 1], [10, 100, 1]], chi: [1, 1], doi: [6, 6], sdLog: [[0.05, 0.1, 0.4], [0.06, 0.12, null]],
    heightM: [41.234, 44], heightSdM: [1.27, 0.9], rzM: [2.01, 1.99], rzSdM: [0.5, 0.49] };
  const lines = modelsCsv(data, result, pick).text.trim().split("\n");
  assert.equal(lines[0], "file_row,line,x,y,ground_z,top_m,bottom_m,conductivity_mS_m,resistivity_ohm_m,above_doi,chi,doi_m,sd_log10_cond,height_m,height_sd_m,rz_m,rz_sd_m");
  assert.equal(lines[1], "1,100,540000,4930000,2400,0,3,10,100,yes,1,6,0.05,41.23,1.27,2.01,0.5");
  assert.equal(lines[6], "6,100,540150,4930000,2405,8,,1,1000,no,1,6,,44,0.9,1.99,0.49"); // a missing sd: blank
  const noGeo = modelsCsv(data, { ...result, heightM: undefined, rzM: undefined }, pick).text.split("\n")[0];
  assert.ok(noGeo.endsWith(",doi_m,sd_log10_cond"));
});

test("#1987 a cancelled run keeps the new fields of the stations it finished", () => {
  let s = mergePartials(null, [{ idx: [0, 1], condMs: [[1, 2], [3, 4]], chi: [1, 1.1], doi: [50, 60], pred: [[9], [8]], sdLog: [[0.1, 0.2], [0.1, 0.3]], heightM: [40, 41], heightSdM: [1, 1.2], pass: 0 }]);
  s = mergePartials(s, [{ idx: [1], condMs: [[30, 40]], chi: [0.8], doi: [61], pred: [[6]], sdLog: [[0.05, 0.1]], heightM: [42], heightSdM: [0.9], pass: 1 }]);
  const r = partialResult(s, 3, [10]);
  assert.deepEqual(r.sdLog, [[0.1, 0.2], [0.05, 0.1], null]);
  assert.deepEqual(r.heightM, [40, 42, null]);
  assert.equal(r.rzM, undefined); // not solved for: not there
  const old = partialResult(mergePartials(null, [{ idx: [0], condMs: [[1]], chi: [1], doi: [5], pred: [[1]], pass: 0 }]), 1, []);
  assert.equal(old.sdLog, undefined); // an engine without the field: the result as before
});

test("#1987 the panel: the table, the two checkboxes with their sd, the station's height and uncertainty, the run's summary", () => {
  const p = readFileSync(new URL("../src/components/TemInvertPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /prior: priorParsed\.rows, free: \{ height: st\.freeH \? Number\(st\.hSd\) : null, rz: st\.freeRz && st\.geom !== "loop" \? Number\(st\.rzSd\) : null \}/);
  assert.match(p, /\|\| priorParsed\.error;/); // a bad table stops the run with its message
  assert.match(p, /tr\("Solve for the height"\)/);
  assert.match(p, /tr\("Height \{h\} m ± \{s\} \(the file's \{f\} m\)\."/);
  assert.match(p, /fileH: b\.request\.heights \|\| null/);
});
