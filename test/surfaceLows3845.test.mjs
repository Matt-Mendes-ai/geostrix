// TASKS.csv #3845 (a mean of two readings offered as a trend), #3846 (Interpret has a Vein line; the legend lists the types in use), #3847 (strike typed, out-of-range bearings counted),
// #3848 (holes from one pad are one site in the outline), #3849 (a typed depth ignores the late-start rule), #3850 (every repeating unit named), #3851 (slips 1, 3, 5, 6, 9). Synthetic only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TREND_MIN_PICKS, TREND_MAX_ALPHA95 } from "../src/lib/stereonetGroups.js";
import { fisherStats } from "../src/lib/stereonet.js";
import { INTERPRETATION_TYPES, interpretationLayer, addInterpretationLine, attitudeOf } from "../src/lib/interpretation.js";
import { parseStructureRows, guessStructureColumns } from "../src/lib/mapStructures.js";
import { mergePads, outlineLayer, defaultReach, PAD_M } from "../src/lib/subcropOutlines.js";
import { collarSubcrop } from "../src/lib/collarSubcrop.js";
import { surfaceFlatRule } from "../src/lib/viewer/surfacePlacement.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const hasKeys = (keys) => { for (const k of keys) for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 50)}`); };

test("#3845 two readings (a cone of the whole hemisphere) are too few to offer as a trend", () => {
  assert.equal(TREND_MIN_PICKS, 4); assert.equal(TREND_MAX_ALPHA95, 45);
  const two = fisherStats([{ dip: 64, azimuth: 284 }, { dip: 40, azimuth: 120 }]);
  assert.ok(two.n < TREND_MIN_PICKS);
  const tight = fisherStats(Array.from({ length: 8 }, (_, i) => ({ dip: 70 + (i % 3), azimuth: 100 + (i % 4) })));
  assert.ok(tight.n >= TREND_MIN_PICKS && tight.alpha95 <= TREND_MAX_ALPHA95, String(tight.alpha95));
  const m = read("../src/components/StereonetModal.jsx");
  assert.match(m, /const tooFew = !!stats && \(stats\.n < TREND_MIN_PICKS \|\| stats\.alpha95 > TREND_MAX_ALPHA95\) && !isGirdle;/);
  assert.match(m, /const noTrend = \(!!stats\?\.noPreferred && !isGirdle\) \|\| tooFew;/);
  assert.match(m, /Pick one structure type or one area first\./); // the outcrop wording: no holes, no domain
  hasKeys(["Disabled: {n} reading(s) with a 95 % cone of {a}° are too few or too scattered to call a trend (at least {min} readings and a cone of {max}° or less). Add readings, or pick the type or area with more.",
    "Disabled: these picks show no preferred orientation (k = {k}, at the level of random planes), so their mean plane is not a trend to model. Pick one structure type or one area first."]);
});

test("#3846 Interpret has Vein and Vein zone lines; a layer's legend lists only the types in use", () => {
  assert.ok(INTERPRETATION_TYPES.some((t) => t.value === "vein" && t.label === "Vein"));
  assert.ok(INTERPRETATION_TYPES.some((t) => t.value === "vein_zone" && t.label === "Vein zone"));
  assert.deepEqual(attitudeOf("vein"), ["dip", "dip_dir", "Dip", "Dip direction"]);
  let l = interpretationLayer("Lines");
  assert.equal(l.categories.length, INTERPRETATION_TYPES.length); // an empty layer lists them all (the pane's own picker is the list)
  l = addInterpretationLine(l, [{ x: 0, y: 0 }, { x: 100, y: 0 }], { type: "shear" });
  assert.deepEqual(l.categories.map((c) => c.value), ["shear"]); assert.equal(l.categories[0].count, 1);
  l = addInterpretationLine(l, [{ x: 0, y: 10 }, { x: 100, y: 10 }], { type: "vein", name: "V1" });
  assert.deepEqual(l.categories.map((c) => c.value), ["shear", "vein"]);
  l.categories = l.categories.map((c) => (c.value === "vein" ? { ...c, color: "#123456" } : c));
  l = addInterpretationLine(l, [{ x: 0, y: 20 }, { x: 100, y: 20 }], { type: "vein" });
  assert.equal(l.categories.find((c) => c.value === "vein").color, "#123456"); // a recoloured category keeps its colour
  assert.equal(l.categories.find((c) => c.value === "vein").count, 2);
  hasKeys(["Vein zone"]);
});

