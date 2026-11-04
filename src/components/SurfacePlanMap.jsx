// TASKS.csv #1792 / #1864 (review #1646, Kodiak) — Geochem > Plan map: surface samples at their X / Y, classed by the element's saved
// threshold (anomalyClasses, the same classes the 3D view draws), optionally over a level slice of a block model (chargeability at an
// elevation), with a scale bar, a north arrow and the legend drawn in. "Send to Layout" adds it as an image that carries its
// real-world width (a scale bar binds to it) and its legend rows; "Save PNG" writes it. Soils rarely carry an elevation, so this plan
// is where a soil anomaly is read against the IP. Map text is English, as every export is.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { X } from "./icons.js";
import { useStore } from "../lib/store.jsx";
import { anomalyClasses } from "../lib/anomalyMap.js";
import { colorForVoxelValue } from "../lib/layers.js";
import { planExtent, fitTransform, modelLevels, defaultPlanLevel, modelSliceAt, niceScaleBar, modelFootprint, padBox, inBox } from "../lib/surfacePlan.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { saveFile } from "../lib/desktop.js";
import { overlay, backdropProps, sel, panel, header, rowBtn as btn } from "../lib/modalStyles.js";
import { t as tr } from "../lib/i18n.js";

const W = 1000, H = 750;
const fmtV = (v) => (!Number.isFinite(v) ? "—" : Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : +v.toPrecision(3));

