// TASKS.csv #4036 (guided modelling row 6) — the guide's Help card, the Help button on its step view, and First steps landing on the guide.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { countHelpPage } from "../scripts/word-count.mjs";
import { PAGES, pageById, searchPages } from "../src/help/content.js";
import { PANE_HELP, helpIdForPane } from "../src/lib/help.js";
import { FIRST_STEPS } from "../src/help/guide.js";
import { GUIDE_STEPS } from "../src/lib/guide/guideSteps.js";

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#4036 the guided-model card: in 3D Modelling, a picture and one line, 70 words or fewer seen first, the cautions a user needs", () => {
  const p = pageById("guided-model");
  assert.ok(p && p.area === "3D Modelling" && p.line && p.picture?.alt);
  let first = 0;
  countHelpPage(p, (kind, text, more) => { if (!more) first += String(text || "").trim().split(/\s+/).filter(Boolean).length; });
  assert.ok(first <= 70, `${first} seen-first words`);
  const c = p.cautions.join(" ").toLowerCase();
  assert.match(c, /nothing runs or is added until you click/); assert.match(c, /not a resource estimate/);
  assert.equal(PANE_HELP["Guided modelling"], "guided-model"); assert.equal(helpIdForPane("Guided modelling"), "guided-model");
  assert.ok(searchPages("seven steps from your data").some((r) => r.page.id === "guided-model"), "found by its line");
});

test("#4036 its text says what the guide does: the seven steps, in the guide's own order and words", () => {
  const p = pageById("guided-model"), all = JSON.stringify(p).toLowerCase();
  assert.equal(GUIDE_STEPS.length, 7, "seven steps");
  for (const w of ["your data", "area", "rocks", "compute or draw", "faults", "volumes", "check"]) assert.ok(all.includes(w), w);
  for (const k of p.keys) assert.ok(p.fields.some((f) => f.name === k && f.gist), k);
  assert.ok(p.howto?.steps?.length >= 3 && /WA lode gold/.test(p.howto.sample));
});

test("#4036 the step view has a Help button beside Skip that opens the card", () => {
  const g = read("src/modules/viewer/guided/GuideSteps.jsx");
  assert.match(g, /import \{ openHelp \} from "\.\.\/\.\.\/\.\.\/lib\/help\.js";/);
  assert.match(g, /<button type="button" style=\{small\} onClick=\{\(\) => openHelp\("guided-model"\)\}>\{tr\("Help"\)\}<\/button>[^\n]*\n\s+\{s\.state !== "done" && \(s\.state !== "skipped" \|\| userSkipped\) && <button type="button" style=\{small\} onClick=\{\(\) => store\.setGuideSkipped\?\.\(id, !userSkipped\)\}>/); // Skip only where it means something: #4037
  for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`src/locales/${lang}.json`))["Help"], lang);
});

test("#4036 First steps' model screen sends the person to the guide (the Model button's Start here), and still says a model is not a resource estimate", () => {
  const s = FIRST_STEPS.find((x) => x.diagram === "buildModel");
  assert.match(s.text, /opens a guide/); assert.match(s.text, /seven steps/); assert.match(s.text, /not a resource estimate/);
  assert.equal(s.button.act, "guided");
  assert.match(read("src/help/FirstSteps.jsx"), /requestModuleAction\("guided-open", \{ tool: "start" \}\)/);
  assert.match(read("src/modules/viewer/guided/GuidedTool.jsx"), /GuideSteps/);
  assert.ok(s.text.trim().split(/\s+/).length <= 40);
});

// ---- what the walk-through of the samples found and fixed (TASKS.csv #4036) ----
import { guideFacts, clearGuideFacts } from "../src/lib/guide/guideFacts.js";

function pile(modellingCodes = null) {
  const collars = [], litho = [];
  for (let i = 0; i < 8; i++) {
    const id = `H${i + 1}`;
    collars.push({ hole_id: id, x: 1000 + (i % 4) * 100, y: 2000 + Math.floor(i / 4) * 100, z: 500, length: 130 });
    ["SST", "SH", "CL", "SH", "LST", "MDST"].forEach((u, k) => litho.push({ hole_id: id, from: k * 20, to: (k + 1) * 20, value: u }));
  }
  return { collars, layers: { litho }, assays: [], assayElements: [], mapLayers: [], terrain: null, sections: [], explicitSurfaces: [], generatedSurfaces: [], stratStack: { units: [], faults: [] }, modellingCodes, explicitSurface: [] };
}

test("#4036 a code the stack leaves out by its role (core loss) is not offered as the rock that cuts the others", () => {
  clearGuideFacts(); const plain = guideFacts(pile());
  assert.equal(plain.body?.unit, "CL", "with no role it lies inside SH in every hole: a body");
  clearGuideFacts(); const lost = guideFacts(pile({ codes: [{ name: "CL", role: "no recovery" }] }));
  assert.equal(lost.body, null, "as core loss it is no body: the step 3 row 'lies inside another rock' (make it an intrusion) is not offered");
  clearGuideFacts();
});

test("#4036 the vein row's door starts the Veins and dykes card on that row's vein (a one-choice card takes the guide's choice too)", () => {
  assert.match(read("src/modules/viewer/guided/guideActs.js"), /case "vein": return setTool\("veins", a\.vein\);/);
  assert.match(read("src/modules/viewer/guided/GuidedTool.jsx"), /if \(!tool\.multi && typeof preset === "string" && choices\.includes\(preset\)\) return preset;/);
});

test("#4036 the strip's dots say their state in the tooltip as well as in the label", () => {
  assert.match(read("src/modules/viewer/guided/GuideSteps.jsx"), /title=\{`\$\{tr\(GUIDE_STEPS\[i\]\.title\)\}: \$\{tr\(STATE_WORD\[x\.state\]\)\}`\}/);
});

test("#4036 the last lithology model (the Result block's Add buttons) is dropped when the project changes", () => {
  assert.match(read("src/modules/ViewerModule.jsx"), /useEffect\(\(\) => setLastLithBlockRaw\(null\), \[viewerUiStateSeq\]\);/);
});

test("#4036 the samples script reads the logged notes as the app does, so its counts are the app's (WA lode gold 15 steady of 22, WA bedded iron 11 of 12)", () => {
  const s = read("scripts/guide-samples.mjs");
  assert.match(s, /setLithologyNoteRoles\(lithologyNoteRoles\(layers\.litho\)\)/);
  assert.match(s, /interval\(csv\(path\.join\(dir, "litho\.csv"\)\), \["lithology", "litho", "rock", "code"\], true\)/);
});
