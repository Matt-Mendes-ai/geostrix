// The 3D view's reference grid, moved out of ViewerModule.jsx (its size cap, #1084) for TASKS.csv #2211.
// Builds the grid display object(s) into a fresh THREE.Group from scratch — called whenever gridConfig changes. "ground" is the
// original flat XZ grid; "3d" adds two vertical wall grids (rotated copies of the same GridHelper) forming an open corner/box, similar
// to the reference grid frame in implicit-modelling tools — useful for judging depth/extent, not just plan position.
// TASKS.csv #2211 (review #2174, WA gold) — on a mine drilled from underground the plane sat at the mean collar elevation, ~200 m below
// the surface, and the grid had no numbers: a reader could not tell a 50 m cell from a 100 m one or where RL 0 is. With collars that look
// underground the plane goes to the highest collar (lift) and the walls reach from there to the deepest hole; the edges carry easting,
// northing and RL labels in the project's own metres (local numbers, no CRS claim).
import * as THREE from "three";
import { gridWallHeight, drillDepthBelowOrigin } from "./gridDepth.js";
import { collarsLookUnderground } from "../collarGround.js"; // TASKS.csv #3159: not pitShell.js, which put the pit solver in startup
import { makeTextSprite } from "./textSprite.js";

// -> { depth (m below the origin the drilling reaches), lift (m the plane sits above the origin), origin { x, y, z } (the mean collar, the
// viewer's scene origin with collars) } or null without collars. traces: the desurveyed holes ({ wz: elevations }), when built
// TASKS.csv #3355 (WA gold) — the depth from the traces' lowest point: each hole's collar dip x length put deep deviated holes below the frame
export const tracesLowest = (traces) => { let lo = Infinity; for (const t of traces || []) for (const z of t?.wz || []) if (z < lo) lo = z; return lo; };
export function gridPlacement(collars, survey = [], traces = null) {
  const cs = (collars || []).filter((c) => [c.x, c.y, c.z].every((v) => Number.isFinite(Number(v))));
  if (!cs.length) return null;
  const mean = (k) => cs.reduce((s, c) => s + Number(c[k]), 0) / cs.length;
  const origin = { x: mean("x"), y: mean("y"), z: mean("z") };
  const top = Math.max(...cs.map((c) => Number(c.z)));
  const lift = cs.length > 1 && collarsLookUnderground(cs.length === collars.length ? collars : cs, survey).underground ? top - origin.z : 0; // the store's array when none was left out: the answer is kept per array (#2798)
  const low = tracesLowest(traces);
  return { depth: Number.isFinite(low) ? Math.max(0, origin.z - low) : drillDepthBelowOrigin(cs), lift, origin, top, auto: autoGridSize(cs) }; // top: the highest collar's RL (#3277)
}

// TASKS.csv #3277 (Galore review) — collars from RL 456 to 1,596 under a 2,000 m horizontal cell: the plane snapped to RL 0 and the walls hung
// from 0 to -2,000, below every hole. The vertical keeps the cell while the drilling spans two cells or more; otherwise it takes its own round
// step, at most ten over the drilling's elevation range (200 m there). -> the vertical step in m
export function verticalStep(cell, range) {
  if (!(cell > 0)) return 1;
  if (!(range > 0) || range / cell >= 2) return cell;
  return CELLS.find((c) => range / c <= 10) || cell;
}

// TASKS.csv #2318 (from #2211, review #2174 WA gold: 'a 1,000 m default is twice the 500 x 800 m block') — the grid's size and cell from the
// collars' extent: the plan box plus 20 %, a round cell (10 ... 5,000 m) giving at most 25 divisions, centred on the box (not the mean
// collar). -> { size, divisions, cx, cy } or null without two collars apart
const CELLS = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];
export function autoGridSize(collars) {
  const cs = (collars || []).filter((c) => Number.isFinite(Number(c?.x)) && Number.isFinite(Number(c?.y)));
  if (cs.length < 2) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cs) { const x = Number(c.x), y = Number(c.y); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const span = Math.max(100, Math.max(x1 - x0, y1 - y0) * 1.2);
  const cell = CELLS.find((c) => span / c <= 25) || CELLS[CELLS.length - 1];
  const divisions = Math.max(2, Math.ceil(span / cell / 2) * 2); // even: a line through the centre
  return { size: divisions * cell, divisions, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
// a grid follows the data while it is set to (sizeAuto) or was never resized from the old fixed default (1,000 m in 20)
export const isAutoGrid = (config) => config?.sizeAuto === true || (config?.sizeAuto == null && Number(config?.size) === 1000 && Number(config?.divisions) === 20);

// the label positions along each edge, every `stride` cells (about five per edge): pure, for the test
export function gridTicks(size, divisions) {
  const cell = size / Math.max(1, divisions), stride = Math.max(1, Math.ceil(divisions / 5)), out = [];
  for (let k = 0; k <= divisions; k += stride) out.push(-size / 2 + k * cell);
  return { cell, ticks: out };
}
const fmt = (v) => Math.round(v).toLocaleString("en-US");

// TASKS.csv #2369 (review #2325, WA uranium) — the grid was centred on the mean collar (577,011 E / 6,681,766 N / RL 331), so no line fell on a
// round coordinate. Its centre and plane now snap to multiples of the cell (577,000 E, 6,682,000 N, RL 350 with 50 m cells): -> the scene offsets
// { dx, dz, y } of the grid's centre and plane (y: the plane's height above the origin), or zeros without an origin
export function gridSnap(origin, cell, lift = 0, vCell = cell) {
  if (!origin || !(cell > 0)) return { dx: 0, dz: 0, y: lift };
  const snap = (v) => Math.round(v / cell) * cell;
  return { dx: snap(origin.x) - origin.x, dz: -(snap(origin.y) - origin.y), y: Math.round((origin.z + lift) / vCell) * vCell - origin.z }; // #3277: vCell
}

// #3277 — a wall of the 3D frame: vertical lines on the plan cells, level lines every vertical step (round RLs; the scaled GridHelper spaced
// them height / divisions). across: "x" (the north wall, in x-y) or "z" (the west wall, in z-y); local y from -height/2 to height/2
function wallLines(size, divisions, height, vStep, across, color) {
  const pos = [], half = size / 2, hh = height / 2, put = (a, y) => (across === "x" ? pos.push(a, y, 0) : pos.push(0, y, a));
  for (let k = 0; k <= divisions; k++) { const a = -half + (k * size) / divisions; put(a, -hh); put(a, hh); }
  for (let y = -hh; y <= hh + 1e-6; y += vStep) { put(-half, y); put(half, y); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color }));
}

