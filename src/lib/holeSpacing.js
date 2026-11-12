import { drillSiteSpacing } from "./drillSpacing.js"; // TASKS.csv #2545 — the median nearest-collar distance

// TASKS.csv #1738 (review #1645, Copley) — how far apart the holes are, said before an estimate runs and when it fills no block.
// Copley's default Cu estimate (search 50 m, min 2 distinct holes) filled 0 of 183,958 blocks with only the generic reason, though
// its nearest two collars are 103 m apart and every other hole 305-1,348 m from its neighbour on five prospects: reconnaissance
// drilling, where a block between the holes is not supported at all. Collars within `padM` of each other are one drill site
// (#1451: a pad of three collars is not three holes 2 m apart).
// holeSpacingSummary(collars, padM) -> { sites, nearestM, medianM, farthestM } (the nearest-neighbour distance between sites: its
// minimum, median and maximum) or null with fewer than 2 sites
// TASKS.csv #2545 (review #2486, WA lithium) — a 25 m pad merged every collar within 25 m of a site, so a regular 25 m grid read '951 drill
// sites ... typically 50 m from the next' (and the variogram took its lag from that) while the pit is drilled at 10 m. With no padM given the
// pad follows the drilling: a tenth of the median nearest-collar distance, kept between 3 and 25 m (fans from one collar still merge;
// a regular grid does not). result.padM says what was used.
export function holeSpacingSummary(collars, padM = null) {
  if (!(padM > 0)) {
    const raw = drillSiteSpacing(collars, { siteM: 0.01, minBuffer: 0, maxBuffer: Infinity });
    padM = raw ? Math.min(25, Math.max(3, raw.spacing / 10)) : 25;
  }
  const { sites, nn } = sitesAndNearest(collars, padM); // TASKS.csv #3005 — grid-hashed, the same sites and distances as the all-pairs loop
  if (sites.length < 2) return null;
  return { sites: sites.length, nearestM: nn[0], medianM: nn[nn.length >> 1], farthestM: nn[nn.length - 1], padM };
}

// TASKS.csv #3005 (WA iron review) — the site merge and the nearest-neighbour search were all-pairs (sites.find per collar, then every site
// against every other: 8.1 s at 6,400 collars, part of the Estimation dialog's 11 s freeze on open, #3007). Both are grid-hashed now with the
// same result: a collar joins the FIRST site (in creation order, as sites.find did) within padM, the site's position the running mean (it
// drifts at most padM from its first collar, so two cells either side are searched); the nearest neighbour of each site by rings of a grid
// sized to the mean spacing, as lib/drillSpacing.js does (#2798). Checked against the old loop on 60 random sets: identical. -> { sites, nn
// (sorted) }
const NONE = [];
const gkey = (i, j) => i * 67108864 + j;
export function sitesAndNearest(collars, padM) {
  const sites = [], g = new Map();
  for (const c of collars || []) {
    if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y)) continue;
    const i = Math.floor(c.x / padM), j = Math.floor(c.y / padM);
    let hit = null;
    for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) for (const s of g.get(gkey(i + di, j + dj)) || NONE) {
      if ((!hit || s.k < hit.k) && (s.x - c.x) ** 2 + (s.y - c.y) ** 2 <= padM * padM) hit = s;
    }
    if (hit) { hit.n++; hit.x += (c.x - hit.x) / hit.n; hit.y += (c.y - hit.y) / hit.n; continue; }
    const s = { x: c.x, y: c.y, n: 1, k: sites.length };
    sites.push(s);
    const kk = gkey(i, j); if (!g.has(kk)) g.set(kk, []); g.get(kk).push(s);
  }
  if (sites.length < 2) return { sites, nn: [] };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of sites) { if (s.x < minX) minX = s.x; if (s.x > maxX) maxX = s.x; if (s.y < minY) minY = s.y; if (s.y > maxY) maxY = s.y; }
  const cell = Math.max(1e-6, Math.sqrt(Math.max(1, (maxX - minX) * (maxY - minY)) / sites.length));
  const grid = new Map();
  for (const s of sites) { const kk = gkey(Math.floor(s.x / cell), Math.floor(s.y / cell)); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(s); }
  const span = Math.ceil(Math.max(maxX - minX, maxY - minY) / cell) + 1;
  const nn = [];
  for (const s of sites) {
    const i0 = Math.floor(s.x / cell), j0 = Math.floor(s.y / cell);
    let best = Infinity;
    const visit = (i, j) => { const list = grid.get(gkey(i, j)); if (list) for (const o of list) { if (o === s) continue; const d = Math.sqrt((o.x - s.x) ** 2 + (o.y - s.y) ** 2); if (d < best) best = d; } };
    for (let r = 0; r <= span; r++) {
      if (r === 0) visit(i0, j0);
      else { for (let d = -r; d <= r; d++) { visit(i0 + d, j0 - r); visit(i0 + d, j0 + r); } for (let d = -r + 1; d <= r - 1; d++) { visit(i0 - r, j0 + d); visit(i0 + r, j0 + d); } }
      if (best <= r * cell) break; // nothing in a farther ring can be closer
    }
    nn.push(best);
  }
  nn.sort((a, b) => a - b);
  return { sites, nn };
}

// Why a run filled no block, from the rules alone. -> { kind, radiusNeededM } | null (blocks were filled, or nothing to say)
//   "holes-apart": min distinct holes >= 2 and no two sites lie within 2 x the radius of each other (the search sphere of a block
//                  between them cannot reach both): radiusNeededM is half the nearest site spacing, rounded up to 5 m
//   "radius": one hole is enough but the radius is still shorter than the composite reach can be (radiusNeededM null)
export function zeroBlockAdvice({ blocksEstimated, searchRadiusM, minHoles, spacing }) {
  if (!(blocksEstimated === 0)) return null;
  const r = Number(searchRadiusM) > 0 ? Number(searchRadiusM) : Infinity;
  if (spacing && Number(minHoles) >= 2 && spacing.nearestM > 2 * r) return { kind: "holes-apart", radiusNeededM: Math.ceil(spacing.nearestM / 2 / 5) * 5 };
  return { kind: "radius", radiusNeededM: null };
}

// TASKS.csv #2420 — the opening search radius of an estimate: 2.5 x the typical site spacing, to 10 m (at least 10 m)
export const searchFromSpacingM = (medianM) => Math.max(10, Math.round((2.5 * medianM) / 10) * 10);
