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
export function customAlphaPicks(customLayers) {
  const out = [];
  for (const L of customLayers || []) {
    const rows = Array.isArray(L?.rows) ? L.rows : [];
    for (const col of angleColumns(rows)) for (const r of rows) {
      const a = r?.[col];
      if (r?.hole_id == null || !fin(a) || Number(a) < 0 || Number(a) > 90 || depthOf(r) == null) continue;
      out.push(pick(r, a, r.value, `${L.name || "Custom layer"} · ${col}`));
    }
  }
  return out;
}
// the structure picks with the alpha-only picks from the zones and custom layers after them (the same array when there are none)
export function withAlphaOnlyPicks(structure, zones, customLayers) {
  const extra = [...zoneAlphaPicks(zones), ...customAlphaPicks(customLayers)];
  return extra.length ? [...(structure || []), ...extra] : structure || [];
}
