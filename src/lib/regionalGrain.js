// TASKS.csv #3911 (platform redesign P8b, design.md section 5, candidate 5) — the regional direction hint: the grain of the published geology map
// around the project (Macrostrat's unit polygons, fetched on a click only through the existing tiles.macrostrat.org vector tiles,
// lib/macrostratFetch.js), as a DIRECTION ONLY: the way the mapped contacts between different units run. A small-scale map says nothing about
// dip, and a region's grain says little about one deposit: the card says "regional direction only, not a dip", is weak or fair (never strong)
// and is never pre-selected (#264: a suggestion with its reason, never a fact). In flat-lying country the contacts follow the hills and show no
// grain: then there is no card, and the helper says so. Pure: the caller hands over the polygons (longitude / latitude).
import { t as tr } from "./i18n.js";
import { describeCandidate, candidateNumbers } from "./trendCandidates.js";

export const REGIONAL_MIN_KM = 20; // the area looked at: the project's own box, at least this wide, centred on it
export const GRAIN_FAIR = 0.5, GRAIN_WEAK = 0.25; // how much of the contact length runs one way (1 = all of it, 0 = no grain)
const SEAM = 1e-6; // degrees: an edge along a tile square or the area box (constant longitude or latitude), not a contact
const deg = 180 / Math.PI;
const n360 = (a) => ((a % 360) + 360) % 360;

// the area to fetch: the project's lon / lat box, widened to REGIONAL_MIN_KM around its centre. box: [lonMin, latMin, lonMax, latMax]
export function regionalArea(box, minKm = REGIONAL_MIN_KM) {
  if (!box || !box.every(Number.isFinite)) return null;
  const lon0 = (box[0] + box[2]) / 2, lat0 = (box[1] + box[3]) / 2, cos = Math.max(0.05, Math.cos((lat0 * Math.PI) / 180));
  const halfLon = Math.max((box[2] - box[0]) / 2, (minKm * 500) / (111320 * cos)), halfLat = Math.max((box[3] - box[1]) / 2, (minKm * 500) / 110574);
  return [lon0 - halfLon, Math.max(-85, lat0 - halfLat), lon0 + halfLon, Math.min(85, lat0 + halfLat)];
}

// features: [{ parts: [[[lon, lat], ...], ...], attributes: { unit } }] (macrostratUnitFeatures) -> the grain of the contacts:
// { strikeDeg (0-180), R, contactKm, polygons, units, strength: "fair" | "weak" | null } or { none: "nopolygons" | "nocontacts" | "nograin", ... }.
// A contact is a polygon edge that is not a seam (a tile square or the area's own edge). Each edge is taken as an axis (its direction and its
// reverse are one), weighted by its length in metres: the mean of the doubled angles gives the strike, its length R how much of it runs one way.
export function regionalGrain(features) {
  const polys = (features || []).filter((f) => f?.parts?.length);
  const units = new Set(polys.map((f) => f.attributes?.unit).filter((u) => u != null && u !== ""));
  if (!polys.length) return { none: "nopolygons", polygons: 0, units: 0 };
  let lat0 = 0, k = 0;
  for (const f of polys) for (const ring of f.parts) for (const p of ring) { if (Number.isFinite(p?.[1])) { lat0 += p[1]; k++; } }
  lat0 = k ? lat0 / k : 0;
  const mx = 111320 * Math.max(0.05, Math.cos((lat0 * Math.PI) / 180)), my = 110574;
  let sx = 0, sy = 0, len = 0;
  if (units.size >= 2) {
    for (const f of polys) for (const ring of f.parts) {
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1], b = ring[i];
        if (!a || !b) continue;
        if (Math.abs(a[0] - b[0]) < SEAM || Math.abs(a[1] - b[1]) < SEAM) continue; // along a tile square or the area box
        const dx = (b[0] - a[0]) * mx, dy = (b[1] - a[1]) * my, l = Math.hypot(dx, dy);
        if (!(l > 0)) continue;
        const t = 2 * Math.atan2(dx, dy); // twice the bearing: an axis
        sx += l * Math.sin(t); sy += l * Math.cos(t); len += l;
      }
    }
  }
  const base = { polygons: polys.length, units: units.size, contactKm: Math.round(len / 100) / 10 };
  if (!(len > 0)) return { none: "nocontacts", ...base };
  const R = Math.hypot(sx, sy) / len, strikeDeg = n360((Math.atan2(sx, sy) * deg) / 2) % 180;
  const strength = R >= GRAIN_FAIR ? "fair" : R >= GRAIN_WEAK ? "weak" : null;
  if (!strength) return { none: "nograin", R: Math.round(R * 100) / 100, ...base };
  return { strikeDeg: Math.round(strikeDeg * 10) / 10, R: Math.round(R * 100) / 100, strength, ...base };
}

// the card for the trend helper: direction only, never suggested
export function regionalCandidate(grain) {
  if (!grain || grain.none) return null;
  const c = { id: "regional", source: "regional", kind: null, dip: 90, dipAzimuth: n360(grain.strikeDeg + 90), directionOnly: true, n: grain.polygons, strength: grain.strength, score: grain.R,
    reason: tr("The direction the contacts between {units} mapped units run in the published geology map around the project ({km} km of contacts, Macrostrat).", { units: grain.units, km: grain.contactKm.toLocaleString() }),
    warnings: [tr("Regional direction only, not a dip: from a small-scale map, and your deposit may differ.")], agreesWith: [], suggested: false, drilling: false };
  c.words = describeCandidate(c);
  c.numbers = candidateNumbers(c);
  return c;
}
// what to say when there is no card
export function regionalNoneText(grain, { offline = false } = {}) {
  if (offline) return tr("No internet connection: the regional geology can't be looked at now.");
  if (grain?.none === "nopolygons") return tr("Macrostrat has no mapped geology around the project.");
  if (grain?.none === "nocontacts") return tr("The published map around the project shows one unit only: no contacts to give a direction.");
  if (grain?.none === "nograin") return tr("The regional geology shows no clear direction here. In flat-lying country the contacts follow the hills, not a grain.");
  return null;
}
