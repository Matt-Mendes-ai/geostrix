// TASKS.csv #4025 (Matt: yes, save the strat stack with the project) — the Strat. stack's units and unconformity marks are a project field (v31,
// track "undo"): saved, per tab, autosaved, and each edit one Ctrl+Z step. An older file opens with an empty stack. Made-up unit codes only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyStack, stackFromFile, stackPartSetter } from "../src/lib/stratStack.js";
import { FIELDS, UNDO_KEYS, PROJECT_VERSION, emptyFields, payloadFromFields, fieldsFromPayload, projectHasContent } from "../src/lib/projectFields.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#4025 the field: undo-tracked, empty in a new project, read back from a file; an older or damaged file gives an empty stack", () => {
  const f = FIELDS.find((x) => x.key === "stratStack");
  assert.equal(f.track, "undo"); assert.ok(UNDO_KEYS.includes("stratStack"));
  assert.ok(PROJECT_VERSION >= 31);
  assert.deepEqual(emptyFields().stratStack, { units: [], breaks: [] });
  const live = { ...emptyFields(), stratStack: { units: ["mcode:AND1", "group:g1", "TUF"], breaks: ["group:g1"] } };
  const file = JSON.parse(JSON.stringify(payloadFromFields(live)));
  assert.deepEqual(file.stratStack, live.stratStack);
  assert.deepEqual(fieldsFromPayload(file, "Demo").stratStack, live.stratStack);
  assert.ok(projectHasContent(live), "a stack alone is work worth an autosave");
  const older = { ...file, version: 30 }; delete older.stratStack;
  assert.deepEqual(fieldsFromPayload(older, "Old").stratStack, emptyStack(), "a v30 file: an empty stack, as before");
  assert.deepEqual(stackFromFile({ units: ["TUF", 3, "", "TUF", "AND"], breaks: "TUF" }), { units: ["TUF", "AND"], breaks: [] }, "only unit keys, each once");
  assert.deepEqual(stackFromFile(null), emptyStack());
});

test("#4025 setStackUnits / setStackBreaks over the one field: a value or a function, the other part kept, a step ended first", () => {
  let s = { units: ["TUF"], breaks: ["TUF"] }, checks = 0;
  const setStratStack = (fn) => { s = fn(s); };
  const setUnits = stackPartSetter(setStratStack, "units", () => checks++), setBreaks = stackPartSetter(setStratStack, "breaks", () => checks++);
  setUnits((p) => [...p, "AND"]);
  assert.deepEqual(s, { units: ["TUF", "AND"], breaks: ["TUF"] });
  const before = s; setBreaks((p) => p); assert.equal(s, before, "no change: the same object, so no undo step");
  setUnits([]); setBreaks([]);
  assert.deepEqual(s, { units: [], breaks: [] }); assert.equal(checks, 4, "each edit ends the step under way first");
  stackPartSetter(setStratStack, "units", () => { throw new Error("no history"); })(["X"]);
  assert.deepEqual(s.units, ["X"], "a history that is not there does not stop the edit");
});

test("#4025 wiring: the store holds it, ViewerModule reads and sets it through the store, Ctrl+Z names it", () => {
  const store = read("../src/lib/store.jsx"), vm = read("../src/modules/ViewerModule.jsx");
  assert.match(store, /const \[stratStack, setStratStack\] = useState\(emptyStack\);/);
  assert.match(store, /stratStack: \[stratStack, setStratStack\]/);
  assert.match(store, /\n {4}stratStack, setStratStack, \/\/ TASKS\.csv #4025/);
  assert.match(vm, /const stackUnits = stratStack\.units, stackBreaks = stratStack\.breaks;/);
  assert.match(vm, /const setStackUnits = useMemo\(\(\) => stackPartSetter\(setStratStack, "units", undoCheckpoint\), \[setStratStack, undoCheckpoint\]\);/);
  assert.match(vm, /const setStackBreaks = useMemo\(\(\) => stackPartSetter\(setStratStack, "breaks", undoCheckpoint\), \[setStratStack, undoCheckpoint\]\);/);
  assert.doesNotMatch(vm, /useState\(\[\]\); \/\/ ordered youngest -> oldest|const \[stackBreaks, setStackBreaks\] = useState/, "no session copy left");
  assert.match(read("../src/lib/undoLabels.js"), /case "stratStack": return tr\("the stratigraphic stack"\);/);
});
