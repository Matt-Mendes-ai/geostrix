// TASKS.csv #1341 — a conceptual pit shell: the ultimate pit limit of a block model, the set of blocks that makes the most
// undiscounted money when no block is mined without the blocks over it within the slope (#836's framing). That is a maximum
// closure, solved exactly as a minimum cut (Picard 1976), the same answer Lerchs-Grossmann and pseudoflow give.
// It is an early screen ("does this sit shallow enough for a pit at these prices?"), not a mine plan: no discounting, no
// ramps or berms, one density, one slope, rock outside the block model taken as barren. Pure: runs in a worker.
import { metalOf } from "./gradeTonnage.js";

const G_PER_OZ = 31.1034768, LB_PER_T = 2204.62262;
// TASKS.csv #1617 (review #1497, Lawyers) — a block the estimate itself called single-hole (one hole carrying at least this share of
// the weight, estimation.js DOMINANT_SHARE; test/oneHoleShare1617 keeps the two equal) counts as one hole's ore in the pit, as a
// block with nHoles 1 does: Lawyers' pit said 'Ore from one hole 0 %' while its estimate had called 160 blocks single-hole in effect
export const ONE_HOLE_SHARE = 0.95;
export const oneHoleBlock = (c) => c.nHoles === 1 || c.holeShare >= ONE_HOLE_SHARE;
// TASKS.csv #1748 (review #1645, Copley) — copper in ppm was priced in $/oz and reported in troy ounces ("Contained metal 234M oz"), and $4
// typed in that box made a 91.5 ppm cut-off and a $1.21B margin. A base metal is sold by the pound or tonne whatever unit its grade is in:
// its ppm / g/t / ppb grade is counted in tonnes of metal (1 ppm = 1e-6 t per t), so it takes $/lb and $/t and reports tonnes.
export const BASE_METALS = new Set(["Cu", "Zn", "Pb", "Ni", "Mo", "Co", "Sn", "W", "Sb", "Bi", "U"]);
export function pitMetalOf(unit, element) {
  const m = metalOf(unit);
  if (m && m.unit === "g" && (BASE_METALS.has(String(element || "")) || isUraniumOxide(element))) return { factor: m.factor / 1e6, unit: "t" }; // oxide: #2434
  return m;
}
// TASKS.csv #2434 (review #2325, WA uranium) — uranium is quoted and sold per lb of U3O8, and the pit panes read '$/lb' as per lb of U METAL: an
// $80/lb U3O8 price gave a 167 ppm cut-off (141 ppm at the right basis). A U grade offers $/lb U3O8 first (1 t U = 1.1792 t U3O8), then $/lb U
// and $/kg U; a U3O8 / eU3O8 grade is already the oxide (priced per lb or t of U3O8, counted in tonnes, not troy ounces).
export const U3O8_PER_U = 1.1792;
export const isUranium = (el) => String(el || "") === "U";
export const isUraniumOxide = (el) => /^e?U3O8$/i.test(String(el || ""));
// tonnes of metal one priced unit is (a price per that unit / this = $ per tonne of the counted metal)
export const PRICED_MASS_T = { t: 1, lb: 1 / LB_PER_T, lbU3O8: 1 / (LB_PER_T * U3O8_PER_U), kgU: 0.001 };
export function priceUnitsFor(metal, element) {
  if (!metal) return null;
  if (metal.unit === "t" && isUranium(element)) return [["lbU3O8", "$/lb U3O8"], ["lb", "$/lb U"], ["kgU", "$/kg U"]];
  if (metal.unit === "t" && isUraniumOxide(element)) return [["lb", "$/lb U3O8"], ["t", "$/t U3O8"]];
  return PRICE_UNITS[metal.unit];
}
// contained metal, the same words in every pit pane: troy ounces for gold-style grades; tonnes and pounds for base metals; uranium as tonnes of
// U and pounds of U3O8 (the traded unit), an oxide grade as tonnes and pounds of U3O8. fmt: a number formatter
export function metalAmountText(tonnesOrGrams, metalUnit, element, fmt) {
  if (metalUnit === "g") return `${fmt(tonnesOrGrams / G_PER_OZ)} oz`;
  const t = tonnesOrGrams;
  if (isUranium(element)) return `${fmt(t)} t U (${fmt(t * U3O8_PER_U * LB_PER_T)} lb U3O8)`;
  if (isUraniumOxide(element)) return `${fmt(t)} t U3O8 (${fmt(t * LB_PER_T)} lb U3O8)`;
  return `${fmt(t)} t (${fmt(t * LB_PER_T)} lb)`;
}
// the element a block model holds: its estimate's parameters, else a symbol at the start of its name ("Cu estimate (idw2, 20m)")
export const elementOfModel = (model) => model?.params?.element || (/^([A-Z][a-z]?)\b/.exec(String(model?.name || "")) || [])[1] || null;
// the units a price can be entered in, for a metal counted in grams or in tonnes (gradeTonnage.js metalOf)
export const PRICE_UNITS = { g: [["oz", "$/oz"], ["g", "$/g"]], t: [["lb", "$/lb"], ["t", "$/t"]] };

// economics: { unit (of the block values), price, priceUnit, recovery (%), miningCost, processingCost ($/t rock), revenueFactor? }
// -> { revenuePerGrade: $ per tonne of rock per unit of grade, cutoff: the grade that just pays for processing } or null
export function pitEconomics({ unit, element = null, price, priceUnit, recovery, processingCost, revenueFactor = 1, by = null }) {
  const m = pitMetalOf(unit, element); // #1748
  if (!m) return null;
  const perBase = m.unit === "g" ? (priceUnit === "oz" ? price / G_PER_OZ : price) : price / (PRICED_MASS_T[priceUnit] || 1); // $ per t of metal; lbU3O8 / kgU: #2434
  const revenuePerGrade = m.factor * (recovery / 100) * perBase * revenueFactor;
  if (!(revenuePerGrade > 0)) return null;
  const e = { revenuePerGrade, cutoff: processingCost / revenuePerGrade, metalUnit: m.unit, metalFactor: m.factor };
  // TASKS.csv #1917 (from #1615 Lawyers, #1749 Copley) — a BY-PRODUCT metal (Ag beside Au, Au beside Cu) with its own price and
  // recovery: its revenue per tonne per unit of ITS grade; a block's revenue is the sum over the metals (cellRevenue), so the ore
  // decision and the pit follow both. by: { unit, element, price, priceUnit, recovery }; the revenue factor scales both prices.
  if (by) { const b = pitEconomics({ ...by, by: null, processingCost, revenueFactor }); e.by = b; e.byFailed = !b; }
  return e;
}

