import React, { useEffect, useMemo, useState } from "react";
import { Trash2 } from "./icons.js";
import ImageTiePointCanvas from "./ImageTiePointCanvas.jsx";
import StepDialog, { stepDialogStyles } from "./StepDialog.jsx"; // TASKS.csv #4073 — the shared step shell (Escape and the focus trap, #238)
import { overlay } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";
import { adjustCorners, adjustedImage, terrainProfilePx, topoPicks, fitVertical, typedAdjustment, imageVE, imageFrame } from "../lib/sectionVertical.js";
import { warpPlan, warpedCorners, sourceRow } from "../lib/sectionWarp.js"; // TASKS.csv #3929
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import NumberInput from "./NumberInput.jsx"; // TASKS.csv #3926 — '0,05' and '0.05' both read

// TASKS.csv #3880 (a GeoStrix user, via Matt, 2026-11-17) — "Match to terrain": a georeferenced section image stands at the heights its control points were typed with, and its own drawn topography
// line could float above the draped terrain with nothing to correct it. Here the user clicks along that DRAWN line; each click is compared with the terrain under it (the terrain's profile along the
// picture is drawn over it too), and the height (or the height and the vertical scale) that brings the two together is fitted, or an offset and a scale are typed. Only the picture's heights change; its place
// along the section line does not. The corners it was georeferenced with are kept, so it can be put back.
const round2 = (v) => Math.round(v * 100) / 100;
// TASKS.csv #3929 — the picture resampled along the warp (lib/sectionWarp.js): column by column, each destination row reads its source row (nearest
// pixel). The margins the bends need are transparent, so the result is a PNG whatever the picture was.
function warpedDataUrl(bitmap, plan) {
  const src = document.createElement("canvas"); src.width = plan.W; src.height = plan.H;
  const sc = src.getContext("2d"); sc.drawImage(bitmap, 0, 0, plan.W, plan.H);
  const from = sc.getImageData(0, 0, plan.W, plan.H).data;
  const out = document.createElement("canvas"); out.width = plan.W; out.height = plan.newH;
  const oc = out.getContext("2d"), img = oc.createImageData(plan.W, plan.newH), to = img.data;
  for (let x = 0; x < plan.W; x++) for (let d = 0; d < plan.newH; d++) {
    const y = sourceRow(plan, x + 0.5, d);
    if (y == null) continue;
    const si = (Math.min(plan.H - 1, Math.round(y)) * plan.W + x) * 4, di = (d * plan.W + x) * 4;
    to[di] = from[si]; to[di + 1] = from[si + 1]; to[di + 2] = from[si + 2]; to[di + 3] = from[si + 3];
  }
  oc.putImageData(img, 0, 0);
  return out.toDataURL("image/png");
}
export default function SectionImageVerticalModal({ image, terrain, onApply, onClose }) {
  const [at, setAt] = useState(0); // TASKS.csv #4073 — the step on screen
  const [bitmap, setBitmap] = useState(null);
  const [picks, setPicks] = useState([]);
  const [offset, setOffset] = useState("0");
  const [scalePct, setScalePct] = useState("100");
  const [pivot, setPivot] = useState(null);
  const [msg, setMsg] = useState("");
  // TASKS.csv #3929 — "Fit at each point": the warp's plan, and how far below the drawn ground the bend reaches (a fifth of the picture's height to start)
  const [warp, setWarp] = useState(null);
  const fr = imageFrame(image), pictureM = fr ? Math.abs(fr.zTL - fr.zBL) : 0;
  const [depthM, setDepthM] = useState(() => String(Math.max(1, Math.round(pictureM / 5))));
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
    setMsg(""); setWarp(null); setOffset(String(round2(f.offset))); setScalePct(String(round2(f.scale * 100))); setPivot(f.pivot);
  };
  const fitEach = () => {
    const w = warpPlan(image, rows, { depthM: Number(depthM) });
    if (w.error) { setMsg(tr(w.error)); setWarp(null); return; }
    setMsg(""); setWarp(w);
  };
  const applyWarp = () => {
    if (!warp || !bitmap) return;
    onApply({ corners: warpedCorners(image, warp), dataUrl: warpedDataUrl(bitmap, warp), width: warp.W, height: warp.newH,
      corners0: image.corners0 || image.corners, dataUrl0: image.dataUrl0 || image.dataUrl, width0: image.width0 ?? image.width, height0: image.height0 ?? image.height,
      verticalAdjust: { warp: { points: warp.n, meanM: round2(warp.mean), maxBendM: round2(warp.maxBendM), depthM: round2(warp.depthM) }, at: new Date().toISOString().slice(0, 10) } });
    onClose();
  };
  const apply = () => {
    if (!adj) return;
    onApply({ corners: adjustCorners(image.corners, adj), corners0: image.corners0 || image.corners, verticalAdjust: { offset: round2(adj.offset), scalePct: round2(adj.scale * 100), at: new Date().toISOString().slice(0, 10) } });
    onClose();
  };
  // back to the picture as georeferenced: its corners and, after a fit at each point (#3929), its own bitmap and size
  const reset = () => { if (image.corners0) { onApply({ corners: image.corners0, corners0: null, verticalAdjust: null, ...(image.dataUrl0 ? { dataUrl: image.dataUrl0, width: image.width0, height: image.height0, dataUrl0: null, width0: null, height0: null } : {}) }); onClose(); } };
  const num = { width: 90, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" };
  const th = { padding: "3px 6px", color: "var(--color-text-secondary)", fontWeight: 500, textAlign: "start", borderBottom: "1px solid var(--color-border)" };
  const rmsNow = rmsOf(rows), rmsAfter = rmsOf(after);
  // TASKS.csv #4073 (Matt: "similar for all pop up windows") — two steps: 1 Points (click along the drawn ground line), 2 Fit (fit or type the
  // adjustment, then Apply). The picture is on both, so the green line shows the fit; the long explanations are in the Help card
  const picture = () => (
    <div>
      {bitmap ? <ImageTiePointCanvas image={{ bitmap, width: image.width, height: image.height }} points={picks} maxSize={640} overlayLines={lines} ariaLabel={tr("Click along the drawn topography line")}
        onAdd={(px, py) => setPicks((p) => [...p, { id: `tp_${Date.now()}_${p.length}`, px, py }])} onMove={(id, px, py) => setPicks((p) => p.map((x) => (x.id === id ? { ...x, px, py } : x)))} /> : <div style={note}>{tr("Loading…")}</div>}
      {/* no terrain: said where you are (there is nothing to match to), with the way that still works */}
      <div style={{ ...note, marginTop: 6 }}>{terrain ? tr("Green: with the adjustment. Dashed grey: now.") : tr("No terrain loaded: type an offset instead.")}</div>
    </div>
  );
  const heading = tr("Match to terrain");
  const help = (
    <details open>
      <summary style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: 4 }}>{heading}</summary>
      <div style={note}>{tr("Click along the topography line drawn on the picture (3 or more points, at its highs and lows). Each click is compared with the terrain under it.")}</div>
      <div style={{ ...note, marginTop: 6 }}>{tr("Green: the terrain along this picture with the typed adjustment. Dashed grey: where it stands now.")}</div>
      <div style={{ ...note, marginTop: 6 }}>{tr("No terrain is loaded (Maps > Terrain), so there is nothing to match to: the picture can still be moved by typing an offset.")}</div>
      <div style={{ ...note, marginTop: 6 }}>{tr("Fit at each point bends the picture so its drawn ground meets the terrain at every click, fading out at the bend depth below the drawn ground, so holes drawn deeper stay straight.")}</div>
      <div style={{ ...note, marginTop: 6 }}>{tr("Only the picture's heights change; its place along the section line does not. The corners it was georeferenced with are kept, so Back to as georeferenced puts it back.")}</div>
      <div style={{ ...note, marginTop: 6 }}>{tr("A picture's own vertical exaggeration is not applied: GeoStrix places it in metres, and the 3D view's own VE stretches the picture and the terrain alike.")}</div>
    </details>
  );
  // the clicks' table: on both steps, so the fit's 'Off the trend' column is read beside the fit
  const clicks = () => (<>
    {picks.length > 0 && (
      <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" }}>
        <thead><tr><th style={th}>#</th><th style={th}>{tr("Picture (m)")}</th><th style={th}>{tr("Terrain (m)")}</th><th style={th}>{tr("Terrain − picture (m)")}</th>{warp && <th style={th} title={tr("How far the click sits from the straight trend through all the clicks: the bend the fit makes there. A large one marks a click off the drawn line.")}>{tr("Off the trend (m)")}</th>}<th style={th} /></tr></thead>
        <tbody>{picks.map((p, i) => { const r = rows.find((x) => x.id === p.id); return (
          <tr key={p.id}><td style={{ padding: "3px 6px" }}>{i + 1}</td>
            <td style={{ padding: "3px 6px" }}>{r ? r.zImage.toFixed(1) : "—"}</td><td style={{ padding: "3px 6px" }}>{r ? r.zTerrain.toFixed(1) : tr("no terrain")}</td><td style={{ padding: "3px 6px" }}>{r ? r.diff.toFixed(1) : "—"}</td>{warp && <td style={{ padding: "3px 6px" }}>{(() => { const q = warp.residuals.find((x) => x.id === p.id); return q ? q.offTrendM.toFixed(1) : "—"; })()}</td>}
            <td style={{ padding: "3px 6px" }}><Trash2 aria-label={tr("Remove this point")} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-danger-icon)" }} onClick={() => setPicks((q) => q.filter((x) => x.id !== p.id))} /></td></tr>); })}</tbody>
      </table>
    )}
  </>);
  const steps = [
    { key: "points", label: tr("Points"), primary: { label: tr("Next") }, render: () => (<>
      {picture()}
      <div style={{ flex: 1, minWidth: 320, display: "flex", flexDirection: "column", gap: 8 }}>
        {image.name && <div style={{ ...note, fontWeight: 600 }}>{image.name}</div>}
        <div style={note}>{tr("Click along the drawn ground line, at its highs and lows.")}</div>
        {/* the picture's VE is dropped, not applied: said in one line where the clicks are made */}
        {ve != null && <div style={note}>{tr("Its {ve} × vertical exaggeration is not applied.", { ve: +ve.toFixed(2) })}</div>}
        {clicks()}
      </div>
    </>) },
    { key: "fit", label: tr("Fit"), primary: warp ? { label: tr("Apply the fit at each point"), onClick: applyWarp, disabled: !bitmap } : { label: tr("Apply"), onClick: apply, disabled: !adj || (adj.offset === 0 && adj.scale === 1) }, render: () => (<>
      {picture()}
      <div style={{ flex: 1, minWidth: 320, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => fit("offset")} disabled={!rows.length} className="gs-btn" title={tr("Move the whole picture up or down by the average difference.")}>{tr("Fit the height")}</button>
          <button type="button" onClick={() => fit("scale")} disabled={rows.length < 3} className="gs-btn" title={tr("Move it and stretch its heights about the clicks' mean height (least squares). Needs 3 clicks that differ in height by 5 m or more.")}>{tr("Fit the height and scale")}</button>
          <button type="button" onClick={fitEach} disabled={rows.length < 2} className="gs-btn" title={tr("Bend the picture so its drawn ground meets the terrain at every click, for a drawing not to scale throughout. The terrain is not changed.")}>{tr("Fit at each point")}</button>
        </div>
        <label style={note}>{tr("Bend depth (m)")}{" "}<NumberInput min={1} value={depthM === "" ? null : depthM} onChange={(v) => { setDepthM(String(v)); setWarp(null); }} style={num} aria-label={tr("Bend depth (m)")} /></label>
        {warp && <div role="status" style={note}>{tr("Moves {mean} m, bends up to {bend} m, fading out {depth} m below the ground: it meets the terrain at all {n} clicks.", { mean: round2(warp.mean), bend: round2(warp.maxBendM), depth: round2(warp.depthM), n: warp.n })}{warp.depthM > Number(depthM) + 0.5 ? " " + tr("Depth raised to {d} m so the picture does not fold.", { d: round2(warp.depthM) }) : ""}</div>}
        {msg && <div role="alert" style={{ ...note, color: "var(--color-danger-fg)" }}>{msg}</div>}
        {clicks()}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={note}>{tr("Vertical offset (m)")}{" "}<NumberInput allowEmpty value={offset === "" ? null : offset} onChange={(v) => { setOffset(v == null ? "" : String(v)); setWarp(null); }} style={num} aria-label={tr("Vertical offset (m)")} /></label>
          <label style={note}>{tr("Vertical scale (%)")}{" "}<NumberInput min={1} value={scalePct === "" ? null : scalePct} onChange={(v) => { setScalePct(String(v)); setWarp(null); }} style={num} aria-label={tr("Vertical scale (%)")} /></label>
        </div>
        {rmsNow != null && <div style={note}>{tr("Misfit (RMS, {n} click(s)): {before} m now, {after} m after.", { n: rows.length, before: rmsNow.toFixed(1), after: rmsAfter == null ? "—" : rmsAfter.toFixed(1) })}</div>}
        {image.verticalAdjust?.warp && <div style={note}>{tr("Already fitted at {n} points (bends up to {b} m).", { n: image.verticalAdjust.warp.points, b: image.verticalAdjust.warp.maxBendM })}</div>}
        {image.verticalAdjust && !image.verticalAdjust.warp && <div style={note}>{tr("Already adjusted: {offset} m, scale {scale} %.", { offset: image.verticalAdjust.offset, scale: image.verticalAdjust.scalePct })}</div>}
        {image.corners0 && <button type="button" onClick={reset} className="gs-btn" style={{ alignSelf: "flex-start" }} title={tr("Put the picture back at the heights it was georeferenced with.")}>{tr("Back to as georeferenced")}</button>}
      </div>
    </>) },
  ];
  // anchored at the top (overlayProps' style): the table of clicks grows, and a centred box moved the picture under the cursor between two clicks
  return <StepDialog title={heading} onClose={onClose} steps={steps} at={at} onAt={setAt} help={help} width="min(1060px, 96vw)" overlayProps={{ style: { ...overlay, alignItems: "flex-start", paddingTop: "4vh" } }} />;
}

const { note } = stepDialogStyles;
