// TASKS.csv #1341 — a conceptual pit shell: the ultimate pit limit of a block model, the set of blocks that makes the most
// undiscounted money when no block is mined without the blocks over it within the slope (#836's framing). That is a maximum
// closure, solved exactly as a minimum cut (Picard 1976), the same answer Lerchs-Grossmann and pseudoflow give.
// It is an early screen ("does this sit shallow enough for a pit at these prices?"), not a mine plan: no discounting, no
// ramps or berms, one density, one slope, rock outside the block model taken as barren. Pure: runs in a worker.
import { metalOf } from "./gradeTonnage.js";

const G_PER_OZ = 31.1034768, LB_PER_T = 2204.62262;
// TASKS.csv #1748 (review #1645, Copley) — copper in ppm was priced in $/oz and reported in troy ounces ("Contained metal 234M oz"), and $4
// typed in that box made a 91.5 ppm cut-off and a $1.21B margin. A base metal is sold by the pound or tonne whatever unit its grade is in:
// its ppm / g/t / ppb grade is counted in tonnes of metal (1 ppm = 1e-6 t per t), so it takes $/lb and $/t and reports tonnes.
export const BASE_METALS = new Set(["Cu", "Zn", "Pb", "Ni", "Mo", "Co", "Sn", "W", "Sb", "Bi", "U"]);
export function pitMetalOf(unit, element) {
  const m = metalOf(unit);
  if (m && m.unit === "g" && BASE_METALS.has(String(element || ""))) return { factor: m.factor / 1e6, unit: "t" };
  return m;
}
// the element a block model holds: its estimate's parameters, else a symbol at the start of its name ("Cu estimate (idw2, 20m)")
export const elementOfModel = (model) => model?.params?.element || (/^([A-Z][a-z]?)\b/.exec(String(model?.name || "")) || [])[1] || null;
// the units a price can be entered in, for a metal counted in grams or in tonnes (gradeTonnage.js metalOf)
export const PRICE_UNITS = { g: [["oz", "$/oz"], ["g", "$/g"]], t: [["lb", "$/lb"], ["t", "$/t"]] };

// economics: { unit (of the block values), price, priceUnit, recovery (%), miningCost, processingCost ($/t rock), revenueFactor? }
// -> { revenuePerGrade: $ per tonne of rock per unit of grade, cutoff: the grade that just pays for processing } or null
export function pitEconomics({ unit, element = null, price, priceUnit, recovery, processingCost, revenueFactor = 1 }) {
  const m = pitMetalOf(unit, element); // #1748
  if (!m) return null;
  const perBase = m.unit === "g" ? (priceUnit === "oz" ? price / G_PER_OZ : price) : (priceUnit === "lb" ? price * LB_PER_T : price);
  const revenuePerGrade = m.factor * (recovery / 100) * perBase * revenueFactor;
  if (!(revenuePerGrade > 0)) return null;
  return { revenuePerGrade, cutoff: processingCost / revenuePerGrade, metalUnit: m.unit, metalFactor: m.factor };
}

// a block's money per tonne: processed if that pays more than sending it to the dump (both pay for mining)
export const marginPerTonne = (grade, e, miningCost, processingCost) => {
  const rev = grade * e.revenuePerGrade;
  return rev > processingCost ? rev - processingCost - miningCost : -miningCost;
};

// TASKS.csv #1353 (review #1352, Silvertip) — with no terrain the pit took ONE flat ground at the top of the highest block,
// above every collar: 100-140 m of air was costed as waste and a paying Zn pit came out empty. The collars are surveyed points on
// the ground: interpolated between them (inverse distance, the 4 nearest), they stand in for the terrain. collars: [{ x, y, z }].
export function collarGround(collars) {
  const pts = (collars || []).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y) && Number.isFinite(c?.z));
  if (!pts.length) return null;
  return (x, y) => {
    const near = pts.map((c) => [Math.hypot(c.x - x, c.y - y), c.z]).sort((a, b) => a[0] - b[0]).slice(0, 4);
    if (near[0][0] < 1e-6) return near[0][1];
    let w = 0, s = 0;
    for (const [d, z] of near) { const k = 1 / (d * d); w += k; s += k * z; }
    return s / w;
  };
}

