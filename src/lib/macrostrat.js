// TASKS.csv #2005 — Macrostrat (macrostrat.org; Matt 2026-11-07: GeoStrix may contact it): its geologic map as a raster drape for the
// project area, and the map units at the project centre with their map sources. Data CC BY 4.0, credited on the layer and in the dialog
// (Macrostrat, Peters et al. 2018, Quinn et al. 2023, and each unit's original map). Requests go through the main process
// (macrostrat-fetch: the two hosts only), and only when the user asks.
//
// The tiles are Web Mercator (z/x/y, PNG): the mosaic is resampled here to a longitude / latitude grid over the area, nearest
// neighbour (a geologic map is categorical: no blended colours), then warped into the project CRS by the same code as a WMS map.

export const MACROSTRAT_TILE_URL = (z, x, y) => `https://tiles.macrostrat.org/carto/${z}/${x}/${y}.png`;
export const MACROSTRAT_API = "https://macrostrat.org/api/v2";
// project data stays English (the raster's provenance)
export const MACROSTRAT_CREDIT = "Geology: Macrostrat (macrostrat.org), CC BY 4.0. Peters, S.E., Husson, J.M., Czaplewski, J. (2018), Macrostrat: a platform for geological data integration and deep-time Earth crust research, G-Cubed, doi:10.1029/2018GC007467. Quinn, D.P., et al. (2023), Macrostrat's map system, Geoscience Data Journal, doi:10.1002/gdj3.189. Original maps as listed.";
export const MACROSTRAT_MAX_TILES = 36;

const lonToX = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const latToY = (lat, z) => { const r = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z; };

// the deepest zoom (from maxZoom down) whose tiles over the area are at most maxTiles -> { z, x0, x1, y0, y1, count }
export function planMacrostratTiles([lonMin, latMin, lonMax, latMax], { maxTiles = MACROSTRAT_MAX_TILES, minZoom = 2, maxZoom = 12 } = {}) {
  for (let z = maxZoom; z >= minZoom; z--) {
    const n = 2 ** z;
    const x0 = Math.max(0, Math.floor(lonToX(lonMin, z))), x1 = Math.min(n - 1, Math.floor(lonToX(lonMax, z)));
    const y0 = Math.max(0, Math.floor(latToY(latMax, z))), y1 = Math.min(n - 1, Math.floor(latToY(latMin, z)));
    const count = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (count <= maxTiles || z === minZoom) return { z, x0, x1, y0, y1, count };
  }
  return null;
}

// mosaic: RGBA of the tiles x0..x1, y0..y1 at zoom z, tileSize px each (row 0 = tile y0's top) -> RGBA over the lon / lat box,
// outW x outH (row 0 north), nearest neighbour; outside the mosaic transparent
export function mercatorToLonLat(mosaic, { z, x0, y0, tileSize, mosaicW, mosaicH }, [lonMin, latMin, lonMax, latMax], outW, outH) {
  const out = new Uint8ClampedArray(outW * outH * 4);
  const cols = new Int32Array(outW);
  for (let i = 0; i < outW; i++) cols[i] = Math.floor((lonToX(lonMin + ((i + 0.5) / outW) * (lonMax - lonMin), z) - x0) * tileSize);
  for (let j = 0; j < outH; j++) {
    const py = Math.floor((latToY(latMax - ((j + 0.5) / outH) * (latMax - latMin), z) - y0) * tileSize);
    if (py < 0 || py >= mosaicH) continue;
    for (let i = 0; i < outW; i++) {
      const px = cols[i];
      if (px < 0 || px >= mosaicW) continue;
      const s = (py * mosaicW + px) * 4, d = (j * outW + i) * 4;
      out[d] = mosaic[s]; out[d + 1] = mosaic[s + 1]; out[d + 2] = mosaic[s + 2]; out[d + 3] = mosaic[s + 3];
    }
  }
  return out;
}

