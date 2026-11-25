// TASKS.csv #4042 (a user asked for "automated identification of stream sampling locations based on a DEM"; it exists: the Survey planner's
// Stream sites, #844 on #845's routing) — made findable: Plan survey in Geochem's Basic tools; "Plan stream sites…" where the DEM is (Maps >
// Terrain, the terrain's menu in the 3D View) opening the planner on Stream sites; a Help page the words find; a pointer in Catchments.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchPages, pageById } from "../src/help/content.js";
import { helpIdForPane } from "../src/lib/help.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#4042 Plan survey is in Geochem's Basic tools, and the planner opens on Stream sites when asked", () => {
  const g = read("../src/modules/GeochemModule.jsx"), p = read("../src/components/SurveyPlannerPanel.jsx");
  assert.match(g, /<RibbonButton \/\* Basic tools: TASKS\.csv #4042 \(was Advanced: #3907, #2199\) \*\/ icon=\{GMapPin\} label="Plan survey"/);
  assert.match(g, /useModuleAction\(\["plan-stream-sites"\], \(\) => \{ setPlannerOpen\(false\); setPlannerTab\("streams"\); setTimeout\(\(\) => setPlannerOpen\(true\), 0\); \}\);/);
  assert.match(g, /<SurveyPlannerPanel initialMode=\{plannerTab\} onClose=\{\(\) => \{ setPlannerOpen\(false\); setPlannerTab\(null\); \}\} \/>/);
  assert.match(p, /const \[mode, setMode\] = useState\(initialMode \|\| prefs\.mode \|\| "soil"\);/);
  assert.match(p, /Stream sites come from the terrain: load or fetch terrain over the area first, or build one offline from points or contours \(Maps > Terrain\)\./, "no terrain: said, with Maps > Terrain");
  assert.match(p, /onClick=\{\(\) => openHelp\("survey-planner"\)\}/);
});

test("#4042 'Plan stream sites…' where the DEM is, and a pointer in Catchments: each asks Geochem for the planner on Stream sites", () => {
  const ask = /requestModuleAction\("plan-stream-sites", \{ tab: "streams" \}\)/; // a payload: kept for two minutes while Geochem loads
  const geo = read("../src/modules/GeophysicsModule.jsx");
  assert.match(geo, /<button className="gs-btn gs-btn--block" style=\{\{ marginTop: 6, marginBottom: 0 \}\} onClick=\{\(\) => \{ goToModule\?\.\("geochem"\); requestModuleAction\("plan-stream-sites", \{ tab: "streams" \}\); \}\}[^\n]*\{tr\("Plan stream sites…"\)\}<\/button>/, "Maps > Terrain, beside Export to GeoTIFF");
  const card = read("../src/modules/viewer/TerrainCard.jsx");
  assert.match(card, /\{ label: tr\("Plan stream sites…"\), onClick: \(\) => \{ goToModule\("geochem"\); requestModuleAction\("plan-stream-sites", \{ tab: "streams" \}\); \} \}/, "the terrain row's menu");
  const c = read("../src/components/CatchmentsPanel.jsx");
  assert.match(c, ask); assert.match(c, /\{tr\("Plan new sites: Plan survey › Stream sites"\)\}/);
  for (const l of ["es", "pt", "fr", "ar"]) { const j = JSON.parse(read(`../src/locales/${l}.json`)); for (const k of ["Plan stream sites…", "Plan new sites: Plan survey › Stream sites"]) assert.ok(j[k], `${l}: ${k}`); }
  const es = JSON.parse(read("../src/locales/es.json"));
  assert.ok(es["Plan new sites: Plan survey › Stream sites"].includes(`${es["Plan survey"]} › ${es["Stream sites"]}`), "the pointer names the translated labels as they show");
});

test("#4042 Help: the planner has a page, its '?' opens it, and the words a user would type find it", () => {
  assert.equal(helpIdForPane("Survey planner"), "survey-planner");
  const p = pageById("survey-planner");
  assert.equal(p.area, "Geochem"); assert.ok(p.line && p.keys.length >= 2);
  for (const q of ["stream sediment", "drainage", "stream sites"]) assert.equal(searchPages(q)[0]?.page.id, "survey-planner", q);
  for (const q of ["DEM", "sample sites", "DEM sample sites"]) assert.ok(searchPages(q).slice(0, 3).some((r) => r.page.id === "survey-planner"), `${q}: in the first three`);
  assert.ok(pageById("terrain").fields.some((f) => f.name === "Plan stream sites…"), "the Terrain page names the button");
  assert.ok(pageById("terrain").related.includes("survey-planner"));
});
