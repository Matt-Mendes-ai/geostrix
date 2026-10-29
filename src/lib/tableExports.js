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

// Surface-sample anomaly classes (SurfaceAnomalyControls): the drawn samples with their class, the value they were
// classified on (#1025), isolation, the hot-spot z (#853), the rule and the CRS as columns (#1064)
export function anomalyClassRows(drawn, result, { crs }) {
  return drawn.map((s, i) => ({ sample_id: s.sample_id, x: s.x, y: s.y, medium: s.medium, ...(result.valueName ? { [result.valueName]: Number.isFinite(result.values?.[i]) ? result.values[i] : "" } : {}), class: result.classOf[i] >= 0 ? result.classes[result.classOf[i]].label : "no value", isolated: result.isolated[i] ? "yes" : "", gi_star_z: result.stat && Number.isFinite(result.stat[i]) ? result.stat[i].toFixed(2) : "", class_rule: result.label, crs }));
}

// Surface QAQC report (SurfaceQaqcPanel): one row per batch, then only the failures (standards outside 2 SD, blanks over
// the limit, duplicates over their RPD limit)
export function surfaceQaqcRows({ batches, stds, blanks, pairs, symbol, unit, blankLimit }) {
  return [
    ...batches.map((b) => ({ section: "batch", batch: b.batch, samples: b.samples, standards: b.standard, blanks: b.blank, duplicates: b.duplicate, lab_standards: b.lab.standard, lab_blanks: b.lab.blank, lab_duplicates: b.lab.duplicate, below_target: ["standard", "blank", "duplicate"].filter((k) => b.short[k]).join(" ") })),
    ...stds.flatMap((g) => g.points.filter((p) => p.out2).map((p) => ({ section: `standard ${symbol} (${unit})`, batch: p.batch, sample_id: p.sample_id, code: g.code, value: p.value, expected: g.limits.mean, sd: g.limits.sd, basis: g.limits.certified ? "certified" : "own repeats", z: p.z.toFixed(2), result: p.out3 ? "outside 3 SD" : "outside 2 SD" }))),
    ...blanks.filter((b) => b.fails).map((b) => ({ section: `blank ${symbol} (${unit})`, batch: b.batch, sample_id: b.sample_id, value: b.value, limit: blankLimit, result: "over limit" })),
    ...pairs.filter((p) => p.fails).map((p) => ({ section: `duplicate ${symbol} (${unit})`, batch: p.batch, sample_id: p.sample_id, parent: p.parent_id, original: p.v1, duplicate: p.v2, rpd_pct: p.rpd.toFixed(1), limit_pct: p.limit, type: p.type, result: "over RPD limit" })),
  ];
}

// Model-surface version comparison (SurfaceCompareModal): plain rows, a header block then section / item / A / B
export function surfaceCompareRows({ nameA, nameB, exported, editsMessage, result, paramDiff }) {
  const rows = [
    ["GeoStrix surface version comparison — a record of two runs, NOT evidence that either is correct."],
    ["Exported", exported],
    ["Version A (older)", nameA || ""],
    ["Version B (newer)", nameB || ""],
    [],
  ];
  if (editsMessage) rows.push(["HAND-EDIT WARNING", editsMessage], []); // a CSV row: stays English (TASKS.csv #786)
  rows.push(["section", "item", "version A", "version B"]);
  const f = (v, d) => (v == null || !Number.isFinite(v) ? "" : v.toFixed(d));
  if (result) {
    rows.push(["geometry", "vertices", result.a.vertexCount, result.b.vertexCount]);
    rows.push(["geometry", "triangles", result.a.triangleCount, result.b.triangleCount]);
    rows.push(["geometry", "watertight", result.a.watertight ? "yes" : "no", result.b.watertight ? "yes" : "no"]);
    rows.push(["geometry", "open edges", result.a.openEdgeCount, result.b.openEdgeCount]);
    rows.push(["geometry", "connected bodies", result.a.componentCount ?? "", result.b.componentCount ?? ""]);
    if (result.bothClosed) {
      rows.push(["volume", "enclosed m3", f(result.a.volumeM3, 1), f(result.b.volumeM3, 1)]);
      rows.push(["volume", "delta m3", "", f(result.volumeDeltaM3, 1)]);
      rows.push(["volume", "delta %", "", f(result.volumeDeltaPct, 2)]);
    } else {
      rows.push(["volume", "enclosed m3", "not applicable — at least one version is an open surface", ""]);
    }
    const sep = (label, sv) => sv && rows.push(["separation", `${label} mean m`, f(sv.meanM, 3), ""], ["separation", `${label} median m`, f(sv.medianM, 3), ""], ["separation", `${label} p95 m`, f(sv.p95M, 3), ""], ["separation", `${label} max m`, f(sv.maxM, 3), ""], ["separation", `${label} vertices sampled`, `${sv.sampled} of ${sv.totalVertices}`, ""]);
    sep("B vertices -> A surface", result.bToA);
    sep("A vertices -> B surface", result.aToB);
    rows.push(["separation", "symmetric mean m", f(result.meanSeparationM, 3), ""]);
    rows.push(["separation", "sampled two-sided Hausdorff (lower bound) m", f(result.maxSeparationM, 3), ""]);
  }
  (paramDiff?.changed || []).forEach((c) => rows.push(["parameter changed", c.key, c.fromText, c.toText]));
  (paramDiff?.outcomes || []).forEach((c) => rows.push(["outcome changed", c.key, c.fromText, c.toText]));
  (paramDiff?.onlyA || []).forEach((k) => rows.push(["parameter only in A", k, "", ""]));
  (paramDiff?.onlyB || []).forEach((k) => rows.push(["parameter only in B", k, "", ""]));
  return rows;
}

// Hole-to-surface query (SurfaceQueryModal): plain rows with their header
export function surfaceQueryRows(results, { surfaceName, closed }) {
  const lines = [["hole_id", "surface", "closest_approach_m", "closest_approach_md_m", "n_pierce_points", "pierce_mds_m", "metres_inside", "hole_length_m", "surface_watertight"]];
  results.forEach((r) => lines.push([
    r.hole_id, surfaceName || "",
    r.minDistance != null ? r.minDistance.toFixed(3) : "", r.atMd != null ? r.atMd.toFixed(2) : "",
    r.intercepts.length, r.intercepts.map((i) => i.md.toFixed(2)).join(" "),
    r.insideLength != null ? r.insideLength.toFixed(2) : "", r.totalLength != null ? r.totalLength.toFixed(2) : "",
    closed ? "yes" : "no",
  ]));
  return lines;
}

// A SQL workspace result: the header then the rows, positionally — keyed by column name, a query returning two columns
// of the same name (SELECT a.hole_id, b.hole_id ...) lost one of them (#1083)
export function sqlResultRows(columns, rows) {
  return [columns.slice(), ...rows.map((r) => columns.map((_, i) => r[i] ?? ""))];
}
