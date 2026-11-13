// TASKS.csv #3142 (the import half of #3033) — a Geosoft .gxf or Geosoft / Surfer .grd read, coloured and encoded off the UI thread. A 2000 x
// 2000 grid froze the window 2.1 s on import (the decode, the 2-98 % stretch, the colours of 4 million nodes, the kept value grid and the PNG).
// The same functions as raster.js parseGXF / parseGRD (rasterRows.js), so the raster is the same; the PNG comes from an OffscreenCanvas.
// Anything that fails here (no OffscreenCanvas, a file the reader refuses) answers `failed`, and the UI thread reads the file itself, as
// before, which also gives the user the reader's own message.
import { gxfRows, grdRows, rowsPicture } from "./rasterRows.js";
import { bytesToB64 } from "./base64.js";
import { useDictionary as setDictionary } from "./i18n.js"; // not a React hook: it only sets the module's dictionary

self.onmessage = async (e) => {
  const { id, kind, name, buf, lang } = e.data || {};
  try {
    if (lang) setDictionary(lang.code, lang.dict);
    if (typeof OffscreenCanvas === "undefined") throw new Error("no OffscreenCanvas");
    const rows = kind === "gxf" ? gxfRows(new TextDecoder().decode(buf), name) : await grdRows(new Uint8Array(buf), name);
    const { record, rgba, outW, outH } = rowsPicture(rows);
    const canvas = new OffscreenCanvas(outW, outH);
    canvas.getContext("2d").putImageData(new ImageData(rgba, outW, outH), 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const dataUrl = `data:image/png;base64,${bytesToB64(new Uint8Array(await blob.arrayBuffer()))}`;
    const g = record.grid, transfer = [rgba.buffer, ...(g ? [g.values, g.maxValues, g.minValues].filter(Boolean).map((a) => a.buffer) : [])];
    self.postMessage({ id, res: { record, dataUrl, rgba, outW, outH } }, transfer);
  } catch (err) {
    self.postMessage({ id, failed: String(err?.message || err) });
  }
};
