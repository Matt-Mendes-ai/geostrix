// TASKS.csv #1128 / #1127 — Matt: "legend should be added in the layout, not in the cross section. as we should be able
// to move it around and edit it" and "let's have the legend subdivided in groups so it doesn't have to have
// \"lithology\" written in every legend". The section window no longer draws a key (#1043 did); a snapshot to Layout
// comes with a Layout legend bound to it, its rows grouped under a heading per layer.
//
// items: buildSectionPayload's legendItems, [["Lithology: Andesite", color], ["Structure planes: FRAC", color],
// ["Model: Unit A", color]] -> Layout legend rows: [heading, null, { heading: true }] then [label, color] for each group
// (no heading when there is one group, as legendGroupsToItems does). Rows already carrying options (a list grouped
// before) are returned unchanged, so this is safe to apply twice.
import { t as tr } from "./i18n.js"; // TASKS.csv #1637
// TASKS.csv #1637 (review #1497, Lawyers) — a value over LONG_VALUE characters is a description, not a category: the Mineralization
// group listed 25 free-text notes (one ~300 characters) and ran off the sheet. They are left out with a note row. ribbons (the
// section's ribbonOrder) name each interval group's ribbon in its heading, so the parallel ribbons can be told apart in print.
export const LONG_VALUE = 40;
export function groupSectionLegend(items, ribbons = null) {
  const all = (items || []).filter((it) => it && it[0] != null);
  // TASKS.csv #2669 — a ramp row (a numeric custom layer's) becomes its own group after the others: a heading and five value swatches (rampRows),
  // which the window's key, its export and Layout's legend all draw; any other row with options means the list was grouped already
  const ramps = all.filter((it) => it[2]?.ramp), rows = all.filter((it) => !it[2]?.ramp);
  if (rows.some((it) => it[2])) return all;
  const groups = new Map(), long = new Map();
  for (const [label, color, , pattern] of rows) {
    const s = String(label), i = s.indexOf(": ");
    const g = i > 0 ? s.slice(0, i) : "", name = i > 0 ? s.slice(i + 2) : s;
    if (!groups.has(g)) groups.set(g, []);
    if (name.length > LONG_VALUE) { long.set(g, (long.get(g) || 0) + 1); continue; }
    groups.get(g).push(pattern != null ? [name, color, { pattern }] : [name, color]); // #1995 — an FGDC pattern drawn over the colour
  }
  const where = (g) => { const n = ribbons?.length > 1 ? ribbons.indexOf(g) : -1; return n < 0 ? g : tr("{g} (ribbon {n} of {t}, from the left)", { g, n: n + 1, t: ribbons.length }); };
  const multi = groups.size > 1, out = [];
  for (const [g, list] of groups) {
    // TASKS.csv #1865 (review #1646, Kodiak) — a lone group keeps its heading when it names a model or a unit ('3dmesh_utm — Chargeability
    // (mV/V)'): a one-model section came to Layout keyed by five bare numbers. A lone category group (lithology) stays bare, as before.
    if (g && (multi || / — |\(.+\)/.test(g))) out.push([where(g), null, { heading: true }]);
    out.push(...list);
    if (long.get(g)) out.push([tr("+ {n} longer description(s) not listed (over {c} characters)", { n: long.get(g), c: LONG_VALUE }), null, { note: true }]);
  }
  for (const [label, , opt] of ramps) { const rr = rampRows(opt.ramp); if (rr.length) out.push([label, null, { heading: true }], ...rr); }
  return out;
}

// TASKS.csv #1637 — the interval layers' ribbons from left to right on a hole drawn downwards (SectionWindow offsets them 0, +w, -w,
// +2w ... in first-seen order along each trace's normal, which points left on a descending trace). -> group names, e.g. Lithology.
// TASKS.csv #1700 — the interval layers a section carries, one entry per ribbon: { key, label, custom } in first-seen order
export function ribbonLayers(intervals) {
  const seen = new Map();
  for (const r of intervals || []) {
    const k = r.layer || "_";
    if (seen.has(k)) continue;
    const label = String(r.label || ""), i = label.indexOf(": ");
    seen.set(k, { key: k, label: i > 0 ? label.slice(0, i) : label, custom: k.startsWith("custom:") });
  }
  return [...seen.values()];
}