// a block's money per tonne: processed if that pays more than sending it to the dump (both pay for mining)
export const marginPerTonne = (grade, e, miningCost, processingCost) => {
  const rev = grade * e.revenuePerGrade;
  return rev > processingCost ? rev - processingCost - miningCost : -miningCost;
};
// TASKS.csv #1917 — a block's revenue per tonne summed over the metals (c.by: its by-product grade, from joinByProduct), and its margin
export const cellRevenue = (c, e) => c.value * e.revenuePerGrade + (e.by && c.by > 0 ? c.by * e.by.revenuePerGrade : 0);
export const cellMargin = (c, e, miningCost, processingCost) => { const rev = cellRevenue(c, e); return rev > processingCost ? rev - processingCost - miningCost : -miningCost; };
// the by-product model's grades joined to the main model's blocks by block centre (to the centimetre): the same grid, so the same
// centres. A block without a match keeps no by-product grade; no match at all means another grid. -> { cells, matched }
export function joinByProduct(cells, byCells) {
  const key = (c) => `${Math.round(c.x * 100)}|${Math.round(c.y * 100)}|${Math.round(c.z * 100)}`;
  const map = new Map();
  for (const b of byCells || []) if (Number.isFinite(b.value)) map.set(key(b), b.value);
  let matched = 0;
  const out = cells.map((c) => { const v = map.get(key(c)); if (v == null) return c; matched++; return { ...c, by: v }; });
  return { cells: out, matched };
}

// TASKS.csv #1353 (review #1352, Silvertip) — with no terrain the pit took ONE flat ground at the top of the highest block,
// above every collar: 100-140 m of air was costed as waste and a paying Zn pit came out empty. The collars are surveyed points on
// the ground: interpolated between them (inverse distance, the 4 nearest), they stand in for the terrain. collars: [{ x, y, z }].
// TASKS.csv #2217 (review #2174, WA underground mine) — the collars are a ground surface only for surface drilling. Collars drilled from
// underground levels (RL 82-352 under a surface at about 390, 12 holes drilled upward) made the estimate drop 3,855 of 36,267 blocks
// 'above the ground', the upholes' grade with them. -> { underground, upward, stacked }: holes drilled upward (a collar or survey dip
// below 0, stored as degrees below horizontal, #339) and pairs of collars within 5 m in plan but over 10 m apart in elevation. Counted
// against the project's size: Woodjam's surface compilation (544 collars) has 2 duplicate collars with conflicting elevations, the WA
// mine 12 upholes in 245 holes. Upward holes: at least 2 and 2 % of the holes; stacked pairs: at least 3 and 5 % of the collars.
export function collarsLookUnderground(collars, survey = []) {
  const up = new Set();
  for (const c of collars || []) if (Number.isFinite(c?.dip) && c.dip < 0) up.add(c.hole_id);
  for (const s of survey || []) if (Number.isFinite(s?.dip) && s.dip < 0) up.add(s.hole_id);
  const pts = (collars || []).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y) && Number.isFinite(c?.z));
  const cells = new Map(), key = (i, j) => `${i},${j}`;
  let stacked = 0;
  for (const c of pts) {
    const i = Math.floor(c.x / 5), j = Math.floor(c.y / 5);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const o of cells.get(key(i + di, j + dj)) || []) {
      if (Math.hypot(o.x - c.x, o.y - c.y) <= 5 && Math.abs(o.z - c.z) > 10) stacked++;
    }
    (cells.get(key(i, j)) || cells.set(key(i, j), []).get(key(i, j))).push(c);
  }
  const n = Math.max(1, (collars || []).length);
  return { underground: up.size >= Math.max(2, 0.02 * n) || stacked >= Math.max(3, 0.05 * n), upward: up.size, stacked };
}
// TASKS.csv #2277 (review #2174, WA lode gold) — how far the ore-grade blocks (value at or above the cut-off grade) lie below the highest
// collar, the nearest the surface the data knows: the pit's own depth is measured from its ground, which on a project drilled from
// underground is a surface through the drill positions. -> null (no collar, no cut-off, no ore block) or { top, min, median, max, n, underground }
export function oreDepthBelowCollars(cells, cutoff, collars, survey = []) {
  const zs = (collars || []).map((c) => c?.z).filter(Number.isFinite);
  if (!zs.length || !Number.isFinite(cutoff)) return null;
  let top = -Infinity;
  for (const z of zs) if (z > top) top = z;
  const d = [];
  for (const c of cells || []) if (Number.isFinite(c?.value) && c.value >= cutoff && Number.isFinite(c.z)) d.push(top - c.z);
  if (!d.length) return null;
  d.sort((a, b) => a - b);
  return { top, min: d[0], median: d[Math.floor(d.length / 2)], max: d[d.length - 1], n: d.length, underground: collarsLookUnderground(collars, survey).underground };
}
// When the depth is worth a verdict: the ore's median 200 m or more below the highest collar (deeper than most open pits' ore), or 100 m
// with the collars underground (drill positions on mine levels: the ore is reached from there). Warning thresholds, not facts about a deposit.
export const DEEP_ORE_M = 200, DEEP_ORE_UNDERGROUND_M = 100;
export const undergroundOreVerdict = (d) => !!d && d.median >= (d.underground ? DEEP_ORE_UNDERGROUND_M : DEEP_ORE_M);

export function collarGround(collars) {
  const pts = (collars || []).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y) && Number.isFinite(c?.z));
  if (!pts.length) return null;
  // TASKS.csv #1903 — the four nearest come out of a cell bucket, ring by ring, with the same answer as sorting every collar: on
  // Lawyers (446 collars) a dump grid of 30-40k cells sorted 446 distances per cell and froze the window 3-5 s; the pit and the
  // pit design use this ground too.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of pts) { if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x; if (c.y < y0) y0 = c.y; if (c.y > y1) y1 = c.y; }
  const cell = Math.max(1, Math.sqrt(Math.max(1, (x1 - x0) * (y1 - y0)) / pts.length)); // about one collar per cell
  const nx = Math.max(1, Math.floor((x1 - x0) / cell) + 1), ny = Math.max(1, Math.floor((y1 - y0) / cell) + 1);
  const buckets = new Map();
  const ci = (x) => Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / cell))), cj = (y) => Math.min(ny - 1, Math.max(0, Math.floor((y - y0) / cell)));
  pts.forEach((c, k) => { const q = cj(c.y) * nx + ci(c.x); (buckets.get(q) || buckets.set(q, []).get(q)).push(k); });
  return (x, y) => {
    const i0 = ci(x), j0 = cj(y), best = []; // up to four [distance, z], ascending
    const take = (k) => {
      const c = pts[k], d = Math.hypot(c.x - x, c.y - y);
      if (best.length === 4 && d >= best[3][0]) return;
      let at = best.length; while (at > 0 && best[at - 1][0] > d) at--;
      best.splice(at, 0, [d, c.z]); if (best.length > 4) best.pop();
    };
    const scan = (i, j) => { if (i < 0 || j < 0 || i >= nx || j >= ny) return; const b = buckets.get(j * nx + i); if (b) for (const k of b) take(k); };
    for (let r = 0; ; r++) {
      // a collar in ring r is at least (r - 1) cells away: once the fourth best is nearer than that, no later ring can beat it
      if (best.length === 4 && best[3][0] <= (r - 1) * cell) break;
      if (i0 - r < 0 && j0 - r < 0 && i0 + r >= nx && j0 + r >= ny) break; // the grid is exhausted
      if (r === 0) scan(i0, j0);
      else { for (let i = i0 - r; i <= i0 + r; i++) { scan(i, j0 - r); scan(i, j0 + r); } for (let j = j0 - r + 1; j <= j0 + r - 1; j++) { scan(i0 - r, j); scan(i0 + r, j); } }
    }
    if (best[0][0] < 1e-6) return best[0][1];
    let w = 0, s = 0;
    for (const [d, z] of best) { const k = 1 / (d * d); w += k; s += k * z; }
    return s / w;
  };
}

