// TASKS.csv #2363 (review #2325, WA uranium) — the vertical exaggeration a new section opens at, from its own shape. A 2.6 km
// section through 90 m of flat palaeochannel opened at 1x: a 1052 x 191 px strip with the elevation ticks printed over each
// other. A section more than ten times longer than it is high opens at length / (10 x height), rounded, between 1x and 20x
// (the VE box's range); one that is not stays at true scale. The user's own value is kept from then on (SectionWindow).
// TASKS.csv #2933 (WA iron review) / #2387 — that 10:1 target opened a 1,138 m section of 50 m holes as a 105 px strip under 300 px of
// empty window. With `aspect` (the window's plot area, height / width) the VE fills that shape instead: the largest round value
// (1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20) at which the plot still fits, so the 1,138 m section opens at 6x in a 1084 x 655 window.
export const MAX_SECTION_VE = 20;
const ROUND_VE = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];

export function defaultSectionVE(lengthM, heightM, aspect = null) {
  const L = Number(lengthM), H = Number(heightM);
  if (!(L > 0) || !(H > 0)) return 1;
  if (Number.isFinite(aspect) && aspect > 0) {
    const raw = (aspect * L) / H;
    if (!(raw > 1)) return 1;
    let v = 1;
    for (const r of ROUND_VE) if (r <= raw) v = r;
    return Math.min(MAX_SECTION_VE, v);
  }
  return Math.min(MAX_SECTION_VE, Math.max(1, Math.round(L / (10 * H))));
}

// the window's plot area as height / width (the toolbar and the frame's margins taken off), kept between a strip and a square
export const plotAspect = (winW, winH, toolbarH = 190) => (winW > 0 && winH > 0 ? Math.min(1.2, Math.max(0.15, (winH - (toolbarH || 190) - 150) / winW)) : null); // 150: the labels row under the toolbar, the title, subtitle and frame
