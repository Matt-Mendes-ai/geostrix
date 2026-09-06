import React, { useMemo, useRef, useState } from "react";
import { X, Upload, Trash2, MapPin } from "lucide-react";
import { fitAffine, residuals, georeferenceImage } from "../lib/georef.js";
import { reprojectXY, getProj4DefSync } from "../lib/reproject.js"; // TASKS.csv #290
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";

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

// TASKS.csv #290 (QGIS-specialist review) — the control-point table had no CRS field: typed X/Y were
// assumed to already be in the project's EPSG. But the real use case for this tool is a SCANNED
// HISTORIC MAP (a BC assessment-report figure), and those very often print only latitude/longitude or
// an older datum's grid. Collar import has had a Source CRS field since #120/#205; this is the same
// idea for tie points, reprojecting each one into the project EPSG before the affine fit rather than
// after, so RMSE and the residual column stay in project units and mean what they say.
// Low severity by design — a wildly wrong CRS shows up immediately as a terrible RMSE rather than
// silently — but "immediately visible" isn't the same as "correctable", and it wasn't correctable.
// Every NAD27 code reproject.js recognizes (geographic + the UTM North series from TASKS.csv #223).
const NAD27_CODES = new Set([4267, ...Array.from({ length: 22 }, (_, i) => 26701 + i)]);
const CP_CRS_OPTIONS = [
  { value: "", label: "Same as project (already project coordinates)" },
  { value: "4326", label: "EPSG:4326 — WGS84 lat/lon (degrees)" },
  { value: "4269", label: "EPSG:4269 — NAD83 lat/lon (degrees)" },
  // NAD27 is offered because it IS what a lot of pre-1990s BC assessment-report maps print, but see
  // the NAD27 note below — proj4js can't do the exact, spatially-varying NAD27 shift without NTv2
  // grids, so reproject.js applies a published ~10 m-class Helmert approximation (EPSG:1179) instead:
  // honest-but-approximate rather than silently wrong. TASKS.csv #299.
  { value: "4267", label: "EPSG:4267 — NAD27 lat/lon (degrees) — approximate, see note" },
  { value: "3005", label: "EPSG:3005 — BC Albers" },
  { value: "other", label: "Other EPSG code…" },
];

