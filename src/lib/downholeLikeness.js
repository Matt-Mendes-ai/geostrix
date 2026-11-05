// TASKS.csv #1709 (review #1645, Copley) — do these "survey stations" lie on the ground, or down the holes? Copley's 2,619 downhole
// magnetic-susceptibility readings (z 557-903 m, every one at or below its collar, up to 284 m below) imported as a surface point
// survey without a word, were gridded flat to 7 cells, and were offered to the inversion as 2,619 TMI stations at 0.7 m spacing.
// A surface station sits near the ground: the terrain where there is one, else the nearest collar's elevation (a collar is on the
// ground) allowing for a slope between them (a station 300 m from a collar on a 20 % hillside can be 60 m below it). Downhole
// readings sit tens to hundreds of metres below the ground close to a collar in plan: their drop is far steeper than any slope.
// downholeLikeness(points, collars, groundAt) -> { n, withZ, compared, below, share, medianDropM, maxDropM, nearCollarShare,
// isDownhole } or null (no elevations, or nothing to compare with). groundAt(x, y) -> z | NaN is optional (the terrain).
export function downholeLikeness(points, collars, groundAt = null, { tolM = 10, slope = 0.2, padM = 15 } = {}) {
  const pts = (points || []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));
  const withZ = pts.filter((p) => Number.isFinite(p.z));
  const cs = (collars || []).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y) && Number.isFinite(c?.z));
  if (!withZ.length || (!cs.length && typeof groundAt !== "function")) return null;
  const nearest = (p) => { let best = null, bd = Infinity; for (const c of cs) { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; best = c; } } return { c: best, d: bd }; };
  const drops = [];
  let below = 0, nearCollar = 0, compared = 0;
  for (const p of withZ) {
    const nc = cs.length ? nearest(p) : null;
    if (nc && nc.d <= padM) nearCollar++;
    let ground = typeof groundAt === "function" ? groundAt(p.x, p.y) : NaN, allow = tolM;
    if (!Number.isFinite(ground) && nc) { ground = nc.c.z; allow = tolM + slope * nc.d; } // a collar some way off: a hillside between
    if (!Number.isFinite(ground)) continue;
    compared++;
    const drop = ground - p.z;
    drops.push(drop);
    if (drop > allow) below++;
  }
  if (!compared) return null;
  drops.sort((a, b) => a - b);
  const share = below / compared, medianDropM = drops[drops.length >> 1], maxDropM = drops[drops.length - 1];
  const nearCollarShare = cs.length ? nearCollar / withZ.length : 0;
  // most readings well below the ground, by more than a hillside could explain: these are not stations
  const isDownhole = share >= 0.5 && medianDropM >= 20;
  return { n: pts.length, withZ: withZ.length, compared, below, share, medianDropM, maxDropM, nearCollarShare, isDownhole };
}