// ---------- the grid ----------
// How far a slope lets a wall step sideways per bench decides the arcs. Each is (di, dj, levels up), never flatter than the
// slope, and an arc two others already imply is left out (a block's cone is the same with far fewer arcs).
// Measured (scratchpad pitarcs): more levels hold the slope better in every bearing and cost arcs, memory and time, so the
// pattern is the most levels that stay within MAX_ARCS: 200,000 blocks at 57 arcs each was 440 MB, too much for a cheap laptop.
export const MAX_ARCS = 25;
export function precedenceArcs(dx, dy, dz, slopeDeg, maxLevels = null) {
  if (maxLevels == null) {
    let best = null;
    for (let L = 1; L <= 8; L++) { const a = precedenceArcs(dx, dy, dz, slopeDeg, L); if (a.length > MAX_ARCS) break; best = a; }
    return best;
  }
  const run = dz / Math.tan((slopeDeg * Math.PI) / 180);
  const allowed = [];
  for (let l = 1; l <= maxLevels; l++) {
    const r = l * run, ax = Math.floor(r / dx), ay = Math.floor(r / dy);
    for (let a = -ax; a <= ax; a++) for (let b = -ay; b <= ay; b++) if (Math.hypot(a * dx, b * dy) <= r + 1e-9) allowed.push([a, b, l]);
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
export function wallAngles(dx, dy, dz, slopeDeg, levels = 32) {
  const arcs = precedenceArcs(dx, dy, dz, slopeDeg), reach = Array.from({ length: levels + 1 }, () => new Map());
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
  return used.length ? { flattest: deg(Math.max(...used)), steepest: deg(Math.min(...used)) } : { flattest: 90, steepest: 90 };
}

// Regular grid over the block model plus room for the walls. cells: [{ x, y, z, dx, dy, dz, value }] in world metres.
// groundAt(x, y) -> elevation or null. Blocks smaller than a grid cell keep their own cut-off decision: a cell's money is the
// sum of its parts, so a coarser grid does not average ore into waste. -> { nx, ny, nz, x0, y0, z0, dx, dy, dz, ground, value, oreT, metalT, wasteT, outsideT, topAssumed }
export function buildPitGrid(cells, { size = null, slopeDeg, density, economics, miningCost, processingCost, groundAt = null, maxCells = 600000 }) {
  const good = cells.filter((c) => Number.isFinite(c.value) && c.dx > 0 && c.dy > 0 && c.dz > 0);
  if (!good.length) return null;
  const med = (k) => good.map((c) => c[k]).sort((a, b) => a - b)[good.length >> 1];
  let dx = size || med("dx"), dy = size || med("dy"), dz = size || med("dz");
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, zLow = Infinity, zHigh = -Infinity, payLow = Infinity;
  good.forEach((c) => {
    x0 = Math.min(x0, c.x - c.dx / 2); x1 = Math.max(x1, c.x + c.dx / 2); y0 = Math.min(y0, c.y - c.dy / 2); y1 = Math.max(y1, c.y + c.dy / 2);
    zLow = Math.min(zLow, c.z - c.dz / 2); zHigh = Math.max(zHigh, c.z + c.dz / 2);
    if (marginPerTonne(c.value, economics, miningCost, processingCost) > 0) payLow = Math.min(payLow, c.z - c.dz / 2);
  });
  // TASKS.csv #1358 — a pit never goes below its deepest paying block (below it there is only cost), so the grid and the wall reach
  // stop there: on a deep fan-drilled model the reach from the model base forced 25 m blocks up to 39 m for a pit 242 m deep
  if (!Number.isFinite(payLow)) return { empty: true };
  zLow = Math.max(zLow, payLow);
  // the highest ground over the blocks and a first wall reach, then the ground over the wider box
  let top = zHigh;
  if (groundAt) for (const c of good) { const g = groundAt(c.x, c.y); if (Number.isFinite(g) && g > top) top = g; }
  const reach = (top - zLow) / Math.tan((slopeDeg * Math.PI) / 180);
  x0 -= reach; x1 += reach; y0 -= reach; y1 += reach;
  const dims = () => [Math.max(1, Math.ceil((x1 - x0) / dx)), Math.max(1, Math.ceil((y1 - y0) / dy)), Math.max(1, Math.ceil((top - zLow) / dz))];
  let [nx, ny, nz] = dims(), coarsened = false;
  while (nx * ny * nz > maxCells) { dx *= 1.25; dy *= 1.25; dz *= 1.25; [nx, ny, nz] = dims(); coarsened = true; }
  const ground = new Float64Array(nx * ny);
  let topAssumed = 0, zTop = -Infinity;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const g = groundAt ? groundAt(x0 + (i + 0.5) * dx, y0 + (j + 0.5) * dy) : null;
    if (Number.isFinite(g)) { ground[j * nx + i] = g; if (g > zTop) zTop = g; } else { ground[j * nx + i] = NaN; topAssumed++; }
  }
  if (!Number.isFinite(zTop)) zTop = top;
  for (let k = 0; k < ground.length; k++) if (!Number.isFinite(ground[k])) ground[k] = top; // no terrain there: the top of the model
  if (zTop > top) { nz = Math.max(1, Math.ceil((zTop - zLow) / dz)); while (nx * ny * nz > maxCells) { dz *= 1.25; nz = Math.max(1, Math.ceil((zTop - zLow) / dz)); coarsened = true; } }
  const z0 = zLow, n = nx * ny * nz, value = new Float64Array(n), oreT = new Float32Array(n), metalU = new Float64Array(n), rockT = new Float32Array(n), modelT = new Float32Array(n);
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
  // each block replaces the barren rock it overlaps, per overlapped cell
  good.forEach((c) => {
    const span = (lo, hi, o, d, N) => [Math.max(0, Math.floor((lo - o) / d)), Math.min(N - 1, Math.ceil((hi - o) / d) - 1)];
    const [i0, i1] = span(c.x - c.dx / 2, c.x + c.dx / 2, x0, dx, nx), [j0, j1] = span(c.y - c.dy / 2, c.y + c.dy / 2, y0, dy, ny), [k0, k1] = span(c.z - c.dz / 2, c.z + c.dz / 2, z0, dz, nz);
    const cover = Number.isFinite(c.coverage) ? c.coverage : 1, margin = marginPerTonne(c.value, economics, miningCost, processingCost), ore = margin > -miningCost;
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
      if (ore) { oreT[q] += t; metalU[q] += t * c.value; if (c.nHoles === 1) oreThin[q] += t; if (c.support === "extrapolated" || c.support === "unsupported") oreExtrap[q] += t; }
    }
  });
  return { nx, ny, nz, x0, y0, z0, dx, dy, dz, ground, value, oreT, metalU, rockT, modelT, oreThin, oreExtrap, coarsened, topAssumed };
}

