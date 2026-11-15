// TASKS.csv #3651 (Fireweed re-test R1, Macpass) — the Grade shell pane remembers which of its boxes hold its own proposals (the cut-off it
// proposed, the search it set from the spacing, the cap the cap note set, whether the search was typed, the holes it last proposed for). That
// memory was the pane's own state, and the pane is unmounted when the 3D Modelling tab is left: back in it, the boxes still held Tom West's
// 60 m / 73 / 299.6 (they live in the 3D View's state) but the pane no longer knew they were its own, so the lines explaining them were gone
// and a change of Model area re-proposed nothing. It is kept here instead, one memory per 3D View (keyed by an object that view owns for its
// life: its traces ref), so a remounted pane picks it up.
const memories = new WeakMap();
export function shellPaneMemory(owner) {
  if (!owner || typeof owner !== "object") return {};
  let m = memories.get(owner);
  if (!m) { m = {}; memories.set(owner, m); }
  return m;
}
// a ref-like view of one field of the memory ({ current }), for the code that reads a ref
export function memoryRef(memory, key, initial) {
  return { get current() { return key in memory ? memory[key] : initial; }, set current(v) { memory[key] = v; } };
}
