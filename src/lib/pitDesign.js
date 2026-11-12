// TASKS.csv #1874 — a BENCHED PIT DESIGN from a pit shell (Matt: "we should have more CAD like tools in that module"). The shell
// (lib/pitShell.js) is an economic limit: a floor over column centres with no benches, berms or faces. This turns it into the
// pit a geologist draws for a report: bench floors on round RLs, a face at the batter angle up to each crest and a catch
// bench (berm) before the next face, from the pit bottom up to where the walls meet the ground. Grid-based like the shell
// itself, so it stays light:
//   1. the shell's floors are read off its mesh (nodes at column centres: a node below the ground is a mined column) and each
//      is rounded to the nearest bench toe RL (datum + k x bench height);
//   2. a finer design grid (about a quarter of the wall reach) takes those floors; bottom-up, the toe region of each bench is the
//      region below it DILATED in plan by the wall reach (face run H / tan(batter) + berm) joined with the columns whose own floor
//      is at that RL. A cell within the face run of the lower toe region lies on the face (z climbs at the batter); farther, it is
//      the berm or floor at the bench RL. Where that is at or above the ground the wall daylights, and the bench above stops there;
//   3. the design surface is that height field cut at the ground; the toe and crest strings of every bench are its contours just
//      above each toe and just below each crest (lib/contours.js); the bench table counts the rock between the design and the
//      ground per bench slab, and the ore from the block model's blocks above the shell's cut-off inside the design.
// It is a geometric design, not a schedule: no dilution, no scheduling. World E, N, Z; pure, runs in a worker.
// TASKS.csv #1952 (Vulcan review) — a face angle and a berm width PER WALL SECTOR (N, NE, E ... as the shell's slope by sector): the
// dilation of each bench reads the batter and berm for the bearing from the lower toe region to the cell, so the weak wall gets its
// flatter faces and wider berms and the good wall its steeper ones.
// TASKS.csv #1948 (Vulcan review) — a RAMP: a haul road of a typed width descending at a typed gradient along the wall, spiralling in
// the typed turn from where it reaches the pit floor (a bearing from the pit's centre). Bottom-up, each bench's berm is widened by the
// road's width over the arc the road needs to climb one bench (the run bench height / gradient, measured along the wall at that
// bench), the road surface descends linearly across that arc, and the next bench's wall stands outside the road, so the design's
// waste and bench table carry the road's rock. One spiral only: where a bench's wall is shorter than the run (the arc would pass
// 350 degrees) the ramp stops there and says a switchback is needed; none is drawn.
import { contourLevel } from "./contours.js";

const RAD = Math.PI / 180;
export const DESIGN_SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const sectorOfBearing = (deg) => DESIGN_SECTORS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
const bearingOf = (dx, dy) => (Math.atan2(dx, dy) / RAD + 360) % 360; // 0 = north, 90 = east
const normDeg = (d) => ((d % 360) + 360) % 360;
export const MAX_DESIGN_CELLS = 1000000; // #1916: was 250,000; a Treaty Creek shell then got a 9.2 m cell, wider than a 4.7 m face

