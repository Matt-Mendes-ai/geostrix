// TASKS.csv #4030 (Matt: yes, save the stack's Conformable / Erode choice and its fault settings too) — relation, faults and faultOffsets join
// stratStack (v32, track "undo"): saved, per tab, autosaved, each change one Ctrl+Z step. A v31 file opens with Conformable and no faults.
// A new project is still empty (the default relation alone is not work). Made-up unit codes and fault ids only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyStack, stackFromFile, stackIsEmpty, stackPartSetter } from "../src/lib/stratStack.js";
import { PROJECT_VERSION, emptyFields, payloadFromFields, fieldsFromPayload, projectHasContent } from "../src/lib/projectFields.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#4030 relation and faults round-trip; a v31 file gets Conformable and no faults; a damaged one, the defaults", () => {
  assert.ok(PROJECT_VERSION >= 32);
  const stack = { units: ["VOL", "TUF"], breaks: [], relation: "erode", faults: ["fault|F1", "surf|s2"], faultOffsets: { "fault|F1": { from: "TUF", faults: ["surf|s2"] } } };
  const file = JSON.parse(JSON.stringify(payloadFromFields({ ...emptyFields(), stratStack: stack })));
  assert.deepEqual(fieldsFromPayload(file, "Demo").stratStack, stack);
  const v31 = { ...file, version: 31, stratStack: { units: ["VOL", "TUF"], breaks: ["VOL"] } };
  assert.deepEqual(fieldsFromPayload(v31, "Old").stratStack, { ...emptyStack(), units: ["VOL", "TUF"], breaks: ["VOL"] }, "Conformable, no faults: today's defaults");
  assert.deepEqual(stackFromFile({ relation: "sideways", faults: ["fault|F1", 7, "fault|F1"], faultOffsets: { "fault|F1": { from: 3, faults: "x" }, bad: null, "fault|F2": [] } }),
    { ...emptyStack(), faults: ["fault|F1"], faultOffsets: { "fault|F1": { from: "", faults: [] }, "fault|F2": { from: "", faults: [] } } }, "an unknown relation is Conformable; only string keys");
});

test("#4030 an empty stack is not work: a new project is not autosaved for its default relation; a fault or a unit is work", () => {
  assert.equal(stackIsEmpty(emptyStack()), true);
  assert.equal(stackIsEmpty({ ...emptyStack(), relation: "erode" }), true, "a choice with nothing to model");
  assert.equal(projectHasContent(emptyFields()), false);
  assert.equal(projectHasContent({ ...emptyFields(), stratStack: { ...emptyStack(), faults: ["fault|F1"] } }), true);
  assert.equal(projectHasContent({ ...emptyFields(), stratStack: { ...emptyStack(), units: ["VOL"] } }), true);
});

test("#4030 the setters keep the other parts; the relation and the faults set through the store, each change its own step", () => {
  let s = emptyStack(), checks = 0;
  const set = (part) => stackPartSetter((fn) => { s = fn(s); }, part, () => checks++);
  set("units")(["VOL", "TUF"]); set("relation")("erode"); set("faults")((p) => [...p, "fault|F1"]); set("faultOffsets")((p) => ({ ...p, "fault|F1": { from: "TUF" } }));
  assert.deepEqual(s, { units: ["VOL", "TUF"], breaks: [], relation: "erode", faults: ["fault|F1"], faultOffsets: { "fault|F1": { from: "TUF" } } });
  assert.equal(checks, 4);
  const vm = read("../src/modules/ViewerModule.jsx");
  assert.match(vm, /const stackFaultOffsets = stratStack\.faultOffsets, stackFaults = stratStack\.faults;/);
  for (const [name, part] of [["setStackFaultOffsets", "faultOffsets"], ["setStackFaults", "faults"], ["setStackRelation", "relation"]]) {
    assert.match(vm, new RegExp(`const ${name} = useMemo\\(\\(\\) => stackPartSetter\\(setStratStack, "${part}", undoCheckpoint\\), \\[setStratStack, undoCheckpoint\\]\\);`), name);
  }
  assert.match(vm, /const stackRelation = stratStack\.relation;/);
  assert.doesNotMatch(vm, /useState\("onlap"\)|const \[stackFaults, setStackFaults\] = useState|const \[stackFaultOffsets, setStackFaultOffsets\] = useState/, "no session copy left");
  assert.match(read("../src/lib/projectFields.js"), /\{ key: "stratStack", track: "undo", empty: emptyStack, load: \(data\) => stackFromFile\(data\.stratStack\), isEmpty: stackIsEmpty \}/);
});
