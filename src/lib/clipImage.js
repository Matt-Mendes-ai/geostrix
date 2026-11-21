// TASKS.csv #3954 — a fetched image clipped to a boundary or claim: the pixels outside its outline made transparent (the browser half of
// lib/fetchAreas.js clipRgbaToOutline). dataUrl: the image; bbox: its [x0, y0, x1, y1] in the project CRS; outline: closed loops there.
// -> the new data URL (PNG, which keeps the transparency), or the old one when nothing was outside
import { clipRgbaToOutline } from "./fetchAreas.js";

export async function clipImageToOutline(dataUrl, bbox, outline) {
  if (!dataUrl || !bbox || !outline?.length) return dataUrl;
  const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error("The image could not be read to clip it.")); i.src = dataUrl; });
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) return dataUrl;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  if (!clipRgbaToOutline(data.data, outline, bbox, w, h)) return dataUrl;
  ctx.putImageData(data, 0, 0);
  return c.toDataURL("image/png");
}
