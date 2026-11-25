// TASKS.csv #4004 (left by #3971) — the fence series' box on the Maps plan too: the same box as the 3D View's Slice series pane
// (viewerUiState.fenceArea, a box or the box round a boundary / claim), turned to the series azimuth (lib/fenceShare.js), its corners dragged or a
// new one drawn. Each change is sent to the 3D View (module action "fence-area"), which keeps and saves it, so both views show one box.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store.jsx";
import { requestModuleAction } from "../lib/menuRequests.js";
import { useFenceAzimuth } from "../lib/fenceShare.js";
import { areaBox, boxCorners, boxFromCorners, moveCorner } from "../lib/fenceBox.js";
import { colors } from "../lib/theme.js";
import { t as tr } from "../lib/i18n.js";

const fmtM = (m) => Math.round(m).toLocaleString();

// v: the plan's view { cx, cy, mPerPx }; size { w, h }. -> { button, overlay, status }
export function useFenceBoxOnPlan(v, size, buttonStyle, chipStyle) {
  const { viewerUiState, boundaries = [] } = useStore();
  const azimuth = useFenceAzimuth();
  const [on, setOn] = useState(false), [drawing, setDrawing] = useState(false), [draft, setDraft] = useState(null);
  const area = viewerUiState?.fenceArea || null;
  const saved = useMemo(() => areaBox(area, azimuth, boundaries), [area, azimuth, boundaries]);
  useEffect(() => { setDraft(null); }, [area]); // the 3D View has it: the draft gives way to the saved box
  const box = draft || saved;
  const svgRef = useRef(null), st = useRef(); st.current = { v, size, azimuth };
  const world = (e) => {
    const { v: vv, size: sz } = st.current, r = svgRef.current.getBoundingClientRect();
    return { x: vv.cx + (e.clientX - r.left - sz.w / 2) * vv.mPerPx, y: vv.cy - (e.clientY - r.top - sz.h / 2) * vv.mPerPx };
  };
  // a corner (0-3) dragged with the opposite one held, or (corner -1) a new box from the press to the pointer; one change sent on release
  const startDrag = (e, corner) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const start = world(e), from = box;
    let last = null;
    const onMove = (ev) => {
      const p = world(ev), az = st.current.azimuth;
      const b = corner >= 0 ? moveCorner(from, az, corner, p) : boxFromCorners(start, p, az);
      if (b.len > 1 && b.wid > 1) { last = b; setDraft(b); }
    };
    const onUp = (ev) => {
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp);
      onMove(ev);
      if (last) requestModuleAction("fence-area", { kind: "box", box: last });
      setDrawing(false);
    };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  };
  const toggle = () => { setOn((o) => !o); setDrawing(!on && !saved); setDraft(null); };
  const button = (
    <button data-btn-own="" onClick={toggle} aria-pressed={on} title={tr("The fence series' box (StrixViewer › Slice series)")} style={{ ...buttonStyle, border: `1px solid ${on ? "var(--color-selected-border)" : "var(--color-border)"}`, background: on ? "var(--color-selected-bg)" : "var(--color-bg)" }}>{tr("Fence box")}</button>
  );
  if (!on || !v) return { button, overlay: null, status: null };
  const X = (x) => size.w / 2 + (x - v.cx) / v.mPerPx, Y = (y) => size.h / 2 - (y - v.cy) / v.mPerPx;
  const cs = box ? boxCorners(box, azimuth).map((c) => [X(c.x), Y(c.y)]) : [];
  const overlay = (
    <svg ref={svgRef} width={size.w} height={size.h} data-fence-box-plan={box ? `${fmtM(box.len)}x${fmtM(box.wid)}` : ""} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
      {drawing && <rect width={size.w} height={size.h} fill="transparent" style={{ pointerEvents: "all", cursor: "crosshair" }} onMouseDown={(e) => startDrag(e, -1)} />}
      {cs.length > 0 && <polygon points={cs.map((p) => p.join(",")).join(" ")} fill="none" stroke={colors.primary} strokeWidth="2" />}
      {!drawing && cs.map(([x, y], i) => <circle key={i} data-fence-corner={i} cx={x} cy={y} r="6" fill={colors.primary} stroke="#fff" strokeWidth="1.5" style={{ pointerEvents: "all", cursor: "move" }} onMouseDown={(e) => startDrag(e, i)} />)}
    </svg>
  );
  const status = (
    <div role="status" aria-label={tr("Fence box")} style={{ ...chipStyle, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }} onMouseDown={(e) => e.stopPropagation()}>
      <span>{drawing || !box
        ? tr("Drag on the plan to draw the fence series' box, turned to its azimuth ({a}°).", { a: azimuth.toFixed(0) })
        : tr("Fence series box, {l} × {w} m at {a}°: drag a corner to change it.", { l: fmtM(box.len), w: fmtM(box.wid), a: azimuth.toFixed(0) })}</span>
      {!drawing && <button onClick={() => setDrawing(true)} className="gs-btn gs-btn--sm">{tr("Draw a box…")}</button>}
    </div>
  );
  return { button, overlay, status };
}
