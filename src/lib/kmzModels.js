// TASKS.csv #3087 part 2 — the project KMZ's 3D models: generated surfaces, block / voxel models and the terrain as COLLADA (.dae) models, and
// the section images as textured upright pictures.
// Google Earth places a <Model> at one longitude / latitude / altitude and reads its vertices as metres east, north and up of that point. So
// every vertex goes through the export's own transform (the project CRS or a local grid's tie -> longitude / latitude, an RL -> elevation)
// and back to metres on the WGS84 ellipsoid around the model's centre, with the Earth's curvature taken off (a point 5 km from the centre sits
// about 2 m below the tangent plane there). Grid convergence and scale factor are then the transform's, not an approximation.
// Google Earth draws a model's material colours, not vertex colours, so a block model's faces are grouped into one material per colour.
// Pure: no DOM, no three.js.
import { voxelCellShown } from "./viewer/geomath.js";
import { rectilinearGrid, buildExposedFaces, srgbToLinear } from "./voxelFaces.js";
import { makeVoxelColorResolverRGB } from "./layers.js";

export const MODEL_MAX_TRIANGLES = 2_000_000; // per model: above this a model is left out (and said so) rather than writing a file Google Earth chokes on
export const TERRAIN_MAX_SIDE = 400; // the terrain is thinned to at most this many nodes a side (about 320,000 triangles)
export const BOX_MAX_CELLS = 200_000; // a block model not on a rectilinear grid is written as whole boxes, up to this many cells

const fin = Number.isFinite;
const D2R = Math.PI / 180, A_WGS = 6378137, F_WGS = 1 / 298.257223563, E2 = F_WGS * (2 - F_WGS);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// "#rrggbb" | "rrggbb" | 0xrrggbb (a three.js getHex()) -> "#rrggbb" or null
export function hexColour(c) {
  if (typeof c === "number" && fin(c)) return `#${(c & 0xffffff).toString(16).padStart(6, "0")}`;
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c ?? "").trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}
const rgb01 = (hex) => { const h = hexColour(hex) || "#b4b4b4"; return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); };

// world (x, y, z) flat -> { origin: { lon, lat, alt }, local: Float64Array of metres east / north / up of the origin } | null (a vertex
// that does not transform). toLonLat(x, y) -> [lon, lat]; altOf(z) -> metres above sea level. The origin is the middle of the model's
// longitude / latitude box at its lowest elevation. Exact: each point goes to Earth-centred coordinates on the WGS84 ellipsoid and into the
// tangent plane at the origin, the frame Google Earth reads a model in (so the Earth's curvature comes off on its own: about 2 m at 5 km).
// The elevations are above sea level, not the ellipsoid; the difference is the same across a model and cancels.
const ecef = (lon, lat, h) => {
  const l = lon * D2R, b = lat * D2R, s = Math.sin(b), N = A_WGS / Math.sqrt(1 - E2 * s * s);
  return [(N + h) * Math.cos(b) * Math.cos(l), (N + h) * Math.cos(b) * Math.sin(l), (N * (1 - E2) + h) * s];
};
export function modelFrame(xyz, toLonLat, altOf = (z) => z) {
  const n = Math.floor((xyz?.length || 0) / 3);
  if (!n) return null;
  const lon = new Float64Array(n), lat = new Float64Array(n), alt = new Float64Array(n);
  let lo0 = Infinity, lo1 = -Infinity, la0 = Infinity, la1 = -Infinity, a0 = Infinity;
  for (let i = 0; i < n; i++) {
    const ll = toLonLat(xyz[3 * i], xyz[3 * i + 1]);
    const L = ll?.[0], B = ll?.[1], A = altOf(xyz[3 * i + 2]);
    if (!fin(L) || !fin(B) || !fin(A)) return null;
    lon[i] = L; lat[i] = B; alt[i] = A;
    if (L < lo0) lo0 = L; if (L > lo1) lo1 = L; if (B < la0) la0 = B; if (B > la1) la1 = B; if (A < a0) a0 = A;
  }
  const lon0 = (lo0 + lo1) / 2, lat0 = (la0 + la1) / 2;
  const [X0, Y0, Z0] = ecef(lon0, lat0, a0);
  const sl = Math.sin(lon0 * D2R), cl = Math.cos(lon0 * D2R), sb = Math.sin(lat0 * D2R), cb = Math.cos(lat0 * D2R);
  const local = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const [X, Y, Z] = ecef(lon[i], lat[i], alt[i]), dx = X - X0, dy = Y - Y0, dz = Z - Z0;
    local[3 * i] = -sl * dx + cl * dy;
    local[3 * i + 1] = -sb * cl * dx - sb * sl * dy + cb * dz;
    local[3 * i + 2] = cb * cl * dx + cb * sl * dy + sb * dz;
  }
  return { origin: { lon: lon0, lat: lat0, alt: a0 }, local };
}

