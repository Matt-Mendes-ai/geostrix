// TASKS.csv #758 — the predicted geological map: the implicit model evaluated where the ground is, the map-view twin
// of the #356 check against the logs. A model can fit every hole and still contradict the outcrop; this shows it.
// Pure (no DOM, no three.js): the run evaluates the grid's nodes in the same GemPy solve (#756) and draws the raster.
import { pointInRings } from "./mapLayers.js";
import { terrainGroundAt } from "./viewer/geomath.js"; // TASKS.csv #927 — no map nodes over the fill

// Terrain nodes over `box` [xmin, ymin, xmax, ymax] (project CRS) at >= minSpacing metres, coarsened so there are at
// most ~maxPts of them (each node is one more point in the solve). Nodes off the terrain are left out. Row 0 is the
// NORTH edge, matching rasters' top-down image order.
export function terrainGrid(terrain, box, { maxPts = 20000, minSpacing = 25 } = {}) {
  if (!terrain || !box) return null;
  const [tx0, ty0, tx1, ty1] = terrain.bbox;
  const x0 = Math.max(box[0], tx0), x1 = Math.min(box[2], tx1), y0 = Math.max(box[1], ty0), y1 = Math.min(box[3], ty1);
  if (!(x1 > x0 && y1 > y0)) return null;
  const step = Math.max(minSpacing, Math.sqrt(((x1 - x0) * (y1 - y0)) / maxPts));
  const nx = Math.max(1, Math.floor((x1 - x0) / step)), ny = Math.max(1, Math.floor((y1 - y0) / step));
  const dx = (x1 - x0) / nx, dy = (y1 - y0) / ny;
  const nodes = [];
  for (let j = 0; j < ny; j++) {
    const y = y1 - (j + 0.5) * dy;
    for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * dx;
      const z = terrainGroundAt(terrain, x, y);
      if (Number.isFinite(z)) nodes.push({ i, j, x, y, z });
    }
  }
  return { bbox: [x0, y0, x1, y1], nx, ny, dx, dy, nodes };
}

const hexRgb = (c) => {
  const h = String(c || "").replace("#", "");
  const v = parseInt(h.length === 3 ? h.split("").map((s) => s + s).join("") : h, 16);
  return Number.isFinite(v) ? [(v >> 16) & 255, (v >> 8) & 255, v & 255] : [128, 128, 128];
};

// RGBA pixels (nx * ny, row 0 north) for the grid: each node coloured by its modelled unit; nodes off the terrain or
// with no unit (above the model, outside its box) transparent.
export function unitRaster(grid, units, colorOf) {
  const px = new Uint8ClampedArray(grid.nx * grid.ny * 4);
  grid.nodes.forEach((n, k) => {
    const u = units[k];
    if (u == null) return;
    const [r, g, b] = hexRgb(colorOf(u));
    const o = (n.j * grid.nx + n.i) * 4;
    px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
  });
  return px;
}

const norm = (s) => String(s ?? "").trim().toLowerCase();

// Agreement with a mapped geology layer (polygons, unit names in layer.styleField): for every mapped unit, the share of
// its grid nodes where the model has the SAME unit name (case and spaces ignored). Mapped units with no model unit of
// that name are listed apart (no agreement can be claimed for them), as are nodes the model leaves blank.
export function mapAgreement(grid, units, layer, modelUnits) {
  if (!layer?.styleField || !(layer.features || []).length) return null;
  const known = new Set((modelUnits || []).map(norm));
  const feats = layer.features.map((f) => {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    f.parts.forEach((p) => p.forEach(([x, y]) => { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }));
    const v = f.attributes?.[layer.styleField];
    return { parts: f.parts, box: [a, b, c, d], unit: v == null || v === "" ? null : String(v) };
  });
  const by = new Map();
  let mapped = 0;
  grid.nodes.forEach((n, k) => {
    const f = feats.find((q) => q.unit && n.x >= q.box[0] && n.x <= q.box[2] && n.y >= q.box[1] && n.y <= q.box[3] && pointInRings([n.x, n.y], q.parts));
    if (!f) return;
    mapped++;
    let e = by.get(f.unit);
    if (!e) by.set(f.unit, (e = { unit: f.unit, nodes: 0, agree: 0, blank: 0, modelled: new Map(), inModel: known.has(norm(f.unit)) }));
    e.nodes++;
    const u = units[k];
    if (u == null) { e.blank++; return; }
    if (norm(u) === norm(f.unit)) e.agree++;
    e.modelled.set(u, (e.modelled.get(u) || 0) + 1);
  });
  const rows = [...by.values()].sort((p, q) => q.nodes - p.nodes).map((e) => ({
    unit: e.unit, nodes: e.nodes, agree: e.agree, blank: e.blank, inModel: e.inModel,
    pct: e.inModel && e.nodes - e.blank > 0 ? e.agree / (e.nodes - e.blank) : null,
    modelledAs: [...e.modelled.entries()].sort((p, q) => q[1] - p[1]).slice(0, 3).map(([u, c]) => ({ unit: u, share: c / e.nodes })),
  }));
  const comparable = rows.filter((r) => r.inModel);
  const cmpNodes = comparable.reduce((s, r) => s + r.nodes - r.blank, 0);
  return {
    layer: layer.name, field: layer.styleField, mappedNodes: mapped, units: rows,
    overall: cmpNodes ? comparable.reduce((s, r) => s + r.agree, 0) / cmpNodes : null,
    unmatchedMapUnits: rows.filter((r) => !r.inModel).map((r) => r.unit),
  };
}
