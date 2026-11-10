// TASKS.csv #2363 (review #2325, WA uranium) — the vertical exaggeration a new section opens at, from its own shape. A 2.6 km
// section through 90 m of flat palaeochannel opened at 1x: a 1052 x 191 px strip with the elevation ticks printed over each
// other. A section more than ten times longer than it is high opens at length / (10 x height), rounded, between 1x and 20x
// (the VE box's range); one that is not stays at true scale. The user's own value is kept from then on (SectionWindow).
export const MAX_SECTION_VE = 20;

export function defaultSectionVE(lengthM, heightM) {
  const L = Number(lengthM), H = Number(heightM);
  if (!(L > 0) || !(H > 0)) return 1;
  return Math.min(MAX_SECTION_VE, Math.max(1, Math.round(L / (10 * H))));
}