// TASKS.csv #1916 — the design cell a shell will get at these benches, before the run: the mined box (metres) widened by every
// bench's reach, at a quarter of the reach, coarsened by 1.25 until the grid fits the cell budget. Also whether a face fits in it.
// TASKS.csv #2278 (review #2174, WA gold) — the prediction padded with the overall reach and the shell's maxDepthM, the run with the widest
// sector reach plus the ramp's width and the benches from the highest ground: 'the 4.7 m faces are drawn' then a 5.2 m cell and no faces.
// Both now take their reaches from designReaches, and the pane passes the shell's crest-to-floor height as the depth.
const sectorParam = (sectors, bearing, key, base) => { const s = sectors ? sectors[sectorOfBearing(bearing)] : null, v = s ? Number(s[key]) : NaN; return Number.isFinite(v) && (key === "berm" ? v >= 0 : v > 0 && v < 90) ? v : base; };
export const rampIsOn = (ramp) => !!ramp && Number(ramp.widthM) > 0 && Number(ramp.gradientPct) > 0 && Number.isFinite(Number(ramp.azimuthDeg));
// TASKS.csv #2730 (follow-up of #2439) — upper: { rl, batterDeg, berm } for the benches whose face starts at or above an RL (soft cover), as the
// shell's upper slope; null = every bench alike. upperOk tells a usable one.
export const upperOk = (u) => !!u && Number.isFinite(Number(u.rl)) && Number(u.batterDeg) > 0 && Number(u.batterDeg) < 90 && Number(u.berm) >= 0;
export function designReaches({ benchH, berm, batterDeg, sectors = null, ramp = null, upper = null }) {
  const faceRun = benchH / Math.tan(batterDeg * RAD), reach = faceRun + berm;
  const reachAt = (b) => benchH / Math.tan(sectorParam(sectors, b, "batterDeg", batterDeg) * RAD) + sectorParam(sectors, b, "berm", berm);
  const all = DESIGN_SECTORS.map((k, i) => reachAt(i * 45));
  if (upperOk(upper)) all.push(benchH / Math.tan(Number(upper.batterDeg) * RAD) + Number(upper.berm)); // #2730
  return { faceRun, reach, reachMax: Math.max(reach, ...all) + (rampIsOn(ramp) ? Number(ramp.widthM) : 0), reachMin: Math.min(reach, ...all) };
}
export function predictDesignCell({ boxW, boxH, depth, shellCell, benchH, berm, batterDeg, sectors = null, ramp = null, upper = null /* #2730 */, maxCells = MAX_DESIGN_CELLS }) {
  if (!(benchH > 0) || !(berm >= 0) || !(batterDeg > 0 && batterDeg < 90)) return null;
  const { faceRun, reach, reachMax, reachMin } = designReaches({ benchH, berm, batterDeg, sectors, ramp, upper }); // #2278 — as the run pads; upper: #2730
  const pad = (Math.ceil(Math.max(0, depth) / benchH) + 1) * reachMax + shellCell, w = boxW + 2 * pad, h = boxH + 2 * pad;
  let cell = Math.max(0.5, Math.min(reachMin / 4, shellCell)), coarsened = false;
  const n = () => (Math.ceil(w / cell) + 1) * (Math.ceil(h / cell) + 1);
  while (n() > maxCells) { cell *= 1.25; coarsened = true; }
  return { cell, faceRun, reach, coarsened, facesDrawn: faceRun >= cell };
}
// the smallest round bench height (5 m steps) whose face would be drawn at this box, or null
export function benchHeightThatDraws(args) {
  for (let h = 5; h <= 60; h += 5) { const p = predictDesignCell({ ...args, benchH: h }); if (p && p.facesDrawn) return h; }
  return null;
}
// a point inside a closed polygon [[x, y], ...] (ray casting)
function insidePolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// the shell mesh's nodes are column centres on a regular lattice: x0 / y0 are the lattice's first centres
export function shellFloors(positions, groundAt = null) {
  const n = positions.length / 3;
  if (n < 2) return null;
  const xs = new Set(), ys = new Set();
  let zMax = -Infinity;
  for (let i = 0; i < n; i++) { xs.add(positions[3 * i]); ys.add(positions[3 * i + 1]); if (positions[3 * i + 2] > zMax) zMax = positions[3 * i + 2]; }
  const step = (set) => { const a = [...set].sort((p, q) => p - q); let d = Infinity; for (let i = 1; i < a.length; i++) { const s = a[i] - a[i - 1]; if (s > 1e-6 && s < d) d = s; } return { a, d: Number.isFinite(d) ? d : 1 }; };
  const X = step(xs), Y = step(ys);
  const x0 = X.a[0], y0 = Y.a[0], dx = X.d, dy = Y.d;
  const nx = Math.round((X.a[X.a.length - 1] - x0) / dx) + 1, ny = Math.round((Y.a[Y.a.length - 1] - y0) / dy) + 1;
  const floor = new Float64Array(nx * ny).fill(NaN);
  let mined = 0, zMin = Infinity;
  for (let i = 0; i < n; i++) {
    const x = positions[3 * i], y = positions[3 * i + 1], z = positions[3 * i + 2];
    const g = groundAt ? groundAt(x, y) : zMax;
    const ground = Number.isFinite(g) ? g : zMax;
    if (z < ground - 0.01) { const c = Math.round((y - y0) / dy) * nx + Math.round((x - x0) / dx); floor[c] = z; mined++; if (z < zMin) zMin = z; }
  }
  return mined ? { nx, ny, x0, y0, dx, dy, floor, mined, zMin, top: zMax } : null;
}

// the nearest bench toe RL to a floor
export const toeRL = (z, benchH, datum = 0) => datum + Math.round((z - datum) / benchH) * benchH;

