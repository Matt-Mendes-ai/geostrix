// TASKS.csv #2969 — its own module (only the CRS picker, which is lazy, imports it): projectCrs.js is in the startup bundle (#3159).
import { crsCandidatesAt, collarCentreLonLat } from "./projectCrs.js";
import { pointTransform } from "./reproject.js";

// TASKS.csv #2969 (review #2876, WA iron) — the CRS codes for a set of collars: their centre's zone first (crsCandidatesAt), then the zones their
// westmost and eastmost collars sit in. A field across a zone boundary (the WA iron one crosses 120° E) listed GDA94 / MGA zone 51 nowhere in
// the first thirty, behind British Columbia's. The ends are the collars of the smallest and largest easting (two transforms). -> [code]
export function crsCodesForCollars(collars, epsg) {
  const c = collarCentreLonLat(collars, epsg);
  if (!c) return [];
  const out = crsCandidatesAt(c.lon, c.lat).map((x) => x.code);
  const pts = (collars || []).filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y)), T = pointTransform(epsg, 4326);
  if (!T || pts.length < 2) return out;
  let w = pts[0], e = pts[0];
  for (const p of pts) { if (p.x < w.x) w = p; if (p.x > e.x) e = p; }
  for (const p of [w, e]) {
    const [lon, lat] = T(p.x, p.y);
    for (const x of crsCandidatesAt(lon, lat)) if (!out.includes(x.code)) out.push(x.code);
  }
  return out;
}
