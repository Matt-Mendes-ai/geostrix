// TASKS.csv #4032 (#4015 guided modelling, row 2) — the guide's saved place: modelGuide = { route, skipped, at }, a "view" project field (v33):
// saved, per tab, autosaved with the project, no Undo step, no unsaved prompt, never content on its own. A v32 file and a damaged value load empty.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GUIDE_ROUTES, emptyGuide, guideFromFile, guideIsEmpty, withRoute, withSkipped, withAt, guideSetters } from "../src/lib/modelGuide.js";
import { FIELDS, UNDO_KEYS, DIRTY_KEYS, PROJECT_VERSION, emptyFields, payloadFromFields, fieldsFromPayload, projectHasContent, extraDirtyValues } from "../src/lib/projectFields.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#4032 the field: view-tracked (no Undo step, no unsaved prompt), v33, empty in a new project and never content", () => {
  const f = FIELDS.find((x) => x.key === "modelGuide");
  assert.equal(f.track, "view");
  assert.ok(!UNDO_KEYS.includes("modelGuide") && !DIRTY_KEYS.includes("modelGuide"), "outside the history and the unsaved-change watcher");
  assert.ok(PROJECT_VERSION >= 33);
  assert.deepEqual(emptyFields().modelGuide, { route: null, skipped: [], at: null });
  const g = { route: "computed", skipped: ["faults", "grade"], at: "rocks" };
  assert.equal(projectHasContent({ ...emptyFields(), modelGuide: g }), false, "a guide alone is not work to autosave");
  const e = emptyFields(), base = extraDirtyValues(e);
  assert.ok(extraDirtyValues({ ...e, modelGuide: g }).every((v, i) => v === base[i]), "choosing a route is not an edit");
});

test("#4032 saved and read back; a v32 file (no key) and damaged values load an empty guide", () => {
  const g = { route: "drawn", skipped: ["faults"], at: "check" };
  const file = JSON.parse(JSON.stringify(payloadFromFields({ ...emptyFields(), modelGuide: g })));
  assert.deepEqual(file.modelGuide, g);
  assert.deepEqual(fieldsFromPayload(file, "Demo").modelGuide, g);
  const v32 = { ...file, version: 32 }; delete v32.modelGuide;
  assert.deepEqual(fieldsFromPayload(v32, "Old").modelGuide, emptyGuide());
  for (const bad of [null, "drawn", 7, [], { route: "sideways", skipped: "faults", at: 3 }]) assert.deepEqual(guideFromFile(bad), emptyGuide(), JSON.stringify(bad));
  assert.deepEqual(guideFromFile({ route: "map", skipped: ["a", "a", "", 4, "x".repeat(41), "b"], at: "" }), { route: "map", skipped: ["a", "b"], at: null }, "short string ids, each once");
  assert.equal(guideFromFile({ skipped: [...Array(30)].map((_, i) => `s${i}`) }).skipped.length, 20, "capped");
  assert.deepEqual(fieldsFromPayload({ ...file, modelGuide: { route: "drawn", skipped: { x: 1 } } }, "Hurt").modelGuide, { route: "drawn", skipped: [], at: null });
});

test("#4032 the edits: route, skip / unskip, the step it was on; no change returns the same object", () => {
  assert.deepEqual(GUIDE_ROUTES, ["computed", "drawn", "map"]);
  let g = emptyGuide();
  assert.equal(guideIsEmpty(g), true);
  g = withRoute(g, "computed"); assert.equal(g.route, "computed");
  assert.equal(withRoute(g, "computed"), g); assert.equal(withRoute(g, "geoml").route, null, "not a route: cleared");
  g = withSkipped(g, "faults"); g = withSkipped(g, "grade"); assert.deepEqual(g.skipped, ["faults", "grade"]);
  assert.equal(withSkipped(g, "faults"), g);
  g = withSkipped(g, "faults", false); assert.deepEqual(g.skipped, ["grade"]);
  g = withAt(g, "rocks"); assert.equal(g.at, "rocks"); assert.equal(withAt(g, "rocks"), g); assert.equal(withAt(g, null).at, null);
  assert.equal(guideIsEmpty(g), false);
  let held = emptyGuide();
  const s = guideSetters((fn) => { held = fn(held); });
  s.setGuideRoute("map"); s.setGuideSkipped("faults"); s.setGuideAt("area");
  assert.deepEqual(held, { route: "map", skipped: ["faults"], at: "area" });
});

test("#4032 wiring: the store holds it and hands out the field and its setters", () => {
  const store = read("../src/lib/store.jsx");
  assert.match(store, /const \[modelGuide, setModelGuide\] = useState\(emptyGuide\);/);
  assert.match(store, /const guideSet = useMemo\(\(\) => guideSetters\(setModelGuide\), \[\]\);/);
  assert.match(store, /modelGuide: \[modelGuide, setModelGuide\]/);
  assert.match(store, /\n {4}modelGuide, setModelGuide, \.\.\.guideSet, /);
  assert.match(read("../src/lib/projectFields.js"), /\{ key: "modelGuide", track: "view", empty: emptyGuide, load: \(data\) => guideFromFile\(data\.modelGuide\), isEmpty: guideIsEmpty \}/);
});
