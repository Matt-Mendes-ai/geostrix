import React, { useMemo, useState } from "react";
import { Crosshair, GitCompareArrows } from "lucide-react";
import { solveOrientationToTarget, missDistanceToTarget, comparePlannedToActual } from "../lib/holePlanning.js";
import { desurveyHole } from "../lib/desurvey.js";
import { useStore } from "../lib/store.jsx";

// TASKS.csv #119 — the two planning tools #188 did not build, rendered inside an expanded planned-hole
// row in the Targeting sidebar. Deliberately a SEPARATE component file rather than more code inside
// ViewerModule.jsx (~380 KB): the only change needed there is one <PlannedHoleTargeting/> line inside
// PlannedHoleRow, which keeps this feature out of the way of everything else editing that file.
//
// Both tools store their inputs ON the planned hole itself (`target`, `asDrilledHoleId`) via the same
// onUpdate patch every other field in the row uses. plannedHoles round-trips through the project file
// wholesale (store.jsx snapshotCurrentPayload/loadProjectPayload, TASKS.csv #188), so these new keys
// persist with no store schema change — and a pre-#119 planned hole simply has neither key, which
// both panels below treat as "not configured yet" rather than an error.
//
// DIP SIGN: everything here stays in the user-facing NEGATIVE-below-horizontal convention, matching
// plannedHoles.dip and the form fields beside it. solveOrientationToTarget returns that convention
// directly (see holePlanning.js's header) so the solved value is written straight through.

