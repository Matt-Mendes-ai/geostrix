// TASKS.csv #1733 (review #1645, Copley) — the lift and drift the project's own holes show, for the Target panel's 'Lift / Drift °/100 m'
// (its hint said 'use your own holes' surveys' while 526 gyro stations sat in the project). Per hole, from its first to its last survey
// station: lift = how much it flattened (dip, stored positive down, getting smaller) and drift = how far its azimuth turned clockwise, each
// per 100 m; the median over the inclined holes surveyed over at least `minSpanM`. Vertical holes (steeper than 85°) have no azimuth to drift.
// survey: [{ hole_id, depth, azimuth, dip }] -> null or { lift, drift, holes }
export function surveyDeviation(survey, { minSpanM = 30, maxDip = 85 } = {}) {
  const by = new Map();
  for (const s of survey || []) {
    const d = Number(s.depth), dip = Number(s.dip), az = Number(s.azimuth);
    if (!Number.isFinite(d) || !Number.isFinite(dip) || !Number.isFinite(az)) continue;
    (by.get(s.hole_id) || by.set(s.hole_id, []).get(s.hole_id)).push({ d, dip, az });
  }
  const lifts = [], drifts = [];
  for (const st of by.values()) {
    if (st.length < 2) continue;
    st.sort((a, b) => a.d - b.d);
    const a = st[0], b = st[st.length - 1], span = b.d - a.d;
    if (span < minSpanM || Math.abs(a.dip) > maxDip) continue;
    const turn = ((b.az - a.az + 540) % 360) - 180; // the shorter way round
    lifts.push(((Math.abs(a.dip) - Math.abs(b.dip)) / span) * 100);
    drifts.push((turn / span) * 100);
  }
  if (!lifts.length) return null;
  const med = (v) => { const s = v.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  return { lift: med(lifts), drift: med(drifts), holes: lifts.length };
}
