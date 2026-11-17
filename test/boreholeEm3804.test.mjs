// TASKS.csv #3804 (Scottie Gold geophysics review; a gap in #3320) — a borehole EM .tem file (decay channels CH1..CH25, several components per station, a fixed loop)
// was read by 'Import survey .xyz' as a ground magnetic survey and by EM > TEM line data as '736 stations on 1 line'. Both now say what it is: no table of points,
// and for borehole EM no reader yet. Synthetic files only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emDecayChannels, boreholeEmClues, emPointRefusal, boreholeEmRefusal } from "../src/lib/boreholeEm.js";
import { tableRefusal } from "../src/lib/tableRefusal.js";
import { parseXYZ } from "../src/lib/geosoft.js";
import { readTemText } from "../src/lib/temLines.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const gates = (n) => Array.from({ length: n }, (_, i) => `CH${i + 1}`);
// a borehole file: three components per station down a hole
function boreholeTem(withHeader = true) {
  const cols = ["X", "Y", "RL", "COMPONENT", "RAWMAG", ...gates(12)];
  const lines = withHeader ? ["/ Borehole EM, DH21-93, fixed loop", "/" + cols.join(" ")] : ["/" + cols.join(" ")];
  for (let st = 0; st < 6; st++) for (const comp of ["X", "Y", "Z"]) lines.push(["531797.6", "5531479.7", String(1245 - st * 20), comp === "X" ? "1" : comp === "Y" ? "2" : "3", "48000", ...gates(12).map((_, k) => (100 / (k + 1)).toFixed(3))].join(" "));
  return lines.join("\n");
}
// an airborne line file: one row per station, no component, no hole
function airborneTem() {
  const cols = ["X", "Y", "Z", "LINE", ...gates(12)];
  const lines = ["/" + cols.join(" ")];
  for (let i = 0; i < 20; i++) lines.push(["Line 100".length ? `${531000 + i * 50}` : "", `${5531000 + i}`, "120", "100", ...gates(12).map((_, k) => (50 / (k + 1)).toFixed(3))].join(" "));
  return lines.join("\n");
}

test("decay channels are CH1..CHn of six gates or more; a plain survey has none", () => {
  const d = emDecayChannels(["X", "Y", "RL", ...gates(25)]);
  assert.equal(d.n, 25); assert.equal(d.first, "CH1"); assert.equal(d.last, "CH25");
  assert.equal(emDecayChannels(["X", "Y", "Z", "RAWMAG", "DIURNAL"]), null);
  assert.equal(emDecayChannels(["X", "Y", ...gates(4)]), null); // under six gates: not a decay
});

test("the clues of a borehole file: a component column, a hole or depth column, a header that says borehole, a station read for each component", () => {
  const g = parseXYZ(boreholeTem());
  const clues = boreholeEmClues(g.columns, g.rows, boreholeTem());
  assert.ok(clues.some((c) => /component column \(COMPONENT\)/.test(c)), clues.join("|"));
  assert.ok(clues.some((c) => /header that says borehole/.test(c)));
  assert.ok(clues.some((c) => /station repeated for several components/.test(c)));
  const noHeader = parseXYZ(boreholeTem(false));
  assert.ok(boreholeEmClues(noHeader.columns, noHeader.rows, "").length >= 2);
  assert.deepEqual(boreholeEmClues(["X", "Y", "HOLE", ...gates(8)], [], "").map((c) => c.replace(/ \(.*/, "")), ["a hole column"]);
  const a = parseXYZ(airborneTem()); assert.deepEqual(boreholeEmClues(a.columns, a.rows, airborneTem()), []);
});

test("'Import survey .xyz' / 'Import CSV' refuse a decay-channel file, borehole or not, in words", () => {
  const g = parseXYZ(boreholeTem());
  const r = tableRefusal("DH21-93.tem", g.columns, g.rows, "point", boreholeTem());
  assert.match(r, /^"DH21-93\.tem" is a borehole EM file \(.*decay channels CH1 … CH12, 12 gates\), not a table of points/);
  assert.match(r, /no reader for borehole EM yet/);
  const a = parseXYZ(airborneTem());
  assert.match(tableRefusal("line.xyz", a.columns, a.rows, "point", airborneTem()), /is a multi-channel EM file .* Read it with EM › TEM line data\./);
  const mag = parseXYZ("/X Y Z RAWMAG\n1 2 3 4\n5 6 7 8\n9 1 2 3\n"); assert.equal(tableRefusal("m.xyz", mag.columns, mag.rows, "point", ""), null);
  assert.equal(emPointRefusal("x", ["a", "b"], []), null);
});

test("EM > TEM line data refuses borehole EM and still reads an airborne line file", () => {
  assert.throws(() => readTemText(boreholeTem(), "DH21-93.tem"), /is borehole EM \(.*\)\. TEM line data reads airborne and ground line surveys, not a hole/);
  const ok = readTemText(airborneTem(), "line.xyz");
  assert.equal(ok.n, 20); assert.ok(ok.groups.length >= 1);
  const g = parseXYZ(boreholeTem());
  assert.equal(boreholeEmRefusal("a.tem", g.columns, g.rows, boreholeTem()).includes("borehole EM"), true);
  assert.equal(boreholeEmRefusal("a.xyz", ["X", "Y", "RAWMAG"], [], ""), null);
});

test("wired: the picker's refusal gets the file's head; the several-files route refuses too; keys in every language", () => {
  const m = read("../src/modules/GeophysicsModule.jsx");
  assert.match(m, /tableRefusal\(file\.name, columns, sample, "point", head\)/);
  assert.match(m, /tableRefusal\(file\.name, columns, parsedRows, "point", text\)/);
  assert.match(m, /tableRefusal\(files\[0\]\.name, columns, parsedRows, "point", text\)/);
  for (const k of ["a component column ({col})", "a header that says borehole", "each station repeated for several components",
    "\"{name}\" is borehole EM ({clues}; decay channels {first} … {last}, {n} gates). TEM line data reads airborne and ground line surveys, not a hole: GeoStrix has no reader for borehole EM yet."])
    for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 40)}`);
});