// TASKS.csv #1850 (review #1646, Kodiak) — with no terrain AND no collars the pit took ONE flat ground at the model's highest block
// top: on Kodiak 90-255 m of air over the real top of rock was mined as waste at 2.7 t/m3. The block model carries a topography of
// its own, the top of each column's highest block; interpolated between the columns as the collars are (#1353), it stands in for
// the terrain. cells: [{ x, y, z, dz }] -> groundAt(x, y) or null.
export function modelTopGround(cells) {
  const tops = new Map();
  for (const c of cells || []) {
    if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y) || !Number.isFinite(c?.z) || !(c.dz > 0)) continue;
    const k = `${Math.round(c.x * 100)}|${Math.round(c.y * 100)}`, t = c.z + c.dz / 2, p = tops.get(k);
    if (!p) tops.set(k, { x: c.x, y: c.y, z: t }); else if (t > p.z) p.z = t;
  }
  return collarGround([...tops.values()]);
}

// ---------- the grid ----------
// How far a slope lets a wall step sideways per bench decides the arcs. Each is (di, dj, levels up), never flatter than the
// slope, and an arc two others already imply is left out (a block's cone is the same with far fewer arcs).
// Measured (scratchpad pitarcs): more levels hold the slope better in every bearing and cost arcs, memory and time, so the
// pattern is the most levels that stay within MAX_ARCS: 200,000 blocks at 57 arcs each was 440 MB, too much for a cheap laptop.
export const MAX_ARCS = 25;
// TASKS.csv #1881 — a slope per WALL SECTOR: the wall on the north side of the pit (the blocks that must come out north of, and
// above, a mined block) may stand steeper or flatter than the south wall. sectorSlopes: { N, NE, E, SE, S, SW, W, NW } in degrees,
// a missing or empty sector taking the overall slope. An arc's sector is the bearing of its offset from the mined block.
export const SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const sectorOfBearing = (deg) => SECTORS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
export function slopeForSector(slopeDeg, sectorSlopes, sector) {
  const v = sectorSlopes ? Number(sectorSlopes[sector]) : NaN;
  return v > 0 && v < 90 ? v : slopeDeg;
}
export const hasSectorSlopes = (sectorSlopes) => !!sectorSlopes && SECTORS.some((k) => { const v = Number(sectorSlopes[k]); return v > 0 && v < 90; });
// the flattest slope a pit's walls can take, for the grid's reach
export const flattestSlope = (slopeDeg, sectorSlopes) => Math.min(slopeDeg, ...SECTORS.map((k) => slopeForSector(slopeDeg, sectorSlopes, k)));
export function precedenceArcs(dx, dy, dz, slopeDeg, maxLevels = null, sectorSlopes = null) {
  if (maxLevels == null) {
    let best = null;
    for (let L = 1; L <= 8; L++) { const a = precedenceArcs(dx, dy, dz, slopeDeg, L, sectorSlopes); if (a.length > MAX_ARCS) break; best = a; }
    return best;
  }
  const runOf = (a, b) => dz / Math.tan((slopeForSector(slopeDeg, sectorSlopes, sectorOfBearing((Math.atan2(a * dx, b * dy) * 180) / Math.PI)) * Math.PI) / 180);
  const runMax = dz / Math.tan((flattestSlope(slopeDeg, sectorSlopes) * Math.PI) / 180);
  const allowed = [];
  for (let l = 1; l <= maxLevels; l++) {
    const r = l * runMax, ax = Math.floor(r / dx), ay = Math.floor(r / dy);
    for (let a = -ax; a <= ax; a++) for (let b = -ay; b <= ay; b++) if (Math.hypot(a * dx, b * dy) <= l * runOf(a, b) + 1e-9) allowed.push([a, b, l]);
  }
  const key = (a, b, l) => `${a},${b},${l}`, set = new Set(allowed.map(([a, b, l]) => key(a, b, l)));
  return allowed.filter(([a, b, l]) => {
    for (const [p, q, m] of allowed) {
      if (m >= l) continue;
      if (set.has(key(a - p, b - q, l - m))) return false; // reachable in two shorter steps
    }
    return true;
  });
}

// The flattest and steepest wall that pattern really makes, over all bearings, in degrees: it can only stand at or above the
// slope asked for, so a run says what it got.
export function wallAngles(dx, dy, dz, slopeDeg, levels = 32, sectorSlopes = null) {
  const arcs = precedenceArcs(dx, dy, dz, slopeDeg, null, sectorSlopes), reach = Array.from({ length: levels + 1 }, () => new Map());
  reach[0].set("0,0", [0, 0]);
  for (let l = 0; l < levels; l++) for (const [a, b] of reach[l].values()) for (const [p, q, m] of arcs) if (l + m <= levels) reach[l + m].set(`${a + p},${b + q}`, [a + p, b + q]);
  const bins = new Float64Array(16);
  for (const [a, b] of reach[levels].values()) {
    const h = Math.hypot(a * dx, b * dy);
    if (!h) continue;
    const bin = Math.floor(((Math.atan2(b * dy, a * dx) + Math.PI) / (2 * Math.PI)) * 16) % 16;
    if (h > bins[bin]) bins[bin] = h;
  }
  const h = levels * dz, used = Array.from(bins).filter((v) => v > 0), deg = (r) => (Math.atan2(h, r) * 180) / Math.PI;
  // #1881 — the flattest wall in each compass sector (bins run from -180 deg = west, counter-clockwise in (x, y))
  const bySector = {};
  for (let k = 0; k < 16; k++) { if (!(bins[k] > 0)) continue; const ang = -180 + (k + 0.5) * 22.5, bearing = 90 - ang, s = sectorOfBearing(bearing), d = deg(bins[k]); if (bySector[s] == null || d < bySector[s]) bySector[s] = d; }
  return used.length ? { flattest: deg(Math.max(...used)), steepest: deg(Math.min(...used)), bySector } : { flattest: 90, steepest: 90, bySector };
}

