// TASKS.csv #838 — NAIP aerial imagery (USDA, public domain, 0.3-1 m, USA only) as a natural-colour image over a drawn area, from the
// Microsoft Planetary Computer with the anonymous token its own service issues. NAIP comes as quarter-quadrangles about 7 km across, each in
// its UTM zone, so an area usually spans several: the newest image covering each part of it is read (only that window) and they are painted
// on one grid in the project's CRS. Sentinel-2's 10 m stays the source everywhere else.
import { openCog, stacSearch, signPc, windowGrid, PC_SEARCH } from "./imageryFetch.js";
import { reprojectXY, getProj4DefSync } from "./reproject.js";
import { pointInRings } from "./mapLayers.js";
import { t as tr } from "./i18n.js";
import { arrMin, arrMax } from "./arrayStats.js"; // #3251 — no spread (#371)

const NAIP_TOKEN = "https://planetarycomputer.microsoft.com/api/sas/v1/token/naipeuwest/naip";
export const NAIP_FINEST_M = 0.6; // most states since 2010; some years are 0.3 or 1 m
const MAX_ITEMS = 60;

const inGeometry = (geometry, p) => {
  const polys = geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
  return polys.some((rings) => pointInRings(p, rings));
};

// The images to read, oldest first so the newest is painted last: newest first, each taken only if it covers a part still uncovered, on a
// sample of the area. items: [{ date, geometry }]. { items, cover (0-1) }.
export function chooseNaipItems(items, bbox, { samples = 24, enough = 0.98 } = {}) {
  const open = [];
  for (let i = 0; i < samples; i++) for (let j = 0; j < samples; j++) open.push([bbox[0] + ((i + 0.5) / samples) * (bbox[2] - bbox[0]), bbox[1] + ((j + 0.5) / samples) * (bbox[3] - bbox[1])]);
  const total = open.length, chosen = [];
  let left = open;
  for (const it of [...items].sort((a, b) => String(b.date).localeCompare(String(a.date)))) {
    const rest = left.filter((p) => !inGeometry(it.geometry, p));
    if (rest.length === left.length) continue;
    chosen.push(it);
    left = rest;
    if (left.length <= (1 - enough) * total) break;
  }
  return { items: chosen.reverse(), cover: 1 - left.length / total };
}

// One image's window on the shared grid. grid: { box, width, height, cell }, north up; rgba: its pixels. src: { box, width, height, cell, bands: [r, g, b] }.
// toSource(x, y) -> [x, y] in the image's CRS (a sparse lattice in fetchNaip). A pixel that is 0 in all three bands is the image's no data: it leaves what is below.
export function paintWindow(rgba, grid, src, toSource) {
  const [r, g, b] = src.bands;
  const c0 = Math.max(0, Math.floor((src.xmin - grid.box[0]) / grid.cell) - 1), c1 = Math.min(grid.width - 1, Math.ceil((src.xmax - grid.box[0]) / grid.cell) + 1);
  const r0 = Math.max(0, Math.floor((grid.box[3] - src.ymax) / grid.cell) - 1), r1 = Math.min(grid.height - 1, Math.ceil((grid.box[3] - src.ymin) / grid.cell) + 1);
  let painted = 0;
  for (let row = r0; row <= r1; row++) {
    const y = grid.box[3] - (row + 0.5) * grid.cell;
    for (let col = c0; col <= c1; col++) {
      const [sx, sy] = toSource(grid.box[0] + (col + 0.5) * grid.cell, y, col, row);
      const sc = Math.floor((sx - src.box[0]) / src.cell), sr = Math.floor((src.box[3] - sy) / src.cell);
      if (sc < 0 || sr < 0 || sc >= src.width || sr >= src.height) continue;
      const k = sr * src.width + sc;
      if (!r[k] && !g[k] && !b[k]) continue;
      const o = 4 * (row * grid.width + col);
      rgba[o] = r[k]; rgba[o + 1] = g[k]; rgba[o + 2] = b[k]; rgba[o + 3] = 255;
      painted++;
    }
  }
  return painted;
}

