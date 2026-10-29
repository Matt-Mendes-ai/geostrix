// TASKS.csv #1083 / #1017 — the rows of four smaller exports, moved out of their panels so a Node test can check them:
// catchment samples (CatchmentsPanel), boundary intercepts (BoundaryInterceptsModal), Voronoi declustering
// (SpatialAnalysis), and the layer style file with its reader (LayerInspector). Pure: data in, rows / payload out.
// `crs` is the CRS column text (tabular.js crsCell(project)).

// Catchments: a = the analysis (results, background, threshold, thresholdLabel); column `${symbol}_${unit}` is the value
export function catchmentRows(a, { symbol, unit, crs }) {
  return a.results.map((r) => ({
    rank: r.rank ?? "", sample_id: r.sample_id, x: r.x, y: r.y, crs, [`${symbol}_${unit}`]: r.value ?? "", catchment_km2: r.placed ? r.areaKm2.toFixed(4) : "", own_km2: r.placed ? r.ownKm2.toFixed(4) : "",
    strahler: r.order ?? "", snapped_m: r.placed ? r.moved.toFixed(0) : "", productivity: r.productivity == null ? "" : r.productivity.toFixed(3), anomalous: r.anomalous ? "yes" : "no",
    follow_up_reach_m: r.reachM ? r.reachM.toFixed(0) : "", lithology: r.lith ? r.lith.slice(0, 3).map((l) => `${l.unit} ${l.pct.toFixed(0)}%`).join("; ") : "",
    background: a.background, threshold: a.threshold, rule: a.thresholdLabel, note: r.placed ? "" : "outside the terrain / not placed",
  }));
}

// Boundary intercepts: excluded / soft are Sets of intercept ids
export function boundaryInterceptRows(intercepts, { crs, excluded = new Set(), soft = new Set() }) {
  return intercepts.map((i) => ({ layer: i.layerLabel, hole_id: i.hole_id, unit: i.unit, from_m: i.from, x: i.x.toFixed(2), y: i.y.toFixed(2), z: i.z.toFixed(2), crs, excluded: excluded.has(i.id) ? "yes" : "no", soft: soft.has(i.id) ? "yes" : "no" }));
}

// Voronoi declustering: cells [{ point: {x, y, z, value, label}, area, weight }]
export function voronoiRows(cells, { crs }) {
  return cells.map((c) => ({
    x: c.point.x, y: c.point.y, z: c.point.z ?? "", crs, value: c.point.value, label: c.point.label ?? "",
    voronoi_area: c.area.toFixed(3), decluster_weight: c.weight.toFixed(6),
  }));
}

// The layer style file: each category's colour and label (a legend override first, the layer's own colour / name
// otherwise). Matched by VALUE on import, so it applies to any layer with the same codes.
export function layerStylePayload(layerKey, meta, categories, legendOverride = {}) {
  const entries = {};
  categories.forEach(([value]) => {
    const ov = legendOverride[value] || {};
    entries[value] = { color: ov.color || meta.colorFn(value), label: ov.label || (meta.nameFn ? meta.nameFn(value) : String(value)) };
  });
  return { geostrixStyle: 1, layerKind: layerKey, layerLabel: meta.label, entries };
}

// Reading one back: the entries whose value this layer has, and how many the file held. Throws on a file that is not one.
export function layerStyleEntries(payload, knownValues) {
  if (!payload || typeof payload.entries !== "object" || payload.entries === null) throw new Error("missing 'entries'");
  const known = new Set([...knownValues].map(String));
  const apply = Object.entries(payload.entries).filter(([value]) => known.has(value)).map(([value, e]) => ({ value, color: e?.color || null, label: e?.label || null }));
  return { apply, total: Object.keys(payload.entries).length };
}