const fieldWrap = { flex: 1, display: "flex", flexDirection: "column", gap: 3, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" };
const inputStyle = { width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "4px 5px", fontSize: "var(--font-size-sm)", color: "var(--color-text)" };
const btn = { display: "flex", alignItems: "center", justifyContent: "center", gap: 5, width: "100%", padding: "5px 8px", borderRadius: 5, border: "1px solid var(--color-border-light)", background: "var(--color-bg-subtle)", color: "var(--color-text)", fontSize: "var(--font-size-sm)", cursor: "pointer" };
const sectionHdr = { fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 5 };
const rowStyle = { display: "flex", gap: 4, marginBottom: 5 };

function TargetField({ label, value, onChange }) {
  return (
    <label style={fieldWrap}>
      {label}
      <input
        type="number" value={value ?? ""} placeholder="—"
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        style={inputStyle}
      />
    </label>
  );
}

export default function PlannedHoleTargeting({ hole, onUpdate, plannedPts, collars, survey }) {
  const { desurveyMethod } = useStore(); // TASKS.csv #135 — the as-drilled trace must match the 3D view
  const [tab, setTab] = useState(null); // null | "target" | "actual"

  const target = hole.target || null;
  const targetComplete = target && Number.isFinite(target.x) && Number.isFinite(target.y) && Number.isFinite(target.z);
  const setTarget = (patch) => onUpdate(hole.id, { target: { ...(hole.target || {}), ...patch } });

  const solved = useMemo(
    () => (targetComplete ? solveOrientationToTarget({ x: hole.x, y: hole.y, z: hole.z }, target) : null),
    [targetComplete, hole.x, hole.y, hole.z, target?.x, target?.y, target?.z]
  );
  // How close does the plan AS IT STANDS get? This is the number that tells you whether applying the
  // solved orientation would actually change anything — after "Apply" it drops to ~0.
  const miss = useMemo(
    () => (targetComplete && plannedPts?.length ? missDistanceToTarget(plannedPts, target) : null),
    [targetComplete, plannedPts, target?.x, target?.y, target?.z]
  );

  const applySolved = () => {
    if (!solved) return;
    // Rounded to 0.1 deg / 0.1 m: a rig cannot be set up to 9 decimal places, and an unrounded value
    // makes the row's own readout look like spurious precision. The residual miss this introduces is
    // sub-decimetre over a few hundred metres and is shown live by `miss` above.
    onUpdate(hole.id, {
      azimuth: Math.round(solved.azimuth * 10) / 10,
      dip: Math.round(solved.dip * 10) / 10,
      length: Math.round(solved.length * 10) / 10,
    });
  };

  // ---- planned vs as-drilled -------------------------------------------------------------------
  const drilledId = hole.asDrilledHoleId || "";
  const comparison = useMemo(() => {
    if (!drilledId || !plannedPts?.length) return null;
    const collar = (collars || []).find((c) => c.hole_id === drilledId);
    if (!collar) return null;
    const hs = (survey || []).filter((s) => s.hole_id === drilledId && !isNaN(s.depth));
    const actual = desurveyHole(collar, hs, desurveyMethod); // #135 — project's method, not a hardcoded one
    if (!actual.length) return null;
    return { ...comparePlannedToActual(plannedPts, actual), stations: hs.length };
  }, [drilledId, plannedPts, collars, survey, desurveyMethod]);

  const tabBtn = (id, label, Icon) => (
    <button
      onClick={() => setTab((t) => (t === id ? null : id))}
      style={{ ...btn, background: tab === id ? "#e3ecf5" : "var(--color-bg-subtle)", borderColor: tab === id ? "var(--color-selected-border)" : "var(--color-border-light)" }}
    >
      <Icon size={12} /> {label}
    </button>
  );

  return (
    <div style={{ marginTop: 6, borderTop: "1px solid var(--color-divider)", paddingTop: 6 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: tab ? 7 : 0 }}>
        {tabBtn("target", "Target", Crosshair)}
        {tabBtn("actual", "As-drilled", GitCompareArrows)}
      </div>

      {tab === "target" && (
        <div>
          <div style={sectionHdr}>Drill to a target point</div>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>
            {/* The add form above (TASKS.csv #188) can solve a target when a hole is first created, but
                only then, and it keeps nothing. This does it for a hole that already exists — the target
                is SAVED on the hole, so the miss readout stays live while you nudge the collar or angles. */}
            The 3D point you want this hole to reach — a modelled contact, a voxel anomaly centre, a projected
            intercept. The target is saved with the hole, so the miss distance below stays live as you edit
            the collar or angles above. A straight hole reaches any point at exactly its straight-line
            distance, so the solved orientation is also the shallowest way there.
          </div>
          <div style={rowStyle}>
            <TargetField label="Target E" value={target?.x} onChange={(v) => setTarget({ x: v })} />
            <TargetField label="Target N" value={target?.y} onChange={(v) => setTarget({ y: v })} />
            <TargetField label="Target Elev" value={target?.z} onChange={(v) => setTarget({ z: v })} />
          </div>
          {!targetComplete ? (
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>Fill in all three coordinates to solve.</div>
          ) : !solved ? (
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger-text)" }}>The target is the collar itself — no direction is defined.</div>
          ) : (
            <div>
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)", marginBottom: 4, lineHeight: 1.5 }}>
                Solved: <b>Az {solved.azimuth.toFixed(1)}°</b> / <b>Dip {solved.dip.toFixed(1)}°</b> / <b>{solved.length.toFixed(1)} m</b>
                <div style={{ color: "var(--color-text-caption)" }}>
                  {solved.horizontal.toFixed(1)} m horizontal, {Math.abs(solved.vertical).toFixed(1)} m {solved.vertical >= 0 ? "below" : "above"} the collar
                </div>
                {solved.dip > 0 && (
                  <div style={{ color: "var(--color-danger-text)" }}>This target is ABOVE the collar — the solved dip is an uphole.</div>
                )}
              </div>
              {miss && (
                <div style={{ fontSize: "var(--font-size-sm)", color: miss.distance < 1 ? "#3f8f5f" : "#c08a3c", marginBottom: 5 }}>
                  Current plan misses by {miss.distance.toFixed(1)} m
                  {miss.distance >= 1 && miss.beyondToe ? " — right direction, but the hole is too short." : ""}
                  {miss.distance < 1 ? " — on target." : ""}
                </div>
              )}
              <button onClick={applySolved} style={{ ...btn, background: "#e3ecf5", borderColor: "var(--color-selected-border)" }}>
                Apply solved orientation to this hole
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "actual" && (
        <div>
          <div style={sectionHdr}>Planned vs. as-drilled</div>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>
            Once this hole has been drilled and its collar + survey imported, link it here to see how far the
            real hole wandered from the design.
          </div>
          <select
            value={drilledId}
            onChange={(e) => onUpdate(hole.id, { asDrilledHoleId: e.target.value || null })}
            style={{ ...inputStyle, marginBottom: 6, cursor: "pointer" }}
          >
            <option value="">— not drilled yet —</option>
            {(collars || []).map((c) => <option key={c.hole_id} value={c.hole_id}>{c.hole_id}</option>)}
          </select>
          {drilledId && !comparison && (
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger-text)" }}>Couldn't build a trace for {drilledId} — check it has a collar with a usable azimuth/dip.</div>
          )}
          {comparison && (
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)", lineHeight: 1.6 }}>
              <div>Collar offset: <b>{comparison.collarOffset.toFixed(1)} m</b></div>
              <div>Toe offset: <b>{comparison.toeOffset.toFixed(1)} m</b></div>
              <div>Max separation: <b>{comparison.maxSeparation.toFixed(1)} m</b> at {comparison.maxSeparationMd.toFixed(0)} m (mean {comparison.meanSeparation.toFixed(1)} m)</div>
              <div>
                Length: planned {comparison.plannedLength.toFixed(0)} m, drilled {comparison.actualLength.toFixed(0)} m
                {Math.abs(comparison.lengthDiff) >= 0.5 && (
                  <span style={{ color: "#c08a3c" }}> ({comparison.lengthDiff > 0 ? "+" : ""}{comparison.lengthDiff.toFixed(0)} m)</span>
                )}
              </div>
              {comparison.azimuthDiff != null && (
                <div>Attitude drift at {comparison.sharedDepth.toFixed(0)} m: Az {comparison.azimuthDiff > 0 ? "+" : ""}{comparison.azimuthDiff.toFixed(1)}°, Dip {comparison.dipDiff > 0 ? "+" : ""}{comparison.dipDiff.toFixed(1)}°</div>
              )}
              <div style={{ color: "var(--color-text-muted)", marginTop: 3 }}>
                {/* Separation is measured only over the depth the two holes SHARE (see holePlanning.js) so a
                    hole drilled deeper or shallower than planned doesn't manufacture a false deviation. */}
                Separation measured over the shared {comparison.sharedDepth.toFixed(0)} m
                {comparison.stations === 0
                  ? " · no survey stations — the as-drilled trace is a straight line from its collar."
                  : ` · ${comparison.stations} survey station${comparison.stations === 1 ? "" : "s"}.`}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
