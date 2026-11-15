// TASKS.csv #3252 phase 4 (Matt's decision 4) — a raster's picture at a pixel size chosen at export time, from its detail tiles (lodTiles.js):
// the level whose pixel is at most the one asked (never finer than the source's own), the tiles over the raster's box read through
// lodTileLoader.js (memory, this computer, then the source), drawn over the fetched picture (which stays wherever a tile could not be read).
// Also the plan of 'Download for offline use': the tiles of every level down to a pixel size, and what they would take on this computer.
import { lodRoot, lodMaxLevel, tilePixelM, tilesInView, lodSourceKey, tileKey, TILE_PX } from "./lodTiles.js";

export const EXPORT_MAX_PX = 8192; // a side of the composed picture (one image in Google Earth / one image on the sheet)
export const TILE_DISK_BYTES = 28 * 1024; // a WebP tile on this computer, about (NAIP 256 px at quality 0.9: 15-40 KB)

// the level for a pixel size: the coarsest whose pixel is at most pixelM, within the source's levels, coarser while the picture would pass maxPx
export function exportLevel(raster, pixelM, maxPx = EXPORT_MAX_PX) {
  const root = lodRoot(raster.bbox), maxLevel = lodMaxLevel(root, raster.lod?.nativeM);
  let z = 0;
  while (z < maxLevel && tilePixelM(root, z) > pixelM * 1.0001) z++;
  const side = (z) => Math.max(raster.bbox[2] - raster.bbox[0], raster.bbox[3] - raster.bbox[1]) / tilePixelM(root, z);
  while (z > 0 && side(z) > maxPx) z--;
  return { root, z, pixelM: tilePixelM(root, z), width: Math.ceil((raster.bbox[2] - raster.bbox[0]) / tilePixelM(root, z)), height: Math.ceil((raster.bbox[3] - raster.bbox[1]) / tilePixelM(root, z)), capped: tilePixelM(root, z) > pixelM * 1.0001 && z < maxLevel };
}

// 'Download for offline use': every level from the first finer than the fetched picture down to the one for pixelM, over box (the raster's
// own by default). -> { levels: [z...], tiles: [{ z, x, y, box }], bytes (estimated on this computer) }
export function offlinePlan(raster, pixelM, box = raster.bbox) {
  const root = lodRoot(raster.bbox), maxLevel = lodMaxLevel(root, raster.lod?.nativeM);
  const base = raster.pixelM > 0 ? raster.pixelM : root.side / 4096;
  const tiles = [], levels = [];
  for (let z = 0; z <= maxLevel; z++) {
    if (tilePixelM(root, z) >= base * 0.99) continue;
    levels.push(z);
    tiles.push(...tilesInView(root, z, box, raster.bbox));
    if (tilePixelM(root, z) <= pixelM * 1.0001) break;
  }
  return { levels, tiles, bytes: tiles.length * TILE_DISK_BYTES };
}

// the picture: { canvas, pixelM, read, missing, capped }. loader: lodTileLoader.js; baseImage: the fetched picture (an <img> or bitmap) or null
export async function composeLodPicture(raster, pixelM, { loader, baseImage = null, maxPx = EXPORT_MAX_PX, onProgress = null, signal = null, concurrency = 4 } = {}) {
  const lv = exportLevel(raster, pixelM, maxPx);
  const [x0, , , y1] = raster.bbox, s = lv.pixelM;
  const canvas = document.createElement("canvas");
  canvas.width = lv.width; canvas.height = lv.height;
  const ctx = canvas.getContext("2d");
  if (baseImage) ctx.drawImage(baseImage, 0, 0, lv.width, lv.height);
  const src = lodSourceKey(raster), tiles = tilesInView(lv.root, lv.z, raster.bbox, raster.bbox);
  let read = 0, missing = 0, done = 0, next = 0;
  const worker = async () => {
    while (next < tiles.length) {
      if (signal?.aborted) throw new DOMException("cancelled", "AbortError");
      const t = tiles[next++];
      let img = null;
      try { img = await loader.fetchLodTile(tileKey(src, t.z, t.x, t.y), raster.lod, t.box); } catch { img = null; }
      if (img) { ctx.drawImage(img, (t.box[0] - x0) / s, (y1 - t.box[3]) / s, TILE_PX, TILE_PX); read++; } else missing++;
      done++; onProgress?.(done, tiles.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tiles.length) }, worker));
  return { canvas, pixelM: s, read, missing, tiles: tiles.length, capped: lv.capped };
}
