// TASKS.csv #485 — the browser half of a project CRS change: each raster's PNG drape is decoded, warped with
// reprojectImageRGBA (the same nearest-neighbour warp raster import uses) and re-encoded, with its new bbox.
// Numeric value grids were already re-gridded by projectReproject.js. Kept apart from that pure module
// because it needs a canvas.
import { getProj4DefSync, reprojectImageRGBA } from "./reproject.js";

async function decode(dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

export async function reprojectRasterImages(rasters, fromEpsg, toEpsg, onProgress) {
  const fromDef = getProj4DefSync(fromEpsg), toDef = getProj4DefSync(toEpsg);
  if (!fromDef || !toDef) throw new Error(`Can't reproject rasters from EPSG:${fromEpsg} to EPSG:${toEpsg}.`);
  const out = [];
  for (let i = 0; i < rasters.length; i++) {
    const r = rasters[i];
    if (!r.dataUrl || !Array.isArray(r.bbox)) { out.push(r); continue; }
    const im = await decode(r.dataUrl);
    const [xmin, ymin, xmax, ymax] = r.bbox;
    const rp = reprojectImageRGBA({ xmin, ymin, xmax, ymax, width: im.width, height: im.height, data: im.data }, fromDef, toDef, im.width, im.height);
    const c = document.createElement("canvas");
    c.width = rp.width; c.height = rp.height;
    c.getContext("2d").putImageData(new ImageData(rp.data, rp.width, rp.height), 0, 0);
    out.push({ ...r, bbox: rp.bbox, dataUrl: c.toDataURL("image/png") });
    onProgress?.(i + 1, rasters.length);
    await new Promise((res) => setTimeout(res, 0)); // let the UI breathe between rasters
  }
  return out;
}
