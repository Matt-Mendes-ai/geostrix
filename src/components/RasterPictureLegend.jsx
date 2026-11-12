// TASKS.csv #1858 (review #1646, Kodiak) — a picture raster (an RGB plan map, a scan, imagery) keeps colours, not values: its card says so,
// and the vendor's colour bar that came with the map (Chg_colorbar.png) can be attached and shown under it, so the colours can be read.
// The image is saved with the raster (`legendImage`, a data URL scaled to at most LEGEND_MAX_PX on its long side).
import React, { useRef, useState } from "react";
import { t as tr } from "../lib/i18n.js";

export const LEGEND_MAX_PX = 800;
const xs = { fontSize: "var(--font-size-xs)", lineHeight: 1.4 };

// a picture file -> a PNG data URL at most maxPx on its long side
async function legendDataUrl(file, maxPx = LEGEND_MAX_PX) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error(tr("\"{name}\" is not a picture GeoStrix can read (PNG, JPEG, WebP, GIF).", { name: file.name }))); i.src = url; });
    const k = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}

export default function RasterPictureLegend({ raster: r, updateRaster }) {
  const input = useRef(null);
  const [err, setErr] = useState(null);
  const link = { ...xs, border: "none", background: "transparent", color: "var(--color-primary)", cursor: "pointer", padding: 0, textAlign: "left" };
  const attach = async (file) => {
    if (!file) return;
    setErr(null);
    try { updateRaster(r.id, { legendImage: { dataUrl: await legendDataUrl(file), name: file.name } }); } catch (e) { setErr(e.message); }
  };
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ ...xs, color: "var(--color-text-caption)" }}>{tr("Picture only: colours, no values. Its colours can be read against the map's own colour bar.")}</div>
      {r.legendImage?.dataUrl
        ? (
          <div style={{ marginTop: 4 }}>
            <img src={r.legendImage.dataUrl} alt={tr("Colour bar of \"{name}\"", { name: r.name })} style={{ maxWidth: "100%", maxHeight: 160, display: "block", border: "1px solid var(--color-border)", background: "#fff" }} />
            <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
              <span style={{ ...xs, color: "var(--color-text-muted)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.legendImage.name}</span>
              <button type="button" onClick={() => input.current?.click()} style={link}>{tr("Replace")}</button>
              <button type="button" onClick={() => updateRaster(r.id, { legendImage: null })} style={link}>{tr("Remove")}</button>
            </div>
          </div>
        )
        : <button type="button" onClick={() => input.current?.click()} style={{ ...link, marginTop: 3 }}>{tr("Attach the map's colour bar (a picture)…")}</button>}
      <input ref={input} type="file" accept=".png,.jpg,.jpeg,.webp,.gif" aria-label={tr("Colour bar picture of \"{name}\"", { name: r.name })} style={{ display: "none" }} onChange={(e) => { attach(e.target.files?.[0]); e.target.value = ""; }} />
      {err && <div role="status" style={{ ...xs, color: "var(--color-danger-text)" }}>{err}</div>}
    </div>
  );
}
