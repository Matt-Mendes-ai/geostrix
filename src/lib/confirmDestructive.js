// TASKS.csv #386 — one wording for destructive actions. Undo (store.jsx undoSnapshot) covers collars,
// survey, layers, assays, sections, boundaries, the current layout page's elements and a few more; it
// does NOT cover generated surfaces, block/voxel models, themes, model domains, layout pages or
// templates. Confirms used to say "can't be undone" for things Undo restores, while several things Undo
// can't restore (an 80 s+ implicit-model run, an inversion) were deleted with no confirm at all.
//   undoable: true  -> the confirm says Ctrl+Z restores it (kept for bulk wipes, where a slip is costly)
//   undoable: false -> the confirm says it can't be undone, plus what it would take to get it back
export const UNDO_HINT = "You can undo this with Ctrl+Z.";
export function confirmDestructive(question, { undoable = false, recover = "" } = {}) {
  const tail = undoable ? UNDO_HINT : `This can't be undone${recover ? ` — ${recover}` : "."}`;
  return window.confirm(`${question} ${tail}`);
}
