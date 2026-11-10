// TASKS.csv #2530 (review #2486, WA lithium) — the same code in the same 30 holes gave 160.8 Mm³, 4.85 Mm³, 0.53 Mm³, 0.30 Mm³ or nothing,
// depending on the tool, each printed to the cubic metre (528,073 m³). An indicator envelope's volume moves by tens of percent with its cell
// and search, so it is given to two significant figures, beside a check anyone can redo by hand: the logged length of the code times the
// area each hole stands for (the hole spacing squared). The reviewer's hand figure for pegmatite there was 0.48-0.54 Mm³.

// 528,073 -> 530,000; 4,851,143 -> 4,900,000; 0 / bad -> 0
export function roundVolume(m3, sig = 2) {
  const v = Number(m3);
  if (!(v > 0) || !Number.isFinite(v)) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(v)) - (sig - 1));
  return Math.round(v / p) * p;
}

// runs [{ hole_id, from, to }] (the code's merged logged runs), spacingM: the median hole spacing -> { metres, holes, spacingM, m3 } | null
export function loggedVolumeCheck(runs, spacingM) {
  const s = Number(spacingM);
  if (!(s > 0) || !runs?.length) return null;
  let metres = 0;
  const holes = new Set();
  for (const r of runs) { const d = Number(r.to) - Number(r.from); if (d > 0) { metres += d; holes.add(r.hole_id); } }
  if (!(metres > 0)) return null;
  return { metres, holes: holes.size, spacingM: s, m3: metres * s * s };
}
