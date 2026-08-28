// TASKS.csv #82 (layer 1 of the geological-modelling architecture the user laid out — see #82's
// TASKS.csv note for the full 12-layer plan this is the first piece of) — drillhole data QA/QC.
// "Before modelling anything, the software should validate..." per that advice. Pure functions, no
// React/three.js here — ViewerModule/DataQCModal call these and render the result.
//
// Deliberately conservative about what counts as an ERROR vs a WARNING vs INFO: an error is something
// that will actively corrupt geometry (a hole with no matching collar, a from > to interval, NaN
// coordinates) or silently misplace it (an out-of-hole-length interval). A warning is something that
// COULD be a real problem but might also be normal for this dataset (very short intervals, a big gap
// between logged intervals, a duplicate hole_id — could be a genuine re-drill). Info is just a
// heads-up with no implied problem (e.g. "N holes have no survey — using straight-hole fallback").

import { pointInBoundary } from "./geoprocessing.js";

const clampSeverityIcon = { error: "🔴", warning: "🟡", info: "🔵" };

function pushIssue(issues, severity, category, holeId, message) {
  issues.push({ severity, category, holeId: holeId || null, message });
}

// ---- Collars ----
function validateCollars(collars) {
  const issues = [];
  const seenIds = new Map(); // hole_id -> count
  const seenCoords = new Map(); // "x,y" (rounded) -> [hole_id]
  collars.forEach((c) => {
    const id = c.hole_id || "(blank)";
    seenIds.set(id, (seenIds.get(id) || 0) + 1);
    if (!c.hole_id) pushIssue(issues, "error", "Collars", null, "A collar row has no hole ID.");
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(c.z)) {
      pushIssue(issues, "error", "Collars", id, "Missing or non-numeric X/Y/Z — this hole cannot be positioned at all.");
    }
    // Azimuth/dip are optional on a collar (only used as a straight-hole fallback when no survey
    // exists for this hole) — checked properly in validateSurveyAndTrajectory below, where the
    // fallback actually gets applied, not here.
    if (c.azimuth != null && Number.isFinite(c.azimuth) && (c.azimuth < 0 || c.azimuth >= 360)) {
      pushIssue(issues, "warning", "Collars", id, `Collar azimuth ${c.azimuth}° is outside 0–360°.`);
    }
    if (c.dip != null && Number.isFinite(c.dip) && (c.dip < -90 || c.dip > 90)) {
      pushIssue(issues, "warning", "Collars", id, `Collar dip ${c.dip}° is outside -90–90° (this app's convention: negative = down).`);
    }
    if (c.length != null && Number.isFinite(c.length) && c.length <= 0) {
      pushIssue(issues, "warning", "Collars", id, `Collar hole length ${c.length} is zero or negative.`);
    }
    if (Number.isFinite(c.x) && Number.isFinite(c.y)) {
      const key = `${Math.round(c.x)},${Math.round(c.y)}`;
      const arr = seenCoords.get(key) || [];
      arr.push(id);
      seenCoords.set(key, arr);
    }
  });
  seenIds.forEach((count, id) => {
    if (count > 1) pushIssue(issues, "warning", "Collars", id, `Hole ID "${id}" appears ${count} times in collars — duplicate import, or a genuine re-drill sharing a name?`);
  });
  seenCoords.forEach((ids, key) => {
    const unique = Array.from(new Set(ids));
    if (unique.length > 1) pushIssue(issues, "warning", "Collars", null, `${unique.length} holes (${unique.join(", ")}) share essentially the same collar location (within 1m) — check for a duplicate import or a coordinate entry error.`);
  });
  return issues;
}

