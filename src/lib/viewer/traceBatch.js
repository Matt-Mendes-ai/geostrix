// TASKS.csv #2176 step 3 — the drillhole traces as a few merged LineSegments instead of one THREE.Line (and one material) per hole.
// On a 20,544-hole project every frame issued ~20,550 draw calls (an orbit frame took ~200 ms) and the first frame after each rebuild
// spent ~8 s in WebGL setup for 20,000 new lines. Here the holes are cut into spatial chunks of about CHUNK_HOLES holes (a chunk
// has a tight bounding sphere, so a pick ray still skips the far ones); each chunk is ONE LineSegments with a per-vertex RGBA colour,
// so a hole keeps its own colour and opacity (holeColours.js, #1504), and a hidden hole (the Holes list, #1533) is collapsed to its
// collar point (nothing rasterizes) and shown again by writing its points back. An assumed-vertical hole (#2014) goes in a dashed
// chunk whose line distances restart at each collar, as its own Line's did.
// Picking: a chunk is a pick target like the Lines were; its raycast hands back a small per-hole stand-in ({ isLine, userData:
// { holeId }, parent: the chunk, visible }) for each hit, so hover, Identify and firstVisibleLayerHit see what a hole's Line gave them.
import * as THREE from "three";

export const TRACE_GREY = 0x445064;
export const TRACE_OPACITY = 0.5; // a grey trace, as LineBasicMaterial({ opacity: 0.5 }) drew it
export const TRACE_OPACITY_COLOURED = 0.95; // a hole coloured by a collar field (#1504)
export const CHUNK_HOLES = 256;

// holes [{ holeId, pts: [{ x, y, z }] }] -> arrays of holes, each about `size` long and spatially together (cells of the collars'
// extent, in a serpentine order), so each chunk's bounding sphere is small
export function chunkHoles(holes, size = CHUNK_HOLES) {
  const n = holes.length;
  if (n <= size) return n ? [holes.slice()] : [];
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const h of holes) { const p = h.pts[0]; if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z; }
  const cols = Math.max(1, Math.ceil(Math.sqrt(n / size))), w = (x1 - x0) / cols || 1, h = (z1 - z0) / cols || 1;
  const key = (p) => { const i = Math.min(cols - 1, Math.floor((p.x - x0) / w)), j = Math.min(cols - 1, Math.floor((p.z - z0) / h)); return i * cols + (i % 2 ? cols - 1 - j : j); };
  const sorted = holes.map((x) => [key(x.pts[0]), x.pts[0].z, x]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((e) => e[2]);
  const out = [];
  for (let i = 0; i < n; i += size) out.push(sorted.slice(i, i + size));
  return out;
}

const _c = new THREE.Color();
// One chunk: positions of every segment (point i -> i+1 of each hole), its colours (RGBA), the hole of each vertex range, and for a
// dashed chunk the distance along its own hole of every vertex
export function traceChunkArrays(holes, { dashed = false } = {}) {
  let verts = 0;
  for (const h of holes) verts += Math.max(0, h.pts.length - 1) * 2;
  const position = new Float32Array(verts * 3), color = new Float32Array(verts * 4), dist = dashed ? new Float32Array(verts) : null;
  const start = new Int32Array(holes.length), count = new Int32Array(holes.length);
  _c.setHex(TRACE_GREY);
  let v = 0;
  holes.forEach((h, k) => {
    start[k] = v;
    let d = 0;
    for (let i = 0; i + 1 < h.pts.length; i++) {
      const a = h.pts[i], b = h.pts[i + 1];
      const o = v * 3; position[o] = a.x; position[o + 1] = a.y; position[o + 2] = a.z; position[o + 3] = b.x; position[o + 4] = b.y; position[o + 5] = b.z; // no array per segment
      if (dist) { dist[v] = d; d += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); dist[v + 1] = d; }
      v += 2;
    }
    count[k] = v - start[k];
  });
  for (let i = 0; i < verts * 4; i += 4) { color[i] = _c.r; color[i + 1] = _c.g; color[i + 2] = _c.b; color[i + 3] = TRACE_OPACITY; }
  return { position, color, dist, start, count };
}

// the hole whose vertex range holds vertex `v` (ranges are in order)
export function holeAtVertex(start, v) {
  let lo = 0, hi = start.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (start[mid] <= v) lo = mid; else hi = mid - 1; }
  return lo;
}

// hole id -> its ranges in the chunk (a repeated id is hidden and coloured with its twin)
const indexOf = (ids) => { const m = new Map(); ids.forEach((id, k) => { const a = m.get(id); if (a) a.push(k); else m.set(id, [k]); }); return m; };

