// TASKS.csv #485 — move a whole project from one CRS to another (Cartography > Project CRS > "reproject
// everything"). Every persisted object that holds world easting/northing is transformed; nothing that is
// hole-relative (intervals, assays, depths) changes. Heights (z) are never touched: GeoStrix has no
// vertical datum model, and every CRS it knows shares the same ellipsoidal/orthometric-agnostic z.
//
// AZIMUTHS. Every stored azimuth / dip direction in GeoStrix is GRID-north relative (import converts true or
// magnetic to grid, #33x). The physical direction of a drillhole does not change when the map projection
// does, but grid north does (convergence differs between UTM zones, Albers, etc.), so by default each one is
// re-expressed in the new grid: the bearing is rebuilt from two transformed points 10 m apart. For a datum
// change inside the same zone this is ~0; between neighbouring UTM zones it is a few degrees. opts.rotate-
// Azimuths = false keeps the numbers as they are (e.g. the numbers were already relative to true north).
//
// Pure and synchronous except for the raster IMAGES (a PNG per raster needs a canvas): those are handled by
// rasterImagesReproject.js in the browser; this module re-grids a raster's numeric value grid only.
//
// Returns { fields: { <only the fields that changed> }, report: { counts, notes, maxRotationDeg } }. Every
// changed object is a NEW object (the #321 / #374 compaction caches are keyed by object identity).
import { pointTransform, getProj4DefSync, reprojectGrid } from "./reproject.js";
import { f32ToB64, b64ToF32 } from "./inversion.js";
import { fillNoData } from "./demFill.js";

const DEG = 180 / Math.PI;
const fin = Number.isFinite;