// the design. shell: shellFloors(); groundAt(x, y) -> elevation or NaN (null: the shell's flat top); cells: the block model's
// blocks ({ x, y, z, dx, dy, dz, value, coverage }), cutoff and density from the shell's run; benchH, berm, batterDeg, datum.
// -> { positions, indices, strings: [{ bench, rl, kind: "toe" | "crest", lines: [[[x, y, z], ...]] }], benches: [{ rl, rockT, oreT, wasteT,
//      metalU, meanGrade }], totals, interRampDeg, faceRun, reach, cell, nCells, coarsened, daylights, crestRL, floorRL }
export function benchedPit(shell, { groundAt = null, cells = [], cutoff = Infinity, density = 1, wasteDensity = null, benchH, berm, batterDeg, datum = 0, maxCells = MAX_DESIGN_CELLS, largestOnly = false, areaPoly = null, sectors = null, ramp = null, onBench = null, weathered = null, upper = null /* #2730 */ } = {}) { // weathered: #2671 — { depthAt(x, y), density } (pitShell.js weatheredOf) // onBench(k, about): #2286
  // TASKS.csv #1916 — a design AREA (areaPoly): a closed polygon [[x, y], ...] in world metres (a design string); only the shell's columns
  // whose centre lies inside it are designed, so one prospect of a district-wide shell gets the whole grid
  let columnsInArea = null;
  const wd = wasteDensity > 0 ? wasteDensity : density; // TASKS.csv #2437 — ore at `density`, the rest of the rock (and the road) at the waste density
  if (shell && Array.isArray(areaPoly) && areaPoly.length > 2) {
    const { nx, ny, floor } = shell, kept = new Float64Array(floor.length).fill(NaN);
    let n = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const c = j * nx + i; if (Number.isFinite(floor[c]) && insidePolygon(shell.x0 + i * shell.dx, shell.y0 + j * shell.dy, areaPoly)) { kept[c] = floor[c]; n++; } }
    shell = { ...shell, floor: kept, mined: n };
    columnsInArea = n;
    if (!n) return { failed: "area-empty" };
  }
  // TASKS.csv #1899 / #1608 — a shell that is several separate pits: keep the largest (most mined columns, 4-connected) and let the
  // design grid go to it alone; the parts left out are counted in partsDropped
  let partsDropped = 0;
  if (largestOnly) {
    const { nx, ny, floor } = shell, label = new Int32Array(nx * ny).fill(-1), sizes = [];
    for (let s = 0; s < nx * ny; s++) {
      if (!Number.isFinite(floor[s]) || label[s] >= 0) continue;
      const id = sizes.length, stack = [s]; label[s] = id; let n = 0;
      while (stack.length) { const c = stack.pop(); n++; const j = Math.floor(c / nx), i = c - j * nx; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const p = jj * nx + ii; if (Number.isFinite(floor[p]) && label[p] < 0) { label[p] = id; stack.push(p); } } }
      sizes.push(n);
    }
    if (sizes.length > 1) {
      const keep = sizes.indexOf(Math.max(...sizes)), kept = new Float64Array(floor.length).fill(NaN);
      for (let c = 0; c < floor.length; c++) if (label[c] === keep) kept[c] = floor[c];
      shell = { ...shell, floor: kept, mined: sizes[keep] };
      partsDropped = sizes.length - 1;
    }
  }
  if (!shell || !(benchH > 0) || !(berm >= 0) || !(batterDeg > 0 && batterDeg < 90)) return null;
  const tanB = Math.tan(batterDeg * RAD), faceRun = benchH / tanB, reach = faceRun + berm;
  const interRampDeg = Math.atan(benchH / reach) / RAD;
  // #1952 — the batter and berm for a bearing: the sector's own when typed, else the overall
  const secParam = (bearing, key, base) => sectorParam(sectors, bearing, key, base); // #2278 — shared with the prediction
  // TASKS.csv #2730 — above the upper RL every wall takes the upper face angle and berm (the sectors are for the walls below it)
  const upperOn = upperOk(upper), up = upperOn ? { rl: Number(upper.rl), batterDeg: Number(upper.batterDeg), berm: Number(upper.berm) } : null;
  let inUpper = false;
  const batterAt = (b) => (inUpper ? up.batterDeg : secParam(b, "batterDeg", batterDeg)), bermAt = (b) => (inUpper ? up.berm : secParam(b, "berm", berm));
  const faceRunAt = (b) => benchH / Math.tan(batterAt(b) * RAD), reachAt = (b) => faceRunAt(b) + bermAt(b);
  const sectorsUsed = sectors ? Object.fromEntries(DESIGN_SECTORS.map((k, i) => [k, { batterDeg: batterAt(i * 45), berm: bermAt(i * 45) }])) : null;
  // #1948 — the ramp's figures; rampW widens the reach wherever the road runs
  const rampOn = rampIsOn(ramp);
  const rampW = rampOn ? Number(ramp.widthM) : 0, rampRun = rampOn ? benchH / (Number(ramp.gradientPct) / 100) : 0, turn = rampOn && ramp.turn === "anticlockwise" ? -1 : 1;
  const { reachMax, reachMin } = designReaches({ benchH, berm, batterDeg, sectors, ramp, upper }); // #2278 — the prediction's figures; upper: #2730
  const rampState = rampOn ? { theta: normDeg(Number(ramp.azimuthDeg)), arcs: [], lengthM: 0, needsSwitchback: false, stoppedAt: null, centre: [], edgeIn: [], edgeOut: [] } : null;
  // the bench RLs the shell's floors take
  let floorRL = Infinity, floorMax = -Infinity, sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity;
  for (let j = 0; j < shell.ny; j++) for (let i = 0; i < shell.nx; i++) {
    const f = shell.floor[j * shell.nx + i];
    if (!Number.isFinite(f)) continue;
    const rl = toeRL(f, benchH, datum);
    if (rl < floorRL) floorRL = rl; if (rl > floorMax) floorMax = rl;
    const x = shell.x0 + i * shell.dx, y = shell.y0 + j * shell.dy;
    if (x < sx0) sx0 = x; if (x > sx1) sx1 = x; if (y < sy0) sy0 = y; if (y > sy1) sy1 = y;
  }
  if (!Number.isFinite(floorRL)) return null;
  const ground = (x, y) => { const g = groundAt ? groundAt(x, y) : NaN; return Number.isFinite(g) ? g : shell.top; };
  // the design grid: the shell's mined box widened by every bench's reach, at about a quarter of the reach
  let gTop = shell.top;
  for (let j = 0; j < shell.ny; j++) for (let i = 0; i < shell.nx; i++) { const g = ground(shell.x0 + i * shell.dx, shell.y0 + j * shell.dy); if (g > gTop) gTop = g; }
  const nBenchMax = Math.ceil((gTop - floorRL) / benchH) + 1, pad = nBenchMax * reachMax + Math.max(shell.dx, shell.dy); // reachMax: #1952 / #1948
  const bx0 = sx0 - pad, bx1 = sx1 + pad, by0 = sy0 - pad, by1 = sy1 + pad;
  let cell = Math.max(0.5, Math.min(reachMin / 4, Math.min(shell.dx, shell.dy))), coarsened = false;
  const dims = () => [Math.max(2, Math.ceil((bx1 - bx0) / cell) + 1), Math.max(2, Math.ceil((by1 - by0) / cell) + 1)];
  let [nx, ny] = dims();
  while (nx * ny > maxCells) { cell *= 1.25; coarsened = true; [nx, ny] = dims(); }
  const N = nx * ny, X = (i) => bx0 + i * cell, Y = (j) => by0 + j * cell;
  // the shell floor and the ground on the design grid
  const fb = new Float64Array(N).fill(NaN), g = new Float64Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = j * nx + i, x = X(i), y = Y(j);
    g[c] = ground(x, y);
    const si = Math.round((x - shell.x0) / shell.dx), sj = Math.round((y - shell.y0) / shell.dy);
    if (si >= 0 && si < shell.nx && sj >= 0 && sj < shell.ny) {
      const f = shell.floor[sj * shell.nx + si];
      if (Number.isFinite(f)) { const rl = toeRL(f, benchH, datum); if (rl < g[c] - 0.01) fb[c] = rl; }
    }
  }
  // bottom-up benches
  const z = new Float64Array(N).fill(NaN); // the design surface where the pit is
  let T = new Uint8Array(N); // the toe region of the bench below, below the ground
  const R = Math.ceil(reachMax / cell), dist = new Float64Array(N), bear = new Float32Array(N); // bear: the bearing of the nearest toe cell (#1952)
  const isRamp = new Uint8Array(N); // #1948 — cells under the road
  const benches = [];
  let daylights = false;
  // #1948 — the toe region's centre and its radius by 5-degree bin (the farthest boundary cell in that bearing), for the road's arc
  const toeProfile = () => {
    let cx = 0, cy = 0, n = 0;
    for (let c = 0; c < N; c++) if (T[c]) { const j = Math.floor(c / nx), i = c - j * nx; cx += X(i); cy += Y(j); n++; }
    if (!n) return null;
    cx /= n; cy /= n;
    const r = new Float64Array(72).fill(0);
    for (let c = 0; c < N; c++) { if (!T[c]) continue; const j = Math.floor(c / nx), i = c - j * nx, dx = X(i) - cx, dy = Y(j) - cy, d = Math.hypot(dx, dy), bin = Math.floor(normDeg(bearingOf(dx, dy)) / 5) % 72; if (d > r[bin]) r[bin] = d; }
    for (let b = 0; b < 72; b++) if (!r[b]) { let l = b, h = b; while (!r[(l + 71) % 72] && l !== b + 72) l--; while (!r[(h + 1) % 72] && h !== b - 72) h++; r[b] = (r[((l + 71) % 72 + 72) % 72] + r[(h + 1) % 72]) / 2 || 0; } // an empty bin takes its neighbours
    const rAt = (deg) => { const u = normDeg(deg) / 5, b0 = Math.floor(u) % 72, t = u - Math.floor(u); return r[b0] * (1 - t) + r[(b0 + 1) % 72] * t; };
    return { cx, cy, rAt };
  };
  const aboutBenches = Number.isFinite(gTop) && benchH > 0 ? Math.max(1, Math.ceil((gTop - floorRL) / benchH)) : null; // #2286 — for the progress line
  for (let k = 0, rl = floorRL; k < 10000; k++, rl += benchH) {
    onBench?.(k + 1, aboutBenches);
    inUpper = !!up && rl - benchH >= up.rl - 1e-9; // #2730 — this bench's face starts at or above the upper RL
    const next = new Uint8Array(N);
    let any = false;
    if (k === 0) {
      for (let c = 0; c < N; c++) if (fb[c] <= rl + 1e-6) { next[c] = 1; z[c] = rl; any = true; }
    } else {
      // the plan distance from the lower toe region, out to the reach: from its boundary cells, with the bearing of the nearest
      dist.fill(Infinity);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const c = j * nx + i;
        if (!T[c]) continue;
        const edge = i === 0 || j === 0 || i === nx - 1 || j === ny - 1 || !T[c - 1] || !T[c + 1] || !T[c - nx] || !T[c + nx];
        if (!edge) continue;
        for (let dj = -R; dj <= R; dj++) {
          const jj = j + dj; if (jj < 0 || jj >= ny) continue;
          for (let di = -R; di <= R; di++) {
            const ii = i + di; if (ii < 0 || ii >= nx) continue;
            const q = jj * nx + ii;
            if (T[q]) continue;
            const d = Math.hypot(di, dj) * cell;
            if (d < dist[q]) { dist[q] = d; bear[q] = bearingOf(di, dj); }
          }
        }
      }
      // #1948 — this bench's stretch of the road: from where it meets the floor below (thetaLo, at rl - benchH) back against the
      // turn to where it meets this floor (thetaHi, at rl), the run measured along the wall outside the berm
      let arc = null;
      if (rampState && !rampState.needsSwitchback && !rampState.daylit) { // daylit: #2713 — the road has reached the ground
        const prof = toeProfile();
        if (prof) {
          const thetaLo = rampState.theta, step = 0.5;
          let run = 0, sweep = 0;
          while (run < rampRun && sweep < 350) { const b = thetaLo - turn * (sweep + step / 2); run += (prof.rAt(b) + reachAt(b) + rampW / 2) * step * RAD; sweep += step; }
          if (run < rampRun) { rampState.needsSwitchback = true; rampState.stoppedAt = rl; }
          else {
            arc = { bench: k, lo: thetaLo, sweep, cx: prof.cx, cy: prof.cy, rAt: prof.rAt };
            rampState.theta = normDeg(thetaLo - turn * sweep); rampState.lengthM += run;
            rampState.arcs.push({ bench: k, floorRL: rl - benchH, fromDeg: +thetaLo.toFixed(1), toDeg: +rampState.theta.toFixed(1), sweepDeg: +sweep.toFixed(1), runM: +run.toFixed(1) });
            // the road's strings along this arc: centreline and edges, every 2 degrees, descending with the turn
            const cl = [], ein = [], eout = [];
            const steps = []; for (let s = sweep; s > 0; s -= 2) steps.push(s); steps.push(0); // the last point exactly at the floor below
            for (const s of steps) { const b = thetaLo - turn * s, rr = prof.rAt(b) + reachAt(b), zz = rl - benchH * (1 - s / sweep), sx = Math.sin(b * RAD), sy = Math.cos(b * RAD); cl.push([prof.cx + (rr + rampW / 2) * sx, prof.cy + (rr + rampW / 2) * sy, zz]); ein.push([prof.cx + rr * sx, prof.cy + rr * sy, zz]); eout.push([prof.cx + (rr + rampW) * sx, prof.cy + (rr + rampW) * sy, zz]); }
            // TASKS.csv #2713 (follow-up of #2440) — where the road's centreline reaches the ground it daylights: it ends there (its length, its
            // strings), and no road is built on the benches above. The crossing is found every half degree and placed between the two steps.
            if (groundAt) {
              const zAt = (s2) => rl - benchH * (1 - s2 / sweep), gAt2 = (s2) => { const b = thetaLo - turn * s2, rr = prof.rAt(b) + reachAt(b) + rampW / 2; return groundAt(prof.cx + rr * Math.sin(b * RAD), prof.cy + rr * Math.cos(b * RAD)); };
              let prev = 0, sd = null;
              for (let s2 = 0; s2 <= sweep + 1e-9; s2 += 0.5) {
                const gz = gAt2(s2);
                if (Number.isFinite(gz) && zAt(s2) >= gz - 1e-9) { const gp = gAt2(prev), fp = Number.isFinite(gp) ? zAt(prev) - gp : -1, fs = zAt(s2) - gz; sd = s2 > prev && fs > fp ? prev + (s2 - prev) * (-fp / (fs - fp)) : s2; break; }
                prev = s2;
              }
              if (sd != null && sd < sweep - 1e-6) {
                const zd = zAt(sd), keep = (line) => line.filter((q) => q[2] <= zd + 1e-9);
                const b = thetaLo - turn * sd, rr = prof.rAt(b) + reachAt(b), sx = Math.sin(b * RAD), sy = Math.cos(b * RAD);
                const cl2 = [[prof.cx + (rr + rampW / 2) * sx, prof.cy + (rr + rampW / 2) * sy, zd], ...keep(cl)];
                cl.length = 0; cl.push(...cl2); const e1 = keep(ein), e2 = keep(eout); ein.length = 0; ein.push(...e1); eout.length = 0; eout.push(...e2);
                const counted = run * (sd / sweep);
                rampState.lengthM -= run - counted; rampState.daylit = true; rampState.daylightRL = +zd.toFixed(2);
                const last = rampState.arcs[rampState.arcs.length - 1]; last.runM = +counted.toFixed(1); last.daylightRL = rampState.daylightRL;
              }
            }
            rampState.centre.push({ bench: k, line: cl }); rampState.edgeIn.push({ bench: k, line: ein }); rampState.edgeOut.push({ bench: k, line: eout });
          }
        }
      }
      // is a bearing (from the toe region's centre) within this bench's arc, and how far along it from its start (lo, where the road meets the
      // floor below) to its end (this bench): TASKS.csv #2713 — the road's z rises with it, as its centreline does (it ran the other way)
      const onArc = (x, y) => { if (!arc) return -1; const u = normDeg((arc.lo - bearingOf(x - arc.cx, y - arc.cy)) * turn); return u <= arc.sweep ? u / arc.sweep : -1; };
      for (let c = 0; c < N; c++) {
        if (T[c]) { next[c] = 1; continue; }
        const d = dist[c], own = fb[c] <= rl + 1e-6, b = bear[c], fr = faceRunAt(b), re = reachAt(b);
        if (d <= re || own) {
          next[c] = 1; any = true;
          z[c] = d <= fr ? rl - benchH + d * Math.tan(batterAt(b) * RAD) : rl; // on the face, else the berm or the floor (#1952: by the wall's sector)
        } else if (arc && d <= re + rampW) {
          const j = Math.floor(c / nx), i = c - j * nx, u = onArc(X(i), Y(j));
          if (u >= 0) { next[c] = 1; any = true; z[c] = rl - benchH * (1 - u); isRamp[c] = 1; } // #1948 — the road across the arc; #2713: rising from the floor below
        }
      }
    }
    if (!any) break;
    // where the design reaches the ground the wall daylights: those cells end the pit and do not carry the next bench. A bench
    // exists only where it has a floor or berm (z at its RL) below the ground: the cells on the face below it belong to the wall
    // of the bench under it, and once no floor is below the ground the previous wall has met the ground everywhere.
    let newFloor = 0;
    const T2 = new Uint8Array(N);
    for (let c = 0; c < N; c++) {
      if (!next[c]) continue;
      if (z[c] < g[c] - 1e-6) { T2[c] = 1; if (!T[c] && z[c] === rl) newFloor++; } else daylights = true;
    }
    if (!newFloor) break;
    benches.push({ rl, rockT: 0, rockV: 0, oreV: 0, oreT: 0, wasteT: 0, metalU: 0, meanGrade: null }); // rockV / oreV: #2437
    T = T2;
  }
  const crestRL = benches.length ? benches[benches.length - 1].rl + benchH : floorRL;
  // #1948 — the road's rock: what the design takes out under the road cells, and the strings
  let rampRockT = 0;
  if (rampState) { const area = cell * cell; for (let c = 0; c < N; c++) if (isRamp[c] && Number.isFinite(z[c]) && z[c] < g[c]) rampRockT += (g[c] - z[c]) * area * wd; }
  // the surface: the design where it is below the ground, the ground on a one-cell ring around it (so it meets the ground)
  const inPit = new Uint8Array(N);
  for (let c = 0; c < N; c++) if (Number.isFinite(z[c]) && z[c] < g[c] - 1e-6) inPit[c] = 1;
  // TASKS.csv #2440 (review #2325) — the highest ground the design meets: the bench range ends there, not at the top bench floor + a bench in the air
  let groundTop = -Infinity; for (let c = 0; c < N; c++) if (inPit[c] && g[c] > groundTop) groundTop = g[c];
  const nodeOf = new Int32Array(N).fill(-1), pos = [], idx = [];
  const onRing = (c) => { const j = Math.floor(c / nx), i = c - j * nx; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && ii < nx && jj >= 0 && jj < ny && inPit[jj * nx + ii]) return true; } return false; };
  const node = (c) => { if (nodeOf[c] < 0) { const j = Math.floor(c / nx), i = c - j * nx; nodeOf[c] = pos.length / 3; pos.push(X(i), Y(j), inPit[c] ? z[c] : g[c]); } return nodeOf[c]; };
  const used = new Uint8Array(N);
  for (let c = 0; c < N; c++) if (inPit[c] || onRing(c)) used[c] = 1;
  // the surface for the strings: the pit and its ring at the ground (a crest that daylights lies between a face node and a ground node)
  const S = new Float64Array(N).fill(NaN);
  for (let c = 0; c < N; c++) if (used[c]) S[c] = inPit[c] ? z[c] : g[c];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    if (!(used[a] && used[b] && used[c] && used[d])) continue;
    if (!(inPit[a] || inPit[b] || inPit[c] || inPit[d])) continue;
    idx.push(node(a), node(b), node(d), node(a), node(d), node(c));
  }
  // the strings: contours of the pit surface just above each toe and just below each crest. contours.js reads row 0 as north.
  const flipped = new Float64Array(N);
  for (let j = 0; j < ny; j++) flipped.set(S.subarray(j * nx, (j + 1) * nx), (ny - 1 - j) * nx);
  const cgrid = { bbox: [bx0, by0, X(nx - 1), Y(ny - 1)], gridW: nx, gridH: ny, elevations: flipped };
  const EPS = 0.02, strings = [];
  benches.forEach((b, k) => {
    const toe = contourLevel(cgrid, b.rl + EPS).map((l) => l.map((p) => [p.x, p.y, b.rl]));
    if (toe.length) strings.push({ bench: k + 1, rl: b.rl, kind: "toe", lines: toe });
    const crest = contourLevel(cgrid, b.rl + benchH - EPS).map((l) => l.map((p) => [p.x, p.y, b.rl + benchH]));
    if (crest.length) strings.push({ bench: k + 1, rl: b.rl + benchH, kind: "crest", lines: crest });
  });
  if (rampState) { // #1948 — the road's strings beside the bench strings
    rampState.centre.forEach((s) => strings.push({ bench: s.bench, rl: null, kind: "ramp_centre", lines: [s.line] }));
    rampState.edgeIn.forEach((s) => strings.push({ bench: s.bench, rl: null, kind: "ramp_edge", lines: [s.line] }));
    rampState.edgeOut.forEach((s) => strings.push({ bench: s.bench, rl: null, kind: "ramp_edge", lines: [s.line] }));
  }
  // the bench table: the rock between the design and the ground per slab, the ore from the blocks inside the design
  const area = cell * cell;
  // TASKS.csv #2671 (follow-up of #2597) — the shell's weathered zone: every tonne above its base, ore or waste, at the weathered density
  const dW = weathered && weathered.density > 0 ? weathered.density : null;
  const wBase = dW ? new Float64Array(N).fill(NaN) : null;
  const wPart = (c, lo, hi) => { const base = wBase ? wBase[c] : NaN; return Number.isFinite(base) && hi > lo ? Math.max(0, hi - Math.max(lo, base)) : 0; }; // metres of [lo, hi] above the base
  for (let c = 0; c < N; c++) {
    if (!inPit[c]) continue;
    if (wBase) { const j = Math.floor(c / nx), i = c - j * nx, d = weathered.depthAt(X(i), Y(j)); if (Number.isFinite(d) && d > 0) wBase[c] = g[c] - d; }
    benches.forEach((b) => { const lo = Math.max(z[c], b.rl), hi = Math.min(g[c], b.rl + benchH); if (hi > lo) { b.rockV += (hi - lo) * area; if (wBase) b.rockWV = (b.rockWV || 0) + wPart(c, lo, hi) * area; } });
  }
  // each block's overlap with every design cell's square (cells are centred on the lattice nodes), as buildPitGrid does
  const span = (lo, hi, o, N1) => [Math.max(0, Math.ceil((lo - o) / cell - 0.5)), Math.min(N1 - 1, Math.floor((hi - o) / cell + 0.5))];
  for (const bl of cells) {
    if (!(bl.ore != null ? bl.ore : bl.value >= cutoff) || !(bl.dx > 0 && bl.dy > 0 && bl.dz > 0)) continue; // bl.ore: decided on both metals (#1917)
    const xlo = bl.x - bl.dx / 2, xhi = bl.x + bl.dx / 2, ylo = bl.y - bl.dy / 2, yhi = bl.y + bl.dy / 2;
    const [i0, i1] = span(xlo, xhi, bx0, nx), [j0, j1] = span(ylo, yhi, by0, ny);
    const cover = Number.isFinite(bl.coverage) ? bl.coverage : 1, zlo = bl.z - bl.dz / 2, zhi = bl.z + bl.dz / 2;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = j * nx + i;
      if (!inPit[c]) continue;
      const ox = Math.min(xhi, X(i) + cell / 2) - Math.max(xlo, X(i) - cell / 2), oy = Math.min(yhi, Y(j) + cell / 2) - Math.max(ylo, Y(j) - cell / 2);
      if (ox <= 0 || oy <= 0) continue;
      for (const b of benches) {
        const oz = Math.min(zhi, g[c], b.rl + benchH) - Math.max(zlo, z[c], b.rl);
        if (oz <= 0) continue;
        const v = ox * oy * oz * cover;
        const rho = bl.density > 0 ? bl.density : density; // TASKS.csv #2647 — the block's code density
        const vw = wBase ? ox * oy * wPart(c, Math.max(zlo, z[c], b.rl), Math.max(zlo, z[c], b.rl) + oz) * cover : 0; // #2671 — the part above the weathered base
        b.oreV += v; b.oreM = (b.oreM || 0) + (v - vw) * rho + vw * dW; b.metalU += ((v - vw) * rho + vw * dW) * bl.value;
        if (vw > 0) b.oreWV = (b.oreWV || 0) + vw;
        if (bl.beyond === "above" || bl.beyond === "below") b.beyondV = (b.beyondV || 0) + v; // #2645 — ore beyond every sample informing it (#2435)
      }
    }
  }
  let beyondT = 0; // #2645
  benches.forEach((b) => {
    const oreV = Math.min(b.oreV, b.rockV), scale = b.oreV > 0 ? oreV / b.oreV : 1; // #2437 — volumes first, then each part at its density
    beyondT += (b.beyondV || 0) * scale * density; delete b.beyondV;
    b.oreT = (b.oreM != null ? b.oreM : b.oreV * density) * scale /* #2647: the ore at its blocks' densities */; b.metalU *= scale; delete b.oreM;
    const wasteW = Math.max(0, (b.rockWV || 0) - (b.oreWV || 0) * scale); // #2671 — the waste above the weathered base
    b.wasteT = (b.rockV - oreV - wasteW) * wd + wasteW * (dW || 0); b.rockT = b.oreT + b.wasteT;
    b.weatheredT = dW ? ((b.oreWV || 0) * scale + wasteW) * dW : 0; delete b.rockWV; delete b.oreWV;
    b.meanGrade = b.oreT > 0 ? b.metalU / b.oreT : null; delete b.rockV; delete b.oreV;
  });
  const totals = benches.reduce((a, b) => ({ rockT: a.rockT + b.rockT, oreT: a.oreT + b.oreT, wasteT: a.wasteT + b.wasteT, metalU: a.metalU + b.metalU }), { rockT: 0, oreT: 0, wasteT: 0, metalU: 0 });
  totals.stripRatio = totals.oreT > 0 ? totals.wasteT / totals.oreT : null;
  totals.meanGrade = totals.oreT > 0 ? totals.metalU / totals.oreT : null;
  totals.oreBeyondSampleShare = totals.oreT > 0 ? beyondT / totals.oreT : 0; // #2645
  totals.weatheredT = benches.reduce((s, b) => s + (b.weatheredT || 0), 0); totals.weatheredDensity = dW; // #2671
  let nCells = 0;
  for (let c = 0; c < N; c++) nCells += inPit[c];
  return { positions: Float64Array.from(pos), indices: Uint32Array.from(idx), strings, benches, totals, interRampDeg, faceRun, reach, cell, nCells, coarsened, daylights, crestRL, floorRL, groundTopRL: Number.isFinite(groundTop) ? groundTop : null /* #2440 */, partsDropped, columnsInArea,
    sectorsUsed /* #1952 */, upperUsed: up /* #2730 */, ramp: rampState ? { arcs: rampState.arcs, lengthM: +rampState.lengthM.toFixed(1), daylightRL: rampState.daylightRL ?? null /* #2713 */, widthM: rampW, gradientPct: Number(ramp.gradientPct), turn: turn > 0 ? "clockwise" : "anticlockwise", azimuthDeg: normDeg(Number(ramp.azimuthDeg)), needsSwitchback: rampState.needsSwitchback, stoppedAtRL: rampState.stoppedAt, rockT: rampRockT, benches: rampState.arcs.length } : null /* #1948 */ };
}

