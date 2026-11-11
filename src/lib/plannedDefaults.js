// TASKS.csv #2450 (review #2325, WA uranium) — a planned hole's starting azimuth, dip and length from the drilling, not az 0 / dip -60 /
// 100 m: on 430 vertical holes 33-93 m deep the form opened on an inclined 100 m hole, and "Solve collar" after a hand-over gave a 102.8 m
// inclined hole for a target 63 m under flat ground. Stored dips are degrees BELOW horizontal (#339: import flips a -90 file to 90); the
// form's dip is negative-down, as planned holes store it. Pure.

import { median } from "./arrayStats.js"; // TASKS.csv #1114 — the one median

// collars [{ hole_id, dip?, azimuth?, length? }], survey [{ hole_id, depth, dip, azimuth }] -> { azimuth, dip, length, n } or null
export function drilledDefaults(collars, survey = []) {
  const first = new Map();
  for (const s of survey || []) {
    if (!Number.isFinite(Number(s?.dip))) continue;
    const cur = first.get(s.hole_id);
    if (!cur || Number(s.depth) < Number(cur.depth)) first.set(s.hole_id, s);
  }
  const dips = [], azs = [], lens = [];
  for (const c of collars || []) {
    const st = first.get(c.hole_id);
    const dip = Number.isFinite(Number(c.dip)) ? Number(c.dip) : st ? Number(st.dip) : NaN;
    const az = Number.isFinite(Number(c.azimuth)) ? Number(c.azimuth) : st ? Number(st.azimuth) : NaN;
    // downward holes only (an uphole is a design of its own); #2582 — the azimuth from the INCLINED ones: a vertical hole's azimuth (often 0) is
    // meaningless, and 4 vertical aircore holes pulled 12 RC holes at 074 to a default of 058
    if (Number.isFinite(dip) && dip > 0) { dips.push(dip); if (Number.isFinite(az) && dip < 85) azs.push(az); }
    if (Number(c.length) > 0) lens.push(Number(c.length));
  }
  if (dips.length < 3 && lens.length < 3) return null;
  const d = dips.length >= 3 ? median(dips) : 60;
  // the azimuth matters only when the holes are inclined: a circular mean of the inclined ones
  let azimuth = 0;
  if (d < 85 && azs.length) {
    const sx = azs.reduce((s, a) => s + Math.sin((a * Math.PI) / 180), 0), cy = azs.reduce((s, a) => s + Math.cos((a * Math.PI) / 180), 0);
    azimuth = Math.round((((Math.atan2(sx, cy) * 180) / Math.PI) + 360) % 360);
  }
  return { azimuth, dip: -Math.round(d), length: lens.length >= 3 ? Math.max(1, Math.round(median(lens))) : 100, n: Math.max(dips.length, lens.length) };
}
