// TASKS.csv #3843 (Scottie Gold surface geology review) — the Stereonet could not take one area or one class of outcrop readings: 'Vein' (65) and 'Vein Zone' (6) were two types, the import kept
// no Zone, and a trend made from the mean was 'Stereonet mean (81° → 16°)'. Synthetic readings only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { surfacePicksOf, classEntries, areaEntries, keepPick, trendLabel, stereonetTrendName } from "../src/lib/stereonetGroups.js";
import { guessStructureColumns, parseStructureRows } from "../src/lib/mapStructures.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const hasKeys = (keys) => { for (const k of keys) for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 50)}`); };

const table = [
  { Station: "A", Easting: 1, Northing: 1, Strike: 270, Dip: 80, Type: "Vein", Zone: "Steep" },
  { Station: "B", Easting: 2, Northing: 1, Strike: 275, Dip: 82, Type: "Vein", Zone: "Steep" },
  { Station: "C", Easting: 3, Northing: 1, Strike: 260, Dip: 70, Type: "Vein Zone", Zone: "Low Tide" },
  { Station: "D", Easting: 4, Northing: 1, Strike: 30, Dip: 60, Type: "Shear", Zone: "Low Tide" },
  { Station: "E", Easting: 5, Northing: 1, Strike: 90, Dip: 20, Type: "Bedding", Zone: "" },
];

test("#3843 the import keeps the Zone / Area column on each reading", () => {
  const headers = Object.keys(table[0]);
  const cols = guessStructureColumns(headers);
  assert.equal(cols.group, "Zone");
  assert.equal(guessStructureColumns(["Easting", "Northing", "Dip", "Strike", "Prospect"]).group, "Prospect");
  assert.equal(guessStructureColumns(["Easting", "Northing", "Dip", "Strike"]).group, null);
  const out = parseStructureRows(table, cols, {});
  assert.deepEqual(out.rows.map((r) => r.group), ["Steep", "Steep", "Low Tide", "Low Tide", undefined]);
  // no group column picked: no group key
  assert.equal("group" in parseStructureRows(table, { ...cols, group: null }, {}).rows[0], false);
});

test("#3843 a class lists its types together; an area cuts the net; a trend is named for what it is", () => {
  const cols = guessStructureColumns(Object.keys(table[0]));
  const rows = parseStructureRows(table, cols, {}).rows;
  const picks = surfacePicksOf([{ rows }]);
  assert.equal(picks.length, 5); assert.equal(picks[0].cls, "vein"); assert.equal(picks[0].group, "Steep"); assert.equal(picks[0].outcrop, true);
  const classes = classEntries(picks);
  assert.deepEqual(classes.map((c) => [c.key, c.n, c.types]), [["class:vein", 3, 2]]); // Vein + Vein Zone; Shear and Bedding are one type each: no class entry
  assert.deepEqual(areaEntries(picks), [{ key: "Low Tide", n: 2 }, { key: "Steep", n: 2 }]);
  assert.deepEqual(areaEntries(picks.filter((p) => p.group === "Steep")), []); // one area: nothing to cut
  assert.equal(picks.filter((p) => keepPick(p, "class:vein")).length, 3);
  assert.equal(picks.filter((p) => keepPick(p, "class:vein", "Steep")).length, 2);
  assert.equal(picks.filter((p) => keepPick(p, "vein zone", "all")).length, 1);
  assert.equal(picks.filter((p) => keepPick(p, "all", "Low Tide")).length, 2);
  assert.equal(picks.filter((p) => keepPick(p, "all", "all")).length, 5);
  assert.equal(trendLabel({ typeLabel: "Vein", area: null, n: 65, k: 3.66, outcropOnly: true }), "Vein, 65 outcrop readings, k 3.7");
  assert.equal(trendLabel({ typeLabel: "Vein", area: "Steep", n: 1, k: Infinity, outcropOnly: false }), "Vein, Steep, 1 reading");
  assert.equal(stereonetTrendName({ terzaghi: false, dip: 80.7, azimuth: 15.9, label: "Vein, 65 outcrop readings, k 3.7" }), "Mean of Vein, 65 outcrop readings, k 3.7 (81° → 16°)");
  assert.equal(stereonetTrendName({ terzaghi: true, dip: 80.7, azimuth: 15.9 }), "Stereonet mean (Terzaghi-weighted) (81° → 16°)");
  // the trends pane still treats the new name as an automatic one
  assert.match("Mean of Vein, 65 outcrop readings, k 3.7 (81° → 16°)", /^(Stereonet mean|Mean of .+|Plane of .+) \(\d+° → \d+°\)$/);
});

test("#3843 wired: the modal offers the class and the area, a class is not 'pooled types', the trend carries its name", () => {
  const m = read("../src/components/StereonetModal.jsx");
  assert.match(m, /\{classList\.map\(\(c\) => <option key=\{c\.key\} value=\{c\.key\}>\{tr\("\{type\} \(all \{n\}\)"/);
  assert.match(m, /\{areaList\.length > 0 && \(/);
  assert.match(m, /const pooledTypes = typeFilter === "all" && types\.length > 1;/); // a class or one type is not pooled
  assert.match(m, /!classList\.some\(\(c\) => c\.key === typeFilter\)/); // the validity effect keeps a class
  assert.match(m, /name: stereonetTrendName\(\{ terzaghi: !!terzaghiOn, dip: stats\.meanDip, azimuth: stats\.meanDipDir, label: trendLabel\(/);
  const v = read("../src/modules/ViewerModule.jsx");
  assert.match(v, /surfaceSets=\{surfaceStructures \|\| \[\]\}/);
  assert.match(v, /onUseAsTrend=\{\(\{ azimuth, dip, terzaghi, name \}\) => \{/);
  assert.match(read("../src/components/SurfaceMappingPanel.jsx"), /\["group", tr\("Area \/ zone"\)\]/);
  hasKeys(["Area / zone", "All areas", "Area of the readings", "{type} (all {n})"]);
});
