import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { timeAgo } from "../src/lib/timeAgo.js";
import { sampleProjectName } from "../src/lib/sampleProjectName.js";
import { guessSurveyMethodFrom } from "../src/lib/geophysSurveys.js";
import { surfaceStructureRows, surfaceStructureFeatures, featuresToKml } from "../src/lib/overlayExport.js";

test("#1274 the recovery time is elapsed, not a clock time that depends on the zone", () => {
  const now = Date.UTC(2026, 10, 1, 12);
  assert.equal(timeAgo(now - 20000, now), "less than a minute ago");
  assert.equal(timeAgo(now + 5000, now), "less than a minute ago");
  assert.equal(timeAgo(now - 60000, now), "1 minute ago");
  assert.equal(timeAgo(now - 52 * 60000, now), "52 minutes ago");
  assert.equal(timeAgo(now - 3600000, now), "1 hour ago");
  assert.equal(timeAgo(now - 47 * 3600000, now), "47 hours ago");
  assert.match(timeAgo(now - 10 * 86400000, now), /2026/);
  const app = readFileSync("src/App.jsx", "utf8");
  assert.ok(!/new Date\(recovery\.autosavedAt\)/.test(app));
});
test("#1218 a sample names an untitled project and leaves a named one", () => {
  assert.equal(sampleProjectName("woodjam", "Untitled project"), "Woodjam (sample)");
  assert.equal(sampleProjectName("perk", ""), "Perk-Rocky (sample)");
  assert.equal(sampleProjectName("harry", "My claims"), "My claims");
});
test("#1197 a label column on every row names the method, if the header does not", () => {
  assert.equal(guessSurveyMethodFrom("value", Array(5).fill("TMI_nT")), "mag");
  assert.equal(guessSurveyMethodFrom("value", ["TMI_nT", "Bouguer"]), null);
  assert.equal(guessSurveyMethodFrom("value", []), null);
  assert.equal(guessSurveyMethodFrom("value", [undefined, "", "TMI_nT"]), "mag");
  assert.equal(guessSurveyMethodFrom("chargeability", Array(5).fill("TMI_nT")), "ip");
});
test("#1206 a set sitting on the terrain exports that z; otherwise its own", () => {
  const rows = [{ x: 1, y: 2, z: 900, dip: 10, dipDir: 20 }, { x: 3, y: 4, dip: 10, dipDir: 20 }];
  const zAt = (x) => (x === 1 ? 1000.126 : 1100);
  assert.deepEqual(surfaceStructureRows({ rows }, null, zAt).map((r) => r.z), [1000.13, 1100]);
  assert.deepEqual(surfaceStructureRows({ rows, snapToTerrain: false }, null, zAt).map((r) => r.z), [900, ""]);
  assert.deepEqual(surfaceStructureRows({ rows }, null).map((r) => r.z), [900, ""]);
  assert.deepEqual(surfaceStructureRows({ rows: [rows[0]] }, null, () => NaN).map((r) => r.z), [900]);
  assert.equal(surfaceStructureFeatures({ rows }, null, zAt).features[1].geometry[0][2], 1100);
});
test("#1251 KML coordinates to 8 decimals", () => {
  const kml = featuresToKml({ features: [{ geometry: [[0, 0, 0]], attributes: {} }], geomType: "point" }, { name: "t", toLonLat: () => [-121.3597070326, 52.2400013122] });
  assert.match(kml, /-121\.35970703,52\.24000131,0/);
});
test("#1248, #1196, #1201, #1205 in place", () => {
  const panel = readFileSync("src/components/SurfaceMappingPanel.jsx", "utf8"), inv = readFileSync("src/components/InversionPanel.jsx", "utf8");
  const geo = readFileSync("src/modules/GeophysicsModule.jsx", "utf8"), sec = readFileSync("src/components/SectionWindow.jsx", "utf8");
  assert.match(panel, /not a format this importer reads/);
  assert.match(inv, /Math\.abs\(mean\) > 10000/);
  assert.match(geo, /!\(VOXEL_PROPERTIES\.includes\(model\.property\) \|\| model\.source === "simpeg"\) && <Scale/);
  assert.match(sec, /<g key=\{hi\} clipPath="url\(#sectionPlotArea\)">/);
});