// Regular grid over the block model plus room for the walls. cells: [{ x, y, z, dx, dy, dz, value }] in world metres.
// groundAt(x, y) -> elevation or null. Blocks smaller than a grid cell keep their own cut-off decision: a cell's money is the
// sum of its parts, so a coarser grid does not average ore into waste. -> { nx, ny, nz, x0, y0, z0, dx, dy, dz, ground, value, oreT, metalT, wasteT, outsideT, topAssumed }
// TASKS.csv #1875 — `fixed`: another grid's geometry ({ nx, ny, nz, x0, y0, z0, dx, dy, dz, ground, topAssumed, coarsened }), so a
// series of revenue factors shares one grid and its shells nest cell for cell (each RF's own box would start at a different corner)
export function buildPitGrid(cells, { size = null, slopeDeg, sectorSlopes = null, density, economics, miningCost, processingCost, groundAt = null, maxCells = 600000, fixed = null }) {
  const good = cells.filter((c) => Number.isFinite(c.value) && c.dx > 0 && c.dy > 0 && c.dz > 0);
  if (!good.length) return null;
  const med = (k) => good.map((c) => c[k]).sort((a, b) => a - b)[good.length >> 1];
  let dx = size || med("dx"), dy = size || med("dy"), dz = med("dz"); // a typed size is the plan cell; the bench stays the block height (#1854)
  const modelCell = med("dx"), askedSize = size || null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, zLow = Infinity, zHigh = -Infinity, payLow = Infinity;
  good.forEach((c) => {
    x0 = Math.min(x0, c.x - c.dx / 2); x1 = Math.max(x1, c.x + c.dx / 2); y0 = Math.min(y0, c.y - c.dy / 2); y1 = Math.max(y1, c.y + c.dy / 2);
    zLow = Math.min(zLow, c.z - c.dz / 2); zHigh = Math.max(zHigh, c.z + c.dz / 2);
    if (cellMargin(c, economics, miningCost, processingCost) > 0) payLow = Math.min(payLow, c.z - c.dz / 2); // both metals: #1917
  });
  // TASKS.csv #1358 — a pit never goes below its deepest paying block (below it there is only cost), so the grid and the wall reach
  // stop there: on a deep fan-drilled model the reach from the model base forced 25 m blocks up to 39 m for a pit 242 m deep
  if (!Number.isFinite(payLow)) return { empty: true };
  const modelBase = zLow; // #1751 — the model's own base; the grid's base is the deepest paying block (#1358), which is above it
  let nx, ny, nz, ground, topAssumed = 0, coarsened = false, top;
  if (fixed) {
    ({ nx, ny, nz, x0, y0, dx, dy, dz, ground, topAssumed, coarsened } = fixed); zLow = fixed.z0; top = fixed.z0 + nz * dz;
  } else {
    zLow = Math.max(zLow, payLow);
    // the highest ground over the blocks and a first wall reach, then the ground over the wider box
    top = zHigh;
    if (groundAt) for (const c of good) { const g = groundAt(c.x, c.y); if (Number.isFinite(g) && g > top) top = g; }
    const reach = (top - zLow) / Math.tan((flattestSlope(slopeDeg, sectorSlopes) * Math.PI) / 180); // #1881 — the flattest wall decides the room
    // TASKS.csv #1896 — the origin steps back from the blocks' own edge by WHOLE cells, so the grid stays on the block lattice: a
    // block is one cell (or a whole number of them) whatever the slope, the sector slopes or the revenue factor. Stepping back by
    // the raw reach put the origin anywhere within a cell of the lattice, every block then straddled four columns and two levels,
    // and on Lawyers' 53.5 m blocks the margin swung $142M / $185M / $157M for 44 / 45 / 46 degrees.
    const ex0 = x0, ey0 = y0;
    x1 += reach; y1 += reach;
    const dims = () => { x0 = ex0 - Math.ceil(reach / dx - 1e-9) * dx; y0 = ey0 - Math.ceil(reach / dy - 1e-9) * dy; return [Math.max(1, Math.ceil((x1 - x0) / dx)), Math.max(1, Math.ceil((y1 - y0) / dy)), Math.max(1, Math.ceil((top - zLow) / dz))]; };
    [nx, ny, nz] = dims();
    while (nx * ny * nz > maxCells) { dx *= 1.25; dy *= 1.25; dz *= 1.25; [nx, ny, nz] = dims(); coarsened = true; }
    ground = new Float64Array(nx * ny);
    let zTop = -Infinity;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const g = groundAt ? groundAt(x0 + (i + 0.5) * dx, y0 + (j + 0.5) * dy) : null;
      if (Number.isFinite(g)) { ground[j * nx + i] = g; if (g > zTop) zTop = g; } else { ground[j * nx + i] = NaN; topAssumed++; }
    }
    if (!Number.isFinite(zTop)) zTop = top;
    for (let k = 0; k < ground.length; k++) if (!Number.isFinite(ground[k])) ground[k] = top; // no terrain there: the top of the model
    if (zTop > top) { nz = Math.max(1, Math.ceil((zTop - zLow) / dz)); while (nx * ny * nz > maxCells) { dz *= 1.25; nz = Math.max(1, Math.ceil((zTop - zLow) / dz)); coarsened = true; } }
  }
  const z0 = zLow, n = nx * ny * nz, value = new Float64Array(n), oreT = new Float32Array(n), metalU = new Float64Array(n), metalU2 = new Float64Array(n) /* the by-product's metal in the ore (#1917) */, rockT = new Float32Array(n), modelT = new Float32Array(n);
  const oreThin = new Float32Array(n), oreExtrap = new Float32Array(n); // #1354 — ore resting on one hole / classed extrapolated or unsupported
  const at = (i, j, k) => k * nx * ny + j * nx + i;
  // every cell starts as barren rock below the ground
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const g = ground[j * nx + i];
    for (let k = 0; k < nz; k++) {
      const f = Math.min(1, Math.max(0, (g - (z0 + k * dz)) / dz));
      if (f <= 0) break;
      const t = f * dx * dy * dz * density, q = at(i, j, k);
      rockT[q] = t; value[q] = -t * miningCost;
    }
  }
  // TASKS.csv #1616 — an estimate not clipped to the ground leaves blocks in the air; the ore-grade ones are counted so the
  // pane can say what the pit never saw (a block only partly above the ground keeps its part below)
  let oreAboveGroundT = 0, oreAboveGroundBlocks = 0;
  const gAt = (x, y) => { const i = Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / dx))), j = Math.min(ny - 1, Math.max(0, Math.floor((y - y0) / dy))); return ground[j * nx + i]; };
  // each block replaces the barren rock it overlaps, per overlapped cell
  good.forEach((c) => {
    if (cellMargin(c, economics, miningCost, processingCost) > -miningCost && c.z - c.dz / 2 >= gAt(c.x, c.y) - 1e-6) { oreAboveGroundT += c.dx * c.dy * c.dz * (Number.isFinite(c.coverage) ? c.coverage : 1) * density; oreAboveGroundBlocks++; }
    const span = (lo, hi, o, d, N) => [Math.max(0, Math.floor((lo - o) / d)), Math.min(N - 1, Math.ceil((hi - o) / d) - 1)];
    const [i0, i1] = span(c.x - c.dx / 2, c.x + c.dx / 2, x0, dx, nx), [j0, j1] = span(c.y - c.dy / 2, c.y + c.dy / 2, y0, dy, ny), [k0, k1] = span(c.z - c.dz / 2, c.z + c.dz / 2, z0, dz, nz);
    const cover = Number.isFinite(c.coverage) ? c.coverage : 1, margin = cellMargin(c, economics, miningCost, processingCost), ore = margin > -miningCost;
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const q = at(i, j, k);
      if (!rockT[q]) continue; // in the air
      const ox = Math.min(c.x + c.dx / 2, x0 + (i + 1) * dx) - Math.max(c.x - c.dx / 2, x0 + i * dx), oy = Math.min(c.y + c.dy / 2, y0 + (j + 1) * dy) - Math.max(c.y - c.dy / 2, y0 + j * dy);
      const zb = z0 + k * dz, g = ground[j * nx + i], oz = Math.min(c.z + c.dz / 2, Math.min(zb + dz, g)) - Math.max(c.z - c.dz / 2, zb);
      if (ox <= 0 || oy <= 0 || oz <= 0) continue;
      const t = Math.min(rockT[q] - modelT[q], ox * oy * oz * cover * density);
      if (t <= 0) continue;
      modelT[q] += t;
      value[q] += t * (margin + miningCost); // it was counted as barren: take that back
      if (ore) { oreT[q] += t; metalU[q] += t * c.value; if (c.by > 0) metalU2[q] += t * c.by; if (oneHoleBlock(c)) oreThin[q] += t; /* #1617 */ if (c.support === "extrapolated" || c.support === "unsupported") oreExtrap[q] += t; }
    }
  });
  return { nx, ny, nz, x0, y0, z0, dx, dy, dz, ground, value, oreT, metalU, metalU2, rockT, modelT, oreThin, oreExtrap, coarsened, topAssumed, oreAboveGroundT, oreAboveGroundBlocks, askedSize, modelCell, atModelBase: z0 <= modelBase + 1e-6 };
}