// target pixel -> image CRS, from a lattice every `step` pixels: one projection per pixel of a 3,000 px image is 9 million calls
function latticeMapper(grid, fromEpsg, toEpsg, step = 16) {
  if (Number(fromEpsg) === Number(toEpsg)) return (x, y) => [x, y];
  const nx = Math.ceil(grid.width / step) + 1, ny = Math.ceil(grid.height / step) + 1;
  const X = new Float64Array(nx * ny), Y = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = reprojectXY(grid.box[0] + i * step * grid.cell, grid.box[3] - j * step * grid.cell, fromEpsg, toEpsg);
    if (!p) throw new Error(tr("EPSG:{epsg} is not a CRS GeoStrix can project to.", { epsg: toEpsg }));
    X[j * nx + i] = p.x; Y[j * nx + i] = p.y;
  }
  return (_x, _y, col, row) => {
    const fi = (col + 0.5) / step, fj = (row + 0.5) / step, i = Math.min(nx - 2, Math.floor(fi)), j = Math.min(ny - 2, Math.floor(fj)), u = fi - i, v = fj - j;
    const at = (A) => (A[j * nx + i] * (1 - u) + A[j * nx + i + 1] * u) * (1 - v) + (A[(j + 1) * nx + i] * (1 - u) + A[(j + 1) * nx + i + 1] * u) * v;
    return [at(X), at(Y)];
  };
}

const itemEpsg = (p) => p["proj:epsg"] ?? Number(String(p["proj:code"] || "").replace(/^EPSG:/i, ""));

// TASKS.csv #3251 (Matt: "even images from the US which were supposed to have 0.6m res are low res", Colorado) — the picture's grid was
// capped at the level's longest side (1,024 / 2,048 / 3,072 px), so a 3 km area came in at 2.9 / 1.5 / 1.0 m pixels while Colorado's 2023
// NAIP is 0.3 m. 'Full resolution' (full: true) fetches at the imagery's own pixel size, split into pictures of at most TILE_PX on a side
// (the texture every GPU takes), at most MAX_SIDE_TILES x MAX_SIDE_TILES of them (about 360 MB of graphics memory at the most); a larger area
// gets pixels just coarse enough to fit, and says so. The split is on the target grid, so the pictures meet edge to edge with no overlap.
export const TILE_PX = 4096, MAX_SIDE_TILES = 2;
// full grid { box, width, height, cell } -> { cell, nx, ny, tiles: [{ box, width, height, cell }] } (west to east, north to south)
export function naipTiles(box, cellM, { tile = TILE_PX, maxSide = MAX_SIDE_TILES } = {}) {
  const W = box[2] - box[0], H = box[3] - box[1];
  const cell = Math.max(cellM, W / (maxSide * tile), H / (maxSide * tile));
  const width = Math.max(1, Math.round(W / cell)), height = Math.max(1, Math.round(H / cell));
  const nx = Math.ceil(width / tile), ny = Math.ceil(height / tile);
  const split = (n, k) => Array.from({ length: k }, (_, i) => Math.floor(((i + 1) * n) / k) - Math.floor((i * n) / k));
  const ws = split(width, nx), hs = split(height, ny), tiles = [];
  let top = box[3];
  for (const h of hs) {
    let left = box[0];
    for (const w of ws) { tiles.push({ box: [left, top - h * cell, left + w * cell, top], width: w, height: h, cell }); left += w * cell; }
    top -= h * cell;
  }
  return { cell, nx, ny, width, height, tiles };
}

