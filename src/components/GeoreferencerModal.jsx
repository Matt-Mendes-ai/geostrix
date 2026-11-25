import React, { useMemo, useRef, useState } from "react";
import SourceCrsField from "./SourceCrsField.jsx"; // TASKS.csv #488
import { Upload, Trash2, MapPin } from "./icons.js";
import StepDialog, { stepDialogStyles } from "./StepDialog.jsx"; // TASKS.csv #4073 — the shared step shell (Escape and the focus trap, #238)
import { fitAffine, residuals, georeferenceImage, collarControlXY } from "../lib/georef.js"; // collarControlXY: TASKS.csv #1763
import { useStore } from "../lib/store.jsx"; // TASKS.csv #1763 — the project's collars
import { reprojectXY, getProj4DefSync, isMetricProjectedEpsg } from "../lib/reproject.js"; // TASKS.csv #290; metric: #1628
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786 — messages in the interface language
import { mineSourceOf, isMineSource, mineChoiceToProject, mineChoiceFromProject, mineSourceSentence } from "../lib/mineGrid.js"; // TASKS.csv #2684
import NumberInput from "./NumberInput.jsx"; // TASKS.csv #3926 — '0,05' and '0.05' both read

// TASKS.csv #129 — QGIS-specialist audit finding: "there's no way to georeference an ungeoreferenced
// scanned map ... the way QGIS's Georeferencer does with manual control points." This is that tool:
// load a plain image (a scanned assessment-report map or claim sketch — PNG, JPG, or a TIFF decoded by geotiff.js since
// TASKS.csv #1855), click
// points on it, type the matching real-world X/Y for each, and once >=3 non-collinear points are
// placed the image is resampled into an axis-aligned world-space raster (see georef.js's
// georeferenceImage — the same "forward-project corners for a bbox, inverse-sample per pixel" shape
// reprojectGrid already uses) and handed back via onImport, same shape RasterModule's
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
export default function GeoreferencerModal({ onImport, onClose, projectEpsg }) {
  const [at, setAt] = useState(0); // TASKS.csv #4073 — the step on screen
  const [img, setImg] = useState(null); // { bitmap, width, height, dataUrl } | null
  const [points, setPoints] = useState([]); // [{id, px, py, x, y, hole?}]
  const { collars = [], project } = useStore(); // #1763; project: #2684
  const holes = useMemo(() => collars.filter((c) => c?.hole_id != null && Number.isFinite(c.x) && Number.isFinite(c.y)).sort((a, b) => String(a.hole_id).localeCompare(String(b.hole_id), undefined, { numeric: true })), [collars]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileInput = useRef(null);
  const canvasRef = useRef(null);

  const displayScale = img ? Math.min(1, DISPLAY_MAX / Math.max(img.width, img.height)) : 1;
  const dispW = img ? Math.round(img.width * displayScale) : 0;
  const dispH = img ? Math.round(img.height * displayScale) : 0;

  // TASKS.csv #1628 (review #1497, Lawyers) — the result is named after the file (every scan was 'Georeferenced scan')
  const [fileStem, setFileStem] = useState("");
  const loadImage = async (file) => {
    setError(null);
    setFileStem(String(file?.name || "").replace(/\.[^.]+$/, ""));
    if (/\.tiff?$/i.test(file.name)) { // TASKS.csv #1855 — decoded by geotiff.js, as the GeoTIFF import does
      try {
        const { decodeTiffImage } = await import("../lib/raster.js");
        const t = await decodeTiffImage(file);
        setImg({ bitmap: t.canvas, width: t.width, height: t.height });
        setPoints([]);
      } catch (err) { setError(err.message); }
      return;
    }
    const url = URL.createObjectURL(file);
    const bitmap = new window.Image();
    bitmap.onload = () => {
      setImg({ bitmap, width: bitmap.naturalWidth, height: bitmap.naturalHeight });
      setPoints([]);
      URL.revokeObjectURL(url);
    };
    bitmap.onerror = () => { setError(tr("Couldn't load this image: PNG, JPG or TIFF only.")); URL.revokeObjectURL(url); };
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
  const [cpEpsg, setCpEpsg] = useState(""); // #488 — "" = same as project (any listed CRS, chosen by name)
  // TASKS.csv #2684 — 'Local mine grid (no CRS)': the points are read on the project's mine grid and brought in through its tie before the fit
  const mineChoice = useMemo(() => mineSourceOf(project), [project]), cpMine = isMineSource(cpEpsg);
  const needsReproject = !cpMine && !!cpEpsg && !!projectEpsg && Number(cpEpsg) !== Number(projectEpsg);
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
    if (cpMine) { const T = mineChoiceToProject(mineChoice, projectEpsg); return T ? parsed.map((p) => { const [x, y] = T(p.x, p.y); return Number.isFinite(x) && Number.isFinite(y) ? { ...p, x, y } : p; }) : parsed; } // #2684
    if (!needsReproject || crsError) return parsed;
    // Reprojected BEFORE the fit (not after), so the affine transform, its RMSE and the per-point
    // residual column below are all expressed in the project's own world units.
    return parsed.map((p) => { const t = reprojectXY(p.x, p.y, cpEpsg, projectEpsg); return t ? { ...p, x: t.x, y: t.y } : p; });
  }, [points, needsReproject, crsError, cpEpsg, projectEpsg, cpMine, mineChoice]);

  // #2684 — a collar's X / Y on the mine grid (its project coordinates taken back through the tie)
  const mineCollarXY = (c) => {
    const F = mineChoiceFromProject(mineChoice, projectEpsg);
    if (!F || !Number.isFinite(c?.x) || !Number.isFinite(c?.y)) return null;
    const [x, y] = F(c.x, c.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x: String(+x.toFixed(3)), y: String(+y.toFixed(3)) } : null;
  };
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
      onImport({ name: fileStem ? `${fileStem} (georeferenced)` : "Georeferenced scan", bbox: result.bbox, dataUrl: outCanvas.toDataURL("image/png") }); // #1628
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const outlierWarn = rmse > 0 && fitResiduals.some((r) => r.error > rmse * 3);
  // TASKS.csv #4073 (Matt: "similar for all pop up windows") — three steps, as the section figure's georeferencing (#4071): 1 Image (load the scan),
  // 2 Points (their CRS, then click and type), 3 Import (the fit, then the gold Import). The long explanations are in the Help card
  const heading = tr("Georeferencer");
  const help = (
    <details open>
      <summary style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: 4 }}>{heading}</summary>
      <div style={note}>{tr("Load a scanned map or claim sketch (PNG / JPG / TIFF), click points on it, and type the matching real-world coordinates for each.")}</div>
      <div style={{ ...note, marginTop: 6 }}>{holes.length > 0 ? tr("Click on the image to add a point, then pick the collar it shows, or enter its known real-world X/Y here.") : tr("Click on the image to add a point, then enter its known real-world X/Y here.")}</div>
      <div style={{ ...note, marginTop: 6 }}>{tr("Points in another CRS are reprojected to the project's CRS before the fit, so the errors are in project units.")}</div>
      <div style={{ ...note, marginTop: 6 }}>{tr("Exact fit: three points always fit this transform exactly, so they cannot show an error. Add a fourth point to check the others.")}</div>
    </details>
  );
  const steps = [
    { key: "image", label: tr("Image"), primary: { label: tr("Next: points"), disabled: !img }, render: () => (<>
      {img ? (
        <div style={{ border: "1px solid var(--color-border)", alignSelf: "flex-start" }}>
          <canvas width={dispW} height={dispH} aria-label={tr("The image")} role="img" style={{ display: "block", background: "#ececec" }}
            ref={(c) => { if (c) { const ctx = c.getContext("2d"); ctx.clearRect(0, 0, dispW, dispH); ctx.drawImage(img.bitmap, 0, 0, dispW, dispH); } }} />
        </div>
      ) : (
        <div style={{ width: DISPLAY_MAX, maxWidth: "100%", height: 400, border: "1px dashed var(--color-border-light)", display: "flex", flexDirection: "column", gap: 10, alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)" }}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) loadImage(f); }}>
          <Upload size={30} />
          <button type="button" className="gs-btn" onClick={() => fileInput.current.click()}>{tr("Load image (PNG / JPG / TIFF)…")}</button>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {img && <button type="button" className="gs-btn gs-btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => fileInput.current.click()}>{tr("Choose another…")}</button>}
        <input ref={fileInput} type="file" accept=".png,.jpg,.jpeg,.tif,.tiff" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) loadImage(f); e.target.value = ""; }} />
      </div>
    </>) },
    { key: "points", label: tr("Points"), primary: { label: tr("Next: check"), disabled: !fit }, hint: points.length > 0 && usablePoints.length < 3 ? tr("Need at least 3 points with valid coordinates to fit a transform.") : "", render: () => (<>
      {img && (
        <div role="button" tabIndex={0} onKeyDown={activateOnKey}
          onClick={onCanvasClick}
          style={{ position: "relative", width: dispW, height: dispH, cursor: "crosshair", border: "1px solid var(--color-border)", background: "#ececec", alignSelf: "flex-start" }}
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
      )}
      <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: 8 }}>
        {/* TASKS.csv #290 — control-point CRS. Defaults to "same as project", so an existing
            workflow that types project coordinates behaves exactly as it did before. */}
        <SourceCrsField
          label={tr("Control points are in")} value={cpEpsg} onChange={(c) => setCpEpsg(c === "" ? "" : String(c))} mineGrid={mineChoice /* #2684 */}
          defaultText="Same as project (already project coordinates)"
          title={tr("The CRS of the coordinates printed on the scanned map (e.g. WGS 84, BC Albers); they are reprojected to the project's CRS before the fit.")}
        />
        {cpMine && mineChoice?.kind !== "local" && ( /* #2684 */
          <div style={{ fontSize: "var(--font-size-sm)", color: mineChoice?.kind === "tie" ? "var(--color-text-secondary)" : "var(--color-warn-text)" }}>{mineSourceSentence(mineChoice, projectEpsg).trim()}</div>
        )}
        {/* the coordinates are converted before the fit: said in one line */}
        {needsReproject && !crsError && <div style={note}>{tr("Reprojected EPSG:{cpEpsg} → EPSG:{projectEpsg} before the fit.", { cpEpsg, projectEpsg })}</div>}
        {crsError && <div style={warnBox}>{crsError}</div>}
        <div style={label}>{tr("Control points ({points})", { points: points.length })}</div>
        {points.length === 0 ? (
          <div style={note}>{holes.length > 0 ? tr("Click the image, then pick a collar or type X / Y.") : tr("Click the image, then type X / Y.")}</div>
        ) : (
          <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" }}>
            <thead><tr><th style={th}>#</th><th style={th}>{tr("Pixel")}</th>{holes.length > 0 && <th style={th}>{tr("Collar")}</th>}<th style={th}>{isGeographicCp ? tr("Longitude") : tr("World X")}</th><th style={th}>{isGeographicCp ? tr("Latitude") : tr("World Y")}</th><th style={th}>{tr("Error (m)")}</th><th style={th}></th></tr></thead>
            <tbody>
              {points.map((p, i) => {
                const r = fitResiduals?.find((rr) => rr.id === p.id);
                return (
                  <tr key={p.id}>
                    <td style={td}>{i + 1}</td>
                    <td style={td}>{p.px}, {p.py}</td>
                    {holes.length > 0 && ( /* TASKS.csv #1763 — a collar the scan shows fills X / Y (in the control points' CRS) */
                      <td style={td}><select value={p.hole ?? ""} aria-label={tr("Collar at control point {n}", { n: i + 1 })} style={{ ...numInput, width: 90 }}
                        onChange={(e) => { const c = holes.find((h) => String(h.hole_id) === e.target.value); const xy = c ? (cpMine ? mineCollarXY(c) : collarControlXY(c, { cpEpsg, projectEpsg, reproject: reprojectXY, geographic: isGeographicCp })) : null; /* mine: #2684 */ updatePoint(p.id, xy ? { hole: e.target.value, ...xy } : { hole: "" }); }}>
                        <option value="">{tr("(typed)")}</option>
                        {holes.map((h) => <option key={h.hole_id} value={String(h.hole_id)}>{h.hole_id}</option>)}
                      </select></td>
                    )}
                    <td style={td}><NumberInput allowEmpty value={p.x === "" ? null : p.x} onChange={(v) => updatePoint(p.id, { x: v == null ? "" : String(v), hole: "" })} style={numInput} aria-label={tr("Easting")} /></td>
                    <td style={td}><NumberInput allowEmpty value={p.y === "" ? null : p.y} onChange={(v) => updatePoint(p.id, { y: v == null ? "" : String(v), hole: "" })} style={numInput} aria-label={tr("Northing")} /></td>
                    <td style={{ ...td, color: r && r.error > (rmse || 0) * 2 ? "var(--color-danger-alt)" : "var(--color-text)" }}>{r && fitResiduals.length > 3 ? r.error.toFixed(2) : "—" /* #1628 — no error to show with three points */}</td>
                    <td style={td}><Trash2 aria-label={tr("Remove this control point")} title={tr("Remove this control point")} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={() => removePoint(p.id)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>) },
    { key: "import", label: tr("Import"), primary: { label: busy ? tr("Georeferencing…") : tr("Import"), onClick: doImport, disabled: !fit || busy }, render: () => (
      <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: 8 }}>
        {fit && (
          <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>{fitResiduals.length === 3 /* #1628 — an affine has 6 unknowns: three points fit it exactly, whatever they are */
            ? tr("Exact fit: add a fourth point to check the error.")
            : isMetricProjectedEpsg(projectEpsg) ? tr("Transform fit — RMSE {rmse} m.", { rmse: rmse.toFixed(2) }) : tr("Transform fit — RMSE {rmse} project units.", { rmse: rmse.toFixed(2) })}
          </div>
        )}
        {/* a point far off the others stays seen where you import, with what to check */}
        {fit && outlierWarn && <div style={warnBox}>{tr("One or more points has a much larger error than the rest — double-check its pixel click and typed coordinates.")}</div>}
        {crsError && <div style={warnBox}>{crsError}</div>}
      </div>
    ) },
  ];
  return <StepDialog title={heading} onClose={onClose} steps={steps} at={at} onAt={setAt} help={help} error={error} width="min(1100px, 96vw)" />;
}

const { label, note, warn: warnBox } = stepDialogStyles;
const th = { padding: "4px 6px", color: "var(--color-text-secondary)", fontWeight: 500, textAlign: "start", borderBottom: "1px solid var(--color-border)" };
const td = { padding: "4px 6px", color: "var(--color-text)" };
const numInput = { width: 80, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" };