// ---------- the solve ----------
// Maximum closure as a minimum cut on the blocks that can matter (paying blocks and the cones over them). Dinic in typed arrays,
// iterative: arcs of infinite capacity from a block to the blocks it needs. onProgress(phases) only says it is alive.
export function solvePit(grid, slopeDeg, { onProgress = null, sectorSlopes = null } = {}) {
  const { nx, ny, nz, dx, dy, dz, value, rockT } = grid;
  const arcs = precedenceArcs(dx, dy, dz, slopeDeg, null, sectorSlopes); // #1881
  const n = nx * ny * nz, id = new Int32Array(n).fill(-1), list = [];
  // from the top down in reverse: a paying block, or anything a kept block needs
  const need = new Uint8Array(n);
  for (let q = 0; q < n; q++) if (value[q] > 0) need[q] = 1;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const q = k * nx * ny + j * nx + i;
    if (!need[q]) continue;
    for (const [a, b, l] of arcs) {
      const K = k + l, I = i + a, J = j + b;
      if (K >= nz || I < 0 || J < 0 || I >= nx || J >= ny) continue;
      const p = K * nx * ny + J * nx + I;
      if (rockT[p] > 0) need[p] = 1;
    }
  }
  for (let q = 0; q < n; q++) if (need[q] && rockT[q] > 0) { id[q] = list.length; list.push(q); }
  const N = list.length, S = N, T = N + 1, V = N + 2;
  if (!N) return { mined: new Uint8Array(n), nodes: 0, arcs: 0, profit: 0 };
  // count arcs, then fill a compressed adjacency with each arc's reverse beside it
  const INF = 1e300;
  let m = 0;
  for (let u = 0; u < N; u++) {
    const q = list[u], k = Math.floor(q / (nx * ny)), j = Math.floor((q - k * nx * ny) / nx), i = q - k * nx * ny - j * nx;
    if (value[q] !== 0) m++;
    for (const [a, b, l] of arcs) { const K = k + l, I = i + a, J = j + b; if (K < nz && I >= 0 && J >= 0 && I < nx && J < ny && id[K * nx * ny + J * nx + I] >= 0) m++; }
  }
  const head = new Int32Array(V).fill(-1), next = new Int32Array(2 * m), to = new Int32Array(2 * m), cap = new Float64Array(2 * m);
  let e = 0;
  const add = (u, v, c) => { to[e] = v; cap[e] = c; next[e] = head[u]; head[u] = e++; to[e] = u; cap[e] = 0; next[e] = head[v]; head[v] = e++; };
  let positive = 0;
  for (let u = 0; u < N; u++) {
    const q = list[u], k = Math.floor(q / (nx * ny)), j = Math.floor((q - k * nx * ny) / nx), i = q - k * nx * ny - j * nx, v = value[q];
    if (v > 0) { add(S, u, v); positive += v; } else if (v < 0) add(u, T, -v);
    for (const [a, b, l] of arcs) { const K = k + l, I = i + a, J = j + b; if (K < nz && I >= 0 && J >= 0 && I < nx && J < ny) { const w = id[K * nx * ny + J * nx + I]; if (w >= 0) add(u, w, INF); } }
  }
  const level = new Int32Array(V), cur = new Int32Array(V), queue = new Int32Array(V), pathE = new Int32Array(V);
  let flow = 0, phases = 0;
  const bfs = () => {
    level.fill(-1); level[S] = 0;
    let qh = 0, qt = 0; queue[qt++] = S;
    while (qh < qt) {
      const u = queue[qh++];
      for (let x = head[u]; x !== -1; x = next[x]) if (cap[x] > 1e-9 && level[to[x]] < 0) { level[to[x]] = level[u] + 1; queue[qt++] = to[x]; }
    }
    return level[T] >= 0;
  };
  while (bfs()) {
    phases++;
    if (onProgress && phases % 8 === 0) onProgress(phases);
    cur.set(head);
    // blocking flow: walk forward, push when the sink is reached, retreat from a dead end
    let u = S, depth = 0;
    for (;;) {
      if (u === T) {
        let f = Infinity, b = 0;
        for (let d = 0; d < depth; d++) if (cap[pathE[d]] < f) { f = cap[pathE[d]]; b = d; }
        for (let d = 0; d < depth; d++) { cap[pathE[d]] -= f; cap[pathE[d] ^ 1] += f; }
        flow += f;
        depth = b; u = to[pathE[b] ^ 1]; // back to the tail of the first saturated arc
        continue;
      }
      let x = cur[u];
      while (x !== -1 && !(cap[x] > 1e-9 && level[to[x]] === level[u] + 1)) x = next[x];
      cur[u] = x;
      if (x !== -1) { pathE[depth++] = x; u = to[x]; continue; }
      if (u === S) break;
      level[u] = -1; // dead end
      depth--;
      u = to[pathE[depth] ^ 1];
    }
  }
  // after the last search, level >= 0 marks what the source still reaches: the mined blocks
  const mined = new Uint8Array(n);
  let profit = 0;
  for (let u = 0; u < N; u++) if (level[u] >= 0) { mined[list[u]] = 1; profit += value[list[u]]; }
  return { mined, nodes: N, arcs: m, phases, profit, positive, flow };
}