export async function fetchNaip(bboxLonLat, { targetEpsg = null, maxPx = 2048, full = false, onProgress } = {}) {
  const d = await stacSearch(PC_SEARCH, { collections: ["naip"], bbox: bboxLonLat, limit: 250, sortby: [{ field: "properties.datetime", direction: "desc" }] });
  const found = (d.features || []).filter((f) => f.assets?.image?.href).map((f) => ({ id: f.id, date: String(f.properties.datetime).slice(0, 10), gsd: f.properties.gsd, epsg: itemEpsg(f.properties), bbox: f.bbox, geometry: f.geometry, href: f.assets.image.href }));
  if (!found.length) throw new Error(tr("No NAIP imagery here. NAIP covers the USA only; elsewhere use the Sentinel-2 source."));
  const { items, cover } = chooseNaipItems(found, bboxLonLat);
  if (items.length > MAX_ITEMS) throw new Error(tr("This area spans {n} NAIP images, over the {max} read at once. Draw a smaller area.", { n: items.length, max: MAX_ITEMS }));
  const dst = Number(targetEpsg) && getProj4DefSync(targetEpsg) ? Number(targetEpsg) : items[0].epsg;
  const finest = Math.min(...items.map((i) => i.gsd).filter(Number.isFinite), NAIP_FINEST_M * 2);
  // #3251 — one grid capped at the level's size, or (full) the imagery's own pixels in up to 2 x 2 pictures
  const whole = windowGrid(bboxLonLat, dst, finest, full ? Infinity : maxPx);
  const plan = full ? naipTiles(whole.box, finest) : { cell: whole.cell, tiles: [whole] };
  const years = [...new Set(items.map((i) => i.date.slice(0, 4)))].sort();
  const yearText = years.length > 1 ? `${years[0]}-${years[years.length - 1]}` : years[0];
  const pixel = plan.cell < 10 ? Number(plan.cell.toFixed(plan.cell < 1 ? 2 : 1)) : Math.round(plan.cell);
  const parts = [];
  let done = 0;
  const steps = plan.tiles.length * items.length;
  for (const [k, grid] of plan.tiles.entries()) {
    const tileLonLat = gridLonLat(grid, dst);
    const part = await paintNaipGrid(grid, tileLonLat, items, dst, () => onProgress?.(++done, steps));
    if (!part) continue;
    const name = `NAIP ${yearText} natural colour (~${pixel} m pixels)${plan.tiles.length > 1 ? `, part ${k + 1} of ${plan.tiles.length}` : ""}`;
    parts.push({ name, bbox: grid.box, dataUrl: part, gridW: grid.width, gridH: grid.height, pixelM: grid.cell });
  }
  if (!parts.length) throw new Error(tr("No NAIP imagery here. NAIP covers the USA only; elsewhere use the Sentinel-2 source."));
  const native = finest < NAIP_FINEST_M * 2 ? finest : null;
  const coarser = native && plan.cell > native * 1.01 ? Math.round((plan.cell / native) * 10) / 10 : 0;
  return {
    ...parts[0], parts, epsg: dst, partial: cover < 0.98, nativeM: native,
    note: tr(" USDA NAIP aerial imagery, public domain, from the Microsoft Planetary Computer: {n} image(s) from {years}.", { n: items.length, years: yearText }) + (cover < 0.98 ? tr(" It covers about {pct}% of your area: the rest stays empty.", { pct: Math.round(cover * 100) }) : "")
      + (parts.length > 1 ? tr(" In {n} pictures of at most {px} px a side, edge to edge.", { n: parts.length, px: TILE_PX }) : "")
      + (coarser ? (full ? tr(" Its pixels are {m} m, {k} times the imagery's own {native} m: a smaller area gets finer ones.", { m: pixel, k: coarser, native }) : tr(" Its pixels are {m} m, {k} times the imagery's own {native} m: a smaller area, or Full resolution, gets finer ones.", { m: pixel, k: coarser, native })) : native ? tr(" At the imagery's own {native} m pixels.", { native }) : ""),
  };
}

// a grid's box in the target CRS -> its lon / lat box (corners and edge middles), for the images' windows
function gridLonLat(grid, epsg) {
  const [x0, y0, x1, y1] = grid.box, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
  const ps = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [xm, y0], [xm, y1], [x0, ym], [x1, ym]].map(([x, y]) => reprojectXY(x, y, epsg, 4326)).filter(Boolean);
  const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
  return [arrMin(xs), arrMin(ys), arrMax(xs), arrMax(ys)];
}

// the images painted onto one grid -> a data URL (WebP 0.9, else PNG), or null when nothing landed on it
async function paintNaipGrid(grid, bboxLonLat, items, dst, step) {
  const rgba = new Uint8ClampedArray(grid.width * grid.height * 4);
  let painted = 0;
  for (const it of items) {
    const ov = [Math.max(bboxLonLat[0], it.bbox[0]), Math.max(bboxLonLat[1], it.bbox[1]), Math.min(bboxLonLat[2], it.bbox[2]), Math.min(bboxLonLat[3], it.bbox[3])];
    if (ov[0] < ov[2] && ov[1] < ov[3]) {
      const w = windowGrid(ov, it.epsg, grid.cell, Infinity);
      const tiff = await openCog(await signPc(it.href, NAIP_TOKEN));
      const bands = await tiff.readRasters({ bbox: w.box, width: w.width, height: w.height, resampleMethod: "nearest", samples: [0, 1, 2], fillValue: 0 });
      const c = [[ov[0], ov[1]], [ov[2], ov[1]], [ov[2], ov[3]], [ov[0], ov[3]]].map(([x, y]) => reprojectXY(x, y, 4326, dst));
      painted += paintWindow(rgba, grid, { box: w.box, width: w.width, height: w.height, cell: w.cell, bands, xmin: Math.min(...c.map((p) => p.x)), xmax: Math.max(...c.map((p) => p.x)), ymin: Math.min(...c.map((p) => p.y)), ymax: Math.max(...c.map((p) => p.y)) }, latticeMapper(grid, dst, it.epsg));
    }
    step();
  }
  if (!painted) return null;
  const canvas = document.createElement("canvas");
  canvas.width = grid.width; canvas.height = grid.height;
  canvas.getContext("2d").putImageData(new ImageData(rgba, grid.width, grid.height), 0, 0);
  const webp = canvas.toDataURL("image/webp", 0.9);
  const url = webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
  canvas.width = canvas.height = 0; // #3251 — the 4096 px canvas let go before the next part
  return url;
}
