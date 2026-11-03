// TASKS.csv #1128 / #1127 — Matt: "legend should be added in the layout, not in the cross section. as we should be able
// to move it around and edit it" and "let's have the legend subdivided in groups so it doesn't have to have
// \"lithology\" written in every legend". The section window no longer draws a key (#1043 did); a snapshot to Layout
// comes with a Layout legend bound to it, its rows grouped under a heading per layer.
//
// items: buildSectionPayload's legendItems, [["Lithology: Andesite", color], ["Structure planes: FRAC", color],
// ["Model: Unit A", color]] -> Layout legend rows: [heading, null, { heading: true }] then [label, color] for each group
// (no heading when there is one group, as legendGroupsToItems does). Rows already carrying options (a list grouped
// before) are returned unchanged, so this is safe to apply twice.
export function groupSectionLegend(items) {
  const rows = (items || []).filter((it) => it && it[0] != null);
  if (rows.some((it) => it[2])) return rows;
  const groups = new Map();
  for (const [label, color] of rows) {
    const s = String(label), i = s.indexOf(": ");
    const g = i > 0 ? s.slice(0, i) : "", name = i > 0 ? s.slice(i + 2) : s;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push([name, color]);
  }
  const multi = groups.size > 1, out = [];
  for (const [g, list] of groups) {
    if (multi && g) out.push([g, null, { heading: true }]);
    out.push(...list);
  }
  return out;
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