test("#3847 a strike or dip direction outside 0 to 360 is counted, not stored as 100; the typed form and the template take a strike", () => {
  const cols = guessStructureColumns(["Easting", "Northing", "Strike", "Dip", "Type"]);
  const out = parseStructureRows([{ Easting: 1, Northing: 1, Strike: 370, Dip: 64, Type: "Vein" }, { Easting: 2, Northing: 1, Strike: 10, Dip: 64, Type: "Vein" }], cols, {});
  assert.equal(out.rows.length, 1); assert.equal(out.skipWhy.badBearing, 1); assert.equal(out.rows[0].dipDir, 100);
  const dd = parseStructureRows([{ Easting: 1, Northing: 1, DipDir: 400, Dip: 10 }], guessStructureColumns(["Easting", "Northing", "DipDir", "Dip"]), {});
  assert.equal(dd.rows.length, 0); assert.equal(dd.skipWhy.badBearing, 1);
  const p = read("../src/components/SurfaceMappingPanel.jsx");
  assert.match(p, /w\.badBearing && tr\("\{n\} with a dip direction or strike outside 0 to 360 \(a typing slip\)"/);
  assert.match(p, /<div key="strike" style=\{row\}>/);
  assert.match(p, /The strike must be from 0 to 360° \(typed: \{v\}\)\./);
  assert.ok(p.includes("Dip direction,Strike,Comments\\r\\n"));
  hasKeys(["{n} with a dip direction or strike outside 0 to 360 (a typing slip)", "or the strike (right-hand rule)", "The strike must be from 0 to 360° (typed: {v}).",
    "Type at least the easting, northing, dip and the dip direction or the strike (a horizontal reading, dip 0, needs no direction).", "Strike (right-hand rule: the dip is 90° clockwise of it)"]);
});

test("#3848 three holes within 2 m are one pad (the commoner unit); pads that disagree are counted; the outline has one cell for the pad", () => {
  const pts = [
    { x: 0, y: 0, unit: "DIO", hole_id: "DH23-300", cover: 0 }, { x: 1.5, y: 0.5, unit: "AND", hole_id: "DH23-301", cover: 1.5 }, { x: 1.9, y: 0, unit: "AND", hole_id: "DH23-302", cover: 1.9 },
    { x: 100, y: 0, unit: "AND", hole_id: "A" }, { x: 200, y: 0, unit: "SLT", hole_id: "B" }, { x: 200.5, y: 0, unit: "SLT", hole_id: "C" },
  ];
  const m = mergePads(pts);
  assert.equal(m.points.length, 3); assert.equal(m.pads, 2); assert.equal(m.disagree, 1);
  const pad = m.points[0]; assert.equal(pad.unit, "AND"); assert.equal(pad.hole_id, "DH23-300 +2"); assert.equal(pad.cover, 1.5);
  assert.match(m.examples[0], /^DH23-300 \+2: AND 2, DIO 1$/);
  assert.equal(PAD_M, 3);
  assert.equal(mergePads([{ x: 0, y: 0, unit: "A" }, { x: 10, y: 0, unit: "B" }]).pads, 0);
  const layer = outlineLayer(pts, "Outlines", () => "#888", { reachM: 90 });
  assert.equal(layer.features.length, 3); assert.deepEqual(layer.padsMerged, { pads: 2, disagree: 1, examples: m.examples });
  assert.equal(outlineLayer(pts, "x", () => "#888", { reachM: 90, padM: 0 }).features.length, 6); // padM 0: every point its own cell
  assert.ok(defaultReach(mergePads(pts).points) > 0);
  const p = read("../src/components/SurfaceMappingPanel.jsx");
  assert.match(p, /reach: String\(defaultReach\(mergePads\(pts\)\.points\)\)/);
  hasKeys(["{n} pad(s) with holes within {m} m of each other count as one site each (the commoner unit); {d} of them met different units ({ex})."]);
});

test("#3849 at a typed depth every hole logged there gives a point, a late-starting log or not", () => {
  const collars = [{ hole_id: "LATE", x: 0, y: 0, z: 100, azimuth: 0, dip: -90 }, { hole_id: "FAR", x: 50, y: 0, z: 100, azimuth: 0, dip: -90 }, { hole_id: "OK", x: 100, y: 0, z: 100, azimuth: 0, dip: -90 }];
  const litho = [{ hole_id: "LATE", from: 15, to: 40, value: "AND" }, { hole_id: "FAR", from: 36, to: 80, value: "AND" }, { hole_id: "OK", from: 0, to: 6, value: "OVB" }, { hole_id: "OK", from: 6, to: 60, value: "DIO" }];
  const rep = { lateStart: [], gap: [] };
  const at20 = collarSubcrop({ collars, survey: [], litho, atDepthM: 20, report: rep });
  assert.deepEqual(at20.map((p) => p.hole_id).sort(), ["LATE", "OK"]); assert.equal(rep.notAtDepth, 1); assert.deepEqual(rep.lateStart, []);
  const rep2 = { lateStart: [], gap: [] };
  const under = collarSubcrop({ collars, survey: [], litho, report: rep2 });
  assert.deepEqual(under.map((p) => p.hole_id), ["OK"]); assert.deepEqual(rep2.lateStart.map((h) => h.hole_id).sort(), ["FAR", "LATE"]); // the under-cover map still leaves them out
});

test("#3850 every other repeating unit is named with its counts, the larger first", () => {
  const m = read("../src/components/MapModelPanel.jsx");
  assert.match(m, /\.slice\(1\)\.sort\(\(a, b\) => b\[1\]\.runs - a\[1\]\.runs\)\.slice\(0, 5\)/);
  assert.match(m, /Also met more than once down the holes: \{list\}\./);
  hasKeys(["Also met more than once down the holes: {list}. A unit that repeats like this is the host between sheets, or an overprint (an alteration or deformation zone), not a bed: its contacts here are not stratigraphic tops.", "{unit} ({r} times in {h} hole(s), up to {max} in one)"]);
});

test("#3851 slips: a repeated header row, the zero-elevation rule, the CRS sentence", () => {
  const cols = guessStructureColumns(["Easting", "Northing", "Strike", "Dip", "Type"]);
  const out = parseStructureRows([{ Easting: 1, Northing: 1, Strike: 10, Dip: 40, Type: "STRUCTURE" }, { Easting: "Easting", Northing: "Northing", Strike: "Strike", Dip: "Dip", Type: "Type" }, { Easting: "", Northing: "", Strike: 5, Dip: 30, Type: "LINEATION" }], cols, {});
  assert.equal(out.rows.length, 1); assert.equal(out.skipWhy.repeatedHeader, 1); assert.equal(out.skipWhy.noXY, 1);
  assert.equal(surfaceFlatRule([], false, [{ x: 1, y: 1 }]), "zero");
  assert.equal(surfaceFlatRule([], false, [{ x: 1, y: 1, z: 30 }]), "samples");
  assert.equal(surfaceFlatRule([{ z: 100 }], false, [{ x: 1, y: 1 }]), "collars"); assert.equal(surfaceFlatRule([], false), "samples");
  assert.match(read("../src/modules/viewer/SurfacePlacementNotices.jsx"), /counts\.flatRule === "zero" \? tr\("\{n\} surface sample\(s\) have no elevation, and no collar or sample gives one: drawn flat at 0 m\./);
  assert.match(read("../src/components/ProjectCrsModal.jsx"), /Choose the CRS your coordinates \(collars, samples, maps\) are in\./);
  const p = read("../src/components/SurfaceMappingPanel.jsx");
  assert.match(p, /const usable = parseStructureRows\(pendingStruct\.rows, pendingStruct\.cols, project\?\.structureCodeClasses\)\.rows;/); // only the codes of the rows that are imported
  hasKeys(["{n} repeated header row(s) inside the file", "{n} surface sample(s) have no elevation, and no collar or sample gives one: drawn flat at 0 m. Load a terrain (Maps > Terrain) to place them on the ground.",
    "Not set yet. Choose the CRS your coordinates (collars, samples, maps) are in."]);
});