// area-weighted vertex normals of a triangle mesh (flat positions, flat indices) -> Float64Array
export function vertexNormals(p, idx) {
  const out = new Float64Array(p.length);
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2];
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { out[k] += nx; out[k + 1] += ny; out[k + 2] += nz; }
  }
  for (let i = 0; i < out.length; i += 3) {
    const l = Math.hypot(out[i], out[i + 1], out[i + 2]);
    if (l > 0) { out[i] /= l; out[i + 1] /= l; out[i + 2] /= l; } else { out[i] = 0; out[i + 1] = 0; out[i + 2] = 1; }
  }
  return out;
}

const f2 = (v) => String(Math.round(v * 100) / 100); // centimetres
const f3 = (v) => String(Math.round(v * 1000) / 1000);
const floats = (a, f) => { const s = new Array(a.length); for (let i = 0; i < a.length; i++) s[i] = f(a[i]); return s.join(" "); };

// parts: [{ positions (local metres, flat), normals (flat), indices, uvs? (flat s, t), color "#rrggbb", alpha 0-1, doubleSided?, texture? (a file
// name beside the .dae) }] -> a COLLADA 1.4.1 document (Z up, metres)
export function daeDocument(name, parts) {
  const images = [], effects = [], materials = [], geoms = [], nodes = [];
  parts.forEach((pt, g) => {
    const alpha = fin(pt.alpha) ? Math.min(1, Math.max(0, pt.alpha)) : 1;
    const [r, gg, b] = rgb01(pt.color);
    let params = "", diffuse = `<color>${f3(r)} ${f3(gg)} ${f3(b)} ${f3(alpha)}</color>`;
    if (pt.texture) {
      images.push(`<image id="img${g}"><init_from>${esc(pt.texture)}</init_from></image>`);
      params = `<newparam sid="surf${g}"><surface type="2D"><init_from>img${g}</init_from></surface></newparam><newparam sid="samp${g}"><sampler2D><source>surf${g}</source></sampler2D></newparam>`;
      diffuse = `<texture texture="samp${g}" texcoord="uv0"/>`;
    }
    // A_ONE: the result is the material weighted by transparent.a x transparency, so transparent.a carries the opacity; written only below 1
    const see = alpha < 1 ? `<transparent opaque="A_ONE"><color>1 1 1 ${f3(alpha)}</color></transparent><transparency><float>1</float></transparency>` : "";
    const two = pt.doubleSided ? `<extra><technique profile="GOOGLEEARTH"><double_sided>1</double_sided></technique></extra>` : "";
    effects.push(`<effect id="fx${g}"><profile_COMMON>${params}<technique sid="common"><lambert><diffuse>${diffuse}</diffuse>${see}</lambert></technique>${two}</profile_COMMON></effect>`);
    materials.push(`<material id="m${g}" name="m${g}"><instance_effect url="#fx${g}"/></material>`);
    const nt = Math.floor(pt.indices.length / 3), uv = !!pt.uvs;
    const stride = uv ? 3 : 2, p = new Array(nt * 3 * stride);
    for (let i = 0; i < nt * 3; i++) { const k = pt.indices[i]; p[i * stride] = k; p[i * stride + 1] = k; if (uv) p[i * stride + 2] = k; }
    const src = (id, arr, f, names) => `<source id="${id}"><float_array id="${id}a" count="${arr.length}">${floats(arr, f)}</float_array><technique_common><accessor source="#${id}a" count="${arr.length / names.length}" stride="${names.length}">${names.map((x) => `<param name="${x}" type="float"/>`).join("")}</accessor></technique_common></source>`;
    geoms.push(`<geometry id="g${g}"><mesh>${src(`g${g}p`, pt.positions, f2, ["X", "Y", "Z"])}${src(`g${g}n`, pt.normals, f3, ["X", "Y", "Z"])}${uv ? src(`g${g}t`, pt.uvs, f3, ["S", "T"]) : ""}`
      + `<vertices id="g${g}v"><input semantic="POSITION" source="#g${g}p"/></vertices><triangles material="m${g}" count="${nt}"><input semantic="VERTEX" source="#g${g}v" offset="0"/><input semantic="NORMAL" source="#g${g}n" offset="1"/>${uv ? `<input semantic="TEXCOORD" source="#g${g}t" offset="2" set="0"/>` : ""}<p>${p.join(" ")}</p></triangles></mesh></geometry>`);
    nodes.push(`<node id="n${g}" name="${esc(`${name} ${g + 1}`)}"><instance_geometry url="#g${g}"><bind_material><technique_common><instance_material symbol="m${g}" target="#m${g}">${uv ? `<bind_vertex_input semantic="uv0" input_semantic="TEXCOORD" input_set="0"/>` : ""}</instance_material></technique_common></bind_material></instance_geometry></node>`);
  });
  return `<?xml version="1.0" encoding="utf-8"?>\n<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">`
    + `<asset><contributor><authoring_tool>GeoStrix</authoring_tool></contributor><unit name="meter" meter="1"/><up_axis>Z_UP</up_axis></asset>`
    + (images.length ? `<library_images>${images.join("")}</library_images>` : "")
    + `<library_effects>${effects.join("")}</library_effects><library_materials>${materials.join("")}</library_materials><library_geometries>${geoms.join("")}</library_geometries>`
    + `<library_visual_scenes><visual_scene id="scene" name="${esc(name)}">${nodes.join("")}</visual_scene></library_visual_scenes><scene><instance_visual_scene url="#scene"/></scene></COLLADA>\n`;
}

