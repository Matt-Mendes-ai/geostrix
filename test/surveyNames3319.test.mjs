// TASKS.csv #3319 (Galore Creek review: the Extension grid's IP.xyz replaced the Main grid's 245,066-point IP.xyz without a question; the
// IP and resistivity files chosen together imported only the first) — the same file read again still replaces it (#600); a file of the same
// name with another row count or extent is asked about and may be kept beside it as 'IP.xyz (2)'; a survey can be renamed; a file of a
// multi-file import without the chosen value column takes its only other numeric column.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sameSurveyFile, surveyNameClashes, uniqueSurveyKey, renameSurvey, soleValueColumn, surveyExtent, replaceSurveyPoints } from "../src/lib/geophysSurveys.js";

const grid = (n, x0, y0, src, step = 25) => Array.from({ length: n }, (_, i) => ({ x: x0 + (i % 100) * step, y: y0 + Math.floor(i / 100) * step, z: 1000, value: i, _src: src }));
const main = grid(5000, 400000, 6300000, "IP.xyz"), again = main.map((r) => ({ ...r })), ext = grid(830, 404000, 6302000, "IP.xyz");

test("the same file read again is the same survey; the Extension grid of the same name is not", () => {
  assert.equal(sameSurveyFile(main, again), true);
  assert.equal(sameSurveyFile(main, ext), false);
  assert.equal(sameSurveyFile(main, grid(5000, 404000, 6302000, "IP.xyz")), false, "the same count elsewhere");
  assert.deepEqual(surveyNameClashes([...main, ...grid(10, 0, 0, "Res.xyz")], again), []);
  const c = surveyNameClashes(main, ext);
  assert.equal(c.length, 1); assert.equal(c[0].key, "IP.xyz"); assert.equal(c[0].loaded.n, 5000); assert.equal(c[0].incoming.n, 830);
  assert.deepEqual(surveyExtent(ext), { n: 830, xmin: 404000, xmax: 404000 + 99 * 25, ymin: 6302000, ymax: 6302000 + 8 * 25 });
});

test("kept beside it under a second name, the loaded one untouched; a rename moves the points and the survey's metadata", () => {
  assert.equal(uniqueSurveyKey("IP.xyz", ["IP.xyz"]), "IP.xyz (2)");
  assert.equal(uniqueSurveyKey("IP.xyz", new Set(["IP.xyz", "IP.xyz (2)"])), "IP.xyz (3)");
  assert.equal(uniqueSurveyKey("Res.xyz", ["IP.xyz"]), "Res.xyz");
  const kept = ext.map((r) => ({ ...r, _src: "IP.xyz (2)" }));
  const both = replaceSurveyPoints(main, kept);
  assert.equal(both.replaced, 0); assert.equal(both.rows.length, 5830);
  const r = renameSurvey(both.rows, { "IP.xyz (2)": { method: "ip", units: "mV/V" }, "IP.xyz": { method: "ip" } }, "IP.xyz (2)", "IP (extension)");
  assert.equal(r.rows.filter((x) => x._src === "IP (extension)").length, 830);
  assert.equal(r.rows.filter((x) => x._src === "IP.xyz").length, 5000);
  assert.deepEqual(r.surveys, { "IP (extension)": { method: "ip", units: "mV/V" }, "IP.xyz": { method: "ip" } });
  assert.equal(r.rows[0], both.rows[0], "the other survey's rows are the same objects");
});

test("a file without the chosen value column takes its only other numeric column; none or several: none", () => {
  const rows = [{ X: "1", Y: "2", Z: "3", AppRho: "120.5", Line: "1" }, { X: "1", Y: "3", Z: "3", AppRho: "98", Line: "1" }];
  assert.equal(soleValueColumn(["X", "Y", "Z", "AppRho", "Line"], rows, ["X", "Y", "Z"]), "AppRho");
  assert.equal(soleValueColumn(["X", "Y", "AppRho", "AppMx"], rows.map((r) => ({ ...r, AppMx: "5" })), ["X", "Y"]), null, "two candidates");
  assert.equal(soleValueColumn(["X", "Y", "Name"], rows.map((r) => ({ ...r, Name: "A1" })), ["X", "Y"]), null, "text only");
  assert.equal(soleValueColumn(["Easting", "Northing", "Elevation", "Time", "Chg"], [{ Easting: 1, Northing: 2, Elevation: 3, Time: 4, Chg: 5 }], []), "Chg", "position / time columns are never the value");
});

test("wired: asked on the single, multi-file and CSV imports; the method from each file's own column; the rename on the card", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal((g.match(/keepOrReplace\((mapped|points|good)\)/g) || []).length, 3);
  assert.match(g, /if \(columns\.includes\(xCol\) && columns\.includes\(yCol\) && !columns\.includes\(valueCol\)\) \{ const alt = soleValueColumn\(columns, raw, \[xCol, yCol, zCol\]\);/);
  assert.match(g, /value: r\[vCol\]/);
  assert.match(g, /guessSurveyMethodFrom\(colOf\.get\(orig\) \|\| valueCol,/);
  assert.match(g, /aria-label=\{tr\("Rename survey \\"\{key\}\\"", \{ key: sv\.key \}\)\}/);
  assert.match(g, /const out = renameSurvey\(rows, geophysSurveys, from, name\);/);
});
