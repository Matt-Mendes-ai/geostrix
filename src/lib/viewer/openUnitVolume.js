// TASKS.csv #3112 (split from #2917, WA iron) — 'Add unit volumes' built the unit under a run's last modelled top as if it were a body:
// with no base modelled it is everything down to the model box's floor ('TNAM 26.8 Mm3' for a 0.7-0.8 Mm3 strand). modellingRuns records
// that unit as lastLithBlock.openBelow ({ unit, top, floorRL }, #2917). Its solid is now left out unless asked for, and when built it is
// named and tooltipped for what it is. Pure; ViewerModule's addUnitVolumes asks and builds.

// openBelow, a block label -> true when that label is the run's open lowest unit
export const isOpenUnit = (openBelow, label) => !!openBelow && openBelow.unit != null && String(label) === String(openBelow.unit);

// The solid's name, tooltip line and notice line (project data stays English; the notice line is translated by the caller's tr).
// -> { name, tip, where } ; where: "below Top of X, to the box floor at RL n" (or without the RL in a trend's warped frame)
export function openUnitText(openBelow, label, modelTitle, when) {
  const top = openBelow?.top || `the top of ${label}`;
  const where = openBelow?.floorRL != null ? `below ${top}, to the box floor at RL ${openBelow.floorRL}` : `below ${top}, to the box floor`;
  return {
    where,
    name: `${label} volume, ${where} (${String(modelTitle || "").replace(/^stack /, "")}, ${when})`,
    tip: `${label}: no base modelled — this solid is everything ${where}, not the unit's own body`,
  };
}