// ---------- what comes out ----------
// totals inside the pit; metal in the block values' own grade x tonnes (mean grade = metalU / oreT)
export function pitSummary(grid, mined) {
  let oreT = 0, rockT = 0, metalU = 0, metalU2 = 0, modelT = 0, money = 0, blocks = 0, thin = 0, extrap = 0;
  for (let q = 0; q < mined.length; q++) {
    if (!mined[q]) continue;
    blocks++; oreT += grid.oreT[q]; rockT += grid.rockT[q]; metalU += grid.metalU[q]; metalU2 += grid.metalU2?.[q] || 0; modelT += grid.modelT[q]; money += grid.value[q];
    thin += grid.oreThin?.[q] || 0; extrap += grid.oreExtrap?.[q] || 0;
  }
  const wasteT = rockT - oreT;
  return { blocks, oreT, wasteT, rockT, stripRatio: oreT > 0 ? wasteT / oreT : null, meanGrade: oreT > 0 ? metalU / oreT : null, metalU, metalU2, meanGrade2: oreT > 0 ? metalU2 / oreT : null /* #1917 */, money, barrenShare: rockT > 0 ? 1 - modelT / rockT : 0,
    oreSingleHoleShare: oreT > 0 ? thin / oreT : 0, oreExtrapolatedShare: oreT > 0 ? extrap / oreT : 0 }; // #1354
}

// The pit as a surface over column centres: the floor of each mined column, the ground elsewhere, drawn only where it touches
// the pit. World E, N, Z. -> { positions: Float64Array, indices: Uint32Array, floors, maxDepth, touchesBase, touchesEdge }
export function pitSurface(grid, mined) {
  const { nx, ny, nz, x0, y0, z0, dx, dy, dz, ground } = grid;
  const floor = new Float64Array(nx * ny).fill(NaN);
  let touchesBase = false, touchesEdge = false, maxDepth = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      if (!mined[k * nx * ny + j * nx + i]) continue;
      const c = j * nx + i, zf = z0 + k * dz;
      floor[c] = zf; if (k === 0 && grid.atModelBase !== false) touchesBase = true; // #1751 — the grid's base is the model's, not merely the deepest paying block
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) touchesEdge = true;
      if (ground[c] - zf > maxDepth) maxDepth = ground[c] - zf;
      break;
    }
  }
  const nodeOf = new Int32Array(nx * ny).fill(-1), pos = [], idx = [];
  const node = (c) => {
    if (nodeOf[c] < 0) { const j = Math.floor(c / nx), i = c - j * nx; nodeOf[c] = pos.length / 3; pos.push(x0 + (i + 0.5) * dx, y0 + (j + 0.5) * dy, Number.isFinite(floor[c]) ? floor[c] : ground[c]); }
    return nodeOf[c];
  };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    if (!(Number.isFinite(floor[a]) || Number.isFinite(floor[b]) || Number.isFinite(floor[c]) || Number.isFinite(floor[d]))) continue;
    idx.push(node(a), node(b), node(d), node(a), node(d), node(c));
  }
  return { positions: Float64Array.from(pos), indices: Uint32Array.from(idx), maxDepth, touchesBase, touchesEdge };
}

// TASKS.csv #1608 — the pit AS DRAWN: its separate parts (4-connected mined columns) with ore, waste, strip and depth each, how
// many blocks deep it is, and the wall angles its block steps make (floor to floor between axis-neighbouring columns, by the
// sector the step faces: N / S / E / W), which is what the mesh shows; wallAngles() is the arc pattern's figure over 32 benches, which a
// pit one or two blocks deep never reaches. -> { pits: [{ columns, oreT, wasteT, rockT, money, stripRatio, maxDepth, blocksDeep }]
// (largest ore first), blocksDeep, drawnWalls: { flattest, steepest, bySector (median step) } | null }
export function pitParts(grid, mined) {
  const { nx, ny, nz, dx, dy, dz, ground, z0 } = grid, NC = nx * ny;
  const floor = new Float64Array(NC).fill(NaN);
  for (let c = 0; c < NC; c++) for (let k = 0; k < nz; k++) if (mined[k * NC + c]) { floor[c] = z0 + k * dz; break; }
  const label = new Int32Array(NC).fill(-1), pits = [];
  for (let s = 0; s < NC; s++) {
    if (!Number.isFinite(floor[s]) || label[s] >= 0) continue;
    const id = pits.length, stack = [s], part = { columns: 0, oreT: 0, wasteT: 0, rockT: 0, money: 0, metalU: 0, metalU2: 0, maxDepth: 0 };
    let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
    label[s] = id;
    while (stack.length) {
      const c = stack.pop(); part.columns++;
      { const jj = Math.floor(c / nx), ii = c - jj * nx; if (ii < i0) i0 = ii; if (ii > i1) i1 = ii; if (jj < j0) j0 = jj; if (jj > j1) j1 = jj; }
      const depth = ground[c] - floor[c]; if (depth > part.maxDepth) part.maxDepth = depth;
      for (let k = 0; k < nz; k++) { const q = k * NC + c; if (!mined[q]) continue; part.oreT += grid.oreT[q]; part.rockT += grid.rockT[q]; part.money += grid.value[q]; part.metalU += grid.metalU[q]; part.metalU2 += grid.metalU2?.[q] || 0; }
      const j = Math.floor(c / nx), i = c - j * nx;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const p = jj * nx + ii; if (Number.isFinite(floor[p]) && label[p] < 0) { label[p] = id; stack.push(p); } }
    }
    part.wasteT = part.rockT - part.oreT; part.stripRatio = part.oreT > 0 ? part.wasteT / part.oreT : null; part.blocksDeep = Math.max(1, Math.round(part.maxDepth / dz));
    part.boxM = [(i1 - i0 + 1) * dx, (j1 - j0 + 1) * dy]; // its plan extent (#1926)
    part.meanGrade = part.oreT > 0 ? part.metalU / part.oreT : null; // #1929
    part.meanGrade2 = part.oreT > 0 ? part.metalU2 / part.oreT : null; // #1917
    pits.push(part);
  }
  pits.sort((a, b) => b.oreT - a.oreT);
  const zOf = (c) => (Number.isFinite(floor[c]) ? floor[c] : ground[c]);
  let flattest = Infinity, steepest = -Infinity, steps = 0;
  const bySectorSteps = {};
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = j * nx + i;
    for (const [a, b] of [[1, 0], [0, 1]]) { // axis neighbours: the mesh's faces run along the grid, a diagonal step is no wall
      const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const p = jj * nx + ii;
      if (!Number.isFinite(floor[c]) && !Number.isFinite(floor[p])) continue;
      const dzv = zOf(c) - zOf(p); if (Math.abs(dzv) < 1e-6) continue;
      // at the rim, a floor a few metres under the neighbouring ground is the pit daylighting, not a wall: a rim step counts
      // from half a level up
      if ((!Number.isFinite(floor[c]) || !Number.isFinite(floor[p])) && Math.abs(dzv) < 0.5 * dz) continue;
      const deg = (Math.atan2(Math.abs(dzv), Math.hypot(a * dx, b * dy)) * 180) / Math.PI;
      const sign = dzv < 0 ? 1 : -1; // the wall faces from the deeper column towards the shallower
      const sector = sectorOfBearing((Math.atan2(sign * a * dx, sign * b * dy) * 180) / Math.PI);
      if (deg < flattest) flattest = deg; if (deg > steepest) steepest = deg; steps++;
      (bySectorSteps[sector] || (bySectorSteps[sector] = [])).push(deg);
    }
  }
  const med = (arr) => { const a = arr.slice().sort((p, q) => p - q); return a[a.length >> 1]; };
  const drawnWalls = steps ? { flattest, steepest, bySector: Object.fromEntries(Object.entries(bySectorSteps).map(([k, v]) => [k, med(v)])) } : null;
  return { pits, blocksDeep: pits.reduce((m, p) => Math.max(m, p.blocksDeep), 0), drawnWalls };
}