export function buildGridGroup(config, placement = null, defaultColor = "#c8ced8") {
  const group = new THREE.Group(); group.name = "gridHelpers";
  if (!config.visible) return group;
  const auto = isAutoGrid(config) ? placement?.auto : null; // #2318
  const size = auto ? auto.size : Math.max(1, config.size) || 1000;
  const divisions = auto ? auto.divisions : Math.max(1, Math.round(config.divisions) || 20);
  const color = new THREE.Color(config.color || defaultColor); // TASKS.csv #308 — one source of truth for the default
  const depth = Number(placement?.depth) || 0;
  // #2369 — on round coordinates: the plane at a multiple of the cell (from the mean collar, or the highest one underground, #2211)
  const at = auto && placement?.origin ? { ...placement.origin, x: auto.cx, y: auto.cy } : placement?.origin; // #2318 — centred on the data's box
  const o0 = placement?.origin, topAbove = o0 && Number.isFinite(placement?.top) ? placement.top - o0.z : 0; // #3277 — the highest collar
  const vStep = verticalStep(size / divisions, topAbove + depth);
  const sn = gridSnap(at, size / divisions, Number(placement?.lift) || 0, vStep), lift = sn.y;
  if (auto && placement?.origin) { sn.dx += auto.cx - placement.origin.x; sn.dz -= auto.cy - placement.origin.y; } // gridSnap measured from the box centre
  group.position.set(sn.dx, 0, sn.dz);
  const mkGrid = () => new THREE.GridHelper(size, divisions, color, color);
  const ground = mkGrid(); ground.position.y = lift;
  group.add(ground);
  let h = 0, up = 0;
  if (config.mode === "3d") {
    // #1405 — below the ground grid, as deep as the drilling (#2369: no deeper); #3277 — in vertical steps, and up to the highest collar
    h = gridWallHeight(vStep, 1, depth + lift);
    up = topAbove > lift + 1e-6 ? Math.ceil((topAbove - lift) / vStep - 1e-9) * vStep : 0;
    const H = h + up, mid = lift + up - H / 2;
    const back = wallLines(size, divisions, H, vStep, "x", color); // the "north" wall
    back.position.set(0, mid, -size / 2);
    group.add(back);
    const side = wallLines(size, divisions, H, vStep, "z", color); // the "west" wall
    side.position.set(-size / 2, mid, 0);
    group.add(side);
  }
  // #2211 — the numbers: easting along the south edge, northing along the west edge, RL down the corner of the walls (or the plane's own)
  const o = placement?.origin;
  if (o && config.labels !== false && typeof document !== "undefined") {
    const labels = new THREE.Group(); labels.name = "gridLabels";
    const { ticks } = gridTicks(size, divisions);
    const add = (text, x, y, z) => { const s = makeTextSprite(text, { color: "#55606e", bg: "rgba(255,255,255,0.7)" }); s.position.set(x, y, z); labels.add(s); };
    for (const x of ticks) add(`${fmt(o.x + sn.dx + x)} E`, x, lift, size / 2); // #2369 — the group sits at the snapped centre
    for (const z of ticks) if (z > -size / 2 + 1e-9) add(`${fmt(o.y - sn.dz - z)} N`, -size / 2, lift, z);
    if (h > 0) { const step = vStep * Math.max(1, Math.ceil((h + up) / vStep / 6)); for (let y = -up; y <= h + 1e-6; y += step) add(`RL ${fmt(o.z + lift - y)}`, -size / 2, lift - y, -size / 2); } // #3277 — vStep, from the top
    else add(`RL ${fmt(o.z + lift)}`, -size / 2, lift, -size / 2);
    group.add(labels);
    group.userData.labels = labels; // the view keeps them a fixed size on screen (fitScreenLabels)
  }
  return group;
}