export default function GeoreferencerModal({ onImport, onClose, projectEpsg }) {
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
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

  // TASKS.csv #290 — "" means "already in the project's CRS" (the previous, only behavior).
  const [cpEpsgChoice, setCpEpsgChoice] = useState("");
  const [cpEpsgOther, setCpEpsgOther] = useState("");
  const cpEpsg = cpEpsgChoice === "other" ? cpEpsgOther.trim() : cpEpsgChoice;
  const needsReproject = !!cpEpsg && !!projectEpsg && Number(cpEpsg) !== Number(projectEpsg);
  const isGeographicCp = needsReproject && /\+proj=longlat/.test(getProj4DefSync(cpEpsg) || "");
  // Set when a CRS was asked for but can't be used — surfaced in the UI instead of silently falling
  // back to "assume project coordinates", which is exactly the failure this row is about.
  const crsError = needsReproject && !getProj4DefSync(cpEpsg)
    ? `EPSG:${cpEpsg} isn't one GeoStrix can reproject — control points are being used as-is (i.e. assumed to already be in EPSG:${projectEpsg}).`
    : needsReproject && !getProj4DefSync(projectEpsg)
      ? `This project's own EPSG:${projectEpsg} isn't one GeoStrix can reproject to — control points are being used as-is.`
      : null;

  const usablePoints = useMemo(() => {
    const parsed = points.filter((p) => p.x !== "" && p.y !== "" && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
      .map((p) => ({ ...p, x: Number(p.x), y: Number(p.y) }));
    if (!needsReproject || crsError) return parsed;
    // Reprojected BEFORE the fit (not after), so the affine transform, its RMSE and the per-point
    // residual column below are all expressed in the project's own world units.
    return parsed.map((p) => { const t = reprojectXY(p.x, p.y, cpEpsg, projectEpsg); return t ? { ...p, x: t.x, y: t.y } : p; });
  }, [points, needsReproject, crsError, cpEpsg, projectEpsg]);

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
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>Georeferencer — manual control points</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>Load a scanned map or claim sketch (PNG/JPG), click points on it, and type the matching real-world coordinates for each.</div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", gap: 16, flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => fileInput.current.click()} style={btn(false)}>
              <Upload size={14} style={{ marginRight: 6 }} /> Load image (PNG/JPG)…
            </button>
            <input ref={fileInput} type="file" accept=".png,.jpg,.jpeg" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) loadImage(f); e.target.value = ""; }} />
            {img ? (
              <div
                onClick={onCanvasClick}
                style={{ position: "relative", width: dispW, height: dispH, cursor: "crosshair", border: "1px solid var(--color-border)", background: "#ececec" }}
              >
                <canvas
                  width={dispW} height={dispH}
                  style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                  ref={(c) => { canvasRef.current = c; if (c) { const ctx = c.getContext("2d"); ctx.clearRect(0, 0, dispW, dispH); ctx.drawImage(img.bitmap, 0, 0, dispW, dispH); } }}
                />
                {points.map((p, i) => (
                  <div key={p.id} style={{ position: "absolute", left: p.px * displayScale - 8, top: p.py * displayScale - 16, pointerEvents: "none", color: "var(--color-danger-alt)" }}>
                    <MapPin size={18} fill="#d9534f" />
                    <span style={{ position: "absolute", left: 16, top: 0, fontSize: "var(--font-size-xs)", background: "var(--color-bg)", padding: "0 3px", borderRadius: 3, color: "var(--color-text)" }}>{i + 1}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ width: DISPLAY_MAX, height: 400, border: "1px dashed var(--color-border-light)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)", fontSize: "var(--font-size-base)" }}>
                Load an image to begin placing control points.
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: 8 }}>
            {/* TASKS.csv #290 — control-point CRS. Defaults to "same as project", so an existing
                workflow that types project coordinates behaves exactly as it did before. */}
            <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "block" }}>
              Control points are in
              <select value={cpEpsgChoice} onChange={(e) => setCpEpsgChoice(e.target.value)} style={{ ...numInput, width: "100%", marginTop: 3 }}
                title="The CRS of the coordinates printed on the scanned map. They're reprojected into the project's CRS before the transform is fitted.">
                {CP_CRS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            {cpEpsgChoice === "other" && (
              <input type="number" value={cpEpsgOther} onChange={(e) => setCpEpsgOther(e.target.value)} placeholder="EPSG code, e.g. 32609" style={{ ...numInput, width: "100%" }} />
            )}
            {/* TASKS.csv #299 — was "no datum shift at all, expect ~100 m offset". An approximate
                shift (EPSG:1179 geocentric translation, DMA TR8350.2, Alberta/BC extent) is now
                applied, so the wording says what it actually buys (~10 m class) without pretending
                it is a grid shift. */}
            {NAD27_CODES.has(Number(cpEpsg)) && (
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-accent-dark)", background: "#fdf6e6", border: "1px solid #e2c98a", borderRadius: 5, padding: "6px 8px" }}>
                NAD27 note: an approximate NAD27→NAD83 datum shift is applied (EPSG:1179, a published 3-parameter fit for Alberta/BC — typically within ~10 m). It is not survey-grade: that needs a grid-based (NTv2) transform, which GeoStrix doesn't ship yet. Expect a small residual on top of the fit's own RMSE.
              </div>
            )}
            {needsReproject && !crsError && (
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                Points are reprojected EPSG:{cpEpsg} → EPSG:{projectEpsg} before fitting, so the errors below are in project units.
              </div>
            )}
            {crsError && (
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-accent-dark)", background: "#fdf6e6", border: "1px solid #e2c98a", borderRadius: 5, padding: "6px 8px" }}>{crsError}</div>
            )}
            <div style={label}>Control points ({points.length}, need 3+ with valid coordinates)</div>
            {points.length === 0 ? (
              <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>Click on the image to add a point, then enter its known real-world X/Y here.</div>
            ) : (
              <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" }}>
                <thead><tr><th style={th}>#</th><th style={th}>Pixel</th><th style={th}>{isGeographicCp ? "Longitude" : "World X"}</th><th style={th}>{isGeographicCp ? "Latitude" : "World Y"}</th><th style={th}>Error (m)</th><th style={th}></th></tr></thead>
                <tbody>
                  {points.map((p, i) => {
                    const r = fitResiduals?.find((rr) => rr.id === p.id);
                    return (
                      <tr key={p.id}>
                        <td style={td}>{i + 1}</td>
                        <td style={td}>{p.px}, {p.py}</td>
                        <td style={td}><input type="number" value={p.x} onChange={(e) => updatePoint(p.id, { x: e.target.value })} style={numInput} /></td>
                        <td style={td}><input type="number" value={p.y} onChange={(e) => updatePoint(p.id, { y: e.target.value })} style={numInput} /></td>
                        <td style={{ ...td, color: r && r.error > (rmse || 0) * 2 ? "var(--color-danger-alt)" : "var(--color-text)" }}>{r ? r.error.toFixed(2) : "—"}</td>
                        <td style={td}><Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={() => removePoint(p.id)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {fit && (
              <div style={{ fontSize: "var(--font-size-base)", color: rmse > 0 ? "var(--color-text-secondary)" : "var(--color-text-secondary)" }}>
                Transform fit — RMSE {rmse.toFixed(2)} world units. {rmse > 0 && fitResiduals.some((r) => r.error > rmse * 3) && <span style={{ color: "var(--color-danger-alt)" }}>One or more points has a much larger error than the rest — double-check its pixel click and typed coordinates.</span>}
              </div>
            )}
            {usablePoints.length > 0 && usablePoints.length < 3 && (
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>Need at least 3 points with valid coordinates to fit a transform.</div>
            )}
            {error && (
              <div style={{ padding: "8px 10px", background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", borderRadius: 6, fontSize: "var(--font-size-base)", color: "var(--color-danger-text)" }}>{error}</div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>Cancel</button>
          <button onClick={doImport} disabled={!fit || busy} style={{ ...btn(true), flex: 2, opacity: fit && !busy ? 1 : 0.5, cursor: fit && !busy ? "pointer" : "not-allowed" }}>
            {busy ? "Georeferencing…" : "Georeference & import as raster"}
          </button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(1100px, 96vw)", maxHeight: "92vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const label = { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)" };
const btn = (primary) => ({ padding: "8px 12px", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: primary ? "1px solid var(--color-success-border)" : "1px solid var(--color-border-light)", background: primary ? "var(--color-success-bg)" : "transparent", color: primary ? "var(--color-success-text)" : "var(--color-text-secondary)", display: "flex", alignItems: "center", justifyContent: "center" });
const th = { padding: "4px 6px", color: "var(--color-text-secondary)", fontWeight: 500, textAlign: "left", borderBottom: "1px solid var(--color-border)" };
const td = { padding: "4px 6px", color: "var(--color-text)" };
const numInput = { width: 80, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" };
