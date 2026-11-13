// TASKS.csv #1448 — Surface Geology text slips (review #1352, Silvertip): raw '710 polygon' counts, untranslated structure classes, '1 tables'
// / '1 have', outcrops said to 'sit on the terrain' with none loaded, the 3D View's drillhole text in the tab's empty card, and an English
// 'Untitled project' tab in other languages. (The 'DEM above' drape hint was already reworded.)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("counts and classes go through the plural and translation helpers", () => {
  const m = read("../src/components/SurfaceMappingPanel.jsx");
  assert.ok(m.includes("{featureCountText(l.features.length, l.geomType)") && !m.includes("{l.features.length} {l.geomType}"));
  assert.ok(/tr\(STRUCTURE_CLASS_LABELS\[(cls|r\.cls)\]/.test(m)); // r.cls: the per-type symbol lines of #3066 name a type with no words by its class
  assert.ok(read("../src/components/SurfaceGeologyProjection.jsx").includes("{tr(STRUCTURE_CLASS_LABELS[k])"));
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(read(`../src/locales/${l}.json`));
    for (const k of ["Fault / shear", "Bedding", "Foliation", "Cleavage", "Contact / dyke", "Vein", "Joint / fracture", "Untitled project"]) assert.ok(j[k], `${l}: ${k}`);
  }
});

test("singular forms; the no-terrain outcrop line says what is drawn", () => {
  const r = read("../src/components/MapImportReview.jsx");
  assert.ok(r.includes('count === 1 ? "Import 1 table"') && r.includes('rows.length === 1 ? "This table may not be a map layer'));
  assert.ok(read("../src/components/StereonetModal.jsx").includes("not plotted: {why}")); // #1551: the reasons counted apart, no plural to agree
  assert.ok(read("../src/components/SurfaceMappingPanel.jsx").includes(" {noZ} had no elevation: drawn flat until a terrain is loaded (Maps > Terrain), then placed on it."));
});

test("the Surface Geology empty card has its own body; the tab name is translated while it is the default", () => {
  const b = read("../src/modules/viewer/EmptyViewerBody.jsx");
  assert.match(b, /if \(mode === "surface"\) return \(/);
  assert.ok(read("../src/modules/ViewerModule.jsx").includes("<EmptyViewerBody mode={mode} />"));
  assert.ok(read("../src/modules/ViewerModule.jsx").includes("({featureCountText(l.features.length, l.geomType)})"));
  assert.match(read("../src/App.jsx"), /const label = !rawLabel \|\| rawLabel === "Untitled project" \? tr\("Untitled project"\) : rawLabel;/);
});