// the KML <Model> that places a .dae (href, in the KMZ) at origin
export const modelKml = (o, href) => `<Model><altitudeMode>absolute</altitudeMode><Location><longitude>${o.lon.toFixed(8)}</longitude><latitude>${o.lat.toFixed(8)}</latitude><altitude>${o.alt.toFixed(2)}</altitude></Location>`
  + `<Orientation><heading>0</heading><tilt>0</tilt><roll>0</roll></Orientation><Scale><x>1</x><y>1</y><z>1</z></Scale><Link><href>${esc(href)}</href></Link></Model>`;

// ---------- the meshes, in world (project) coordinates: { xyz, indices, normals?, uvs?, color, alpha, doubleSided?, texture? } ----------

// a generated surface (store.generatedSurfaces: flat world vertices + indices, its base colour / opacity and any chosen style) -> a part | null
export function surfaceMesh(s) {
  const v = s?.vertices, ix = s?.indices;
  const xyz = Array.isArray(v?.[0]) ? Float64Array.from(v.flat()) : v?.length ? Float64Array.from(v) : null;
  if (!xyz || xyz.length < 9 || !(ix?.length >= 3)) return null;
  const n = xyz.length / 3, indices = Uint32Array.from(ix);
  for (let i = 0; i < indices.length; i++) if (!(indices[i] < n)) return null;
  for (let i = 0; i < xyz.length; i++) if (!fin(xyz[i])) return null;
  const opacity = s.style?.opacity ?? s.opacity;
  return { xyz, indices, color: hexColour(s.style?.color) || hexColour(s.color) || "#b4b4b4", alpha: fin(opacity) ? opacity : 0.75, doubleSided: true };
}

