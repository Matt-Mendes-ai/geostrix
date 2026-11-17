// TASKS.csv #3817 / #3825 (Scottie Gold leftovers): the clear items. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSolidFile } from "../src/lib/solidImport.js";
import { surveyMetaFor } from "../src/lib/surveyLegendDefault.js";
import { PALETTES } from "../src/lib/layers.js";
import { trendFromDirections, directionSpreadDeg, TREND_MIN_SPREAD_DEG } from "../src/lib/trend.js";
import { directionVector } from "../src/lib/variogram.js";
import { memberMetalColumns } from "../src/lib/setLimits.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// a DXF of 3DFACE entities: two good triangles and one whose corners weld to a line (no area)
const face = (pts) => ["0", "3DFACE", "8", "0", ...pts.flatMap(([x, y, z], k) => [`1${k}`, String(x), `2${k}`, String(y), `3${k}`, String(z)])].join("\n");
const dxf = ["0", "SECTION", "2", "ENTITIES",
  face([[0, 0, 0], [10, 0, 0], [0, 10, 0], [0, 10, 0]]),
  face([[10, 0, 0], [10, 10, 0], [0, 10, 0], [0, 10, 0]]),
  face([[0, 0, 5], [0, 0, 5], [10, 0, 5], [10, 0, 5]]), // two corners at one place: it welds to a line
  "0", "ENDSEC", "0", "EOF"].join("\n");

test("#3817 (#3815 (6)): a DXF's faces with no area are counted and said; its counts carry separators", () => {
  const r = parseSolidFile("synthetic_shell.dxf", dxf);
  assert.equal(r.nFaceEntities, 3);
  assert.equal(r.nFlatFaces, 1);
  assert.equal(r.triangleCount, 2);
  assert.equal(r.note, "3 3DFACE entities (1 with no area left out: their corners weld to a line or a point)");
  assert.match(read("../src/lib/solidImport.js"), /m\.nFaceEntities\.toLocaleString\("en-US"\)/);
});

test("#3817 (#3815 (3)): a resistivity survey opens on the resistivity ramp (low = red), a conductivity survey on its reverse", () => {
  const vals = Array.from({ length: 200 }, (_, i) => 5 * 1.04 ** i); // 5 to about 12,000 ohm-m
  const res = surveyMetaFor("res", vals).legend.stops, cond = surveyMetaFor("em_cond", vals).legend.stops;
  assert.equal(res[0].color.toLowerCase(), PALETTES.resistivity.colors[0].toLowerCase(), "the lowest resistivity is the ramp's red");
  assert.equal(res.at(-1).color.toLowerCase(), PALETTES.resistivity.colors.at(-1).toLowerCase());
  assert.equal(cond[0].color.toLowerCase(), PALETTES.resistivity.colors.at(-1).toLowerCase(), "conductivity: reversed");
  assert.equal(surveyMetaFor("ip", vals).legend, undefined, "chargeability as before");
});

test("#3825 (#3787): no trend from directions that do not open far enough apart; the reason is said", () => {
  // the fans sampled three directions within 40 degrees: a 'short' axis from them is the least-sampled direction, not the body's
  const narrow = [{ azimuth: 0, dip: 0, range: 400 }, { azimuth: 20, dip: 10, range: 250 }, { azimuth: 40, dip: 0, range: 100 }];
  assert.ok(directionSpreadDeg(narrow, directionVector) < TREND_MIN_SPREAD_DEG);
  assert.equal(trendFromDirections(narrow, directionVector), null);
  const wide = [{ azimuth: 90, dip: 0, range: 500 }, { azimuth: 0, dip: 0, range: 100 }, { azimuth: 0, dip: 90, range: 50 }];
  assert.ok(Math.abs(directionSpreadDeg(wide, directionVector) - 90) < 1e-9);
  assert.ok(trendFromDirections(wide, directionVector));
  assert.match(read("../src/components/VariogramModal.jsx"), /fitted\.length >= 2 && sp < TREND_MIN_SPREAD_DEG \? <div/);
});

