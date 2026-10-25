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