// the terrain heightfield ({ bbox, gridW, gridH, elevations, row 0 = north }) thinned to maxSide nodes a side -> a part | null
export function terrainMesh(t, maxSide = TERRAIN_MAX_SIDE) {
  const W = t?.gridW | 0, H = t?.gridH | 0, el = t?.elevations, bb = t?.bbox;
  if (W < 2 || H < 2 || !el || el.length < W * H || !Array.isArray(bb) || !bb.every(fin)) return null;
  const step = Math.max(1, Math.ceil(Math.max(W, H) / maxSide));
  const cols = [], rows = [];
  for (let i = 0; i < W; i += step) cols.push(i); if (cols[cols.length - 1] !== W - 1) cols.push(W - 1);
  for (let j = 0; j < H; j += step) rows.push(j); if (rows[rows.length - 1] !== H - 1) rows.push(H - 1);
  const [x0, y0, x1, y1] = bb, at = new Int32Array(cols.length * rows.length).fill(-1), xyz = [];
  rows.forEach((j, b) => cols.forEach((i, a) => {
    const z = el[j * W + i];
    if (!fin(z)) return;
    at[b * cols.length + a] = xyz.length / 3;
    xyz.push(x0 + (i / (W - 1)) * (x1 - x0), y1 - (j / (H - 1)) * (y1 - y0), z);
  }));
  const idx = [];
  for (let b = 0; b + 1 < rows.length; b++) for (let a = 0; a + 1 < cols.length; a++) {
    const nw = at[b * cols.length + a], ne = at[b * cols.length + a + 1], sw = at[(b + 1) * cols.length + a], se = at[(b + 1) * cols.length + a + 1];
    // counter-clockwise seen from above (rows run south)
    if (sw >= 0 && se >= 0 && ne >= 0) idx.push(sw, se, ne);
    if (sw >= 0 && ne >= 0 && nw >= 0) idx.push(sw, ne, nw);
  }
  if (!idx.length) return null;
  return { xyz: Float64Array.from(xyz), indices: Uint32Array.from(idx), color: hexColour(t.color) || "#8a7f68", alpha: fin(t.opacity) ? t.opacity : 1, doubleSided: true, thinnedBy: step };
}

// a voxel / block model -> { parts: one per colour, cells, faces } | null. The cells the 3D View shows (voxelCellShown), coloured as it colours
// them (makeVoxelColorResolverRGB, to 8 levels a channel), as their outer faces on a rectilinear grid (the 3D View's own voxelFaces), else as
// whole boxes up to BOX_MAX_CELLS.
export function voxelMeshes(model) {
  const all = (model?.cells || []).filter((c) => [c.x, c.y, c.z, c.dx, c.dy, c.dz].every(fin) && fin(c.value));
  const cells = all.filter((c) => voxelCellShown(model, c));
  if (!cells.length) return null;
  const resolve = makeVoxelColorResolverRGB(model);
  const palette = new Map(), colours = [];
  const indexOf = (v) => {
    const q = resolve(v).map((x) => Math.min(255, Math.round(x / 8) * 8));
    const key = q.join(",");
    let k = palette.get(key);
    if (k === undefined) { k = colours.length; palette.set(key, k); colours.push(`#${q.map((x) => x.toString(16).padStart(2, "0")).join("")}`); }
    return k;
  };
  const alpha = fin(model.opacity) ? model.opacity : 0.85;
  let lx = Infinity, hx = -Infinity, ly = Infinity, hy = -Infinity, lz = Infinity, hz = -Infinity;
  for (const c of cells) { lx = Math.min(lx, c.x); hx = Math.max(hx, c.x); ly = Math.min(ly, c.y); hy = Math.max(hy, c.y); lz = Math.min(lz, c.z); hz = Math.max(hz, c.z); }
  const o = { x: (lx + hx) / 2, y: (ly + hy) / 2, z: (lz + hz) / 2 }; // float32 positions stay at millimetres near the model
  const groups = new Map(); // colour index -> { xyz: [], normals: [], n }
  const quad = (k, pts, nrm) => {
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { xyz: [], normals: [], n: 0 }));
    for (const p of pts) { g.xyz.push(p[0], p[1], p[2]); g.normals.push(nrm[0], nrm[1], nrm[2]); }
    g.n++;
  };
  // the 3D View's colour hook returns the palette index as the red and green bytes; the face colours come back linear, so a table maps them back
  const G = rectilinearGrid(all);
  const fm = G ? buildExposedFaces(cells, G, o, (v) => { const k = indexOf(v); return [k & 255, (k >> 8) & 255, 0]; }) : null;
  if (fm) {
    const lut = new Map();
    for (let b = 0; b < 256; b++) lut.set(Math.fround(srgbToLinear(b / 255)), b);
    const P = fm.positions, Nn = fm.normals, C = fm.colors;
    for (let f = 0; f < fm.faces; f++) {
      const v0 = f * 4 * 3, k = lut.get(C[v0]) + 256 * lut.get(C[v0 + 1]);
      // scene (x east, y up, z south) -> world (east, north, up): a proper rotation, so the winding is kept
      const pts = [0, 1, 2, 3].map((q) => { const i = v0 + q * 3; return [P[i] + o.x, -P[i + 2] + o.y, P[i + 1] + o.z]; });
      quad(k, pts, [Nn[v0], -Nn[v0 + 2], Nn[v0 + 1]]);
    }
  } else {
    if (cells.length > BOX_MAX_CELLS) return { parts: [], cells: cells.length, faces: cells.length * 6, tooMany: true };
    for (const c of cells) {
      const lo = [c.x - c.dx / 2, c.y - c.dy / 2, c.z - c.dz / 2], hi = [c.x + c.dx / 2, c.y + c.dy / 2, c.z + c.dz / 2], k = indexOf(c.value);
      for (let a = 0; a < 3; a++) for (const s of [1, -1]) {
        const u = (a + 1) % 3, v = (a + 2) % 3;
        const corner = (bu, bv) => { const p = [0, 0, 0]; p[a] = s > 0 ? hi[a] : lo[a]; p[u] = bu ? hi[u] : lo[u]; p[v] = bv ? hi[v] : lo[v]; return p; };
        let q = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)]; // e_u x e_v = e_a: counter-clockwise seen from outside on +a
        if (s < 0) q = q.reverse();
        const nrm = [0, 0, 0]; nrm[a] = s;
        quad(k, q, nrm);
      }
    }
  }
  const parts = [...groups].sort((a, b) => a[0] - b[0]).map(([k, g]) => {
    const indices = new Uint32Array(g.n * 6);
    for (let f = 0; f < g.n; f++) { const b4 = f * 4, b6 = f * 6; indices[b6] = b4; indices[b6 + 1] = b4 + 1; indices[b6 + 2] = b4 + 2; indices[b6 + 3] = b4; indices[b6 + 4] = b4 + 2; indices[b6 + 5] = b4 + 3; }
    return { xyz: Float64Array.from(g.xyz), normals: Float64Array.from(g.normals), indices, color: colours[k], alpha };
  });
  return { parts, cells: cells.length, faces: parts.reduce((n, p) => n + p.indices.length / 6, 0) };
}