// the whole run, for the worker and the tests. inputs: { cells, unit, price, priceUnit, recovery, miningCost, processingCost, density, slopeDeg, revenueFactor, size }; ground as for buildPitGrid
export function runPitShell(inputs, { groundAt = null, collars = null, onProgress = null } = {}) {
  const economics = pitEconomics(inputs);
  if (!economics) return { failed: "units" };
  if (economics.byFailed) return { failed: "by-units" }; // #1917
  // TASKS.csv #1917 — the by-product's grades joined to the blocks; another grid matches no block and is refused
  let cells = inputs.cells, byMatched = null;
  if (inputs.by) { const j = joinByProduct(cells, inputs.byCells); if (!j.matched) return { failed: "by-grid" }; cells = j.cells; byMatched = j.matched / cells.length; }
  // TASKS.csv #2276 — collars drilled from underground are not the ground: a pit cut from the cuddies (2.38 Moz, $2.94B, 50-320 m below the real
  // surface) is refused, with the counts, instead of being priced
  if (!groundAt && collars?.length) { const ug = collarsLookUnderground(collars); if (ug.underground) return { failed: "underground", underground: ug }; }
  const fromCollars = !groundAt ? collarGround(collars) : null; // #1353
  const fromModel = !groundAt && !fromCollars ? modelTopGround(cells) : null; // #1850 — the model's own column tops, never one flat plane
  const grid = buildPitGrid(cells, { size: inputs.size, slopeDeg: inputs.slopeDeg, sectorSlopes: inputs.sectorSlopes, density: inputs.density, economics, miningCost: inputs.miningCost, processingCost: inputs.processingCost, groundAt: groundAt || fromCollars || fromModel });
  if (!grid) return { failed: "no-cells" };
  if (grid.empty) return { empty: true, cutoff: economics.cutoff, cell: [] };
  const groundSource = groundAt ? "terrain" : fromCollars ? "collars" : "model top";
  const solve = solvePit(grid, inputs.slopeDeg, { onProgress, sectorSlopes: inputs.sectorSlopes }); // #1881
  const summary = pitSummary(grid, solve.mined);
  if (!summary.blocks) return { empty: true, cutoff: economics.cutoff, cell: [grid.dx, grid.dy, grid.dz], groundSource };
  // #1917 — the by-product's figures: its metal, mean grade over the ore, its share of the revenue, and how many blocks carried it
  const by = economics.by ? (() => { const r1 = summary.metalU * economics.revenuePerGrade, r2 = summary.metalU2 * economics.by.revenuePerGrade; return { metalU: summary.metalU2, meanGrade: summary.meanGrade2, metalUnit: economics.by.metalUnit, metalFactor: economics.by.metalFactor, cutoff: economics.by.cutoff, revenueShare: r1 + r2 > 0 ? r2 / (r1 + r2) : 0, matchedShare: byMatched }; })() : null;
  return { ...summary, ...pitSurface(grid, solve.mined), by, parts: pitParts(grid, solve.mined) /* #1608 */, oreAboveGroundT: grid.oreAboveGroundT, oreAboveGroundBlocks: grid.oreAboveGroundBlocks /* #1616 */, askedSize: grid.askedSize, modelCellM: grid.modelCell /* #1610 */, cutoff: economics.cutoff, metalUnit: economics.metalUnit, metalFactor: economics.metalFactor, cell: [grid.dx, grid.dy, grid.dz], grid: [grid.nx, grid.ny, grid.nz], walls: wallAngles(grid.dx, grid.dy, grid.dz, inputs.slopeDeg, 32, inputs.sectorSlopes), groundSource, nodes: solve.nodes, arcs: solve.arcs, topAssumed: grid.topAssumed / (grid.nx * grid.ny), coarsened: grid.coarsened };
}

// TASKS.csv #1875 — what a shell is worth at the ENTERED price (#1609 valued a revenue-factor shell at the scaled price): the
// mined cells' metal at the base revenue, less processing on their ore and mining on all their rock, with the shell's own
// ore / waste split (a block the lower price sent to waste stays waste here)
export function pitValueAt(grid, mined, economics, miningCost, processingCost) {
  let money = 0;
  for (let q = 0; q < mined.length; q++) if (mined[q]) money += grid.metalU[q] * economics.revenuePerGrade + (economics.by && grid.metalU2 ? grid.metalU2[q] * economics.by.revenuePerGrade : 0) /* #1917 */ - grid.oreT[q] * processingCost - grid.rockT[q] * miningCost;
  return money;
}

