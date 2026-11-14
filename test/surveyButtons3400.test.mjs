// TASKS.csv #3400 (Matt: "I wanna have the ribbon menu with all the survey names or abbreviations. So a beginner will know where to find the
// survey they want to work with") — the Geophysics Surveys group: a button per method by name, in Simple mode too; Magnetics / Gravity /
// Radiometrics open the point importer set to that method; EM a chooser (FDEM 1D, TEM); each with a one-line tooltip and a help page.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { methodWithHint, METHOD_HINTS, SURVEY_METHODS } from "../src/lib/geophysSurveys.js";
import { PANE_HELP } from "../src/lib/help.js";
import { pageById } from "../src/help/content.js";

test("the method a button opened the importer with: the column's own product of that kind, else the kind's usual method", () => {
  assert.equal(methodWithHint("mag_rtp", "mag"), "mag_rtp"); // a reduced-to-pole column stays reduced to pole
  assert.equal(methodWithHint(null, "mag"), "mag");
  assert.equal(methodWithHint("rad_k", "mag"), "mag"); // a 'K' column guessed as radiometrics, opened from Magnetics: magnetics
  assert.equal(methodWithHint("grav_fa", "grav"), "grav_fa");
  assert.equal(methodWithHint("mag", "grav"), "grav");
  assert.equal(methodWithHint("rad_th", "rad"), "rad_th");
  assert.equal(methodWithHint(null, "rad"), "rad_tc");
  assert.equal(methodWithHint("em_tau", "tem"), "em_tau");
  assert.equal(methodWithHint("em_cond", "tem"), "em_dbdt"); // FDEM conductivity is not a TEM channel
  // no hint (Point survey): the guess as before
  assert.equal(methodWithHint("ip", null), "ip");
  assert.equal(methodWithHint(null, null), null);
  for (const m of Object.values(METHOD_HINTS)) assert.ok(SURVEY_METHODS[m], m);
});

const src = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const ribbon = src.slice(src.indexOf('<RibbonGroup label="Surveys">'), src.indexOf('<RibbonGroup label="Models">'));

test("the Surveys group: a button per method, every one in Simple mode, each with a tooltip saying what it measures", () => {
  const buttons = [...ribbon.matchAll(/<RibbonButton ([^\n]*?)\/>/g)].map((m) => m[1]);
  const label = (b) => /label="([^"]+)"/.exec(b)?.[1];
  assert.deepEqual(buttons.map(label), ["Magnetics", "Gravity", "Radiometrics", "IP / Resistivity", "EM", "MT / AMT", "Point survey", "Inversion"]);
  for (const b of buttons.slice(0, 7)) {
    assert.doesNotMatch(b, /\badvanced\b/, `${label(b)} shows in Simple mode`);
    const title = /title="([^"]+)"/.exec(b)?.[1] || "";
    assert.ok(title.length > 40 && title.length < 200, `${label(b)}: a one-line tooltip`);
  }
  assert.match(buttons[7], /\badvanced\b/, "Inversion keeps its place, in Advanced");
  assert.match(ribbon, /label="Magnetics"[^\n]*\{\.\.\.methodBtn\("mag"\)\}/);
  assert.match(ribbon, /label="Gravity"[^\n]*\{\.\.\.methodBtn\("grav"\)\}/);
  assert.match(ribbon, /label="Radiometrics"[^\n]*\{\.\.\.methodBtn\("rad"\)\}/);
  assert.match(ribbon, /label="IP \/ Resistivity"[^\n]*\{\.\.\.geoBtn\("dcip"\)\}/);
  assert.match(ribbon, /label="EM"[^\n]*onClick=\{\(\) => setGeoPane\("em"\)\}/);
  assert.match(ribbon, /label="MT \/ AMT"[^\n]*\{\.\.\.geoBtn\("mt"\)\}/);
  assert.match(ribbon, /label="Point survey"[^\n]*\{\.\.\.methodBtn\(null\)\}/);
  // no new lucide icon (the vendor-lucide chunk loads at startup): Gravity and Radiometrics reuse icons the app has
  assert.match(src, /import \{ Gauge as RRadiation, ArrowDownToLine as RWeight \} from "\.\.\/components\/icons\.js";/);
  assert.doesNotMatch(src, /from "lucide-react"/);
});

test("each method's pane has its help page; the EM chooser offers FDEM 1D and TEM, each with help", () => {
  for (const [title, id] of [["Magnetic survey (CSV / XYZ)", "magnetics"], ["Gravity survey (CSV / XYZ)", "gravity"], ["Radiometric survey (CSV / XYZ)", "radiometrics"], ["Electromagnetic surveys (EM)", "em-surveys"]]) {
    assert.equal(PANE_HELP[title], id);
    assert.equal(pageById(id)?.title, title);
    assert.ok(src.includes(`<TaskPaneHeader title="${title}"`), title);
  }
  assert.match(src, /methodHint === "mag" \? <TaskPaneHeader title="Magnetic survey \(CSV \/ XYZ\)"/);
  assert.match(src, /\{geoPane === "em" && \(<>/);
  assert.match(src, /go: \(\) => setGeoPane\("fdem"\), help: "fdem-1d"/);
  assert.match(src, /go: \(\) => \{ setMethodHint\("tem"\); setGeoPane\("points"\); \}, help: "point-survey"/);
  assert.match(src, /onClick=\{\(\) => openHelp\(o\.help\)\}/);
});

test("the three import paths take the method from the button", () => {
  assert.equal((src.match(/methodWithHint\(guessSurveyMethodFrom\(/g) || []).length, 3);
  assert.match(src, /<button type="button" onClick=\{\(\) => setMethodHint\(null\)\}[^\n]*\{tr\("Import without a method"\)\}/);
});
