// TASKS.csv #4002 — the bars along the trace (#3943) in the section window: the 3D view's chosen minerals as lanes beside each hole and, when the
// 3D view draws the assays as bars, the section's grade bars (#392) in the same look (each element its own hue, the 3D view's scale: its full bar
// at the project's 98th percentile). Same choices, colours and scale as the 3D view, so a bar reads the same in both; nothing when the 3D view
// draws no bars. Pure: sectionPayload.js calls it, SectionWindow's SectionSVG draws the result and its key lists keyRows.
import { MAX_BARS, mineralBars, assayBarScale, mineralBarColour } from "./traceBarsData.js";

const fmt = (v) => String(+Number(v).toPrecision(3));
const scaleText = (s) => `▮ = ${fmt(s.full)}${s.unit ? ` ${s.unit}` : ""}`;

// mnlgy: { rows, chosen, on, shown(row), codeColour(code) } -> the 3D view's Mineralization bars on the holes in holeIds, clipped by clip(hole, from, to)
// to the runs inside the buffer; assay: { on, rows, syms, units, hue(sym) } -> each drawn element's lane, colour and full bar.
// -> { mineralBars: { bars: [{ hole_id, from, to, lane, f, v }], lanes: [{ id, label, colour, full, unit }] } | null, assayLanes: { [sym]: { lane, colour, full, unit } } | null, keyRows }
export function sectionBarSets({ holeIds, clip = null, mnlgy = null, assay = null, mineralTitle = "Mineralization" }) {
  const keyRows = [];
  let mineral = null, assayLanes = null;
  const chosen = Array.isArray(mnlgy?.chosen) ? mnlgy.chosen.slice(0, MAX_BARS) : [];
  if (mnlgy?.on && chosen.length) {
    // the scale from every row (as the 3D view's legend), the bars only on this section's holes
    const { bars, scale } = mineralBars(mnlgy.rows, chosen, { shown: (r) => holeIds.has(r?.hole_id) && (!mnlgy.shown || mnlgy.shown(r)) });
    if (scale.length) {
      const lanes = scale.map((s, i) => ({ ...s, colour: mineralBarColour(s.id, i, mnlgy.codeColour) }));
      const kept = clip ? bars.flatMap((b) => clip(b.hole_id, b.from, b.to).map(([from, to]) => ({ ...b, from, to }))) : bars;
      mineral = { bars: kept, lanes };
      for (const l of lanes) keyRows.push([`${mineralTitle} bars: ${l.label} ${scaleText(l)}`, l.colour]);
    }
  }
  if (assay?.on && assay.syms?.length) {
    const scale = assayBarScale(assay.rows, assay.syms, assay.units || {});
    if (scale.length) {
      assayLanes = Object.fromEntries(scale.map((s, lane) => [s.id, { lane, colour: assay.hue(s.id), full: s.full, unit: s.unit }]));
      for (const s of scale) keyRows.push([`Assay bars: ${s.label} ${scaleText(s)}`, assayLanes[s.id].colour]);
    }
  }
  return { mineralBars: mineral, assayLanes, keyRows };
}

// the section's assay points (buildSectionPayload's { assay: { sym, value, idx } }) drawn as the 3D view's bars: only the elements with a lane,
// in that lane, in the element's hue, f = value / full (capped at 1). Other points pass unchanged.
export function withAssayBarLook(points, assayLanes) {
  if (!assayLanes) return points;
  return points.flatMap((p) => {
    if (!p.assay) return [p];
    const L = assayLanes[p.assay.sym];
    if (!L) return [];
    return [{ ...p, color: L.colour, assay: { ...p.assay, idx: L.lane, f: Math.min(1, Math.max(0, p.assay.value / L.full)) } }];
  });
}