export function reprojectProject(live, fromEpsg, toEpsg, opts = {}) {
  const T = pointTransform(fromEpsg, toEpsg);
  if (!T) throw new Error(`Can't reproject from EPSG:${fromEpsg} to EPSG:${toEpsg} — one of them isn't a CRS GeoStrix can build.`);
  const fromDef = getProj4DefSync(fromEpsg), toDef = getProj4DefSync(toEpsg);
  const rotate = opts.rotateAzimuths !== false;
  const counts = {}, notes = [];
  let maxRot = 0;
  const count = (k, n = 1) => { counts[k] = (counts[k] || 0) + n; };
  const xy = (x, y) => (fin(x) && fin(y) ? T(x, y) : [x, y]);
  // grid bearing at (x, y) re-expressed in the new grid
  const az = (x, y, a) => {
    if (!rotate || !fin(a) || !fin(x) || !fin(y)) return a;
    const r = a / DEG, [x0, y0] = T(x, y), [x1, y1] = T(x + 10 * Math.sin(r), y + 10 * Math.cos(r));
    const out = ((Math.atan2(x1 - x0, y1 - y0) * DEG) % 360 + 360) % 360;
    maxRot = Math.max(maxRot, Math.abs(((out - a + 540) % 360) - 180));
    return Math.round(out * 100) / 100;
  };
  // how far grid north turns at (x, y), whatever opts.rotateAzimuths says (for the voxel note)
  const convergence = (x, y) => {
    const [x0, y0] = T(x, y), [x1, y1] = T(x, y + 10);
    return Math.abs(Math.atan2(x1 - x0, y1 - y0) * DEG);
  };
  const turn = (a, b) => ((b - a + 540) % 360) - 180; // signed change from bearing a to bearing b
  const f = {};

  // ---- drillholes ----
  const collarAt = new Map();
  if (live.collars?.length) {
    f.collars = live.collars.map((c) => {
      collarAt.set(c.hole_id, c);
      const [x, y] = xy(c.x, c.y);
      return { ...c, x, y, ...(fin(c.azimuth) ? { azimuth: az(c.x, c.y, c.azimuth) } : {}) };
    });
    count("collars", f.collars.length);
  }
  const holeAz = (holeId, a) => { const c = collarAt.get(holeId); return c ? az(c.x, c.y, a) : a; };
  if (rotate && live.survey?.length && collarAt.size) {
    f.survey = live.survey.map((s) => (fin(s.azimuth) ? { ...s, azimuth: holeAz(s.hole_id, s.azimuth) } : s));
    count("survey stations", f.survey.length);
  }
  if (live.layers) {
    const L = { ...live.layers };
    let changed = false;
    if (live.layers.geophys_pts?.length) {
      L.geophys_pts = live.layers.geophys_pts.map((r) => { const [x, y] = xy(r.x, r.y); return { ...r, x, y }; });
      count("survey points", L.geophys_pts.length); changed = true;
    }
    if (rotate && live.layers.structure?.length && collarAt.size) {
      L.structure = live.layers.structure.map((r) => (fin(r.azimuth) ? { ...r, azimuth: holeAz(r.hole_id, r.azimuth) } : r));
      changed = true;
    }
    if (changed) f.layers = L;
  }
  if (live.plannedHoles?.length) {
    f.plannedHoles = live.plannedHoles.map((h) => {
      const [x, y] = xy(h.x, h.y);
      const target = h.target && fin(h.target.x) ? (() => { const [tx, ty] = xy(h.target.x, h.target.y); return { ...h.target, x: tx, y: ty }; })() : h.target;
      return { ...h, x, y, azimuth: az(h.x, h.y, h.azimuth), ...(h.target ? { target } : {}) };
    });
    count("planned holes", f.plannedHoles.length);
  }

  // ---- surface data ----
  if (live.surfaceSamples?.length) {
    f.surfaceSamples = live.surfaceSamples.map((r) => { const [x, y] = xy(r.x, r.y); return { ...r, x, y }; });
    count("surface samples", f.surfaceSamples.length);
  }
  if (live.surfaceStructures?.length) {
    f.surfaceStructures = live.surfaceStructures.map((set) => ({
      ...set,
      rows: (set.rows || []).map((r) => {
        const [x, y] = xy(r.x, r.y);
        const dipDir = az(r.x, r.y, r.dipDir);
        // strike turns by exactly the same angle as the dip direction (whatever strike convention the file used)
        const strike = fin(r.strike) && fin(dipDir) && fin(r.dipDir) ? Math.round(((r.strike + turn(r.dipDir, dipDir)) % 360 + 360) % 360 * 100) / 100 : r.strike;
        return { ...r, x, y, dipDir, ...(r.strike !== undefined ? { strike } : {}) };
      }),
    }));
    count("structure sets", f.surfaceStructures.length);
  }
  if (live.boundaries?.length) {
    f.boundaries = live.boundaries.map((b) => ({ ...b, polylines: (b.polylines || []).map((line) => line.map((p) => { const [x, y] = xy(p.x, p.y); return { ...p, x, y }; })) }));
    count("boundaries", f.boundaries.length);
  }
  if (live.mapLayers?.length) {
    f.mapLayers = live.mapLayers.map((l) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const features = (l.features || []).map((ft) => ({
        ...ft,
        parts: (ft.parts || []).map((part) => part.map(([px, py, ...rest]) => {
          const [x, y] = xy(px, py);
          const rx = Math.round(x * 100) / 100, ry = Math.round(y * 100) / 100; // 1 cm, as at import (mapLayers.js)
          if (rx < x0) x0 = rx; if (rx > x1) x1 = rx; if (ry < y0) y0 = ry; if (ry > y1) y1 = ry;
          return [rx, ry, ...rest];
        })),
      }));
      return { ...l, features, ...(x0 <= x1 ? { bbox: [x0, y0, x1, y1] } : {}), crsNote: `${l.crsNote ? `${l.crsNote} ` : ""}Reprojected EPSG:${fromEpsg} → EPSG:${toEpsg} with the project.` };
    });
    count("map layers", f.mapLayers.length);
  }
  if (live.omfObjects?.length) {
    f.omfObjects = live.omfObjects.map((o) => {
      const org = o.origin || [0, 0, 0];
      const [ox, oy] = xy(org[0], org[1]);
      const v = o.vertices;
      if (!v || !v.length) return { ...o, origin: [ox, oy, org[2]] };
      const out = Array.from(v);
      for (let i = 0; i < out.length; i += 3) {
        const [x, y] = xy(org[0] + out[i], org[1] + out[i + 1]);
        out[i] = x - ox; out[i + 1] = y - oy;
      }
      return { ...o, origin: [ox, oy, org[2]], vertices: out };
    });
    count("OMF objects", f.omfObjects.length);
  }

  // ---- sections: endpoints and contact points; along-line distance and azimuth rebuilt ----
  if (live.sections?.length) {
    f.sections = live.sections.map((s) => {
      if (![s.ax, s.ay, s.bx, s.by].every(fin)) return s;
      const [ax, ay] = xy(s.ax, s.ay), [bx, by] = xy(s.bx, s.by);
      const len = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / len, uy = (by - ay) / len;
      const azimuth = Math.round((((Math.atan2(bx - ax, by - ay) * DEG) % 360 + 360) % 360) * 100) / 100;
      const contacts = (s.contacts || []).map((c) => ({
        ...c,
        points: (c.points || []).map((p) => {
          if (!fin(p.x) || !fin(p.y)) return p;
          const [x, y] = xy(p.x, p.y);
          return { ...p, x, y, l: (x - ax) * ux + (y - ay) * uy };
        }),
      }));
      const name = /^Section \d{1,3}°$/.test(s.name || "") ? `Section ${String(Math.round(azimuth) % 360).padStart(3, "0")}°` : s.name;
      return { ...s, ax, ay, bx, by, ...(fin(s.azimuth) ? { azimuth } : {}), contacts, name };
    });
    count("sections", f.sections.length);
  }

  // ---- generated / imported surfaces: every vertex ----
  if (live.generatedSurfaces?.length) {
    f.generatedSurfaces = live.generatedSurfaces.map((s) => {
      const v = s.vertices;
      if (!v || v.length < 3) return s;
      const out = new Array(v.length);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < v.length; i += 3) {
        const [x, y] = xy(v[i], v[i + 1]);
        out[i] = Math.round(x * 100) / 100; out[i + 1] = Math.round(y * 100) / 100; out[i + 2] = v[i + 2];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      let params = s.params;
      if (params) {
        params = { ...params };
        const cx = (v[0] + v[v.length - 3]) / 2, cy = (v[1] + v[v.length - 2]) / 2; // a point on the surface, for convergence
        if (Array.isArray(params.extent) && params.extent.length === 6) params.extent = [Math.round(x0), Math.round(x1), Math.round(y0), Math.round(y1), params.extent[4], params.extent[5]];
        if (params.anisotropy && fin(params.anisotropy.azimuth)) params.anisotropy = { ...params.anisotropy, azimuth: az(cx, cy, params.anisotropy.azimuth) };
        if (fin(params.fallbackDipDirection)) params.fallbackDipDirection = az(cx, cy, params.fallbackDipDirection);
      }
      return { ...s, vertices: out, ...(params ? { params } : {}) };
    });
    count("surfaces", f.generatedSurfaces.length);
  }

  // ---- voxel models: cell centres (cells stay axis-aligned — see the note) ----
  if (live.voxelModels?.length) {
    let worst = 0;
    f.voxelModels = live.voxelModels.map((m) => {
      const cells = (m.cells || []).map((c) => { const [x, y] = xy(c.x, c.y); return { ...c, x, y }; });
      const c0 = m.cells?.[0];
      if (c0 && fin(c0.x) && fin(c0.y)) worst = Math.max(worst, convergence(c0.x, c0.y));
      let params = m.params;
      if (params) {
        params = { ...params };
        if (typeof params.crs === "string" && /^EPSG:/i.test(params.crs)) params.crs = `EPSG:${toEpsg}`;
        const pt = (p) => (Array.isArray(p) && fin(p[0]) && fin(p[1]) ? [...xy(p[0], p[1]), ...p.slice(2)] : p);
        if (params.lineStart) params.lineStart = pt(params.lineStart);
        if (params.lineEnd) params.lineEnd = pt(params.lineEnd);
        if (Array.isArray(params.lineStart) && Array.isArray(params.lineEnd) && fin(params.lineAzimuth)) {
          params.lineAzimuth = +((((Math.atan2(params.lineEnd[0] - params.lineStart[0], params.lineEnd[1] - params.lineStart[1]) * DEG) % 360) + 360) % 360).toFixed(2);
        }
        if (params.localOrigin) params.localOrigin = pt(params.localOrigin);
      }
      let stationData = m.stationData;
      if (stationData?.base && stationData.x && stationData.y) {
        const bx = b64ToF32(stationData.x), by = b64ToF32(stationData.y);
        const pts = Array.from(bx, (dx, i) => xy(stationData.base[0] + dx, stationData.base[1] + by[i]));
        const base = pts.length ? [pts[0][0], pts[0][1]] : stationData.base;
        stationData = { ...stationData, base, x: f32ToB64(pts.map((p) => p[0] - base[0])), y: f32ToB64(pts.map((p) => p[1] - base[1])) };
      }
      return { ...m, cells, ...(params ? { params } : {}), ...(stationData ? { stationData } : {}) };
    });
    count("voxel models", f.voxelModels.length);
    if (worst > 0.2) notes.push(`Voxel models: cell centres moved exactly, but cells stay aligned to the new grid axes — grid north differs by ${worst.toFixed(2)}° between the two CRSs, so blocks are now turned by that much relative to the ground they describe. Fine for display; re-run an inversion in the new CRS if the orientation matters.`);
  }

  // ---- terrain (node grid) and raster value grids ----
  if (live.terrain?.elevations?.length && Array.isArray(live.terrain.bbox)) {
    const t = live.terrain, [xmin, ymin, xmax, ymax] = t.bbox;
    const src = Float32Array.from(t.elevations);
    const mask = t.noDataMask ? maskBits(t.noDataMask, src.length) : null;
    if (mask) for (let i = 0; i < src.length; i++) if (mask[i]) src[i] = NaN; // filled cells are not data
    const rp = reprojectGrid({ xmin, ymin, xmax, ymax, gridW: t.gridW, gridH: t.gridH, band: src }, fromDef, toDef, t.gridW, t.gridH);
    const fill = fillNoData(rp.elevations);
    f.terrain = { ...t, bbox: rp.bbox, elevations: fill.elevations, noDataMask: fill.noDataMask };
    count("terrain", 1);
  }
  if (live.rasters?.some((r) => r.grid)) {
    f.rasters = live.rasters.map((r) => (r.grid ? { ...r, grid: reprojectValueGrid(r.grid, fromDef, toDef) } : r));
  }

  // ---- layout: world anchors of captured viewports / north arrows ----
  const layoutEls = (els) => (els || []).map((e) => {
    if (e.type === "viewport" && e.targetWorld && fin(e.targetWorld.x)) { const [x, y] = xy(e.targetWorld.x, e.targetWorld.y); return { ...e, targetWorld: { ...e.targetWorld, x, y } }; }
    if (e.type === "north" && e.decl?.at && fin(e.decl.at.x)) { const [x, y] = xy(e.decl.at.x, e.decl.at.y); return { ...e, decl: { ...e.decl, at: { ...e.decl.at, x, y } } }; }
    return e;
  });
  if (live.layoutPages?.some((p) => p.elements?.some((e) => e.type === "viewport" || (e.type === "north" && e.decl)))) {
    f.layoutPages = live.layoutPages.map((p) => ({ ...p, elements: layoutEls(p.elements) }));
    notes.push("Layout pages: refresh each map viewport and north arrow (their pictures and grid-north angle were captured in the old CRS).");
  }
  if (live.layoutTemplates?.length) f.layoutTemplates = live.layoutTemplates.map((t) => (Array.isArray(t.elements) ? { ...t, elements: layoutEls(t.elements) } : t));

  f.project = { ...live.project, epsg: Number(toEpsg) };
  if (maxRot > 0.005) notes.push(`Azimuths and dip directions were turned by up to ${maxRot.toFixed(2)}° so they still point the same way on the ground (grid north differs between the two CRSs).`);
  return { fields: f, report: { counts, notes, maxRotationDeg: maxRot } };
}

// Node-registered raster value grid (raster.js makeValueGrid) into the new CRS, same node count.
export function reprojectValueGrid(g, fromDef, toDef) {
  const vals = b64ToF32(g.values);
  const xmin = g.x0, xmax = g.x0 + (g.nx - 1) * g.dx, ymax = g.yTop, ymin = g.yTop - (g.ny - 1) * g.dy;
  const rp = reprojectGrid({ xmin, ymin, xmax, ymax, gridW: g.nx, gridH: g.ny, band: vals }, fromDef, toDef, g.nx, g.ny);
  const [bx0, by0, bx1, by1] = rp.bbox;
  let valid = 0;
  for (const v of rp.elevations) if (fin(v)) valid++;
  return { ...g, x0: bx0, yTop: by1, dx: (bx1 - bx0) / Math.max(1, g.nx - 1), dy: (by1 - by0) / Math.max(1, g.ny - 1), values: f32ToB64(rp.elevations), valid };
}

function maskBits(b64, n) {
  const bin = typeof atob === "function" ? atob(b64) : globalThis.Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
  return out;
}