export function ribbonOrder(intervals) {
  const seen = [];
  for (const r of intervals || []) {
    const k = r.layer || "_";
    if (seen.some((s) => s.k === k)) continue;
    const n = seen.length, label = String(r.label || ""), i = label.indexOf(": ");
    seen.push({ k, group: i > 0 ? label.slice(0, i) : label, off: n === 0 ? 0 : (n % 2 ? 1 : -1) * Math.ceil(n / 2) });
  }
  return seen.sort((a, b) => b.off - a.off).map((s) => s.group);
}

// TASKS.csv #1475 (review #1352, Silvertip) — a section of Zn assays came to Layout with a 51-row legend and no Zn: its grade bars
// and their numbers had no key. The assay groups (assayLegendGroups' output) of the elements this section draws, first, as
// "Zn (%): 0.5–2 %" rows; and the mineralization drawn, by name (the logged % left out so each mineral is one row).
// points: buildSectionPayload's points ({ assay: { sym } } for grade bars); intervals / points labels "Mineralization: X (n%)".
export function sectionAssayLegend(points, assayGroups) {
  const drawn = new Set((points || []).filter((p) => p.assay).map((p) => p.assay.sym));
  const out = [];
  for (const g of assayGroups || []) {
    if (!drawn.has(String(g.key).replace(/^assay_/, ""))) continue;
    for (const [label, color] of g.items || []) if (color && color !== "transparent") out.push([`${g.label}: ${label}`, color]);
  }
  return out;
}
export function sectionMineralLegend(intervals, points, groupLabel = "Mineralization") {
  const prefix = `${groupLabel}: `, seen = new Set(), out = [];
  for (const r of [...(intervals || []), ...(points || [])]) {
    const s = String(r?.label || "");
    if (!s.startsWith(prefix) || r.assay) continue;
    const name = s.replace(/\s*\([\d.]+\s*%\)\s*$/, "");
    if (seen.has(`${name}|${r.color}`)) continue;
    seen.add(`${name}|${r.color}`);
    out.push([name, r.color]);
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

// TASKS.csv #1373 (review #1352, Silvertip) — ten generated surfaces were drawn on a section as coloured lines over block-model
// cells, with no name on any of them and no key in the snapshot. The Layout legend now lists the model surfaces cut by the section
// and each block model drawn, its classes as swatches or its ramp as five values from low to high.
// surfaceTraces: [{ name, color }]; voxelSlices: [{ name, legend: voxelLegendGroups' group | null }]
export function rampRows(ramp, n = 5) {
  if (!ramp?.colors?.length || !Number.isFinite(ramp.min) || !Number.isFinite(ramp.max)) return [];
  const { colors, min, max, log } = ramp, rows = [];
  for (let k = 0; k < n; k++) {
    const t = n > 1 ? k / (n - 1) : 0;
    const v = log && min > 0 ? 10 ** (Math.log10(min) + t * (Math.log10(max) - Math.log10(min))) : min + t * (max - min);
    rows.push([String(+v.toPrecision(3)), colors[Math.round(t * (colors.length - 1))]]);
  }
  return rows;
}
export function sectionModelLegend(surfaceTraces, voxelSlices, surfaceGroup = "Model surfaces") {
  const out = [], seen = new Set();
  for (const st of surfaceTraces || []) {
    const k = `${st.name}|${st.color}`;
    if (!st.name || seen.has(k)) continue;
    seen.add(k);
    out.push([`${surfaceGroup}: ${st.name}`, st.color]);
  }
  for (const vs of voxelSlices || []) {
    // the heading is everything before the first ": " (groupSectionLegend): a name such as "Model units: stack SLST" keeps its colon as a dash
    const g = vs.legend, name = String(g?.label || vs.name).replace(/: /g, " – ");
    const rows = g ? (g.ramp ? rampRows(g.ramp) : g.items || []) : [];
    for (const [label, color] of rows) if (color && color !== "transparent") out.push([`${name}: ${label}`, color]);
  }
  return out;
}