// ---- Survey / trajectory ----
function validateSurveyAndTrajectory(collars, survey) {
  const issues = [];
  const collarIds = new Set(collars.map((c) => c.hole_id));
  const byHole = new Map();
  survey.forEach((s) => {
    if (!byHole.has(s.hole_id)) byHole.set(s.hole_id, []);
    byHole.get(s.hole_id).push(s);
  });
  survey.forEach((s) => {
    if (!collarIds.has(s.hole_id)) pushIssue(issues, "error", "Survey", s.hole_id, `Survey row references hole "${s.hole_id}", which has no matching collar — this hole cannot be desurveyed and won't render.`);
    if (!Number.isFinite(s.depth) || s.depth < 0) pushIssue(issues, "error", "Survey", s.hole_id, `Survey station has an invalid depth (${s.depth}).`);
    if (Number.isFinite(s.azimuth) && (s.azimuth < 0 || s.azimuth >= 360)) pushIssue(issues, "warning", "Survey", s.hole_id, `Survey azimuth ${s.azimuth}° is outside 0–360° @ ${s.depth}m.`);
    if (Number.isFinite(s.dip) && (s.dip < -90 || s.dip > 90)) pushIssue(issues, "warning", "Survey", s.hole_id, `Survey dip ${s.dip}° is outside -90–90° @ ${s.depth}m.`);
  });
  byHole.forEach((stations, holeId) => {
    const sorted = [...stations].sort((a, b) => a.depth - b.depth);
    // Duplicate-depth stations.
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].depth === sorted[i - 1].depth) pushIssue(issues, "warning", "Survey", holeId, `Two survey stations at the same depth (${sorted[i].depth}m) — only one will be used.`);
    }
    // "Impossible trajectory" heuristic: a single station-to-station swing of >45° in azimuth or
    // >30° in dip over a short interval reads as a data-entry error far more often than a real
    // drilling deviation — real holes drift gradually. Flagged as a warning, not an error, since
    // some genuinely aggressive deviations do happen (deflections, wedges).
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1], b = sorted[i];
      if (!Number.isFinite(a.azimuth) || !Number.isFinite(b.azimuth) || !Number.isFinite(a.dip) || !Number.isFinite(b.dip)) continue;
      const dz = b.depth - a.depth;
      if (dz <= 0) continue;
      let dAz = Math.abs(b.azimuth - a.azimuth);
      if (dAz > 180) dAz = 360 - dAz; // shortest angular distance
      const dDip = Math.abs(b.dip - a.dip);
      if (dAz > 45) pushIssue(issues, "warning", "Survey", holeId, `Azimuth jumps ${dAz.toFixed(0)}° between ${a.depth}m and ${b.depth}m — check for a typo or a genuinely sharp deflection.`);
      if (dDip > 30) pushIssue(issues, "warning", "Survey", holeId, `Dip jumps ${dDip.toFixed(0)}° between ${a.depth}m and ${b.depth}m — check for a typo or a genuinely sharp deflection.`);
    }
  });
  const noSurvey = collars.filter((c) => !byHole.has(c.hole_id));
  if (noSurvey.length) {
    pushIssue(issues, "info", "Survey", null, `${noSurvey.length} hole(s) have no survey data — using the straight-hole fallback (collar azimuth/dip/length). Real deviation, if any, isn't captured for ${noSurvey.length === 1 ? "this hole" : "these holes"}.`);
  }
  return issues;
}

// ---- Interval layers (litho/alt/vein/geotech/litho_gc/alt_gc) ----
function validateIntervalLayer(rows, layerLabel, collarIds, holeLengths) {
  const issues = [];
  const byHole = new Map();
  rows.forEach((r) => {
    if (!byHole.has(r.hole_id)) byHole.set(r.hole_id, []);
    byHole.get(r.hole_id).push(r);
    if (!collarIds.has(r.hole_id)) pushIssue(issues, "error", layerLabel, r.hole_id, `Interval references hole "${r.hole_id}", which has no matching collar.`);
    if (!Number.isFinite(r.from) || !Number.isFinite(r.to)) {
      pushIssue(issues, "error", layerLabel, r.hole_id, `Interval has a non-numeric from/to (${r.from}–${r.to}).`);
    } else if (r.from > r.to) {
      pushIssue(issues, "error", layerLabel, r.hole_id, `Interval from (${r.from}) is greater than to (${r.to}) — swapped or mis-entered.`);
    } else if (r.from === r.to) {
      pushIssue(issues, "warning", layerLabel, r.hole_id, `Zero-length interval at ${r.from}m.`);
    }
    const maxDepth = holeLengths.get(r.hole_id);
    if (Number.isFinite(maxDepth) && Number.isFinite(r.to) && r.to > maxDepth + 0.5) {
      pushIssue(issues, "warning", layerLabel, r.hole_id, `Interval to=${r.to}m extends past this hole's own recorded length/survey extent (~${maxDepth.toFixed(0)}m) — depth may be measured-depth vs true-vertical-depth confusion, or a mis-keyed hole ID.`);
    }
    if (!r.value || r.value === "Unknown") pushIssue(issues, "info", layerLabel, r.hole_id, `Interval at ${Number.isFinite(r.from) ? r.from : "?"}–${Number.isFinite(r.to) ? r.to : "?"}m has no code/value.`);
  });
  byHole.forEach((intervals, holeId) => {
    const sorted = [...intervals].filter((r) => Number.isFinite(r.from) && Number.isFinite(r.to)).sort((a, b) => a.from - b.from);
    // Bug-hunt pass: only comparing each interval to its immediate predecessor (sorted by `from`)
    // missed an interval fully NESTED inside an earlier, longer one when it didn't overlap its own
    // immediate neighbor — e.g. 0-50, 10-20, 15-100 sorted by from is 0-50, 10-20, 15-100; 15-100
    // overlaps 10-20 (adjacent, caught) but 10-20 overlapping 0-50 (two back) needed its own check.
    // Track the running max `to` seen so far and which interval produced it, so any interval starting
    // before that running max — not just before its immediate neighbor — gets flagged.
    let maxEnd = -Infinity, maxEndOwner = null;
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      if (i > 0) {
        const prev = sorted[i - 1];
        if (cur.from < maxEnd - 0.01 && maxEndOwner) {
          pushIssue(issues, "warning", layerLabel, holeId, `Overlapping intervals: ${maxEndOwner.from}–${maxEndOwner.to}m (${maxEndOwner.value}) and ${cur.from}–${cur.to}m (${cur.value}).`);
        } else if (cur.from > prev.to + 0.01 && cur.from >= maxEnd - 0.01) {
          const gap = cur.from - prev.to;
          if (gap > 1) pushIssue(issues, "info", layerLabel, holeId, `Gap of ${gap.toFixed(1)}m between ${prev.to}m and ${cur.from}m (unlogged interval).`);
        }
      }
      if (cur.to > maxEnd) { maxEnd = cur.to; maxEndOwner = cur; }
    }
    // Exact duplicate intervals (same from/to/value) — almost always a double-import.
    const seen = new Set();
    sorted.forEach((r) => {
      const key = `${r.from}|${r.to}|${r.value}`;
      if (seen.has(key)) pushIssue(issues, "warning", layerLabel, holeId, `Duplicate interval ${r.from}–${r.to}m (${r.value}) — likely imported twice.`);
      seen.add(key);
    });
  });
  return issues;
}