// export rows: one per string vertex
export function benchStringRows(strings) {
  const out = [];
  strings.forEach((s) => s.lines.forEach((line, li) => line.forEach((p, vi) => out.push({ bench: s.bench, rl: s.rl, kind: s.kind, line: li + 1, vertex: vi + 1, x: +p[0].toFixed(2), y: +p[1].toFixed(2), z: +p[2].toFixed(2) }))));
  return out;
}
export const benchStringFeatures = (strings) => strings.flatMap((s) => s.lines.map((line) => ({ attributes: { name: s.kind === "ramp_centre" ? `RAMP_CL_${s.bench}` : s.kind === "ramp_edge" ? `RAMP_EDGE_${s.bench}` : `BENCH_${Math.round(s.rl)}_${s.kind.toUpperCase()}`, kind: s.kind, rl: s.rl }, geometry: line }))); // ramp layers: #1948
export const benchTableRows = (benches, unit) => benches.map((b, i) => ({ bench: i + 1, floor_rl: b.rl, rock_t: Math.round(b.rockT), ore_t: Math.round(b.oreT), waste_t: Math.round(b.wasteT), [`mean_grade_${String(unit || "").replace("%", "pct")}`]: b.meanGrade == null ? "" : +b.meanGrade.toPrecision(4), strip_ratio: b.oreT > 0 ? +(b.wasteT / b.oreT).toFixed(2) : "" }));
