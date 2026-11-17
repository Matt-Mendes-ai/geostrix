// TASKS.csv #3812 (a 3D UBC mesh offered to the DCIP2D import), #3813 (Evaluate onto the drillholes: where to cross-plot, a repeat replaces the layer), #3814 (the
// Magnetics / Gravity / Radiometrics panes list their own surveys), #3815 (small Geophysics slips: 2, 4, 5, 7). Synthetic only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onHolesRoutes } from "../src/lib/downholeLogs.js";
import { isUBCMeshText } from "../src/lib/voxel.js";
import { geophysLegendGroups } from "../src/lib/legendGroups.js";
import { SURVEY_METHODS } from "../src/lib/geophysSurveys.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const hasKeys = (keys) => { for (const k of keys) for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 50)}`); };
const gm = read("../src/modules/GeophysicsModule.jsx");

test("#3812 a 3D UBC mesh is told where it goes; the pane says where a 3D model and a cloud go", () => {
  assert.equal(isUBCMeshText("72 182 75\n531000 5531000 1500\n"), true); // the review's Model_Fine_Con.msh shape: nx ny nz, then the origin
  const p = read("../src/components/DcipPanel.jsx");
  assert.match(p, /const k = texts\.findIndex\(\(t\) => isUBCMeshText\(t\)\);/);
  assert.match(p, /goes to Geophysics › Block models › Import UBC mesh \+ model, not here\. This button reads one 2D line \(dcinv2d\.msh\)\./);
  assert.match(p, /One 2D line only\. A 3D inversion model \(a UBC mesh with 3 sizes\) goes to Block models/);
  hasKeys(['"{name}" is a 3D UBC mesh ({nx} × {ny} × {nz} cells): a 3D inversion model goes to Geophysics › Block models › Import UBC mesh + model, not here. This button reads one 2D line (dcinv2d.msh).',
    "One 2D line only. A 3D inversion model (a UBC mesh with 3 sizes) goes to Block models; a cloud of apparent values (X Y Z value) to Point survey."]);
});

test("#3813 the notice names the route this project can use; a repeat evaluation replaces its layer", () => {
  assert.match(onHolesRoutes([{ hole_id: "A" }], { litho: [{}] }), /Geochem › X–Y scatter \(the model's values are listed as 'On holes: …'\)/); // assays, no numeric log (Scottie)
  assert.match(onHolesRoutes([], { sg: [{ hole_id: "A" }] }), /use Downhole logs\./);
  assert.match(onHolesRoutes([{}], { sg: [{}] }), /Downhole logs against a log, Geochem › X–Y scatter against an assay/);
  assert.equal(onHolesRoutes([], {}), ""); assert.equal(onHolesRoutes(null, null), "");
  assert.match(gm, /const prevLayer = \(customLayers \|\| \[\]\)\.find\(\(l\) => l\.sourceModel === model\.id && \/\^On holes: \/\.test\(String\(l\.name\)\)\);/);
  assert.match(gm, /const id = prevLayer\?\.id \|\| `custom_\$\{Date\.now\(\)\}`;/);
  assert.match(gm, /the logs\.\{routes\}", \{ name: model\.name, routes: onHolesRoutes\(assays, layers\)/);
  hasKeys(["Cross-plots: Downhole logs against a log, Geochem › X–Y scatter against an assay.", "For a cross-plot against a log, use Downhole logs.",
    "For a cross-plot against an assay, use Geochem › X–Y scatter (the model's values are listed as 'On holes: …')."]);
});

test("#3814 a method's pane lists that method's surveys; the others are named apart", () => {
  assert.equal(SURVEY_METHODS.mag.group, "mag"); assert.equal(SURVEY_METHODS.grav.group, "grav"); assert.equal(SURVEY_METHODS.rad_k.group, "rad"); assert.equal(SURVEY_METHODS.em_cond.group, "em");
  assert.match(gm, /const inMethodPane = methodHint === "mag" \|\| methodHint === "grav" \|\| methodHint === "rad";/);
  assert.match(gm, /const ofPane = \(sv\) => SURVEY_METHODS\[geophysSurveys\[sv\.key\]\?\.method\]\?\.group === methodHint;/);
  assert.match(gm, /\{paneSurveys\.map\(\(sv\) => \{/);
  assert.match(gm, /tr\("Other surveys in the project \(\{n\}\)", \{ n: otherSurveys\.length \}\)/);
  hasKeys(["No magnetic survey yet: import one above.", "No gravity survey yet: import one above.", "No radiometric survey yet: import one above.", "Other surveys in the project ({n})", "Their method, rename and export are under Point survey."]);
});

test("#3815 (4) one survey loaded: its key carries the survey's name", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ x: i, y: i, z: 1, value: 10 + i, _src: "Model_AppChg.xyz" }));
  const g = geophysLegendGroups({ rows, surveys: { "Model_AppChg.xyz": { units: "mV/V" } } });
  assert.equal(g.length, 1); assert.match(g[0].label || g[0].title || g[0].name || "", /Model_AppChg\.xyz \(mV\/V\)/);
});

test("#3815 (2) (5) (7) the count with separators, the budget note points at the Advanced ribbon, a block model's removal says Undo does not cover it", () => {
  assert.match(gm, /mapped: mapped\.length\.toLocaleString\(\) \/\* #3815 \(2\) \*\//);
  assert.match(gm, /setting \(Advanced ribbon, Cell budget\) and re-import/);
  assert.match(gm, /tr\("Undo does not bring a block model back\."\)/);
  hasKeys(["Undo does not bring a block model back."]);
});
