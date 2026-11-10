// TASKS.csv #1324 — the Identify tool: what is under a click in the 3D view, nearest first, for everything a click can land on. Hover tooltips only ever answered for
// drillhole layers; a block model, a raster or a map layer said nothing. Runs on a click only, loaded with the first one: nothing here costs anything until then.
import * as THREE from "three";
import { b64ToF32 } from "../inversion.js";
import { pointInRings } from "../mapLayers.js";
import { t as tr } from "../i18n.js";
import { sampleIdentifyFields } from "./sampleTip.js"; // TASKS.csv #1821
import { gradeText } from "../gradeText.js"; // TASKS.csv #2515

const num = (v, d = 2) => (Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : String(v ?? ""));
const metres = (v) => `${num(v, 2)} m`;
const SKIP = new Set(["hole_id", "from", "to", "depth", "value", "values", "extra", "modelColor", "catValue", "tip", "id"]);

// A logged row or a feature's attributes as [name, value] pairs: only what a person can read
export function attributeFields(row, skip = SKIP) {
  const out = [];
  for (const [k, v] of Object.entries(row || {})) {
    if (skip.has(k) || k.startsWith("_") || v == null || v === "" || typeof v === "object" || typeof v === "function") continue;
    out.push([k, typeof v === "number" ? num(v, 4) : String(v)]);
  }
  return out;
}

// Depth down a hole at a point: the nearest place on its trace. pts: [{ x, y, z, md }] in scene coordinates.
export function depthOnTrace(pts, p) {
  let best = null, bestD = Infinity;
  for (let i = 0; i < (pts?.length || 0) - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L2 = dx * dx + dy * dy + dz * dz;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / L2)) : 0;
    const d = Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y, a.z + t * dz - p.z);
    if (d < bestD) { bestD = d; best = a.md + t * (b.md - a.md); }
  }
  return best;
}

