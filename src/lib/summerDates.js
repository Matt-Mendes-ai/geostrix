// TASKS.csv #2464 (review #2325, WA uranium) — Spectral index proposed 1 July to 15 September (a northern summer) on a project at 30 S. The last
// completed summer of the project's hemisphere: 1 July to 15 September in the north (as before), 1 December to 28 February in the south;
// unknown latitude counts as north. now: a Date (for tests). -> { from, to } as YYYY-MM-DD. Pure.
// TASKS.csv #3000 / #3473 (WA iron review) — in the tropics (within 23.5 degrees) the clear season is the DRY one, not the 'summer': the Pilbara's
// December to February is its cloudy cyclone season. The last completed dry season: 1 June to 15 September in the southern tropics, 1 December
// to 15 March in the northern ones.
export function lastSummer(lat = null, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth(); // 0 = January
  if (Number.isFinite(lat) && Math.abs(lat) < 23.5) {
    if (lat < 0) { const yy = y - (m < 9 ? 1 : 0); return { from: `${yy}-06-01`, to: `${yy}-09-15` }; }
    const end = m >= 3 ? y : y - 1; // a northern dry season ends in March: done by April
    return { from: `${end - 1}-12-01`, to: `${end}-03-15` };
  }
  if (Number.isFinite(lat) && lat < 0) {
    const end = m >= 2 ? y : y - 1; // a southern summer ends in February: done by March
    return { from: `${end - 1}-12-01`, to: `${end}-02-28` };
  }
  const yy = y - (m < 9 ? 1 : 0); // done by October
  return { from: `${yy}-07-01`, to: `${yy}-09-15` };
}
