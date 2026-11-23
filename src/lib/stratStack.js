// TASKS.csv #4025 (Matt: save the strat stack with the project) — the Strat. stack is project data: { units: unit keys youngest -> oldest,
// breaks: the units with an unconformity marked under them (#1309) }. It is saved in the project file (projectFields.js, v31), kept per tab,
// autosaved, and each edit is one Ctrl+Z step, so Add all, Sort by the holes and Remove all no longer carry their own Undo lines.
// TASKS.csv #4030 (Matt: yes, the relation and the faults too; v32) — relation: "onlap" (Conformable, the default since #271) | "erode";
// faults: the "<type>|<id>" keys of the faults that offset the stack (#360); faultOffsets: { faultKey: { from: unit key | "", faults: [keys] } } (#1054).
const strings = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string" && x))] : []);

export const emptyStack = () => ({ units: [], breaks: [], relation: "onlap", faults: [], faultOffsets: {} });

function offsetsFromFile(v) {
  const out = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, c] of Object.entries(v)) {
    if (!k || !c || typeof c !== "object") continue;
    out[k] = { from: typeof c.from === "string" ? c.from : "", faults: strings(c.faults) };
  }
  return out;
}

// nothing to keep: every part empty but the relation (its default alone is not work; projectFields' projectHasContent, which decides an autosave)
const blank = (v) => v == null || (Array.isArray(v) ? v.length === 0 : typeof v === "object" ? Object.keys(v).length === 0 : false);
export const stackIsEmpty = (s) => !s || Object.entries(s).every(([k, v]) => k === "relation" || blank(v));

// a stored stack as the app holds it; an older file: today's defaults for what it lacks (no stack at all before v31, no relation / faults before v32)
export function stackFromFile(v) {
  if (!v || typeof v !== "object") return emptyStack();
  return { units: strings(v.units), breaks: strings(v.breaks), relation: v.relation === "erode" ? "erode" : "onlap", faults: strings(v.faults), faultOffsets: offsetsFromFile(v.faultOffsets) };
}

// setStackUnits / setStackBreaks / setStackRelation / ... over the one field: a value or a function of the part, as useState's setter. checkpoint
// (the store's undoCheckpoint) ends the step under way first, so an edit right after another (within the history's quiet period) is still its own step.
export function stackPartSetter(setStratStack, part, checkpoint) {
  return (v) => {
    try { checkpoint?.(); } catch { /* no history */ }
    setStratStack((s) => {
      const cur = s?.[part] ?? emptyStack()[part];
      const next = typeof v === "function" ? v(cur) : v;
      return next === cur ? s : { ...emptyStack(), ...s, [part]: next };
    });
  };
}
