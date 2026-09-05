// TASKS.csv #145 — the sculpt controls that appear inside a generated surface's expanded row.
//
// Presentational only: every piece of state and all of the geometry work lives in
// src/lib/useSculpt.js (which in turn calls the verified maths in src/lib/sculpt.js). Kept out of
// ViewerModule.jsx so that file grows by one JSX element rather than a hundred lines.
import React from "react";
import { Hand, Undo2, Check, X as XIcon } from "lucide-react";

const num = (v, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: d }));

export default function SculptPanel({ surface, sculpt, pBtn, smallSel }) {
  const active = sculpt.targetId === surface.id;
  const info = active ? sculpt.anchorInfo : null;
  const edits = surface.edits || [];

  return (
    <div style={{ marginTop: 10, borderTop: "1px solid var(--color-divider)", paddingTop: 8 }}>
      <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginBottom: 4 }}>Manual editing (sculpt)</div>

      {/* Provenance, stated where the geologist works, not only in the export file. */}
      {surface.editCount > 0 && (
        <div style={{ fontSize: 10, color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 5, padding: "6px 7px", marginBottom: 6, lineHeight: 1.45 }}>
          <strong>This surface has been hand-edited.</strong> {surface.editCount} manual edit{surface.editCount === 1 ? "" : "s"} applied
          after generation, so it is no longer purely the output of the parameters listed above. Every
          mesh export of it carries the same statement. Last edit{" "}
          {edits.length ? new Date(edits[edits.length - 1].at).toLocaleString() : "—"}
          {edits.length > 0 && (
            <span>
              {" "}({num(edits[edits.length - 1].offsetM, 2)} m {edits[edits.length - 1].axis === "vertical" ? "vertical" : "along the normal"},
              {" "}{edits[edits.length - 1].radiusM} m brush, {edits[edits.length - 1].verticesMoved.toLocaleString()} vertices).
            </span>
          )}
          {" "}Cumulative volume change across all edits:{" "}
          <strong>
            {edits.length
              ? `${edits[edits.length - 1].volumeAfterM3 - edits[0].volumeBeforeM3 >= 0 ? "+" : ""}${num(edits[edits.length - 1].volumeAfterM3 - edits[0].volumeBeforeM3, 0)} m³`
              : "—"}
          </strong>{" "}
          from {num(edits.length ? edits[0].volumeBeforeM3 : null, 0)} m³ as generated. The volume and tonnage
          above are recomputed from the edited mesh, not carried over.
        </div>
      )}

      {!active ? (
        <button
          onClick={() => sculpt.begin(surface.id)}
          disabled={!!sculpt.targetId}
          style={{ ...pBtn, marginBottom: 0, opacity: sculpt.targetId ? 0.5 : 1, cursor: sculpt.targetId ? "default" : "pointer" }}
          title="Locally correct this surface: click a point on it in the 3D view and nudge that patch, with a smooth falloff so the neighbours follow."
        ><Hand size={12} /> Sculpt this surface</button>
      ) : (
        <div style={{ background: "#eef3fa", border: "1px solid #c3d3e8", borderRadius: 5, padding: "7px 8px" }}>
          <div style={{ fontSize: 10.5, color: "var(--color-text)", marginBottom: 6, lineHeight: 1.45 }}>
            {info
              ? <>Brush placed at <strong>{num(info.world.x, 1)} E / {num(info.world.y, 1)} N / {num(info.world.z, 1)} m</strong>. Click elsewhere on the surface to move it.</>
              : <>Click on this surface in the 3D view to place the brush.</>}
          </div>

          <label style={{ fontSize: 10, color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <span style={{ width: 96, flexShrink: 0 }}>Brush radius (m)</span>
            <input type="number" min={0.1} step={1} value={sculpt.radius}
              onChange={(e) => sculpt.setRadius(e.target.value)} style={{ ...smallSel, width: 70 }} />
          </label>

          <label style={{ fontSize: 10, color: "var(--color-text-secondary)", display: "block", marginBottom: 5 }}>
            <span style={{ display: "block", marginBottom: 3 }}>Direction</span>
            <select value={sculpt.axis} onChange={(e) => sculpt.setAxis(e.target.value)} style={{ ...smallSel, width: "100%" }}>
              <option value="normal">Along the surface normal (outward positive)</option>
              <option value="vertical">Vertical / elevation (up positive)</option>
            </select>
          </label>

          <label style={{ fontSize: 10, color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ width: 96, flexShrink: 0 }}>Offset (m)</span>
            <input type="number" step={0.5} value={sculpt.offset} disabled={!info}
              onChange={(e) => sculpt.setOffset(e.target.value)} style={{ ...smallSel, width: 70 }} />
          </label>
          <input
            type="range" min={-50} max={50} step={0.25} value={sculpt.offset} disabled={!info}
            onChange={(e) => sculpt.setOffset(e.target.value)}
            style={{ width: "100%", marginBottom: 6 }}
          />

          {info && (
            <div style={{ fontSize: 9.5, color: "var(--color-text-secondary)", lineHeight: 1.5, marginBottom: 6 }}>
              {info.vertices.toLocaleString()} of {info.totalVertices.toLocaleString()} vertices under the brush
              ({info.triangles.toLocaleString()} triangles). Falloff is smooth to zero at the rim, so the
              patch bends rather than spiking. Brush built in {info.buildMs} ms.
              <div style={{ marginTop: 3 }}>
                Live volume change: <strong style={{ color: info.dV === 0 ? "var(--color-text-secondary)" : "var(--color-text)" }}>
                  {info.dV >= 0 ? "+" : ""}{num(info.dV, 0)} m³
                </strong> (exact, not an estimate — computed over the affected triangles only)
              </div>
            </div>
          )}
          {info && info.flipped > 0 && (
            <div style={{ fontSize: 10, color: "#8a3030", background: "#fbeeee", border: "1px solid #e6c4c4", borderRadius: 5, padding: "5px 6px", marginBottom: 6, lineHeight: 1.45 }}>
              <strong>{info.flipped} triangle{info.flipped === 1 ? " is" : "s are"} now inside out.</strong> This offset
              has pushed the patch through the surface. The mesh will still report as watertight (nothing
              about its connectivity changed) but the enclosed volume — and therefore any tonnage — is no
              longer meaningful. Reduce the offset or widen the radius.
            </div>
          )}

          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={sculpt.apply} disabled={!info || !sculpt.offset}
              style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, padding: "5px 6px", fontSize: 10.5, opacity: info && sculpt.offset ? 1 : 0.5 }}
              title="Commit this edit to the surface"><Check size={11} /> Apply</button>
            <button onClick={sculpt.cancelAnchor} disabled={!info}
              style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, padding: "5px 6px", fontSize: 10.5, opacity: info ? 1 : 0.5 }}
              title="Discard the preview and put the surface back">Discard</button>
            <button onClick={() => sculpt.undo(surface.id)} disabled={!sculpt.historyDepth}
              style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, padding: "5px 6px", fontSize: 10.5, opacity: sculpt.historyDepth ? 1 : 0.5 }}
              title="Undo the last applied sculpt on this surface (session-local history)"><Undo2 size={11} /> Undo ({sculpt.historyDepth})</button>
            <button onClick={sculpt.end}
              style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "5px 8px", fontSize: 10.5 }}
              title="Leave sculpt mode"><XIcon size={11} /></button>
          </div>

          <div style={{ fontSize: 9.5, color: "var(--color-text-muted)", marginTop: 6, lineHeight: 1.45 }}>
            Moving vertices never changes which triangles share which edges, so a watertight shell stays
            watertight and an open surface stays exactly as open as it was. Undo history is for this
            session only — once the project is saved, an edit is permanent (and coordinates round to 1 cm
            in the project file). Vertex/triangle deletion and pinning are not implemented — see TASKS.csv #145.
          </div>
        </div>
      )}
    </div>
  );
}
