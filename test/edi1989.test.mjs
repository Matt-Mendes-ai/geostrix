// TASKS.csv #1989 — MT / AMT soundings from EDI files: units, apparent resistivity and phase, the determinant, Niblett–Bostick
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEdi, soundingCurves, bostick, stationLine, ediStations, bostickPoints, lineOrder, mtSurveyName, mergeStations, sortLines, parseEdiCoord, foldPhase, MU0 } from "../src/lib/edi.js";
import { SURVEY_METHODS } from "../src/lib/geophysSurveys.js";
import { unreadableFormatAdvice } from "../src/lib/unreadableFormats.js";

const FREQS = [1, 10, 100, 1000];
// a uniform 100 ohm.m half-space: |Z| from rho, phase 45 degrees (xy first quadrant, yx third)
function halfSpaceEdi({ rho = 100, si = true, withRho = true, info = "", order = "INC", extra = "", id = "1100N3550", lat = "49:43:27.74", lon = "-120:27:11.68", elev = "1602.1", prospect = "MPD" } = {}) {
  const fs = order === "DEC" ? [...FREQS].reverse() : FREQS;
  const mag = (f) => (si ? Math.sqrt(rho * 2 * Math.PI * f * MU0) : Math.sqrt((rho * f) / 0.2));
  const c = Math.SQRT1_2;
  const block = (name, vals) => `>${name} //${vals.length}\n${vals.map((v) => v.toExponential(6)).join(" ")}\n`;
  return [
    `>HEAD\nDATAID="${id}"\nPROSPECT="${prospect}"\nLAT=${lat}\nLONG=${lon}\nELEV=${elev}\nEMPTY=1.0E+32\n`,
    `>INFO\n${info}\n`,
    `>=DEFINEMEAS\nREFLAT=${lat}\nREFLONG=${lon}\n`,
    `>=MTSECT\nNFREQ=${fs.length}\n`,
    `>FREQ ORDER=${order} //${fs.length}\n${fs.join(" ")}\n`,
    block("ZXYR", fs.map((f) => mag(f) * c)), block("ZXYI", fs.map((f) => mag(f) * c)),
    block("ZYXR", fs.map((f) => -mag(f) * c)), block("ZYXI", fs.map((f) => -mag(f) * c)),
    block("ZXXR", fs.map(() => 0)), block("ZXXI", fs.map(() => 0)), block("ZYYR", fs.map(() => 0)), block("ZYYI", fs.map(() => 0)),
    withRho ? block("RHOXY", fs.map(() => rho)) + block("PHSXY", fs.map(() => 45)) : "",
    extra, ">END\n",
  ].join("");
}

test("a uniform half-space: 100 ohm.m and 45 degrees on xy, yx and the determinant; SI found from the file's own rho", () => {
  const e = parseEdi(halfSpaceEdi(), "a.edi");
  assert.equal(e.units, "SI"); assert.equal(e.unitsFrom, "rho"); assert.deepEqual(e.warnings, []);
  assert.equal(e.id, "1100N3550"); assert.equal(e.prospect, "MPD"); assert.equal(e.elev, 1602.1);
  assert.ok(Math.abs(e.lat - (49 + 43 / 60 + 27.74 / 3600)) < 1e-12 && Math.abs(e.lon + (120 + 27 / 60 + 11.68 / 3600)) < 1e-12);
  const c = soundingCurves(e);
  for (const k of ["xy", "yx", "det"]) c.freqs.forEach((f, i) => {
    assert.ok(Math.abs(c.rho[k][i] - 100) < 1e-3, `${k} rho at ${f} Hz`);
    assert.ok(Math.abs(c.phs[k][i] - 45) < 1e-4, `${k} phase at ${f} Hz: ${c.phs[k][i]}`);
  });
});

test("field units: the SEG default with no rho in the file; SI from a note in >INFO", () => {
  const f = parseEdi(halfSpaceEdi({ si: false, withRho: false }));
  assert.equal(f.units, "field"); assert.equal(f.unitsFrom, "standard");
  assert.ok(Math.abs(soundingCurves(f).rho.det[2] - 100) < 1e-3);
  const s = parseEdi(halfSpaceEdi({ si: true, withRho: false, info: "NB. All impedances are in SI units." }));
  assert.equal(s.units, "SI"); assert.equal(s.unitsFrom, "info");
  assert.ok(Math.abs(soundingCurves(s).rho.xy[0] - 100) < 1e-3);
  const fr = parseEdi(halfSpaceEdi({ si: false, withRho: true }));
  assert.equal(fr.units, "field"); assert.equal(fr.unitsFrom, "rho");
});

test("frequencies come out ascending whatever ORDER says; EMPTY values are missing", () => {
  const txt = halfSpaceEdi({ order: "DEC" }).replace(/>ZXYR \/\/4\n(\S+)/, ">ZXYR //4\n1.0E+32");
  const e = parseEdi(txt);
  assert.deepEqual(e.freqs, [1, 10, 100, 1000]);
  assert.ok(Number.isNaN(e.z.xy.re[3]), "the first value in the file is the 1000 Hz one (DEC)");
  const c = soundingCurves(e);
  assert.ok(Number.isNaN(c.rho.xy[3]) && Math.abs(c.rho.xy[0] - 100) < 1e-3);
});