// ---------- the solve ----------
// Maximum closure as a minimum cut on the blocks that can matter (paying blocks and the cones over them). Dinic in typed arrays,
// iterative: arcs of infinite capacity from a block to the blocks it needs. onProgress(phases) only says it is alive.
export function solvePit(grid, slopeDeg, { onProgress = null } = {}) {
  const { nx, ny, nz, dx, dy, dz, value, rockT } = grid;
  const arcs = precedenceArcs(dx, dy, dz, slopeDeg);
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
  let oreT = 0, rockT = 0, metalU = 0, modelT = 0, money = 0, blocks = 0, thin = 0, extrap = 0;
  for (let q = 0; q < mined.length; q++) {
    if (!mined[q]) continue;
    blocks++; oreT += grid.oreT[q]; rockT += grid.rockT[q]; metalU += grid.metalU[q]; modelT += grid.modelT[q]; money += grid.value[q];
    thin += grid.oreThin?.[q] || 0; extrap += grid.oreExtrap?.[q] || 0;
  }
  const wasteT = rockT - oreT;
  return { blocks, oreT, wasteT, rockT, stripRatio: oreT > 0 ? wasteT / oreT : null, meanGrade: oreT > 0 ? metalU / oreT : null, metalU, money, barrenShare: rockT > 0 ? 1 - modelT / rockT : 0,
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
      floor[c] = zf; if (k === 0) touchesBase = true;
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

// the whole run, for the worker and the tests. inputs: { cells, unit, price, priceUnit, recovery, miningCost, processingCost, density, slopeDeg, revenueFactor, size }; ground as for buildPitGrid
export function runPitShell(inputs, { groundAt = null, collars = null, onProgress = null } = {}) {
  const economics = pitEconomics(inputs);
  if (!economics) return { failed: "units" };
  const fromCollars = !groundAt ? collarGround(collars) : null; // #1353
  const grid = buildPitGrid(inputs.cells, { size: inputs.size, slopeDeg: inputs.slopeDeg, density: inputs.density, economics, miningCost: inputs.miningCost, processingCost: inputs.processingCost, groundAt: groundAt || fromCollars });
  if (!grid) return { failed: "no-cells" };
  if (grid.empty) return { empty: true, cutoff: economics.cutoff, cell: [] };
  const groundSource = groundAt ? "terrain" : fromCollars ? "collars" : "model top";
  const solve = solvePit(grid, inputs.slopeDeg, { onProgress });
  const summary = pitSummary(grid, solve.mined);
  if (!summary.blocks) return { empty: true, cutoff: economics.cutoff, cell: [grid.dx, grid.dy, grid.dz], groundSource };
  return { ...summary, ...pitSurface(grid, solve.mined), cutoff: economics.cutoff, metalUnit: economics.metalUnit, metalFactor: economics.metalFactor, cell: [grid.dx, grid.dy, grid.dz], grid: [grid.nx, grid.ny, grid.nz], walls: wallAngles(grid.dx, grid.dy, grid.dz, inputs.slopeDeg), groundSource, nodes: solve.nodes, arcs: solve.arcs, topAssumed: grid.topAssumed / (grid.nx * grid.ny), coarsened: grid.coarsened };
}
