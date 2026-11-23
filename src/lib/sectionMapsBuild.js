// TASKS.csv #4041 — the map layers' part of a section payload, built in the main window with each section it sends (ViewerModule
// openSectionOrSay, on use): for every map layer and raster that reaches the section line or its overview, the spans / ticks / strip along
// the line (lib/sectionMaps.js) and a small picture of it over the overview's extent. Light: a raster is read once at no more than
// PICK_PX a side (nearest neighbour, so a geological map keeps its exact colours) and sampled at most STRIP_MAX times; the overview pictures
// are OVERVIEW_PX across. Order as Maps draws them: the rasters, then the map layers. Never throws: a layer that fails is left out.
import { lineOf, polygonSpans, lineTicks, stripSpans } from "./sectionMaps.js";
import { drawMapLayer } from "./mapLayers.js";

export const PICK_PX = 1024, OVERVIEW_PX = 256;

const meet = (a, b) => !!a && !!b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

// a raster's picture, decoded once (an Image) and its pixels at no more than PICK_PX a side; kept for the few most recent pictures
const pictures = new Map();
function picture(dataUrl) {
  let p = pictures.get(dataUrl);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const k = Math.min(1, PICK_PX / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
          const c = document.createElement("canvas"); c.width = w; c.height = h;
          const ctx = c.getContext("2d"); ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, w, h);
          resolve({ img, px: { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data } });
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
    pictures.set(dataUrl, p);
    if (pictures.size > 6) pictures.delete(pictures.keys().next().value);
  }
  return p;
}

// a canvas over the overview's extent, OVERVIEW_PX on its longer side
function overviewCanvas(ext) {
  const k = OVERVIEW_PX / Math.max(ext[2] - ext[0], ext[3] - ext[1]), c = document.createElement("canvas");
  c.width = Math.max(2, Math.round((ext[2] - ext[0]) * k)); c.height = Math.max(2, Math.round((ext[3] - ext[1]) * k));
  return c;
}
function rasterPng(img, bbox, ext) {
  const c = overviewCanvas(ext), sx = c.width / (ext[2] - ext[0]), sy = c.height / (ext[3] - ext[1]), ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, (bbox[0] - ext[0]) * sx, (ext[3] - bbox[3]) * sy, (bbox[2] - bbox[0]) * sx, (bbox[3] - bbox[1]) * sy);
  return c.toDataURL("image/png");
}
function vectorPng(layer, ext) {
  const c = overviewCanvas(ext);
  drawMapLayer(c.getContext("2d"), { ...layer, lineWidthM: Math.max(layer.lineWidthM || 2, (ext[2] - ext[0]) / c.width) }, ext, c.width, c.height); // a line at least a pixel wide
  return c.toDataURL("image/png");
}

// section: { ax, ay, bx, by }; profile: the ground profile [{ d }] (its reach past A and B is the band's); overview: the pane's model (origin,
// size) or null -> { layers: [{ id, name, kind, visible, opacity, credit, spans?, ticks?, png }] } or null when no layer reaches it
export async function buildSectionMaps({ section, profile = null, overview = null, mapLayers = [], rasters = [] }) {
  try {
    const L = lineOf(section);
    if (!L) return null;
    const ds = (profile || []).map((p) => p.d).filter(Number.isFinite);
    const range = [Math.min(0, ...ds), Math.max(L.len, ...ds)];
    const ends = [[L.ax + L.ux * range[0], L.ay + L.uy * range[0]], [L.ax + L.ux * range[1], L.ay + L.uy * range[1]]];
    const lineBox = [Math.min(ends[0][0], ends[1][0]), Math.min(ends[0][1], ends[1][1]), Math.max(ends[0][0], ends[1][0]), Math.max(ends[0][1], ends[1][1])];
    const ext = overview?.origin && overview?.size ? [overview.origin[0], overview.origin[1], overview.origin[0] + overview.size[0], overview.origin[1] + overview.size[1]] : null;
    const layers = [];
    for (const r of rasters || []) {
      if (!r?.dataUrl || !r.bbox || !(meet(r.bbox, lineBox) || meet(r.bbox, ext))) continue;
      try {
        const pic = await picture(r.dataUrl);
        if (!pic) continue;
        const legend = Array.isArray(r.legend?.units) ? r.legend.units : Array.isArray(r.legend) ? r.legend : null;
        const spans = meet(r.bbox, lineBox) ? stripSpans(pic.px, r.bbox, section, range, { keyColour: !r.grid ? r.keyColour : null, legend }) : [];
        layers.push({ id: `raster:${r.id}`, name: r.name || "Raster", kind: "raster", visible: r.visible !== false, opacity: r.opacity ?? 0.85, credit: r.provenance?.credit || r.credit || null, spans, png: ext && meet(r.bbox, ext) ? rasterPng(pic.img, r.bbox, ext) : null });
      } catch { /* left out */ }
    }
    for (const l of mapLayers || []) {
      if (!l?.bbox || !l.features?.length || !(meet(l.bbox, lineBox) || meet(l.bbox, ext))) continue;
      try {
        const kind = l.geomType === "polyline" ? "polyline" : l.geomType === "polygon" ? "polygon" : "point";
        const onLine = meet(l.bbox, lineBox);
        layers.push({ id: `map:${l.id}`, name: l.name || "Map layer", kind, visible: l.visible !== false, opacity: l.opacity ?? 0.6, credit: l.credit || null,
          ...(kind === "polygon" ? { spans: onLine ? polygonSpans(l, section, range) : [] } : kind === "polyline" ? { ticks: onLine ? lineTicks(l, section, range) : [] } : {}),
          png: ext && meet(l.bbox, ext) ? vectorPng(l, ext) : null });
      } catch { /* left out */ }
    }
    return layers.length ? { layers } : null;
  } catch { return null; }
}
