// TASKS.csv #3968 (Matt's first-time test, a 91-hole section: "This is very crowded. We need a way to turn off the various labels on a cross
// section.") — each kind of label a section draws can be turned off from its Labels menu. The choice is saved with the section in its labels
// ({ mode, leaders, offsets, show }), so a re-opened section, its PNG / SVG / PDF and its Layout snapshot keep it. Pure.
//   ids: the hole names (labels.mode, whose 'off' hides them; the position is chosen beside the menu), eoh: 'EOH n m', ticks: the downhole depth
//   ticks and their numbers, offsets: the '-22...+21 m' offset from the section (and a snapped vertex's), grades: the grade / intercept labels,
//   surfaces: surface and shell names (and a planned hole's pierce points), ground: the ground surface's label.
export const LABEL_KINDS = [
  ["ids", "Hole IDs"], ["eoh", "End-of-hole depths"], ["ticks", "Depth ticks"], ["offsets", "Offset from the section"],
  ["grades", "Grade / intercept labels"], ["surfaces", "Surface and shell names"], ["ground", "Ground surface label"],
];
// over this many holes in the buffer a section opens with its offsets and depth ticks off (said beside the menu)
export const CROWDED_HOLES = 30;
export const crowdedDefault = (labels, holeCount) => !labels?.show && holeCount > CROWDED_HOLES;

// what is drawn: the section's own choice, else the defaults (everything, but offsets and depth ticks on a crowded section)
export function labelShow(labels, holeCount) {
  const crowded = holeCount > CROWDED_HOLES;
  const base = { eoh: true, ticks: !crowded, offsets: !crowded, grades: true, surfaces: true, ground: true };
  const s = labels?.show && typeof labels.show === "object" ? labels.show : {};
  const out = { ...base };
  for (const k of Object.keys(base)) if (typeof s[k] === "boolean") out[k] = s[k];
  out.ids = (labels?.mode || "collar") !== "off";
  return out;
}

// the kind of a label placed in the section's collision pass, by its key; null: not one of the kinds (always drawn)
export function floatLabelKind(key) {
  const k = String(key || "");
  if (k.startsWith("dm") || k.startsWith("pm")) return "ticks";
  if (k.startsWith("eoh") || k.startsWith("peoh")) return "eoh";
  if (k.startsWith("off") || k.startsWith("snap")) return "offsets";
  if (k.startsWith("grade_") || k.startsWith("bi_")) return "grades";
  if (k.startsWith("sf") || k.startsWith("pp")) return "surfaces";
  return null;
}

// the labels patch for one kind turned on or off (hole IDs through labels.mode, keeping the position chosen before)
export function labelsPatch(labels, holeCount, kind, on) {
  if (kind === "ids") return on ? { mode: labels?.lastMode && labels.lastMode !== "off" ? labels.lastMode : "collar" } : { mode: "off", lastMode: labels?.mode && labels.mode !== "off" ? labels.mode : labels?.lastMode || "collar" };
  const cur = labelShow(labels, holeCount);
  const { ids, ...show } = cur;
  return { show: { ...show, [kind]: !!on } };
}
// All / None
export function labelsPatchAll(labels, on) {
  const show = { eoh: on, ticks: on, offsets: on, grades: on, surfaces: on, ground: on };
  return on ? { show, mode: labels?.mode && labels.mode !== "off" ? labels.mode : labels?.lastMode || "collar" }
    : { show, mode: "off", lastMode: labels?.mode && labels.mode !== "off" ? labels.mode : labels?.lastMode || "collar" };
}