export default function SurfacePlanMap({ onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const { surfaceSamples = [], surfaceElements = [], geochemThresholds = [], mapLayers = [], voxelModels = [], addLayoutImage, goToModule } = useStore();
  const units = useMemo(() => Object.fromEntries(surfaceElements.map((e) => [e.symbol, e.unit])), [surfaceElements]);
  const saved = new Set(geochemThresholds.map((t) => t.symbol));
  const elements = useMemo(() => [...surfaceElements].sort((a, b) => (saved.has(b.symbol) ? 1 : 0) - (saved.has(a.symbol) ? 1 : 0)), [surfaceElements, geochemThresholds]);
  const media = useMemo(() => [...new Set(surfaceSamples.map((s) => s.medium).filter(Boolean))], [surfaceSamples]);
  const [symbol, setSymbol] = useState(() => elements[0]?.symbol || "");
  const [medium, setMedium] = useState(() => (media.includes("soil") ? "soil" : ""));
  const [modelId, setModelId] = useState(() => voxelModels[0]?.id || "");
  const model = voxelModels.find((m) => m.id === modelId) || null;
  const levels = useMemo(() => (model ? modelLevels(model) : []), [model]);
  const [level, setLevel] = useState(null);
  useEffect(() => { setLevel(model ? defaultPlanLevel(model) : null); }, [model]);
  const [opacity, setOpacity] = useState(0.7);
  const footprint = useMemo(() => (model ? modelFootprint(model) : null), [model]);
  const [frame, setFrame] = useState("model"); // "model": the block model's footprint (when one is chosen); "samples": all of them
  const [msg, setMsg] = useState(null);
  const canvasRef = useRef(null);

  const a = useMemo(() => (symbol ? anomalyClasses(surfaceSamples, { mode: "element", symbol, scheme: "threshold" }, { units, mapLayers, thresholds: geochemThresholds }) : null), [surfaceSamples, symbol, units, mapLayers, geochemThresholds]);
  const ofMedium = useMemo(() => surfaceSamples.map((s, i) => ({ s, i })).filter(({ s }) => Number.isFinite(s.x) && Number.isFinite(s.y) && (!medium || s.medium === medium)), [surfaceSamples, medium]);
  const extent = useMemo(() => (frame === "model" && footprint ? padBox(footprint, 0.08) : planExtent(ofMedium.map(({ s }) => s))), [frame, footprint, ofMedium]);
  const shown = useMemo(() => (extent ? ofMedium.filter(({ s }) => inBox(extent, s.x, s.y)) : []), [ofMedium, extent]);
  const slice = useMemo(() => (model && level != null ? modelSliceAt(model, level) : []), [model, level]);
  const unit = units[symbol] || "ppm";
  const title = `${symbol} (${unit}) in ${medium || "all surface samples"}${model && level != null ? ` over ${model.name}${model.property ? ` (${model.property})` : ""} at ${fmtV(level)} m` : ""}`;

  // the counts per class of the samples drawn, for the legend
  const counts = useMemo(() => {
    const c = new Map();
    for (const { i } of shown) { const k = a ? a.classOf[i] : -1; c.set(k, (c.get(k) || 0) + 1); }
    return c;
  }, [shown, a]);

  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
    const ext = extent;
    if (!ext) { ctx.fillStyle = "#555"; ctx.font = "16px sans-serif"; ctx.fillText("No surface samples with coordinates to draw.", 30, 50); return; }
    const T = fitTransform(ext, W, H);
    // the block-model slice under the samples
    if (slice.length) {
      ctx.globalAlpha = opacity;
      for (const c of slice) {
        const [x0, y0] = T.toPx(c.x - c.dx / 2, c.y + c.dy / 2), [x1, y1] = T.toPx(c.x + c.dx / 2, c.y - c.dy / 2);
        ctx.fillStyle = colorForVoxelValue(model, c.value);
        ctx.fillRect(x0, y0, Math.max(1, x1 - x0 + 0.5), Math.max(1, y1 - y0 + 0.5));
      }
      ctx.globalAlpha = 1;
    }
    // samples: background first, anomalous on top
    const order = [...shown].sort((p, q) => (a ? a.classOf[p.i] - a.classOf[q.i] : 0));
    for (const { s, i } of order) {
      const k = a ? a.classOf[i] : -1, top = a ? a.classes.length - 1 : 0;
      const r = k < 0 ? 2.2 : k >= top ? 5.5 : k >= top - 1 ? 4 : 3;
      const [px, py] = T.toPx(s.x, s.y);
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = k < 0 ? a?.noDataColor || "#e6e6e6" : a.classes[k].color; ctx.fill();
      ctx.lineWidth = 0.6; ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.stroke();
    }
    // title
    ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(0, 0, W, 30);
    ctx.fillStyle = "#222"; ctx.font = "bold 15px sans-serif"; ctx.fillText(title, 12, 20);
    // north arrow
    ctx.fillStyle = "#222"; ctx.beginPath(); ctx.moveTo(W - 34, 48); ctx.lineTo(W - 44, 76); ctx.lineTo(W - 34, 70); ctx.lineTo(W - 24, 76); ctx.closePath(); ctx.fill();
    ctx.font = "bold 13px sans-serif"; ctx.fillText("N", W - 39, 44);
    // scale bar
    const sb = niceScaleBar(T.mPerPx, 180);
    const sx = W - 30 - sb.px, sy = H - 28;
    ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(sx - 8, sy - 22, sb.px + 16, 34);
    ctx.fillStyle = "#222"; ctx.fillRect(sx, sy, sb.px, 5); ctx.fillStyle = "#fff"; ctx.fillRect(sx + sb.px / 2, sy + 1, sb.px / 2 - 1, 3);
    ctx.fillStyle = "#222"; ctx.font = "12px sans-serif"; ctx.fillText("0", sx - 3, sy - 6); ctx.fillText(sb.label, sx + sb.px - ctx.measureText(sb.label).width / 2, sy - 6);
    // legend
    const rows = [];
    if (a) a.classes.forEach((c, k) => rows.push([`${c.label} (${(counts.get(k) || 0).toLocaleString("en-US")})`, c.color]));
    if (counts.get(-1)) rows.push([`no value (${counts.get(-1).toLocaleString("en-US")})`, a?.noDataColor || "#e6e6e6"]);
    if (slice.length) { const vs = slice.map((c) => c.value); const lo = Math.min(...vs), hi = Math.max(...vs); rows.push([`${model.name} ${fmtV(lo)}`, colorForVoxelValue(model, lo)], [`${model.name} ${fmtV(hi)}`, colorForVoxelValue(model, hi)]); }
    ctx.font = "12px sans-serif";
    if (!rows.length) { cv.dataset.mPerPx = String(T.mPerPx); return; }
    const lw = Math.min(W - 40, 44 + Math.max(...rows.map(([t]) => ctx.measureText(t).width))), lh = 18 * rows.length + 14;
    ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fillRect(10, H - lh - 10, lw, lh); ctx.strokeStyle = "#999"; ctx.strokeRect(10, H - lh - 10, lw, lh);
    rows.forEach(([t, col], k) => { const y = H - lh + 4 + 18 * k; ctx.fillStyle = col; ctx.fillRect(20, y, 12, 12); ctx.strokeStyle = "#555"; ctx.strokeRect(20, y, 12, 12); ctx.fillStyle = "#222"; ctx.fillText(t, 40, y + 10); });
    cv.dataset.mPerPx = String(T.mPerPx);
  }, [shown, extent, a, slice, opacity, model, title, counts]);

  const legendItems = () => {
    const g = `${symbol} in ${medium || "surface samples"}`, out = [];
    if (a) a.classes.forEach((c) => out.push([`${g}: ${c.label}`, c.color]));
    if (slice.length) { const vs = slice.map((c) => c.value); const lo = Math.min(...vs), hi = Math.max(...vs); out.push([`${model.name} at ${fmtV(level)} m: ${fmtV(lo)}`, colorForVoxelValue(model, lo)], [`${model.name} at ${fmtV(level)} m: ${fmtV(hi)}`, colorForVoxelValue(model, hi)]); }
    return out;
  };
  const sendToLayout = () => {
    const cv = canvasRef.current; if (!cv) return;
    addLayoutImage({ label: title, src: cv.toDataURL("image/png"), naturalW: W, naturalH: H, worldWidthAtCaptureM: W * Number(cv.dataset.mPerPx || 0) || null, planMap: true, legendItems: legendItems() });
    goToModule("layout");
    onClose();
  };
  const savePng = () => {
    const cv = canvasRef.current; if (!cv) return;
    cv.toBlob(async (b) => { if (!b) return; const res = await saveFile({ suggestedName: `plan_${symbol}_${medium || "samples"}.png`, filters: [{ name: "PNG", extensions: ["png"] }], content: new Uint8Array(await b.arrayBuffer()) }); if (res && !res.ok && res.error) setMsg(res.error); }, "image/png");
  };

  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div role="dialog" aria-modal="true" aria-label={tr("Plan map of surface samples")} style={{ ...panel({ width: "min(1100px, 96vw)", maxHeight: "94vh" }), display: "flex", flexDirection: "column" }}>
        <div style={header}>
          <div style={{ fontWeight: 600 }}>{tr("Plan map of surface samples")}</div>
          <button type="button" onClick={onClose} aria-label={tr("Close")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)" }}><X size={16} /></button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "10px 16px", fontSize: "var(--font-size-base)" }}>
          <label>{tr("Element")} <select style={sel} value={symbol} onChange={(e) => setSymbol(e.target.value)}>{elements.map((e) => <option key={e.symbol} value={e.symbol}>{e.symbol}{saved.has(e.symbol) ? ` — ${tr("threshold saved")}` : ""}</option>)}</select></label>
          <label>{tr("Medium")} <select style={sel} value={medium} onChange={(e) => setMedium(e.target.value)}><option value="">{tr("All")}</option>{media.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
          <label>{tr("Under it")} <select style={sel} value={modelId} onChange={(e) => setModelId(e.target.value)}><option value="">{tr("No block model")}</option>{voxelModels.map((m) => <option key={m.id} value={m.id}>{m.name}{m.property ? ` (${m.property})` : ""}</option>)}</select></label>
          {model && levels.length > 0 && <label>{tr("Elevation")} <select style={sel} value={level ?? ""} onChange={(e) => setLevel(Number(e.target.value))}>{levels.map((z) => <option key={z} value={z}>{fmtV(z)} m</option>)}</select></label>}
          {model && footprint && <label>{tr("Frame")} <select style={sel} value={frame} onChange={(e) => setFrame(e.target.value)}><option value="model">{tr("The block model")}</option><option value="samples">{tr("All the samples")}</option></select></label>}
          {model && <label>{tr("Opacity")} <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} style={{ verticalAlign: "middle" }} /></label>}
        </div>
        {a?.notes?.length > 0 && <div style={{ padding: "0 16px 6px", fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)" }}>{a.notes.map((n) => tr(n.text, n.params)).join(" ")}</div>}
        {model && level != null && !slice.length && <div style={{ padding: "0 16px 6px", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("No cell of the model has a value at this elevation.")}</div>}
        <div style={{ padding: "0 16px", overflow: "auto", flex: 1, minHeight: 0 }}>
          <canvas ref={canvasRef} width={W} height={H} style={{ width: "100%", height: "auto", border: "1px solid var(--color-border)", background: "#fff" }} />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", padding: "10px 16px" }}>
          {msg && <span style={{ color: "var(--color-danger-text)", fontSize: "var(--font-size-sm)", marginRight: "auto" }}>{msg}</span>}
          <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)", marginRight: "auto" }}>{shown.length === ofMedium.length ? tr("{n} sample(s) drawn", { n: shown.length.toLocaleString() }) : tr("{n} of {m} sample(s) in the frame", { n: shown.length.toLocaleString(), m: ofMedium.length.toLocaleString() })}</span>
          <button type="button" style={btn(false)} onClick={savePng}>{tr("Save PNG")}</button>
          <button type="button" style={btn(true)} onClick={sendToLayout} disabled={!shown.length}>{tr("Send to Layout")}</button>
        </div>
      </div>
    </div>
  );
}