// TASKS.csv #1875 — NESTED PITS: the shell at each revenue factor on ONE grid (the largest factor's, so every shell is a subset of
// the next), each valued at the entered price, and a schedule: the shells mined in turn as pushbacks, each from the top bench
// down, at `rate` tonnes of rock a year, every cell's cash discounted at `discountPct` a year from the time it is mined (the
// cumulative rock before it, over the rate). -> { runs: [{ rf, ...summary, moneyBase, years, npv, undiscounted, positions, indices,
// ... }], yearly: [{ year, rockT, oreT, cash }], cell, grid, groundSource, bestNpv, bestMoney } or { failed } / { empty }
export function runPitSeries(inputs, rfs, { groundAt = null, collars = null, rate = null, discountPct = null, onProgress = null } = {}) {
  const base = pitEconomics({ ...inputs, revenueFactor: 1 });
  if (!base) return { failed: "units" };
  if (base.byFailed) return { failed: "by-units" }; // #1917
  let cells = inputs.cells;
  if (inputs.by) { const j = joinByProduct(cells, inputs.byCells); if (!j.matched) return { failed: "by-grid" }; cells = j.cells; } // #1917
  const list = [...new Set(rfs.filter((r) => Number.isFinite(r) && r > 0))].sort((a, b) => a - b);
  if (!list.length) return { failed: "factors" };
  if (!groundAt && collars?.length) { const ug = collarsLookUnderground(collars); if (ug.underground) return { failed: "underground", underground: ug }; } // #2276
  const fromCollars = !groundAt ? collarGround(collars) : null, ground = groundAt || fromCollars || modelTopGround(cells); // model top: #1850
  const eco = (rf) => pitEconomics({ ...inputs, revenueFactor: rf });
  const topRf = list[list.length - 1];
  const top = buildPitGrid(cells, { size: inputs.size, slopeDeg: inputs.slopeDeg, sectorSlopes: inputs.sectorSlopes, density: inputs.density, economics: eco(topRf), miningCost: inputs.miningCost, processingCost: inputs.processingCost, groundAt: ground });
  if (!top) return { failed: "no-cells" };
  if (top.empty) return { empty: true, cutoff: base.cutoff };
  const fixed = { nx: top.nx, ny: top.ny, nz: top.nz, x0: top.x0, y0: top.y0, z0: top.z0, dx: top.dx, dy: top.dy, dz: top.dz, ground: top.ground, topAssumed: top.topAssumed, coarsened: top.coarsened };
  // every shell is reported and valued on the ENTERED price's grid: its ore / waste decisions and cash per cell (#1609)
  const baseGrid = topRf === 1 ? top : buildPitGrid(cells, { size: inputs.size, slopeDeg: inputs.slopeDeg, density: inputs.density, economics: base, miningCost: inputs.miningCost, processingCost: inputs.processingCost, groundAt: ground, fixed });
  const N = top.nx * top.ny * top.nz, slab = top.nx * top.ny;
  const runs = [], order = []; // order: every mined cell once, in the order it is mined: pushback by pushback, top bench first
  const cellRock = [], cellCash = [], cellOre = [], when = new Int32Array(N).fill(-1);
  const discount = Number.isFinite(discountPct) ? discountPct / 100 : null;
  list.forEach((rf, idx) => {
    const e = eco(rf);
    const grid = rf === topRf ? top : buildPitGrid(cells, { size: inputs.size, slopeDeg: inputs.slopeDeg, density: inputs.density, economics: e, miningCost: inputs.miningCost, processingCost: inputs.processingCost, groundAt: ground, fixed });
    if (!grid || grid.empty) { runs.push({ rf, cutoff: e.cutoff, blocks: 0, oreT: 0, wasteT: 0, rockT: 0, metalU: 0, meanGrade: null, money: 0, moneyBase: 0, stripRatio: null, maxDepth: 0, pushbackCells: 0, pushbackRockT: 0, positions: null, indices: null }); return; }
    const solve = solvePit(grid, inputs.slopeDeg, { onProgress: (phases) => onProgress?.({ idx, of: list.length, rf, phases }), sectorSlopes: inputs.sectorSlopes }); // #1881
    const summary = pitSummary(baseGrid, solve.mined), moneyBase = summary.money; // tonnes, grade and value at the entered price
    const moneyScaled = pitSummary(grid, solve.mined).money; // what the solver optimized: the scaled price
    // the pushback: this shell's cells not yet mined by a smaller one, top bench down
    const pushback = [];
    for (let k = grid.nz - 1; k >= 0; k--) for (let c = 0; c < slab; c++) { const q = k * slab + c; if (solve.mined[q] && when[q] < 0) { when[q] = idx; pushback.push(q); } }
    let pbRock = 0;
    pushback.forEach((q) => { order.push(q); cellRock.push(baseGrid.rockT[q]); cellOre.push(baseGrid.oreT[q]); cellCash.push(baseGrid.value[q]); pbRock += baseGrid.rockT[q]; });
    const surf = summary.blocks ? pitSurface(grid, solve.mined) : null;
    runs.push({ rf, cutoff: e.cutoff, ...summary, moneyBase, moneyScaled, pushbackRockT: pbRock, pushbackCells: pushback.length, maxDepth: surf?.maxDepth ?? 0, touchesBase: !!surf?.touchesBase, touchesEdge: !!surf?.touchesEdge, positions: surf?.positions ?? null, indices: surf?.indices ?? null });
  });
  // the schedule
  const yearly = [];
  if (rate > 0) {
    let cum = 0, counted = 0, pb = 0;
    const npvAt = new Float64Array(runs.length), undAt = new Float64Array(runs.length), yearsAt = new Float64Array(runs.length);
    const boundary = runs.map((r) => (counted += r.pushbackCells || 0));
    for (let i = 0; i < order.length; i++) {
      while (pb < runs.length && i >= boundary[pb]) pb++;
      const t = (cum + cellRock[i] / 2) / rate; // years from the start to the middle of this cell
      cum += cellRock[i];
      const cash = cellCash[i], disc = discount != null ? cash / Math.pow(1 + discount, t) : cash;
      for (let j = pb; j < runs.length; j++) { npvAt[j] += disc; undAt[j] += cash; }
      yearsAt[pb] = cum / rate;
      const y = Math.max(0, Math.floor(cum / rate - 1e-9)); // never below year 1: a first cell holding a sliver of rock under an interpolated ground (#1850)
      while (yearly.length <= y) yearly.push({ year: yearly.length + 1, rockT: 0, oreT: 0, cash: 0 });
      yearly[y].rockT += cellRock[i]; yearly[y].oreT += cellOre[i]; yearly[y].cash += cash;
    }
    let lastYears = 0;
    runs.forEach((r, j) => { if (r.pushbackCells) lastYears = yearsAt[j]; r.years = lastYears; r.npv = discount != null ? npvAt[j] : null; r.undiscounted = undAt[j]; });
  }
  let bestNpv = -1, bestMoney = -1;
  runs.forEach((r, j) => { if (r.npv != null && (bestNpv < 0 || r.npv > runs[bestNpv].npv)) bestNpv = j; if (bestMoney < 0 || r.moneyBase > runs[bestMoney].moneyBase) bestMoney = j; });
  return { runs, yearly, cell: [top.dx, top.dy, top.dz], grid: [top.nx, top.ny, top.nz], groundSource: groundAt ? "terrain" : fromCollars ? "collars" : "model top", coarsened: top.coarsened, topAssumed: top.topAssumed / slab, cutoffBase: base.cutoff, metalUnit: base.metalUnit, metalFactor: base.metalFactor, byMetalUnit: base.by?.metalUnit ?? null, byMetalFactor: base.by?.metalFactor ?? null /* #1917 */, bestNpv, bestMoney, rate, discountPct };
}
