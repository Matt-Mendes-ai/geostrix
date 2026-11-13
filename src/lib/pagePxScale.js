// TASKS.csv #3159 — the Layout sheet's page scale, moved verbatim out of drillPlan.js: the store's layout links (layoutLinks.js)
// need it at startup, and importing it from drillPlan.js put the whole drill-plan drawing code in the startup bundle.
// drillPlan.js re-exports both.
export const PAGE_PX_PER_PAPER_M = 96 / 0.0254; // the Layout sheet is 96 px per inch
export const pxPerMetre = (scale) => PAGE_PX_PER_PAPER_M / Math.max(1, Number(scale) || 1);
