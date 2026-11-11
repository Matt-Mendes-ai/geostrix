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
  const sites = [];
  for (const c of collars || []) {
    if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y)) continue;
    const s = sites.find((q) => Math.hypot(q.x - c.x, q.y - c.y) <= padM);
    if (s) { s.n++; s.x += (c.x - s.x) / s.n; s.y += (c.y - s.y) / s.n; } else sites.push({ x: c.x, y: c.y, n: 1 });
  }
  if (sites.length < 2) return null;
  const nn = sites.map((a) => Math.min(...sites.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.y - b.y)))).sort((a, b) => a - b);
  return { sites: sites.length, nearestM: nn[0], medianM: nn[nn.length >> 1], farthestM: nn[nn.length - 1], padM };
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
