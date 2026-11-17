import React, { useEffect, useMemo, useState } from "react";
import { X, Trash2 } from "./icons.js";
import ImageTiePointCanvas from "./ImageTiePointCanvas.jsx";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";
import { adjustCorners, adjustedImage, terrainProfilePx, topoPicks, fitVertical, typedAdjustment, imageVE } from "../lib/sectionVertical.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

// TASKS.csv #3880 (a GeoStrix user, via Matt, 2026-11-17) — "Match to terrain": a georeferenced section image stands at the heights its control points were typed with, and its own drawn topography
// line could float above the draped terrain with nothing to correct it. Here the user clicks along that DRAWN line; each click is compared with the terrain under it (the terrain's profile along the
// picture is drawn over it too), and the height (or the height and the vertical scale) that brings the two together is fitted, or an offset and a scale are typed. Only the picture's heights change; its place
// along the section line does not. The corners it was georeferenced with are kept, so it can be put back.
const round2 = (v) => Math.round(v * 100) / 100;
export default function SectionImageVerticalModal({ image, terrain, onApply, onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const [bitmap, setBitmap] = useState(null);
  const [picks, setPicks] = useState([]);
  const [offset, setOffset] = useState("0");
  const [scalePct, setScalePct] = useState("100");
  const [pivot, setPivot] = useState(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { const b = new Image(); b.onload = () => setBitmap(b); b.src = image.dataUrl; }, [image.dataUrl]);
  const adj = typedAdjustment({ offset, scalePct, pivot: pivot ?? 0 });
  const preview = useMemo(() => (adj ? adjustedImage(image, adj) : image), [image, adj?.offset, adj?.scale, adj?.pivot]);
  const rows = useMemo(() => topoPicks(image, picks, terrain), [image, picks, terrain]);
  const after = useMemo(() => topoPicks(preview, picks, terrain), [preview, picks, terrain]);
  const rmsOf = (r) => (r.length ? Math.sqrt(r.reduce((t, x) => t + x.diff * x.diff, 0) / r.length) : null);
  const lines = useMemo(() => [
    { id: "now", color: "#8a8f98", dash: "5 4", runs: terrainProfilePx(image, terrain) },
    { id: "match", color: "#1b7f3b", runs: terrainProfilePx(preview, terrain) },
  ], [image, preview, terrain]);
  const ve = imageVE(image);
  const fit = (mode) => {
    const f = fitVertical(rows, mode);
    if (f.error) { setMsg(tr(f.error)); return; }
    setMsg(""); setOffset(String(round2(f.offset))); setScalePct(String(round2(f.scale * 100))); setPivot(f.pivot);
  };
  const apply = () => {
    if (!adj) return;
    onApply({ corners: adjustCorners(image.corners, adj), corners0: image.corners0 || image.corners, verticalAdjust: { offset: round2(adj.offset), scalePct: round2(adj.scale * 100), at: new Date().toISOString().slice(0, 10) } });
    onClose();
  };
  const reset = () => { if (image.corners0) { onApply({ corners: image.corners0, corners0: null, verticalAdjust: null }); onClose(); } };
  const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 };
  const num = { width: 90, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" };
  const btn = (primary) => ({ padding: "6px 12px", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: primary ? "1px solid var(--color-success-border)" : "1px solid var(--color-border-light)", background: primary ? "var(--color-success-bg, var(--color-bg-subtle))" : "var(--color-bg-subtle)", color: "var(--color-text)" });
  const th = { padding: "3px 6px", color: "var(--color-text-secondary)", fontWeight: 500, textAlign: "start", borderBottom: "1px solid var(--color-border)" };
  const rmsNow = rmsOf(rows), rmsAfter = rmsOf(after);
  return (
    <div style={overlay}>
      <div role="dialog" aria-modal="true" aria-label={tr("Match a section image to the terrain")} onClick={(e) => e.stopPropagation()} style={{ width: "min(1060px, 96vw)", maxHeight: "92vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--color-border)" }}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text)" }}>{tr("Match a section image to the terrain")}</div>
            <div style={note}>{image.name}</div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>
        <div style={{ padding: 16, overflow: "auto", display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div>
            {bitmap ? <ImageTiePointCanvas image={{ bitmap, width: image.width, height: image.height }} points={picks} maxSize={640} overlayLines={lines} ariaLabel={tr("Click along the drawn topography line")}
              onAdd={(px, py) => setPicks((p) => [...p, { id: `tp_${Date.now()}_${p.length}`, px, py }])} onMove={(id, px, py) => setPicks((p) => p.map((x) => (x.id === id ? { ...x, px, py } : x)))} /> : <div style={note}>{tr("Loading…")}</div>}
            <div style={{ ...note, marginTop: 6 }}>{terrain ? tr("The green line is the terrain along this picture as it would stand with the typed adjustment; the dashed grey line is where it stands now.") : tr("No terrain is loaded (Maps > Terrain), so there is nothing to match to: the picture can still be moved by typing an offset.")}</div>
          </div>
          <div style={{ flex: 1, minWidth: 320, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={note}>{tr("Click along the topography line drawn on the picture (3 or more points, at its highs and lows). Each click is compared with the terrain under it.")}</div>
            {ve != null && <div style={note}>{tr("The picture's own vertical exaggeration is {ve} ×. GeoStrix places it in metres, so this is not applied; the 3D View's own VE stretches the picture and the terrain alike.", { ve: +ve.toFixed(2) })}</div>}
            {picks.length > 0 && (
              <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" }}>
                <thead><tr><th style={th}>#</th><th style={th}>{tr("Picture (m)")}</th><th style={th}>{tr("Terrain (m)")}</th><th style={th}>{tr("Terrain − picture (m)")}</th><th style={th} /></tr></thead>
                <tbody>{picks.map((p, i) => { const r = rows.find((x) => x.id === p.id); return (
                  <tr key={p.id}><td style={{ padding: "3px 6px" }}>{i + 1}</td>
                    <td style={{ padding: "3px 6px" }}>{r ? r.zImage.toFixed(1) : "—"}</td><td style={{ padding: "3px 6px" }}>{r ? r.zTerrain.toFixed(1) : tr("no terrain")}</td><td style={{ padding: "3px 6px" }}>{r ? r.diff.toFixed(1) : "—"}</td>
                    <td style={{ padding: "3px 6px" }}><Trash2 aria-label={tr("Remove this point")} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-danger-icon)" }} onClick={() => setPicks((q) => q.filter((x) => x.id !== p.id))} /></td></tr>); })}</tbody>
              </table>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => fit("offset")} disabled={!rows.length} style={btn(false)} title={tr("Move the whole picture up or down by the average difference.")}>{tr("Fit the height")}</button>
              <button type="button" onClick={() => fit("scale")} disabled={rows.length < 3} style={btn(false)} title={tr("Move it and stretch its heights about the clicks' average height, by least squares. Needs 3 clicks that differ in height by 5 m or more.")}>{tr("Fit the height and scale")}</button>
            </div>
            {msg && <div role="alert" style={{ ...note, color: "var(--color-danger-fg)" }}>{msg}</div>}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label style={note}>{tr("Vertical offset (m)")}{" "}<input type="number" step="any" value={offset} onChange={(e) => setOffset(e.target.value)} style={num} aria-label={tr("Vertical offset (m)")} /></label>
              <label style={note}>{tr("Vertical scale (%)")}{" "}<input type="number" step="any" min="1" value={scalePct} onChange={(e) => setScalePct(e.target.value)} style={num} aria-label={tr("Vertical scale (%)")} /></label>
            </div>
            {rmsNow != null && <div style={note}>{tr("Over {n} click(s) the picture is {before} m (root mean square) from the terrain; with this adjustment {after} m.", { n: rows.length, before: rmsNow.toFixed(1), after: rmsAfter == null ? "—" : rmsAfter.toFixed(1) })}</div>}
            {image.verticalAdjust && <div style={note}>{tr("Already adjusted: {offset} m, scale {scale} % (the corners it was georeferenced with are kept).", { offset: image.verticalAdjust.offset, scale: image.verticalAdjust.scalePct })}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button type="button" onClick={apply} disabled={!adj || (adj.offset === 0 && adj.scale === 1)} style={btn(true)}>{tr("Apply")}</button>
              {image.corners0 && <button type="button" onClick={reset} style={btn(false)} title={tr("Put the picture back at the heights it was georeferenced with.")}>{tr("Back to as georeferenced")}</button>}
              <button type="button" onClick={onClose} style={btn(false)}>{tr("Cancel")}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
