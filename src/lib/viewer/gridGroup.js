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
  const lift = cs.length > 1 && collarsLookUnderground(cs, survey).underground ? top - origin.z : 0;
  return { depth: drillDepthBelowOrigin(cs), lift, origin };
}

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
  const size = Math.max(1, config.size) || 1000;
  const divisions = Math.max(1, Math.round(config.divisions) || 20);
  const color = new THREE.Color(config.color || defaultColor); // TASKS.csv #308 — one source of truth for the default
  const depth = Number(placement?.depth) || 0;
  // #2369 — on round coordinates: the plane at a multiple of the cell (from the mean collar, or the highest one underground, #2211)
  const sn = gridSnap(placement?.origin, size / divisions, Number(placement?.lift) || 0), lift = sn.y;
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