// the ground size of one tile pixel at zoom z and latitude lat (Web Mercator) -> metres
export const tilePixelMetres = (z, lat, tileSize) => (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (2 ** z * tileSize);
// the output's long side in px: no finer than the tiles' own pixels (a small area upsampled two tiles to 1,024 px and called it
// '~3 m pixels'), 256 px at least, longPx at most
export const outputLongPx = (longSideM, srcPixelM, longPx = 1024) => Math.max(256, Math.min(longPx, Math.ceil(longSideM / srcPixelM)));

// TASKS.csv #2011 (Matt: "need legend for macrostrat geology") — the same carto tiles as vectors (MVT, read by src/lib/mvt.js): every
// polygon names its map unit, so the drape's legend is the set of units in the tiles it was drawn from — not a guess from the pixels
// (the PNG tiles add relief shading: one unit is a thousand pixel colours, none equal to the unit's listed colour).
export const MACROSTRAT_MVT_URL = (z, x, y) => `https://tiles.macrostrat.org/carto/${z}/${x}/${y}`;

// tiles: readVectorTile() output, one entry per tile -> { units, lines, sources }. units: one row per Macrostrat legend_id (the same unit
// in several tiles or polygons counted once), youngest first by its age model, units with no age last; colour null when Macrostrat gives
// none (the carto tiles draw those grey). lines: the fault / fold lines by type. sources: the original maps' citations.
export function macrostratLegend(tiles) {
  const units = new Map(), lines = new Map(), sources = new Map();
  const cite = (p) => [p.ref_authors && `${String(p.ref_authors).trim()} (${p.ref_year || "n.d."})`, p.ref_title, p.ref_source, p.ref_isbn || p.ref_url].map((s) => String(s || "").trim()).filter(Boolean).join(". ");
  for (const layers of tiles || []) for (const l of layers || []) {
    if (l.name === "units") {
      for (const f of l.features || []) {
        if (f.type !== "polygon") continue;
        const p = f.properties || {}, name = String(p.name || p.strat_name || p.lith || "").trim();
        if (!name) continue;
        const key = p.legend_id != null ? `L${p.legend_id}` : [name, p.age, p.lith, p.color].join("|");
        const seen = units.get(key);
        if (seen) { seen.polygons++; continue; }
        const top = Number(p.best_age_top), bottom = Number(p.best_age_bottom), source = cite(p);
        if (source && p.source_id != null) sources.set(p.source_id, source);
        units.set(key, { id: key, name, age: String(p.age || "").trim(), ma: Number.isFinite(top) && Number.isFinite(bottom) ? [bottom, top] : null, lith: String(p.lith || "").trim(), descrip: String(p.descrip || "").trim(),
          color: /^#[0-9a-f]{6}$/i.test(p.color || "") ? p.color.toLowerCase() : null, sourceId: p.source_id ?? null, polygons: 1 });
      }
    } else if (l.name === "lines") {
      for (const f of l.features || []) { const t = String(f.properties?.type || "").trim() || "line"; lines.set(t, (lines.get(t) || 0) + 1); }
    }
  }
  const byAge = (a, b) => (a.ma && b.ma ? a.ma[1] - b.ma[1] || a.ma[0] - b.ma[0] : a.ma ? -1 : b.ma ? 1 : 0) || a.name.localeCompare(b.name);
  return { units: [...units.values()].sort(byAge), lines: [...lines].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count), sources: [...sources.values()] };
}

// /geologic_units/map?lat&lng -> the units there, finest map first ({ name, strat, lith, descrip, age, color, sourceId, scale })
const SCALE_ORDER = { large: 0, medium: 1, small: 2, tiny: 3 };
export function parseMacrostratUnits(json) {
  const data = json?.success?.data;
  if (!Array.isArray(data)) return [];
  return data
    .filter((u) => u && (u.name || u.lith || u.descrip))
    .map((u) => ({
      name: String(u.name || "").trim(), strat: String(u.strat_name || "").trim(), lith: String(u.lith || "").trim(), descrip: String(u.descrip || "").trim(),
      age: u.t_int_name && u.b_int_name ? (u.t_int_name === u.b_int_name ? u.t_int_name : `${u.b_int_name} – ${u.t_int_name}`) : u.best_int_name || "",
      ma: Number.isFinite(u.t_age) && Number.isFinite(u.b_age) ? [u.b_age, u.t_age] : null,
      color: /^#[0-9a-f]{6}$/i.test(u.color || "") ? u.color : null, sourceId: u.source_id, scale: u.scale || "",
    }))
    .sort((a, b) => (SCALE_ORDER[a.scale] ?? 9) - (SCALE_ORDER[b.scale] ?? 9))
    // one unit can come back as several map records (Copley: the same BC phase twice): kept once, the record with ages first
    .filter((u, i, all) => { const k = (x) => [x.name, x.strat, x.lith, x.age, x.sourceId, x.scale].join("|"); const twins = all.filter((x) => k(x) === k(u)); return (twins.find((x) => x.ma) || twins[0]) === u; });
}
// /defs/sources -> { source_id: "Authors (year). Title. Publisher. DOI / URL" }
export function parseMacrostratSources(json) {
  const out = {};
  for (const s of json?.success?.data || []) {
    const doi = String(s.isbn_doi || "").trim();
    out[s.source_id] = [String(s.authors || "").trim() && `${String(s.authors).trim()} (${s.ref_year || "n.d."})`, String(s.ref_title || s.name || "").trim(), String(s.ref_source || "").trim(), doi || String(s.url || "").trim()].filter(Boolean).join(". ");
  }
  return out;
}