test("Niblett–Bostick: a half-space maps to itself at the skin depth over root 2", () => {
  const b = bostick(100, 45, 1);
  assert.ok(Math.abs(b.rho - 100) < 1e-9);
  assert.ok(Math.abs(b.depth - Math.sqrt(100 / (2 * Math.PI * MU0))) < 1e-9);
  assert.ok(Math.abs(b.depth - (503.29 * Math.sqrt(100)) / Math.SQRT2) < 1, `${b.depth}`);
  assert.ok(bostick(100, 60, 1).rho < 100, "a phase over 45 degrees: more conductive at depth");
  assert.equal(bostick(100, 95, 1), null); assert.equal(bostick(100, 0, 1), null); assert.equal(bostick(-1, 45, 1), null);
  assert.ok(Math.abs(foldPhase(-146.5) - 33.5) < 1e-9 && Math.abs(foldPhase(28.3) - 28.3) < 1e-9);
});

test("stations, lines and the depth points under them", () => {
  assert.deepEqual(stationLine("1100N3550"), { line: "1100N", station: "3550" });
  assert.deepEqual(stationLine("L5 st12"), { line: null, station: "L5 st12" });
  assert.equal(parseEdiCoord("-0:30:00"), -0.5); assert.equal(parseEdiCoord("49.5"), 49.5); assert.ok(Number.isNaN(parseEdiCoord("")));
  const a = parseEdi(halfSpaceEdi({ id: "1100N3650" })), b = parseEdi(halfSpaceEdi({ id: "1100N3550" })), c = parseEdi(halfSpaceEdi({ id: "1100N3750", elev: "" }));
  let k = 0;
  const st = ediStations([a, b, c], (lon) => ({ x: 683500 + 100 * k++, y: 5511099 + 0 * lon }));
  assert.equal(st[0].line, "1100N"); assert.equal(st[2].z, null);
  const { rows, noPlace, outside } = bostickPoints(st, "MT soundings (MPD)");
  assert.equal(noPlace, 1); assert.equal(outside, 0); assert.equal(rows.length, 8);
  const r = rows.find((p) => p.station === "1100N3550" && p.freq === 1);
  assert.ok(Math.abs(r.value - 2) < 1e-4 && Math.abs(r.rho - 100) < 0.01, "log10 of 100 ohm.m");
  assert.ok(Math.abs(r.z - (1602.1 - Math.sqrt(100 / (2 * Math.PI * MU0)))) < 1);
  const ord = lineOrder(st);
  assert.deepEqual(ord.map((o) => o.s.id), ["1100N3650", "1100N3550", "1100N3750"], "west to east by position");
  assert.deepEqual(ord.map((o) => Math.round(o.d)), [0, 100, 200]);
  const exact = ediStations([b], () => ({ x: 685046.57, y: 5511098.97 }))[0];
  assert.deepEqual([exact.x, exact.y], [685046.6, 5511099], "UTM coordinates keep 0.1 m, not 5 significant digits");
  assert.deepEqual(sortLines(["1100N", "500N", "900N", "", "L2"]), ["500N", "900N", "1100N", "", "L2"]);
  assert.equal(mtSurveyName([a, b]), "MT soundings (MPD)");
  assert.equal(mtSurveyName([a, parseEdi(halfSpaceEdi({ prospect: "Other" }))]), "MT soundings");
  const merged = mergeStations(st, [{ ...st[0], z: 1500 }]);
  assert.equal(merged.length, 3); assert.equal(merged.find((s) => s.id === "1100N3650").z, 1500);
});

test("files it cannot read say why", () => {
  assert.throws(() => parseEdi(">HEAD\nDATAID=\"x\"\n>=SPECTRASECT\nNFREQ=2\n>SPECTRA FREQ=1 //2\n1 2\n>END\n", "s.edi"), /MT spectra \(>=SPECTRASECT\)/);
  assert.throws(() => parseEdi("hello", "t.edi"), /no >HEAD block/);
  assert.throws(() => parseEdi(">HEAD\nDATAID=\"x\"\n>FREQ //1\n1\n>END\n", "u.edi"), /no off-diagonal impedances/);
});

test("wired: the Geophysics tab reads .edi files into the MT pane; the 3D View points there; the method is labelled", () => {
  assert.equal(unreadableFormatAdvice("500N3550.edi"), null, "no longer refused");
  assert.equal(SURVEY_METHODS.mt_bostick.units, "log₁₀ Ω·m");
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.ok(g.includes('const MtSoundingsPane = React.lazy(() => import("../components/MtSoundingsPane.jsx"));'));
  assert.match(g, /if \(edis\.length\) \{ setMtDrop\(edis\); setGeoPane\("mt"\); \}/);
  assert.match(g, /\{geoPane === "mt" && \(<Suspense fallback=\{null\}><MtSoundingsPane /);
  const p = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.ok(p.includes("MT / AMT soundings are read on the Geophysics tab."));
  const pane = readFileSync(new URL("../src/components/MtSoundingsPane.jsx", import.meta.url), "utf8");
  assert.match(pane, /askAdoptCrs\(\{ isEmpty: projectIsEmpty, currentEpsg: target, declaredEpsg: 4326/);
  assert.match(pane, /updateGeophysSurvey\(name, \{ method: "mt_bostick"/);
});
