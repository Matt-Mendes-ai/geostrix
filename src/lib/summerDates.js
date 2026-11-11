// TASKS.csv #2464 (review #2325, WA uranium) — Spectral index proposed 1 July to 15 September (a northern summer) on a project at 30 S. The last
// completed summer of the project's hemisphere: 1 July to 15 September in the north (as before), 1 December to 28 February in the south;
// unknown latitude counts as north. now: a Date (for tests). -> { from, to } as YYYY-MM-DD. Pure.
export function lastSummer(lat = null, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth(); // 0 = January
  if (Number.isFinite(lat) && lat < 0) {
    const end = m >= 2 ? y : y - 1; // a southern summer ends in February: done by March
    return { from: `${end - 1}-12-01`, to: `${end}-02-28` };
  }
  const yy = y - (m < 9 ? 1 : 0); // done by October
  return { from: `${yy}-07-01`, to: `${yy}-09-15` };
}
