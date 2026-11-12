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
import { collarsLookUnderground } from "../pitShell.js";
import { makeTextSprite } from "./textSprite.js";

// -> { depth (m below the origin the drilling reaches), lift (m the plane sits above the origin), origin { x, y, z } (the mean collar, the
// viewer's scene origin with collars) } or null without collars
export function gridPlacement(collars, survey = []) {
  const cs = (collars || []).filter((c) => [c.x, c.y, c.z].every((v) => Number.isFinite(Number(v))));
  if (!cs.length) return null;
  const mean = (k) => cs.reduce((s, c) => s + Number(c[k]), 0) / cs.length;
  const origin = { x: mean("x"), y: mean("y"), z: mean("z") };
  const top = Math.max(...cs.map((c) => Number(c.z)));
  const lift = cs.length > 1 && collarsLookUnderground(cs.length === collars.length ? collars : cs, survey).underground ? top - origin.z : 0; // the store's array when none was left out: the answer is kept per array (#2798)
  return { depth: drillDepthBelowOrigin(cs), lift, origin, auto: autoGridSize(cs) };
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
export function gridSnap(origin, cell, lift = 0) {
  if (!origin || !(cell > 0)) return { dx: 0, dz: 0, y: lift };
  const snap = (v) => Math.round(v / cell) * cell;
  return { dx: snap(origin.x) - origin.x, dz: -(snap(origin.y) - origin.y), y: snap(origin.z + lift) - origin.z };
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
  const sn = gridSnap(at, size / divisions, Number(placement?.lift) || 0), lift = sn.y;
  if (auto && placement?.origin) { sn.dx += auto.cx - placement.origin.x; sn.dz -= auto.cy - placement.origin.y; } // gridSnap measured from the box centre
  group.position.set(sn.dx, 0, sn.dz);
  const mkGrid = () => new THREE.GridHelper(size, divisions, color, color);
  const ground = mkGrid(); ground.position.y = lift;
  group.add(ground);
  let h = 0;
  if (config.mode === "3d") {
    h = gridWallHeight(size, divisions, depth + lift); // #1405 — below the ground grid, as deep as the drilling (#2369: no deeper)
    const back = mkGrid(); // rotate XZ -> XY, forms the "north" wall
    back.rotation.x = Math.PI / 2; back.scale.set(1, 1, h / size); // local z -> world -y after the turn
    back.position.set(0, lift - h / 2, -size / 2);
    group.add(back);
    const side = mkGrid(); // rotate XZ -> ZY, forms the "west" wall
    side.rotation.z = Math.PI / 2; side.scale.set(h / size, 1, 1); // local x -> world y
    side.position.set(-size / 2, lift - h / 2, 0);
    group.add(side);
  }
  // #2211 — the numbers: easting along the south edge, northing along the west edge, RL down the corner of the walls (or the plane's own)
  const o = placement?.origin;
  if (o && config.labels !== false && typeof document !== "undefined") {
    const labels = new THREE.Group(); labels.name = "gridLabels";
    const { ticks, cell } = gridTicks(size, divisions);
    const add = (text, x, y, z) => { const s = makeTextSprite(text, { color: "#55606e", bg: "rgba(255,255,255,0.7)" }); s.position.set(x, y, z); labels.add(s); };
    for (const x of ticks) add(`${fmt(o.x + sn.dx + x)} E`, x, lift, size / 2); // #2369 — the group sits at the snapped centre
    for (const z of ticks) if (z > -size / 2 + 1e-9) add(`${fmt(o.y - sn.dz - z)} N`, -size / 2, lift, z);
    if (h > 0) { const step = cell * Math.max(1, Math.ceil(h / cell / 5)); for (let y = 0; y <= h + 1e-6; y += step) add(`RL ${fmt(o.z + lift - y)}`, -size / 2, lift - y, -size / 2); }
    else add(`RL ${fmt(o.z + lift)}`, -size / 2, lift, -size / 2);
    group.add(labels);
    group.userData.labels = labels; // the view keeps them a fixed size on screen (fitScreenLabels)
  }
  return group;
}
