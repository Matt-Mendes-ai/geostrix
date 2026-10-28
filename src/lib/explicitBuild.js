// TASKS.csv #901 — the Explicit surface pane's pure decisions, moved out of the component so they are tested in Node (the
// #855 review: "testable logic lives in the component ... against the repo's own rule"). No behaviour change.
// Pure: no React, no three.js.

// a short, stable fingerprint of what the surface is built from: rebuilt only when it changes
export function inputKey(def, ep, hasTerrain, faultGeo = null, trend = null) {
  const s = JSON.stringify([ep.points.map((p) => [p.x, p.y, p.z].map((v) => Math.round(v * 100))), def.margin ?? null, def.resolution || 80, !!(def.cutAtTerrain && hasTerrain), ...(def.shape ? [def.shape] : []),
    ...(def.boundedBy ? [def.boundedBy.surfaceId, def.boundedBy.side, faultGeo] : []), ...(trend ? [[trend.dip, trend.dipAzimuth, trend.pitch, trend.ratios?.max, trend.ratios?.int]] : [])]); /* trend: #881 (none: same key as before) */ // boundedBy: TASKS.csv #861 (absent: same key as before) // shape: #824 (absent on older surfaces: same key as before, no rebuild)
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${ep.points.length}:${(h >>> 0).toString(36)}`;
}

// TASKS.csv #824 — the shape the fit uses: the one chosen, or automatic; automatic with lines drawn on sections follows the
// lines' own apparent dip (under 45 deg: elevation over the map), not a best-fit plane that can stand across the sections;
// a surface made before #824 has no shape and keeps the best-fit-plane rule it was built with ("auto" in the fit).
export function shapeFrame(shape, apparentDip) {
  if (shape === "map" || shape === "plane") return shape;
  if (shape === "auto" && apparentDip != null) return apparentDip < 45 ? "map" : "plane";
  return "auto";
}

// TASKS.csv #824 — lines on ONE section only (and nothing off it): every point lies in that section's plane, so the
// "surface" would be a sheet standing in the section. ep: explicitPoints' result; drawnImageCount: section images with a
// line drawn on them. A pick or a mapped contact anywhere gives it a third dimension, so it builds.
export function onlyOneSection(ep, drawnImageCount) {
  return !ep.picks && !ep.mapLines && drawnImageCount + ep.sections === 1;
}

// TASKS.csv #880 — the raw inputs of explicit surfaces as table rows, for a CSV an auditor or another package can read
// (Matt: "Yes, build it"): every pick, every vertex of a section line drawn for the surface, every vertex of a line drawn
// on a section image. Mapped contacts, dip guides and downhole dip guides (#1056) are derived from the map or the core at
// build time and are not listed (their source is the map layer / the structure table). Coordinates are the project CRS; md is metres down the hole for picks on holes.
export const INPUT_COLUMNS = ["surface", "unit", "contact", "layer", "source", "ref", "vertex", "hole_id", "md", "above", "below", "easting", "northing", "elevation", "seeded_from_logs", "pick_id"];
export function explicitInputRows(defs, sections) {
  const rows = [];
  const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : "");
  for (const d of defs || []) {
    const base = { surface: d.name, unit: d.unit || d.name, contact: d.contact === "lower" ? "lower" : "upper", layer: d.layer || "" };
    for (const p of d.picks || []) rows.push({ ...base, source: p.hole_id ? (p.src === "boundary" ? "pick on a logged contact" : "pick on a hole trace") : p.fromDxf ? "imported DXF point" : "pick (3D point)", ref: p.fromDxf || "", vertex: "", hole_id: p.hole_id || "", md: r3(p.md), above: p.above || "", below: p.below || "", easting: r3(p.x), northing: r3(p.y), elevation: r3(p.z), seeded_from_logs: p.seeded ? "yes" : "", pick_id: p.id || "" });
    for (const s of sections || []) for (const c of s.contacts || []) {
      if (c.unit !== d.name || c.isUpperContact === false || (c.kind && c.kind !== "contact")) continue;
      (c.points || []).forEach((p, i) => rows.push({ ...base, source: "line on a section", ref: s.name, vertex: i + 1, hole_id: p.hole_id || "", md: r3(p.md), above: "", below: "", easting: r3(p.x), northing: r3(p.y), elevation: r3(p.z), seeded_from_logs: "", pick_id: "" }));
    }
    (d.lines || []).forEach((l, li) => (l.pts || []).forEach((p, i) => rows.push({ ...base, source: l.imageId === "dxf" ? "imported DXF string" : "line on a section image", ref: l.imageId === "dxf" ? l.source || "DXF" : `${l.imageId || "image"} line ${li + 1}`, /* dxf: #875 */ vertex: i + 1, hole_id: "", md: "", above: "", below: "", easting: r3(p.x), northing: r3(p.y), elevation: r3(p.z), seeded_from_logs: "", pick_id: "" })));
  }
  return rows;
}

