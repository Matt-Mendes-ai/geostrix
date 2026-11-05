// TASKS.csv #1623 (review #1497, Lawyers) — a colour picture's background made transparent. RGB GeoTIFFs with no alpha
// and no nodata tag (three Lawyers geophysics images, 32-50 % white fill) were drawn as a solid white sheet over the holes.
// The stored picture is never rewritten: the raster carries keyColour ("#ffffff") and the 3D drape keys it out when it
// builds the texture, so the choice can be turned off or changed later.

export const KEY_TOL = 8; // per channel, 0-255: JPEG-ish noise in a "white" fill stays inside it

export function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const near = (d, i, rgb, tol) => Math.abs(d[i] - rgb[0]) <= tol && Math.abs(d[i + 1] - rgb[1]) <= tol && Math.abs(d[i + 2] - rgb[2]) <= tol;

// Sets alpha 0 on every pixel within tol of rgb (RGBA bytes, in place). Returns how many it cleared.
export function keyOutColour(data, rgb, tol = KEY_TOL) {
  let n = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] && near(data, i, rgb, tol)) { data[i + 3] = 0; n++; }
  return n;
}

// The share of opaque pixels within tol of rgb.
export function colourFraction(data, rgb, tol = KEY_TOL) {
  let n = 0, opaque = 0;
  for (let i = 0; i < data.length; i += 4) { if (!data[i + 3]) continue; opaque++; if (near(data, i, rgb, tol)) n++; }
  return opaque ? n / opaque : 0;
}

// White or black when at least 95 % of the opaque border pixels are that colour, else null. A border that is already
// transparent (an image with alpha, or the margin a reprojection adds) needs nothing.
export function borderKeyColour(data, w, h, tol = KEY_TOL) {
  if (!(w > 2 && h > 2) || data.length < w * h * 4) return null;
  const idx = [];
  for (let x = 0; x < w; x++) idx.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) idx.push(y * w, y * w + w - 1);
  let opaque = 0, white = 0, black = 0;
  for (const p of idx) {
    const i = p * 4;
    if (data[i + 3] < 128) continue;
    opaque++;
    if (near(data, i, [255, 255, 255], tol)) white++;
    else if (near(data, i, [0, 0, 0], tol)) black++;
  }
  if (opaque < idx.length * 0.5) return null;
  if (white >= opaque * 0.95) return "#ffffff";
  if (black >= opaque * 0.95) return "#000000";
  return null;
}

// Browser only: a picture (data URL) with one colour keyed out, as a canvas for a texture.
export function keyedCanvas(img, keyColour, tol = KEY_TOL) {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width; canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const rgb = hexRgb(keyColour);
  if (rgb && canvas.width && canvas.height) {
    const im = ctx.getImageData(0, 0, canvas.width, canvas.height);
    keyOutColour(im.data, rgb, tol);
    ctx.putImageData(im, 0, 0);
  }
  return canvas;
}

// Browser only: the border colour of a stored picture (for a raster imported before this existed), from a copy at most
// 512 px on a side. Resolves null when the border is not uniform white or black.
export function detectKeyColour(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 512 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const w = Math.max(3, Math.round(img.naturalWidth * s)), h = Math.max(3, Math.round(img.naturalHeight * s));
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      const colour = borderKeyColour(d, w, h);
      resolve(colour ? { colour, fraction: colourFraction(d, hexRgb(colour)) } : null);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
