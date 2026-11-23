// TASKS.csv #4025 (Matt: save the strat stack with the project) — the Strat. stack is project data: { units: unit keys youngest -> oldest,
// breaks: the units with an unconformity marked under them (#1309) }. It is saved in the project file (projectFields.js, v31), kept per tab,
// autosaved, and each edit is one Ctrl+Z step, so Add all, Sort by the holes and Remove all no longer carry their own Undo lines.
const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x) : []);

export const emptyStack = () => ({ units: [], breaks: [] });

// a stored stack as the app holds it; an older file (no stack) or a damaged one: an empty stack, as before #4025
export function stackFromFile(v) {
  return v && typeof v === "object" ? { units: [...new Set(strings(v.units))], breaks: [...new Set(strings(v.breaks))] } : emptyStack();
}

// setStackUnits / setStackBreaks over the one field: a value or a function of the part, as useState's setter. checkpoint (the store's undoCheckpoint)
// ends the step under way first, so an edit right after another (within the history's quiet period) is still its own step.
export function stackPartSetter(setStratStack, part, checkpoint) {
  return (v) => {
    try { checkpoint?.(); } catch { /* no history */ }
    setStratStack((s) => {
      const cur = s?.[part] || [];
      const next = typeof v === "function" ? v(cur) : v;
      return next === cur ? s : { ...emptyStack(), ...s, [part]: next };
    });
  };
}