function makeChunk(holes, dashed) {
  const a = traceChunkArrays(holes, { dashed });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(a.position, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(a.color, 4)); // itemSize 4: three draws the alpha too (vertexAlphas)
  if (a.dist) geo.setAttribute("lineDistance", new THREE.BufferAttribute(a.dist, 1));
  const material = dashed
    ? new THREE.LineDashedMaterial({ vertexColors: true, dashSize: 4, gapSize: 4, transparent: true }) // #2014 — dashed, like a planned hole: this stick is an assumption
    : new THREE.LineBasicMaterial({ vertexColors: true, transparent: true });
  const lines = new THREE.LineSegments(geo, material);
  const holeIds = holes.map((h) => h.holeId);
  lines.userData = { traceChunk: { holeIds, index: indexOf(holeIds), start: a.start, count: a.count, base: a.position.slice(), hidden: new Uint8Array(holes.length), proxies: new Array(holes.length) } };
  lines.raycast = raycastChunk;
  return lines;
}

// Adds the trace chunks of `holes` ({ holeId, pts, dashed }) to `group`; returns them
export function addTraceChunks(group, holes, size = CHUNK_HOLES) {
  const out = [];
  for (const dashed of [false, true]) {
    for (const part of chunkHoles(holes.filter((h) => !!h.dashed === dashed && h.pts.length > 1), size)) { const l = makeChunk(part, dashed); group.add(l); out.push(l); }
  }
  return out;
}

const _hits = [];
function raycastChunk(raycaster, intersects) {
  _hits.length = 0;
  THREE.LineSegments.prototype.raycast.call(this, raycaster, _hits);
  const tc = this.userData.traceChunk;
  for (const hit of _hits) {
    const k = holeAtVertex(tc.start, hit.index);
    hit.object = tc.proxies[k] || (tc.proxies[k] = traceHoleProxy(this, k));
    intersects.push(hit);
  }
}
// what a hit on one hole's segment reports as its object: the fields the pick consumers read from a hole's Line
function traceHoleProxy(chunk, k) {
  const tc = chunk.userData.traceChunk;
  return {
    isObject3D: true, isLine: true, type: "Line", traceProxy: true, userData: { holeId: tc.holeIds[k] }, parent: chunk, layers: chunk.layers,
    get visible() { return !tc.hidden[k]; }, get matrixWorld() { return chunk.matrixWorld; }, get material() { return chunk.material; }, geometry: chunk.geometry,
  };
}

// Hides (collapses to the collar point) or shows one hole of a chunk; false when the chunk does not hold it. Call flushTraceChunk after.
export function setTraceHoleHidden(chunk, holeId, hidden) {
  const tc = chunk.userData.traceChunk, ks = tc.index.get(holeId);
  if (!ks) return false;
  const pos = chunk.geometry.attributes.position.array;
  for (const k of ks) {
    if (!!tc.hidden[k] === !!hidden) continue;
    tc.hidden[k] = hidden ? 1 : 0;
    const s = tc.start[k] * 3, e = s + tc.count[k] * 3;
    if (hidden) for (let i = s; i < e; i += 3) { pos[i] = tc.base[s]; pos[i + 1] = tc.base[s + 1]; pos[i + 2] = tc.base[s + 2]; }
    else pos.set(tc.base.subarray(s, e), s);
    chunk.geometry.attributes.position.needsUpdate = true;
  }
  return true;
}
// One hole's colour (a hex, or null for the grey trace) and opacity
export function setTraceHoleColour(chunk, holeId, hex) {
  const tc = chunk.userData.traceChunk, ks = tc.index.get(holeId);
  if (!ks) return false;
  _c.set(hex == null ? TRACE_GREY : hex);
  const a = hex == null ? TRACE_OPACITY : TRACE_OPACITY_COLOURED, col = chunk.geometry.attributes.color;
  const arr = col.array;
  for (const k of ks) for (let i = tc.start[k] * 4, end = i + tc.count[k] * 4; i < end; i += 4) { arr[i] = _c.r; arr[i + 1] = _c.g; arr[i + 2] = _c.b; arr[i + 3] = a; }
  col.needsUpdate = true;
  return true;
}
// After setTraceHoleHidden: the bounding volumes follow the visible holes (Box3.setFromObject for the zooms; frustum culling)
export function flushTraceChunk(chunk) { chunk.geometry.boundingBox = null; chunk.geometry.boundingSphere = null; }
// The Holes list's pass (ViewerModule's visibleHoles effect, #1533): every hole of a chunk hidden or shown from visibleHoles
export function hideTraceHoles(chunk, visibleHoles) {
  for (const id of chunk.userData.traceChunk.holeIds) setTraceHoleHidden(chunk, id, visibleHoles[id] === false);
  flushTraceChunk(chunk);
}