// The block a point on a model falls in (world coordinates). A point on a face sits on the boundary of two blocks, so the caller nudges it along the ray first.
export function voxelCellAt(model, x, y, z) {
  let best = null, bestD = Infinity;
  for (const c of model?.cells || []) {
    const hx = (c.dx ?? model.dx ?? 0) / 2, hy = (c.dy ?? model.dy ?? 0) / 2, hz = (c.dz ?? model.dz ?? 0) / 2;
    if (Math.abs(x - c.x) <= hx && Math.abs(y - c.y) <= hy && Math.abs(z - c.z) <= hz) return c;
    const d = Math.hypot(x - c.x, y - c.y, z - c.z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// The feature of a map layer at a point: inside a polygon, or within tol of a line or point. Layers drape as one image, so the mesh answers for its whole box.
export function mapFeatureAt(layer, x, y, tol) {
  let best = null, bestD = Infinity;
  for (const f of layer?.features || []) {
    for (const part of f.parts || []) {
      if (layer.geomType === "polygon") { if (pointInRings([x, y], [part])) return f; continue; }
      const pts = typeof part[0] === "number" ? [part] : part;
      if (pts.length === 1) { const d = Math.hypot(pts[0][0] - x, pts[0][1] - y); if (d <= tol && d < bestD) { bestD = d; best = f; } continue; }
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
        const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
        const d = Math.hypot(ax + t * dx - x, ay + t * dy - y);
        if (d <= tol && d < bestD) { bestD = d; best = f; }
      }
    }
  }
  return best;
}

// A raster's value at a point, or null: outside the grid, or no data there. grid: { nx, ny, x0, yTop, dx, dy, values } (base64 or an array).
export function rasterValueAt(grid, x, y) {
  if (!grid?.values) return null;
  const col = Math.round((x - grid.x0) / grid.dx), row = Math.round((grid.yTop - y) / grid.dy);
  if (col < 0 || row < 0 || col >= grid.nx || row >= grid.ny) return null;
  const v = (typeof grid.values === "string" ? b64ToF32(grid.values) : grid.values)[row * grid.nx + col];
  return Number.isFinite(v) ? v : null;
}

const visibleChain = (o) => { for (let n = o; n; n = n.parent) if (n.visible === false) return false; return true; };

const fromTip = (tip) => (tip ? String(tip).split("\n") : []);

function describe(hit, ctx) {
  const o = hit.object, p = hit.point, { x: ox, y: oy, z: oz } = ctx.origin;
  const world = { e: p.x + ox, n: oy - p.z, z: p.y + oz };
  const tipLines = fromTip(o.userData?.tip);
  const base = { point: p, world, hole: null };
  // a drillhole layer, custom layer, assay or point survey
  const group = ctx.layerOf(o);
  if (group) {
    const row = o.userData?.row;
    const collar = tipLines[1] === "collar";
    const hole = row?.hole_id || (ctx.isHole(tipLines[0]) ? tipLines[0] : null);
    const fields = [];
    if (hole) fields.push([tr("Hole"), hole]);
    // TASKS.csv #1504 — a collar's own record: position, orientation, length and the columns kept from its file
    const c = o.userData?.collar;
    if (collar) return { ...base, layer: tr("Collars"), title: hole, hole, fields: c ? [...fields, ...attributeFields(c), ...attributeFields(c.attrs, new Set())] : fields };
    // #1821 — a surface sample: the element it is coloured by and its class first, every element, its own fields
    if (o.userData?.units && row?.medium != null) return { ...base, layer: group, title: tipLines[0] || group, hole: null, fields: [...sampleIdentifyFields(row, o.userData.mapped, o.userData.units), ...attributeFields(row, new Set([...SKIP, "attrs"]))] };
    const nameLine = tipLines[1]?.includes(":") ? tipLines[1].slice(tipLines[1].indexOf(":") + 1).trim() : null;
    if (nameLine) fields.push([tr("Value"), nameLine]);
    else if (row?.value != null) fields.push([tr("Value"), gradeText(row.value)]); // #2515
    if (row?.from != null && row?.to != null) { fields.push([tr("From"), metres(row.from)], [tr("To"), metres(row.to)], [tr("Length"), metres(row.to - row.from)]); } else if (row?.depth != null) fields.push([tr("Depth"), metres(row.depth)]);
    if (row?.values) for (const [sym, v] of Object.entries(row.values).slice(0, 16)) if (v != null) fields.push([sym, `${num(v, 4)} ${ctx.units?.[sym] || ""}`.trim()]);
    if (row) fields.push(...attributeFields(row));
    else for (const line of tipLines.slice(hole ? 2 : 1)) fields.push(["", line]);
    const trace = hole && ctx.traceOf(hole);
    if (trace && !(row?.from != null) && row?.depth == null) { const md = depthOnTrace(trace, p); if (md != null) fields.push([tr("Depth at this point"), metres(md)]); }
    return { ...base, layer: group, title: hole || tipLines[0] || group, hole, fields };
  }
  // a block model: the block under the click
  if (o.userData?.srcModel) {
    const m = o.userData.srcModel, d = ctx.rayDirection, step = 0.01 * Math.min(m.dx || 1, m.dy || 1, m.dz || 1, 1);
    const c = voxelCellAt(m, world.e + d.x * step, world.n - d.z * step, world.z + d.y * step);
    const fields = [];
    if (c) {
      // #1811 — the model's property and unit name the value ('Chargeability (mV/V): 12.09'), to 4 significant figures
      fields.push([m.property || tr("Value"), m.valueLabels?.[c.value] ?? (Number.isFinite(c.value) ? num(+c.value.toPrecision(4), 6) : String(c.value))]);
      fields.push([tr("Block size"), `${num(c.dx ?? m.dx, 1)} × ${num(c.dy ?? m.dy, 1)} × ${num(c.dz ?? m.dz, 1)} m`]);
      fields.push([tr("Block centre"), `${num(c.x, 1)} E, ${num(c.y, 1)} N, ${num(c.z, 1)} m`]);
    }
    return { ...base, backdrop: true, layer: tr("Block models"), title: m.name, fields };
  }
  const rs = ctx.rasterOf(o);
  if (rs) {
    const v = rasterValueAt(rs.grid, world.e, world.n), fields = [];
    if (v != null) fields.push([tr("Value"), num(v, 4)]);
    if (rs.params?.tool) fields.push([tr("Made with"), rs.params.tool]);
    fields.push([tr("Drape"), rs.drapeMode === "terrain" ? tr("On the terrain") : rs.drapeMode === "collars" ? tr("On the ground between the collars") /* #2447 */ : tr("Flat at {z} m", { z: num(rs.elevation ?? 0, 1) })]);
    return { ...base, backdrop: true, layer: tr("Rasters"), title: rs.name, fields };
  }
  const ml = ctx.mapLayerOf(o);
  if (ml) {
    const f = mapFeatureAt(ml, world.e, world.n, ctx.tolerance(hit));
    if (!f) return null; // the layer's image covers its whole box: nothing of it here
    return { ...base, backdrop: ml.geomType === "polygon", layer: tr("Map layers"), title: ml.name, fields: attributeFields(f.attributes, new Set()) };
  }
  const set = ctx.structureSetOf(o);
  if (set) {
    if (hit.instanceId == null) return null;
    const r = set.rows?.[hit.instanceId];
    return { ...base, layer: tr("Surface structures"), title: set.name, fields: r ? [[tr("Dip"), `${num(r.dip, 0)}°`], [tr("Dip direction"), `${num(r.dipDir, 0)}°`], ...attributeFields(r, new Set(["x", "y", "z", "dip", "dipDir"]))] : [] };
  }
  if (o === ctx.terrainMesh) return { ...base, backdrop: true, layer: tr("Terrain"), title: tr("Terrain"), fields: [] };
  const kind = ctx.kindOf(o);
  if (!kind && !tipLines.length) return null;
  return { ...base, layer: kind || tr("3D view"), title: tipLines[0] || kind, fields: tipLines.slice(1).map((l) => ["", l]) };
}

// hits: three.js intersections, any order. Nearest first, one entry per object: a ray goes through a block model many times, and that is one answer.
// A block model, raster, map layer or terrain is behind nearly every click, translucent or not: a hole seen through one is what was clicked, so those backdrops come last.
export function describeHits(hits, ctx, max = 20) {
  const seen = new Set(), out = [];
  const backdrop = (d) => d.backdrop === true;
  for (const h of [...hits].sort((a, b) => a.distance - b.distance)) {
    if (seen.has(h.object) || !visibleChain(h.object)) continue;
    const d = describe(h, ctx);
    if (!d) continue;
    seen.add(h.object);
    out.push(d);
    if (out.length >= max) break;
  }
  return [...out.filter((d) => !backdrop(d)), ...out.filter(backdrop)];
}

// One click: the ray, everything it meets, described. r: the view's refs and data (useIdentify). { items, point of the first, camera distance }.
export function identifyAt(r, clientX, clientY) {
  const rect = r.mountRef.current.getBoundingClientRect(), camera = r.cameraRef.current;
  const rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), camera);
  const hits = [...r.pickHits(rc)];
  // what hover never looks at: map layers and surface structures
  hits.push(...rc.intersectObjects([r.mapLayerGroupRef.current, r.surfStructGroupRef.current].filter(Boolean), true));
  const byObject = (ref) => new Map(Object.entries(ref.current).map(([id, m]) => [m, id]));
  const rasterIds = byObject(r.rasterMeshesRef), mapIds = byObject(r.mapLayerMeshesRef), setIds = byObject(r.surfStructObjsRef);
  const groups = new Map(Object.entries(r.layerGroupsRef.current).map(([k, g]) => [g, k]));
  const kinds = r.kinds.map(([ref, label]) => [ref.current, label]);
  return describeHits(hits, {
    origin: r.originRef.current,
    rayDirection: rc.ray.direction,
    units: r.units,
    isHole: (id) => r.tracesRef.current.some((t) => t.hole_id === id),
    traceOf: (id) => r.tracesRef.current.find((t) => t.hole_id === id)?.pts,
    layerOf: (o) => { const k = groups.get(o.parent); return k == null ? null : r.layerLabel(k); },
    rasterOf: (o) => { const id = rasterIds.get(o); return id == null ? null : r.rasters.find((x) => String(x.id) === id); },
    mapLayerOf: (o) => { const id = mapIds.get(o); return id == null ? null : r.mapLayers.find((x) => String(x.id) === id); },
    structureSetOf: (o) => { const id = setIds.get(o.parent); return id == null ? null : r.surfaceStructures.find((x) => String(x.id) === id); },
    terrainMesh: r.terrainMeshRef.current,
    kindOf: (o) => { for (let n = o.parent; n; n = n.parent) { const k = kinds.find(([g]) => g === n); if (k) return k[1]; } return null; },
    tolerance: (h) => (6 * 2 * h.distance * Math.tan(((camera.fov || 45) * Math.PI) / 360)) / rect.height, // 6 screen pixels at the hit, in metres
  });
}

export const identifyText = (it) => [it.layer, it.title, ...it.fields.map(([k, v]) => (k ? `${k}: ${v}` : v)), `${num(it.world.e, 1)} E, ${num(it.world.n, 1)} N, ${num(it.world.z, 1)} m`].join("\n");
