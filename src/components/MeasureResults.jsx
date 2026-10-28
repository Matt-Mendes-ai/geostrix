// TASKS.csv #1136 — moved out of ViewerModule (loaded on first use, not at startup)
import React from "react";
import { X } from "./icons.js";
import { activateOnKey } from "../lib/a11y.js";
import { t as tr } from "../lib/i18n.js";


// TASKS.csv #121 — measurement tool math. segmentStats mirrors buildSectionPayload's own azimuth
// formula exactly (Math.atan2(dx, dy), dx=east diff/dy=north diff, 0=N/90=E/clockwise) so a bearing
// read off a measurement matches the convention a drawn cross-section already uses elsewhere in this
// same file — one bearing convention across the whole app, not two that could disagree.
function segmentStats(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const horiz = Math.hypot(dx, dy);
  const dist3d = Math.hypot(dx, dy, dz);
  const azimuth = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  return { dist3d, horiz, vert: dz, azimuth };
}
// Plan-view (horizontal, x/y — elevation ignored) polygon area via the shoelace formula. Matches how
// a claim/target-spacing area is actually used in practice (a plan-view footprint), not a literal 3D
// surface area of a possibly-non-planar polygon, which wouldn't have one well-defined value anyway.
function polygonArea(pts) {
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
    a += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(a) / 2;
}
function polylineLength(pts, closeLoop) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (closeLoop && pts.length > 2) total += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  return total;
}
function fmtLen(m) {
  if (!Number.isFinite(m)) return "—";
  return m >= 1000 ? `${(m / 1000).toFixed(3)} km (${m.toFixed(1)} m)` : `${m.toFixed(2)} m`;
}
function fmtArea(m2) {
  if (!Number.isFinite(m2)) return "—";
  return m2 >= 10000 ? `${(m2 / 10000).toFixed(3)} ha (${m2.toFixed(0)} m²)` : `${m2.toFixed(1)} m²`;
}

// TASKS.csv #121 — live measurement readout, rendered inline in ViewToolbar's subtoolbar row (same
// spot the Buffer(m) control uses for sectionMode) rather than a positioned popover, so it stays
// visible and readable while the user keeps clicking points in the 3D view below — a popover the
// user would have to keep re-hovering the toolbar button to see would defeat the point of a LIVE
// running readout.
// TASKS.csv #121 follow-up — the tool used to be two separate toolbar buttons (Ruler=distance,
// Shapes=area); merged into one "Measure" button per the user's request ("we really only need one"),
// with a small Distance/Area pill pair here in the readout bar taking over the job of picking which
// kind of measurement is being taken. Switching pills clears any in-progress points (via
// onSwitchMode/switchMeasureMode) rather than trying to reinterpret an existing polyline as a polygon
// or vice versa, which would silently give a nonsense reading.
export default function MeasureResults({ mode, pts, onClear, onSwitchMode }) {
  const box = { display: "flex", alignItems: "center", gap: 10, marginLeft: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "5px 10px" };
  const clearBtn = { display: "flex", alignItems: "center", gap: 3, cursor: "pointer", color: "var(--color-danger-icon)", fontSize: "var(--font-size-sm)", flexShrink: 0 };
  const pillWrap = { display: "flex", alignItems: "center", gap: 2, background: "#e8eaed", borderRadius: 5, padding: 2, flexShrink: 0 };
  const pill = (active) => ({ padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontSize: "var(--font-size-sm)", color: active ? "var(--color-text)" : "var(--color-text-faint)", background: active ? "var(--color-bg)" : "transparent", boxShadow: active ? "0 1px 2px rgba(0,0,0,0.1)" : "none" });

  const modeSwitch = (
    <div style={pillWrap}>
      <span role="button" tabIndex={0} onKeyDown={activateOnKey} style={pill(mode === "distance")} onClick={() => onSwitchMode("distance")}>{tr("Distance")}</span>
      <span role="button" tabIndex={0} onKeyDown={activateOnKey} style={pill(mode === "area")} onClick={() => onSwitchMode("area")}>{tr("Area")}</span>
    </div>
  );

  if (mode === "distance") {
    if (pts.length < 2) {
      return (
        <div style={box}>
          {modeSwitch}
          <span>{pts.length === 0 ? tr("Click on the model to start measuring…") : tr("1 point placed — click to add the next.")}</span>
          {pts.length > 0 && <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={onClear} style={clearBtn}><X size={12} />{" "}{tr("Clear")}</span>}
        </div>
      );
    }
    const totalPath = polylineLength(pts, false);
    const straight = segmentStats(pts[0], pts[pts.length - 1]);
    const last = segmentStats(pts[pts.length - 2], pts[pts.length - 1]);
    return (
      <div style={box}>
        {modeSwitch}
        <span><b style={{ color: "var(--color-text)" }}>{tr("Total:")}</b> {fmtLen(totalPath)}</span>
        {pts.length > 2 && <span><b style={{ color: "var(--color-text)" }}>{tr("Straight-line:")}</b> {fmtLen(straight.dist3d)}</span>}
        <span><b style={{ color: "var(--color-text)" }}>{tr("Last segment:")}</b> {tr("{v} @ {azimuth}° (Δelev {v2}{vert} m)", { v: fmtLen(last.dist3d), azimuth: last.azimuth.toFixed(1), v2: last.vert >= 0 ? "+" : "", vert: last.vert.toFixed(1) })}</span>
        <span style={{ color: "var(--color-text-muted)" }}>{tr("{pts} pt(s)", { pts: pts.length })}</span>
        <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={onClear} style={clearBtn}><X size={12} />{" "}{tr("Clear")}</span>
      </div>
    );
  }

  // area mode
  if (pts.length < 3) {
    return (
      <div style={box}>
        {modeSwitch}
        <span>{tr("{pts} point(s) placed — need at least 3 to compute an area.", { pts: pts.length })}</span>
        {pts.length > 0 && <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={onClear} style={clearBtn}><X size={12} />{" "}{tr("Clear")}</span>}
      </div>
    );
  }
  const area = polygonArea(pts);
  const perimeter = polylineLength(pts, true);
  return (
    <div style={box}>
      {modeSwitch}
      <span><b style={{ color: "var(--color-text)" }}>{tr("Area:")}</b> {fmtArea(area)}</span>
      <span><b style={{ color: "var(--color-text)" }}>{tr("Perimeter:")}</b> {fmtLen(perimeter)}</span>
      <span style={{ color: "var(--color-text-muted)" }}>{tr("{pts} pt(s)", { pts: pts.length })}</span>
      <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={onClear} style={clearBtn}><X size={12} />{" "}{tr("Clear")}</span>
    </div>
  );
}
