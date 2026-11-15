// TASKS.csv #3486 — TEM 1D inversion: the neighbour tie offered in the panel (the engine's second pass), its gap set from the stations sent so a
// first look (every 20th station) still ties neighbours, and the models exported as a CSV table. SYNTHETIC data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readTemText } from "../src/lib/temLines.js";
import { buildTemRequest, modelsCsv } from "../src/lib/temInvert.js";

const head = ["LINE_NO", "E_UTM12N", "N_UTM12N", "Ytopbathv2", "T[0]", "T[1]", "T[2]", "T[3]", "D[0]", "D[1]", "D[2]", "D[3]"];
const rows = [];
for (let l = 0; l < 2; l++) for (let i = 0; i < 40; i++) rows.push([l === 0 ? "100" : "200", 540000 + i * 30, 4930000 + l * 500, 2400 + i, 1e-4, 2e-4, 4e-4, 8e-4, 1e-9, 5e-10, 2e-10, 8e-11].join(","));
const data = readTemText([head.join(","), ...rows].join("\n"), "SYNTHETIC_lines.csv");
const g = data.groups.find((x) => x.role === "data") || data.groups[0];
const req = (opts) => buildTemRequest(data, { moments: [{ group: g, times: [0.1, 0.2, 0.4, 0.8], waveform: null, rampUs: 0 }], unit: "SI", system: { geom: "vmd", r: 13, h: 30 }, layers: {}, ...opts });

test("#3486 the tie's gap: three times the stations' spacing along a line, between 100 and 500 m; none without a tie", () => {
  assert.equal(req({ lateral: 0 }).request.gapM, undefined);
  assert.equal(req({ lateral: 1 }).request.gapM, 100); // every station: 30 m apart, 3 x 30 = 90 -> the engine's own 100
  assert.equal(req({ lateral: 1, every: 20 }).request.gapM, 500); // every 20th: 600 m apart -> 1,800 m, capped at 500: ties nothing (a tie across that made the real file's fit worse)
  assert.equal(req({ lateral: 1, every: 4 }).request.gapM, 360); // every 4th: 120 m apart -> 3 x = 360 m
  assert.equal(req({ lateral: 1 }).request.lateral, 1);
});

test("#3486 the models as CSV: a row a station and layer, the half-space's bottom blank, above the DOI or not, stations without a model left out", () => {
  const { request, pick } = req({ lateral: 0, every: 10 });
  assert.equal(pick.length, 8);
  const result = { thick: [3, 5], condMs: pick.map((_, j) => (j === 1 ? null : [10, 100, 1])), chi: pick.map(() => 1.04), doi: pick.map(() => 6) };
  const { text, rows: n } = modelsCsv(data, result, pick);
  const lines = text.trim().split("\n");
  assert.equal(lines[0], "file_row,line,x,y,ground_z,top_m,bottom_m,conductivity_mS_m,resistivity_ohm_m,above_doi,chi,doi_m");
  assert.equal(n, 7 * 3); assert.equal(lines.length, 1 + 21);
  assert.equal(lines[1], `1,100,540000,4930000,2400,0,3,10,100,yes,1.04,6`);
  assert.equal(lines[2], `1,100,540000,4930000,2400,3,8,100,10,yes,1.04,6`);
  assert.equal(lines[3], `1,100,540000,4930000,2400,8,,1,1000,no,1.04,6`); // the half-space: no bottom; below the DOI
  assert.ok(!text.includes("\n11,")); // pick[1] (file row 11) had no model
  assert.ok(request.x.length === 8);
});

test("#3486 the panel offers the tie and the export", () => {
  const p = readFileSync(new URL("../src/components/TemInvertPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /const TIES = \[\{ v: 0, label: "None: each sounding alone" \}, \{ v: 0\.3, label: "Weak" \}, \{ v: 1, label: "Medium" \}, \{ v: 3, label: "Strong" \}\];/);
  assert.match(p, /lateral: Number\(st\.lateral\) \|\| 0, \/\/ #3486/);
  assert.match(p, /const \{ text, rows \} = modelsCsv\(data, R, st\.pick\);/);
  assert.match(p, /onClick=\{exportCsv\}/);
});
