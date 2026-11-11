// TASKS.csv #2270 (rose count), #2271 (Identify labels), #2272 (one-level ribbon), #2273 (hover text), #2274 (Interpret wording, shear zone),
// #2275 (CRS list on a tied local grid) — review #2174, Surface Geology
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { structureIdentifyFields, recordedElevationField } from "../src/lib/viewer/identify.js";
import { surfaceSampleTip } from "../src/lib/viewer/sampleTip.js";
import { INTERPRETATION_TYPES, attitudeOf } from "../src/lib/interpretation.js";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("#2270 — the rose's own count beside a dip filter", () => {
  assert.match(src("../src/components/StereonetModal.jsx"), /view === "rose" && rose && roseMinDip > 0 && <span[^>]*>\{tr\("· the rose counts \{n\} of \{m\} plane\(s\): those dipping \{d\}° or more"/);
});

test("#2271 — a disc: labels, the class by name, the recorded elevation; no internal keys", () => {
  const f = structureIdentifyFields({ x: 32192, y: 808512, z: 400, dip: 66, dipDir: 74, type: "SH", cls: "other", station: "WS027", comment: "synthetic", zFlat: true });
  assert.deepEqual(f.map(([k]) => k), ["Dip", "Dip direction", "Class", "Type", "Station", "Comment", "Elevation"]);
  assert.ok(!f.some(([k]) => /^(cls|zFlat|x|y|z)$/.test(k)));
  assert.deepEqual(recordedElevationField({ z: 400 }), ["Elevation (recorded)", "400 m"]);
  assert.deepEqual(recordedElevationField({ z: 192.55, zFlat: true }), ["Elevation", "none in the file: drawn flat at 192.6 m"]);
  assert.match(src("../src/lib/viewer/identify.js"), /attributeFields\(row, new Set\(\[\.\.\.SKIP, "attrs", \.\.\.PLACEMENT_KEYS\]\)\), recordedElevationField\(row\)/);
});

test("#2272 — the ribbon tells the toggle it has one level; the CSS hides it", () => {
  assert.match(src("../src/components/Ribbon.jsx"), /const levels = el\.querySelector\("\.ge-adv"\) \? "2" : "1";/);
  assert.match(src("../src/styles/app.css"), /\.ge-ribbon\[data-levels="1"\] \+ \.ge-ui-mode \{ visibility: hidden; \}/);
});

test("#2273 — a flat sample with a terrain loaded is not said to have 'no terrain'", () => {
  const base = { sample_id: "S013", medium: "soil", x: 31800, y: 808900, z: 193, values: {} };
  assert.match(surfaceSampleTip({ ...base, zFlat: true, zOutside: true }), /the terrain has no ground here/);
  assert.match(surfaceSampleTip({ ...base, zFlat: true }), /no elevation in the file and no terrain/);
});

test("#2274 — Interpret: a shear zone type with a dip; no survey wording on the map; the Survey row only with surveys", () => {
  assert.ok(INTERPRETATION_TYPES.some((t) => t.value === "shear" && t.label === "Shear zone"));
  assert.deepEqual(attitudeOf("shear"), attitudeOf("fault"));
  const p = src("../src/components/InterpretPane.jsx");
  assert.match(p, /tr\("Click the first point of the line\."\)/);
  assert.match(p, /\{surveys\.length > 0 && <label style=\{row\}>\{tr\("Survey"\)\}/);
  assert.match(p, /over the map or a survey in the 3D view/);
});

test("#2275 — a tied local grid seeds the CRS list from its tie", () => {
  const c = src("../src/components/CrsPicker.jsx");
  assert.match(c, /const tie = !crsSet \? store\?\.project\?\.localGrid\?\.tie : null;/);
  assert.match(c, /return \[Number\(tie\.epsg\), \.\.\.\(c \? crsCandidatesAt\(c\.lon, c\.lat\)\.map\(\(x\) => x\.code\) : \[\]\)\];/);
});