// ---- Point layers (mnlgy/magsusc) and structure ----
function validatePointLayer(rows, layerLabel, collarIds, holeLengths) {
  const issues = [];
  rows.forEach((r) => {
    if (!collarIds.has(r.hole_id)) pushIssue(issues, "error", layerLabel, r.hole_id, `Point references hole "${r.hole_id}", which has no matching collar.`);
    const depth = r.depth ?? r.from;
    if (!Number.isFinite(depth) || depth < 0) pushIssue(issues, "error", layerLabel, r.hole_id, `Point has an invalid depth (${depth}).`);
    const maxDepth = holeLengths.get(r.hole_id);
    if (Number.isFinite(maxDepth) && Number.isFinite(depth) && depth > maxDepth + 0.5) {
      pushIssue(issues, "warning", layerLabel, r.hole_id, `Point at ${depth}m extends past this hole's own recorded length/survey extent (~${maxDepth.toFixed(0)}m).`);
    }
  });
  return issues;
}

// ---- Assays (TASKS.csv #221 — this table was never checked at all: "Run data QC" scanned collars,
// survey, and every litho/alt/vein/geotech/point layer, but a project could have 35 QC errors across
// those AND zero assay-related issues reported, because nothing here ever looked at `assays`). Same
// shape of checks as validateIntervalLayer (hole existence, from/to sanity, overlaps, duplicates) plus
// per-element numeric sanity on `values`, since an assay row's payload (multiple element results) has
// no equivalent in the single-`value` interval layers above.
function validateAssays(assays, collarIds, holeLengths) {
  const issues = [];
  const byHole = new Map();
  assays.forEach((a) => {
    if (!byHole.has(a.hole_id)) byHole.set(a.hole_id, []);
    byHole.get(a.hole_id).push(a);
    if (!collarIds.has(a.hole_id)) pushIssue(issues, "error", "Assays", a.hole_id, `Assay interval references hole "${a.hole_id}", which has no matching collar.`);
    if (!Number.isFinite(a.from) || !Number.isFinite(a.to)) {
      pushIssue(issues, "error", "Assays", a.hole_id, `Assay interval has a non-numeric from/to (${a.from}–${a.to}).`);
    } else if (a.from > a.to) {
      pushIssue(issues, "error", "Assays", a.hole_id, `Assay interval from (${a.from}) is greater than to (${a.to}) — swapped or mis-entered.`);
    } else if (a.from === a.to) {
      pushIssue(issues, "warning", "Assays", a.hole_id, `Zero-length assay interval at ${a.from}m.`);
    }
    const maxDepth = holeLengths.get(a.hole_id);
    if (Number.isFinite(maxDepth) && Number.isFinite(a.to) && a.to > maxDepth + 0.5) {
      pushIssue(issues, "warning", "Assays", a.hole_id, `Assay interval to=${a.to}m extends past this hole's own recorded length/survey extent (~${maxDepth.toFixed(0)}m).`);
    }
    const values = a.values || {};
    const symbols = Object.keys(values);
    if (!symbols.length) {
      pushIssue(issues, "info", "Assays", a.hole_id, `Assay interval at ${Number.isFinite(a.from) ? a.from : "?"}–${Number.isFinite(a.to) ? a.to : "?"}m has no element results.`);
    } else {
      symbols.forEach((sym) => {
        const v = values[sym];
        if (v != null && !Number.isFinite(v)) pushIssue(issues, "warning", "Assays", a.hole_id, `${sym} value "${v}" at ${a.from}–${a.to}m is not numeric.`);
        else if (Number.isFinite(v) && v < 0) pushIssue(issues, "warning", "Assays", a.hole_id, `${sym} value ${v} at ${a.from}–${a.to}m is negative — assay results shouldn't be below zero.`);
      });
    }
  });
  byHole.forEach((intervals, holeId) => {
    const sorted = [...intervals].filter((a) => Number.isFinite(a.from) && Number.isFinite(a.to)).sort((a, b) => a.from - b.from);
    let maxEnd = -Infinity, maxEndOwner = null;
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      if (i > 0 && cur.from < maxEnd - 0.01 && maxEndOwner) {
        pushIssue(issues, "warning", "Assays", holeId, `Overlapping assay intervals: ${maxEndOwner.from}–${maxEndOwner.to}m and ${cur.from}–${cur.to}m.`);
      }
      if (cur.to > maxEnd) { maxEnd = cur.to; maxEndOwner = cur; }
    }
    const seen = new Set();
    sorted.forEach((a) => {
      const key = `${a.from}|${a.to}`;
      if (seen.has(key)) pushIssue(issues, "warning", "Assays", holeId, `Duplicate assay interval ${a.from}–${a.to}m — likely imported twice.`);
      seen.add(key);
    });
  });
  return issues;
}