// a section image ({ corners: [[x, y, z] TL, TR, BR, BL], opacity }) and its picture's file name -> a part | null, drawn from both sides
export function sectionImageMesh(img, texture) {
  const c = img?.corners;
  if (!Array.isArray(c) || c.length !== 4 || !c.every((p) => Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every(fin))) return null;
  const xyz = Float64Array.from(c.flatMap((p) => p.slice(0, 3)));
  return { xyz, indices: Uint32Array.from([0, 3, 2, 0, 2, 1]), uvs: Float64Array.from([0, 1, 1, 1, 1, 0, 0, 0]), color: "#ffffff", alpha: fin(img.opacity) ? img.opacity : 1, doubleSided: true, texture };
}

// parts in world coordinates -> { dae, origin, triangles } | null: one frame for the whole model, normals from the mesh when it has none
export function buildModel(name, parts, toLonLat, altOf) {
  const live = parts.filter((p) => p && p.xyz.length >= 9 && p.indices.length >= 3);
  if (!live.length) return null;
  const total = live.reduce((n, p) => n + p.xyz.length, 0), all = new Float64Array(total);
  let at = 0;
  for (const p of live) { all.set(p.xyz, at); at += p.xyz.length; }
  const fr = modelFrame(all, toLonLat, altOf);
  if (!fr) return null;
  at = 0;
  const local = live.map((p) => {
    const positions = fr.local.subarray(at, at + p.xyz.length);
    at += p.xyz.length;
    // a given normal is a direction in the project grid: east / north / up near the model differ from it only by the grid convergence (a degree
    // or two), which the lighting does not show, so it is kept as it is
    return { ...p, positions, normals: p.normals || vertexNormals(positions, p.indices) };
  });
  return { dae: daeDocument(name, local), origin: fr.origin, triangles: live.reduce((n, p) => n + p.indices.length / 3, 0) };
}
