// TASKS.csv #1686 (review #1645, Copley) — angles to the core axis logged outside the Structure planes layer: Copley's Structural zones hold
// 51 alphas (FL, FR, VN, BX, SH...) and its custom Veins layer Vein_AvgAngle_TCA1 / TCA2 on 50 intervals, and neither reached
// Structures, the Stereonet, the Downhole plot or the section fans, which all read layers.structure only (the Downhole plot said no hole
// had 'a measured alpha'). They are alpha-only picks (no dip direction without oriented core): { hole_id, depth, value, alpha },
// added beside the structure picks for the tools that take alpha-only picks (#527, #1108, #1130). Nothing is invented: no dip,
// no azimuth, no beta.
const fin = (v) => v !== null && v !== "" && Number.isFinite(Number(v));
const ANGLE_NAME = /(^|[^a-z])(tca\d*|alpha\d*)([^a-z]|$)|angle.?to.?core|core.?axis.?angle/i;

// a zone or interval row's depth: its own depth, else the middle of from / to
const depthOf = (r) => (fin(r.depth) ? Number(r.depth) : fin(r.from) && fin(r.to) ? (Number(r.from) + Number(r.to)) / 2 : null);
const pick = (r, alpha, value, source) => ({ hole_id: r.hole_id, depth: depthOf(r), value: value == null || value === "" ? "?" : String(value), alpha: Number(alpha), dip: null, azimuth: null, alphaOnly: true, source });

// Structural zones: every row with an alpha of 0-90
export function zoneAlphaPicks(zones) {
  return (zones || []).filter((r) => r?.hole_id != null && fin(r.alpha) && Number(r.alpha) >= 0 && Number(r.alpha) <= 90 && depthOf(r) != null).map((r) => pick(r, r.alpha, r.value, "Structural zones"));
}
// the columns of a custom layer named as an angle to the core axis whose values are angles (at least 80 % of the filled ones 0-90)
export function angleColumns(rows) {
  const cols = new Set();
  for (const r of (rows || []).slice(0, 500)) for (const k of Object.keys(r || {})) if (ANGLE_NAME.test(k)) cols.add(k);
  return [...cols].filter((k) => { let n = 0, ok = 0; for (const r of rows) { const v = r?.[k]; if (v == null || v === "") continue; n++; if (fin(v) && Number(v) >= 0 && Number(v) <= 90) ok++; } return n > 0 && ok >= 0.8 * n; });
}
// TASKS.csv #3266 (review #3195, Galore Creek) — an alpha column's beta: the column of the same stem with BETA for ALPHA (FLT_ALPHA /
// FLT_BETA, VN_ALPHA / VN_BETA, Vein_alpha2 / Vein_beta2), matched without case; null when there is none
export function betaColumnOf(col, keys) {
  if (!/alpha/i.test(col)) return null;
  const want = col.replace(/alpha/i, "beta").toLowerCase();
  return (keys || []).find((k) => String(k).toLowerCase() === want) || null;
}
// veins (TASKS.csv #3266): the built-in Veins layer's rows, whose extra columns (VN_ALPHA...) are read as a custom layer's are
export function customAlphaPicks(customLayers, veins = null) {
  const out = [];
  const sources = [...(customLayers || []), ...(Array.isArray(veins) && veins.length ? [{ name: "Veins", rows: veins }] : [])];
  for (const L of sources) {
    const rows = Array.isArray(L?.rows) ? L.rows : [];
    const keys = [...new Set(rows.slice(0, 500).flatMap((r) => Object.keys(r || {})))];
    for (const col of angleColumns(rows)) {
      const bcol = betaColumnOf(col, keys); // #3266
      for (const r of rows) {
        const a = r?.[col];
        if (r?.hole_id == null || !fin(a) || Number(a) < 0 || Number(a) > 90 || depthOf(r) == null) continue;
        const p = pick(r, a, r.value, `${L.name || "Custom layer"} · ${col}`), b = bcol ? r[bcol] : null;
        out.push(fin(b) && Number(b) >= 0 && Number(b) <= 360 ? { ...p, beta: Number(b) } : p);
      }
    }
  }
  return out;
}
// TASKS.csv #3266 — the layer picks that have a beta, oriented as a structure file's alpha / beta picks are (coreOrientation's
// orientFromAlphaBeta) with the hole's surveyed attitude at the pick and the project's reference line (ref: "top" | "bottom", the choice its
// structure picks were imported with). attitudeAt(pick) -> { azimuth, dip } | null. A pick that cannot be oriented (no survey, a near-vertical
// hole) stays alpha-only with its beta and the reason. orient: the coreOrientation function, passed in (this file stays dependency-free).
export function orientPairedPicks(picks, attitudeAt, ref, orient) {
  return (picks || []).map((p) => {
    if (!Number.isFinite(p?.beta) || !p.alphaOnly) return p;
    const att = attitudeAt(p);
    const o = att ? orient({ alphaDeg: p.alpha, betaDeg: p.beta, holeAzDeg: att.azimuth, holeDipDeg: att.dip, useTop: ref === "top" }) : { error: "no collar/survey for this hole" };
    if (o.error) return { ...p, orientError: o.error };
    return { ...p, dip: o.dipDeg, azimuth: o.dipDirDeg, alphaOnly: false, abRef: ref, orientedFrom: `alpha/beta, ${ref}-of-hole line` };
  });
}
// the structure picks with the alpha-only picks from the zones and custom layers after them (the same array when there are none).
// veins / orient (TASKS.csv #3266): the Veins layer's angles too, and a function that orients the picks with a beta (orientPairedPicks)
export function withAlphaOnlyPicks(structure, zones, customLayers, { veins = null, orient = null } = {}) {
  const lp = customAlphaPicks(customLayers, veins);
  const extra = [...zoneAlphaPicks(zones), ...(orient ? orient(lp) : lp)];
  return extra.length ? [...(structure || []), ...extra] : structure || [];
}