test("#3825 (#3788): a member mostly on the detection floor gets no contained metal (table and CSV)", () => {
  const rows = [{ cutoff: 0.5, means: [{ mean: 2, tonnes: 1000 }, { mean: 1, tonnes: 1000 }] }];
  const out = memberMetalColumns(rows, [{ element: "Au", unit: "ppm" }, { element: "Ag", unit: "ppm", skipMetal: true }], { rho: 2.7 });
  assert.ok(Object.keys(out[0]).some((k) => k.startsWith("Au_")));
  assert.ok(!Object.keys(out[0]).some((k) => k.startsWith("Ag_")), "Ag left out");
  const g = read("../src/components/GradeTonnageModal.jsx");
  assert.match(g, /const floorHeavy = new Set\(floorKept\.filter\(\(f\) => Number\(f\.sharePct\) > 50\)\.map\(\(f\) => f\.symbol\)\);/);
  assert.match(g, /members\.map\(\(m\) => \(floorHeavy\.has\(m\.element\) \? \[\] : metalColumns\(/);
  assert.match(g, /more than half of the results are on the floor, so no contained metal is given for them/);
});

test("wiring: the drop notice leaves with its pane; Values are from a UBC file's name; Spatial analysis counts; Surface query offers stepped estimates", () => {
  const geo = read("../src/modules/GeophysicsModule.jsx");
  assert.match(geo, /useEffect\(\(\) => \{ setRasterError\(\(e\) => \(e\?\.dropPane && e\.dropPane !== geoPane \? null : e\)\); \}, \[geoPane\]\);/);
  assert.match(geo, /dropPane: edis\.length \? "mt" : geoPane/);
  assert.match(geo, /const guessed = guessVoxelProperty\(modelFile\.name\);/);
  assert.match(geo, /addVoxelModel\(\{ name: modelName, source: "ubc", cells, min, max, \.\.\.\(guessed \? \{ property: guessed \} : \{\}\)/);
  assert.match(read("../src/components/SpatialAnalysis.jsx"), /value=\{fmtNum\(stats\.n\)/);
  assert.match(read("../src/components/SurfaceQueryModal.jsx"), /!\(m\.colorMode === "discrete" && m\.valueLabels\)/);
});

test("#3852 (#3809): one model off a lattice can be worked alone; joining it is refused with the reason", async () => {
  const { blockCalc, joinRefusal } = await import("../src/lib/blockCalc.js");
  // a UBC-style mesh with two cell heights: not one regular grid
  const cells = [{ x: 5, y: 5, z: 5, dx: 10, dy: 10, dz: 10, value: 0.01 }, { x: 5, y: 5, z: 12.5, dx: 10, dy: 10, dz: 5, value: 0.002 }, { x: 15, y: 5, z: 5, dx: 10, dy: 10, dz: 10, value: 0 }];
  const m = { name: "synthetic conductivity", cells };
  assert.equal(joinRefusal(null, m, { first: true }), null, "the first and only input");
  assert.match(joinRefusal(null, m), /not one regular grid/);
  assert.match(joinRefusal(null, { cells: [{ x: 0, y: 0, z: 0, dx: 1, dy: 1, dz: 1, value: 1 }] }, { firstIrregular: true }), /worked alone/);
  const r = await blockCalc([{ var: "c", model: m }], "1 / c");
  assert.deepEqual(r.cells.map((c) => c.value), [100, 500]);
  assert.equal(r.blank, 1, "1 / 0 gives no number");
  assert.deepEqual([r.cells[1].dz, r.cells[1].z], [5, 12.5], "each block as it is");
});

test("#3825 (#3792 (2)): a precious-metal equivalent reports kg and troy oz, as the metal it is named after", async () => {
  const { metalColumns, metalOf } = await import("../src/lib/gradeTonnage.js");
  const keys = (el) => metalColumns(metalOf("g/t"), el).map((c) => c.key);
  assert.deepEqual(keys("AuEq (Au + Ag/80)"), ["metal_kg", "metal_oz"]);
  assert.deepEqual(keys("AgEq"), ["metal_kg", "metal_oz"]);
  assert.deepEqual(keys("Equant"), ["metal_t"], "a name that only starts with Eq is not one");
});

test("#3852 (#3833): an .xyz file dropped on the Maps plan goes to the Geophysics tab's import", () => {
  const m = read("../src/modules/MapsModule.jsx");
  assert.match(m, /const xyzFiles = all\.filter\(\(f\) => \/\\.xyz\$\/i\.test\(f\.name\)\);/);
  assert.match(m, /goToModule\?\.\("geophysics"\); requestModuleAction\("geophysics-drop", \{ files: xyzFiles \}\);/);
});
