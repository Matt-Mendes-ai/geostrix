import React, { useMemo, useRef, useState } from "react";
import { X, Upload, Trash2, MapPin } from "lucide-react";
import { fitAffine, residuals, georeferenceImage } from "../lib/georef.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";

// TASKS.csv #129 — QGIS-specialist audit finding: "there's no way to georeference an ungeoreferenced
// scanned map ... the way QGIS's Georeferencer does with manual control points." This is that tool:
// load a plain image (a scanned assessment-report map or claim sketch — PNG/JPG only, since browsers
// don't natively decode TIFF and a non-georeferenced TIFF has no tags to fall back on anyway), click
// points on it, type the matching real-world X/Y for each, and once >=3 non-collinear points are
// placed the image is resampled into an axis-aligned world-space raster (see georef.js's
// georeferenceImage — the same "forward-project corners for a bbox, inverse-sample per pixel" shape
// reprojectGrid/satelliteFetch.js already use) and handed back via onImport, same shape RasterModule's
// other importers produce ({name, bbox, dataUrl}).
const DISPLAY_MAX = 700; // scaled-down on-screen canvas size; control points are still stored/fit at full source resolution

export default function GeoreferencerModal({ onImport, onClose }) {
  useEscapeKey(onClose); // TASKS.csv #238
  const [img, setImg] = useState(null); // { bitmap, width, height, dataUrl } | null
  const [points, setPoints] = useState([]); // [{id, px, py, x, y}]
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileInput = useRef(null);
  const canvasRef = useRef(null);

  const displayScale = img ? Math.min(1, DISPLAY_MAX / Math.max(img.width, img.height)) : 1;
  const dispW = img ? Math.round(img.width * displayScale) : 0;
  const dispH = img ? Math.round(img.height * displayScale) : 0;

  const loadImage = (file) => {
    setError(null);
    const url = URL.createObjectURL(file);
    const bitmap = new window.Image();
    bitmap.onload = () => {
      setImg({ bitmap, width: bitmap.naturalWidth, height: bitmap.naturalHeight });
      setPoints([]);
      URL.revokeObjectURL(url);
    };
    bitmap.onerror = () => { setError("Couldn't load this image — only PNG/JPG are supported (browsers can't decode plain TIFF, and an ungeoreferenced TIFF has no tags to read anyway)."); URL.revokeObjectURL(url); };
    bitmap.src = url;
  };

  const onCanvasClick = (e) => {
    if (!img) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = Math.round((e.clientX - rect.left) / displayScale);
    const py = Math.round((e.clientY - rect.top) / displayScale);
    setPoints((p) => [...p, { id: `cp_${Date.now()}_${p.length}`, px, py, x: "", y: "" }]);
  };

  const updatePoint = (id, patch) => setPoints((p) => p.map((pt) => (pt.id === id ? { ...pt, ...patch } : pt)));
  const removePoint = (id) => setPoints((p) => p.filter((pt) => pt.id !== id));

  const usablePoints = points.filter((p) => p.x !== "" && p.y !== "" && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
    .map((p) => ({ ...p, x: Number(p.x), y: Number(p.y) }));

  const fit = useMemo(() => {
    if (usablePoints.length < 3) return null;
    try { return fitAffine(usablePoints); } catch { return null; }
  }, [usablePoints]);

  const fitResiduals = useMemo(() => (fit ? residuals(fit, usablePoints) : null), [fit, usablePoints]);
  const rmse = fitResiduals ? Math.sqrt(fitResiduals.reduce((s, r) => s + r.error ** 2, 0) / fitResiduals.length) : null;

  const doImport = () => {
    if (!img || !fit) return;
    setBusy(true);
    setError(null);
    try {
      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = img.width; srcCanvas.height = img.height;
      const sctx = srcCanvas.getContext("2d");
      sctx.drawImage(img.bitmap, 0, 0);
      const imageData = sctx.getImageData(0, 0, img.width, img.height);
      const result = georeferenceImage(imageData, img.width, img.height, fit);
      const outCanvas = document.createElement("canvas");
      outCanvas.width = result.outW; outCanvas.height = result.outH;
      const octx = outCanvas.getContext("2d");
      octx.putImageData(new ImageData(result.data, result.outW, result.outH), 0, 0);
      onImport({ name: "Georeferenced scan", bbox: result.bbox, dataUrl: outCanvas.toDataURL("image/png") });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 15, color: "#8a6a1f", fontWeight: 600 }}>Georeferencer — manual control points</div>
            <div style={{ fontSize: 11, color: "#94a1b0", marginTop: 2 }}>Load a scanned map or claim sketch (PNG/JPG), click points on it, and type the matching real-world coordinates for each.</div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", gap: 16, flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => fileInput.current.click()} style={btn(false)}>
              <Upload size={13} style={{ marginRight: 6 }} /> Load image (PNG/JPG)…
            </button>
            <input ref={fileInput} type="file" accept=".png,.jpg,.jpeg" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) loadImage(f); e.target.value = ""; }} />
            {img ? (
              <div
                onClick={onCanvasClick}
                style={{ position: "relative", width: dispW, height: dispH, cursor: "crosshair", border: "1px solid #d9dce1", background: "#ececec" }}
              >
                <canvas
                  width={dispW} height={dispH}
                  style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                  ref={(c) => { canvasRef.current = c; if (c) { const ctx = c.getContext("2d"); ctx.clearRect(0, 0, dispW, dispH); ctx.drawImage(img.bitmap, 0, 0, dispW, dispH); } }}
                />
                {points.map((p, i) => (
                  <div key={p.id} style={{ position: "absolute", left: p.px * displayScale - 8, top: p.py * displayScale - 16, pointerEvents: "none", color: "#d9534f" }}>
                    <MapPin size={16} fill="#d9534f" />
                    <span style={{ position: "absolute", left: 16, top: 0, fontSize: 10, background: "#ffffff", padding: "0 3px", borderRadius: 3, color: "#1a2028" }}>{i + 1}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ width: DISPLAY_MAX, height: 400, border: "1px dashed #c7ccd3", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a1b0", fontSize: 12 }}>
                Load an image to begin placing control points.
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={label}>Control points ({points.length}, need 3+ with valid coordinates)</div>
            {points.length === 0 ? (
              <div style={{ fontSize: 12, color: "#55606e" }}>Click on the image to add a point, then enter its known real-world X/Y here.</div>
            ) : (
              <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
                <thead><tr><th style={th}>#</th><th style={th}>Pixel</th><th style={th}>World X</th><th style={th}>World Y</th><th style={th}>Error (m)</th><th style={th}></th></tr></thead>
                <tbody>
                  {points.map((p, i) => {
                    const r = fitResiduals?.find((rr) => rr.id === p.id);
                    return (
                      <tr key={p.id}>
                        <td style={td}>{i + 1}</td>
                        <td style={td}>{p.px}, {p.py}</td>
                        <td style={td}><input type="number" value={p.x} onChange={(e) => updatePoint(p.id, { x: e.target.value })} style={numInput} /></td>
                        <td style={td}><input type="number" value={p.y} onChange={(e) => updatePoint(p.id, { y: e.target.value })} style={numInput} /></td>
                        <td style={{ ...td, color: r && r.error > (rmse || 0) * 2 ? "#d9534f" : "#1a2028" }}>{r ? r.error.toFixed(2) : "—"}</td>
                        <td style={td}><Trash2 size={12} style={{ cursor: "pointer", color: "#55606e" }} onClick={() => removePoint(p.id)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {fit && (
              <div style={{ fontSize: 11.5, color: rmse > 0 ? "#55606e" : "#55606e" }}>
                Transform fit — RMSE {rmse.toFixed(2)} world units. {rmse > 0 && fitResiduals.some((r) => r.error > rmse * 3) && <span style={{ color: "#d9534f" }}>One or more points has a much larger error than the rest — double-check its pixel click and typed coordinates.</span>}
              </div>
            )}
            {usablePoints.length > 0 && usablePoints.length < 3 && (
              <div style={{ fontSize: 11, color: "#94a1b0" }}>Need at least 3 points with valid coordinates to fit a transform.</div>
            )}
            {error && (
              <div style={{ padding: "8px 10px", background: "#2a1f1f", border: "1px solid #4a2f2f", borderRadius: 6, fontSize: 11.5, color: "#e0a0a0" }}>{error}</div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #d9dce1" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>Cancel</button>
          <button onClick={doImport} disabled={!fit || busy} style={{ ...btn(true), flex: 2, opacity: fit && !busy ? 1 : 0.5, cursor: fit && !busy ? "pointer" : "not-allowed" }}>
            {busy ? "Georeferencing…" : "Georeference & import as raster"}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(8,10,14,0.75)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" };
const panel = { width: "min(1100px, 96vw)", maxHeight: "92vh", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #d9dce1" };
const label = { fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a1b0" };
const btn = (primary) => ({ padding: "8px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", border: primary ? "1px solid #3d6b52" : "1px solid #c7ccd3", background: primary ? "#1e3629" : "transparent", color: primary ? "#8fd9ab" : "#55606e", display: "flex", alignItems: "center", justifyContent: "center" });
const th = { padding: "4px 6px", color: "#55606e", fontWeight: 500, textAlign: "left", borderBottom: "1px solid #d9dce1" };
const td = { padding: "4px 6px", color: "#1a2028" };
const numInput = { width: 80, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "4px 6px", color: "#1a2028", fontSize: 11 };