// ---- Project-level ----
function validateProject(project) {
  const issues = [];
  if (!project?.epsg) pushIssue(issues, "warning", "Project", null, "No EPSG/CRS set for this project — collars/survey/rasters are assumed to already share one consistent CRS, but nothing here confirms it.");
  return issues;
}

// ---- Boundaries/claims (TASKS.csv #125) ----
// QGIS-specialist audit finding: "#82's QC is excellent for collars/survey/intervals, but there's
// nothing for general vector layers ... no dangling-vertex, self-intersection, or overlap checks for
// boundaries/claims, which QGIS's Topology Checker plugin covers routinely for claim/tenure work."
// Distinct concern from every check above — this is 2D polygon topology, not drillhole geometry.

// Two segments (p1->p2, p3->p4) intersect — standard orientation/cross-product test, excluding the
// shared-endpoint case (adjacent edges in the same ring always "touch" at their common vertex, which
// isn't a topology error).
function segmentsIntersect(p1, p2, p3, p4) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return false;
}

// Checks one ring for zero-length (duplicate consecutive vertex) edges and self-intersection (any two
// non-adjacent edges crossing — a real "bowtie" shape, which usually means a hand-digitized or
// exported claim boundary has its vertices out of order rather than a genuinely self-crossing
// property line). O(n²) edge-pair comparisons — fine at the tens-to-low-hundreds of vertices a real
// claim/boundary .ply or .dxf actually has.
function checkRingTopology(pts, label, boundaryName, issues) {
  const n = pts.length;
  if (n < 3) return;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) {
      pushIssue(issues, "warning", label, boundaryName, `Two consecutive vertices are at (near) the same point (~${a.x.toFixed(1)}, ${a.y.toFixed(1)}) — a zero-length edge.`);
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Skip edges that share a vertex (adjacent, including the ring's own closing edge) — those
      // always "touch", which isn't a self-intersection.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) {
        pushIssue(issues, "error", label, boundaryName, `Self-intersecting boundary — edge ${i + 1} crosses edge ${j + 1}. This will render as a bowtie/twisted shape and its area calculation will be wrong.`);
        return; // one reported crossing is enough to flag the ring as bad — avoids a wall of redundant messages for a badly-ordered vertex list
      }
    }
  }
}

function validateBoundaryTopology(boundaries) {
  const issues = [];
  boundaries.forEach((b) => {
    const label = b.kind === "claim" ? "Claims" : "Boundaries";
    (b.polylines || []).forEach((pts, partIdx) => {
      if (pts.length < 3) return;
      const closed = pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y;
      const ring = closed ? pts.slice(0, -1) : pts; // checkRingTopology already treats the ring as implicitly closed
      checkRingTopology(ring, label, `${b.name}${b.polylines.length > 1 ? ` (part ${partIdx + 1})` : ""}`, issues);
    });
  });
  // Pairwise overlap check between different boundaries — a heuristic (any vertex of one lies inside
  // the other), not a full polygon-clip intersection: catches the common real cases (one boundary
  // wholly or mostly inside another, e.g. an accidentally-reimported duplicate, or two claims that
  // genuinely overlap) without needing a full computational-geometry library, same "practical
  // approximation over exact geometry" tradeoff this app already makes elsewhere (e.g. reprojectGrid's
  // corner-bbox reprojection). Won't catch two polygons that cross without either's vertices landing
  // inside the other (a rare, thin-sliver overlap) — an accepted first-pass limitation.
  for (let i = 0; i < boundaries.length; i++) {
    for (let j = i + 1; j < boundaries.length; j++) {
      const a = boundaries[i], b = boundaries[j];
      const aInB = (a.polylines || []).some((pts) => pts.some((p) => pointInBoundary(p.x, p.y, b.polylines)));
      const bInA = !aInB && (b.polylines || []).some((pts) => pts.some((p) => pointInBoundary(p.x, p.y, a.polylines)));
      if (aInB || bInA) {
        pushIssue(issues, "warning", "Boundaries", null, `"${a.name}" and "${b.name}" appear to overlap — check whether this is intentional (e.g. a renewed claim) or a duplicate import.`);
      }
    }
  }
  return issues;
}

// Runs every check and returns { issues: [...], summary: {error,warning,info}, byCategory: Map }.
// `layers` is the store's full layers object ({litho:[],alt:[],...}); `holeLengths` (hole_id -> max
// known depth) is derived once here from survey (max station depth) falling back to collar.length,
// then reused across every interval/point layer check rather than recomputed per-layer.
export function runDataQC({ project, collars, survey, layers, boundaries, assays }) {
  const collarIds = new Set(collars.map((c) => c.hole_id));
  const holeLengths = new Map();
  collars.forEach((c) => { if (Number.isFinite(c.length)) holeLengths.set(c.hole_id, c.length); });
  const surveyMaxByHole = new Map();
  survey.forEach((s) => {
    if (!Number.isFinite(s.depth)) return;
    const cur = surveyMaxByHole.get(s.hole_id);
    if (cur === undefined || s.depth > cur) surveyMaxByHole.set(s.hole_id, s.depth);
  });
  surveyMaxByHole.forEach((maxDepth, id) => holeLengths.set(id, maxDepth)); // survey extent wins over a stated collar length if both exist

  const issues = [
    ...validateProject(project),
    ...validateCollars(collars),
    ...validateSurveyAndTrajectory(collars, survey),
    ...validateIntervalLayer(layers.litho || [], "Lithology", collarIds, holeLengths),
    ...validateIntervalLayer(layers.alt || [], "Alteration", collarIds, holeLengths),
    ...validateIntervalLayer(layers.vein || [], "Vein", collarIds, holeLengths),
    ...validateIntervalLayer(layers.geotech || [], "Geotech", collarIds, holeLengths),
    ...validateIntervalLayer(layers.recovery || [], "Recovery %", collarIds, holeLengths),
    ...validateIntervalLayer(layers.sg || [], "Specific gravity", collarIds, holeLengths),
    ...validateIntervalLayer(layers.litho_gc || [], "Litho (geochem-derived)", collarIds, holeLengths),
    ...validateIntervalLayer(layers.alt_gc || [], "Alteration (geochem-derived)", collarIds, holeLengths),
    ...validateAssays(assays || [], collarIds, holeLengths),
    ...validatePointLayer(layers.mnlgy || [], "Mineralization", collarIds, holeLengths),
    ...validatePointLayer(layers.magsusc || [], "Mag. susceptibility", collarIds, holeLengths),
    ...validatePointLayer(layers.structure || [], "Structure", collarIds, holeLengths),
    ...validateBoundaryTopology(boundaries || []),
  ];

  const summary = { error: 0, warning: 0, info: 0 };
  issues.forEach((i) => { summary[i.severity] = (summary[i.severity] || 0) + 1; });
  const byCategory = new Map();
  issues.forEach((i) => {
    if (!byCategory.has(i.category)) byCategory.set(i.category, []);
    byCategory.get(i.category).push(i);
  });
  return { issues, summary, byCategory };
}

export { clampSeverityIcon as severityIcon };
