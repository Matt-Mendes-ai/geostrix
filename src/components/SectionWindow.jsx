import React, { useEffect, useState, useRef } from "react";
import { Camera, Pencil, Check, Undo2, X, Save, Download, FileText } from "lucide-react";
import { onSectionData, sendSectionSnapshot, sendSectionContacts, saveFile, savePDF } from "../lib/desktop.js";

const SECTION_W = 1100, SECTION_H = 660;

// TASKS.csv — cross-section contact drawing. A first pass at "let the user draw where the lith
// contacts should be" on a cross-section, so a later pass can feed those interpreted 2D contacts into
// 3D surface generation as extra control points (currently only litho/alt interval tops feed a
// surface — see gatherLithoSurfaceSpec in ViewerModule.jsx). This window is a separate Electron
// renderer (or a plain browser tab in dev) with no shared React store, so drawn contacts are held here
// locally and relayed back to the main window's store.sections via sendSectionContacts (see
// electron/main.js "section-contacts" and App.jsx's onSectionContacts) — mirrors the existing
// "Snapshot to Layout" relay pattern exactly.
const CONTACT_PALETTE = ["#c98a5a", "#4a6b4a", "#6b7a8a", "#c0392b", "#8a3a3a", "#d4b06a", "#3a8a8a", "#7a9e6a", "#e2a63c", "#7a5ac9"];
function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return CONTACT_PALETTE[Math.abs(h) % CONTACT_PALETTE.length];
}

export default function SectionWindow() {
  const [data, setData] = useState(null);
  const [snapped, setSnapped] = useState(false);
  const [saved, setSaved] = useState(false);
  const svgRef = useRef(null);

  // Finished contacts + the in-progress polyline being drawn. Both keyed in section-local/world coords
  // (l = distance along the section line in meters, z = elevation, x/y = world easting/northing) — see
  // store.jsx's `sections` comment for why, in short: real-world units survive a later reopen with a
  // different visible-hole set intact, unlike screen-relative fractions would.
  const [contacts, setContacts] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState([]);

  // TASKS.csv #15 — vertical exaggeration. 1x means the vertical (elevation) scale matches the
  // horizontal (distance-along-section) scale exactly — true 1:1 — computed from the section's own
  // real-world width (SECTION_W maps to `maxL` meters) so "1x" means something real, not just
  // "however tall SectionSVG's old fixed box happened to make it look". >1 stretches the vertical axis
  // (subtle dips/steps in contacts and drillhole traces become easier to read); <1 compresses it. The
  // page height itself grows/shrinks with the exaggerated z-range rather than squeezing a fixed box,
  // since faking exaggeration inside a fixed box would just be a different, undisclosed distortion.
  const [vExag, setVExag] = useState(1);

  // Layout's "assign a scale bar" feature (mirrors the existing viewport worldHeightAtTarget pattern —
  // see LayoutModule.jsx's onSyncScaleBar) needs to know the true real-world scale of whatever gets
  // snapshotted, so a scale bar can be computed/re-derived even after the image is resized on the page.
  // SectionSVG computes hScale (px per real meter along the section, viewBox units) fresh every render
  // — mirrored into this ref (not state; a plain read at snapshot time, no need to re-render this
  // component when it changes) so snapshotToLayout below can convert the captured pixel width into a
  // real-world width in meters.
  const geomRef = useRef({ hScale: 1 });

  useEffect(() => {
    const off = onSectionData((d) => { setData(d); setContacts(d.contacts || []); });
    const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
    const id = params.get("id");
    if (id) {
      const raw = sessionStorage.getItem(id);
      if (raw) { const d = JSON.parse(raw); setData(d); setContacts(d.contacts || []); }
    }
    return off;
  }, []);

  // The SVG's own rendered size — not the fixed SECTION_W/SECTION_H constants — since vertical
  // exaggeration (#15) makes the actual height data-dependent (see vExag above); every export needs
  // to capture whatever the page is currently showing, VE included, not the pre-#15 fixed box.
  const svgDims = () => {
    const svg = svgRef.current;
    if (!svg) return null;
    // The svg element itself is width="100%" with no fixed height attribute (its display height
    // instead falls out of the viewBox aspect ratio, which is exactly what #15's dynamic vertical
    // exaggeration needs) — so the actual pixel dimensions live in viewBox, not the width/height
    // attributes.
    const vb = svg.viewBox?.baseVal;
    if (vb && vb.width && vb.height) return { w: vb.width, h: vb.height };
    return { w: SECTION_W, h: SECTION_H };
  };

  const snapshotToLayout = () => {
    const svgEl = svgRef.current;
    const dims = svgDims();
    if (!svgEl || !dims) return;
    const clone = svgEl.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(dims.w));
    clone.setAttribute("height", String(dims.h));
    const markup = new XMLSerializer().serializeToString(clone);
    const src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(markup)))}`;
    const hScale = geomRef.current.hScale;
    sendSectionSnapshot({
      label: data?.title || "Cross-section",
      src, naturalW: dims.w, naturalH: dims.h,
      // TASKS.csv — Layout scale-bar assignment for cross-sections: the real-world horizontal span
      // this snapshot represents at its native (naturalW) pixel width, so Layout can derive a scale
      // bar the same way it already does for viewport snapshots (worldHeightAtTarget).
      worldWidthAtCaptureM: hScale ? dims.w / hScale : null,
      // User request ("the legend needs to update matching the cross section"): carry the exact
      // {label,color} pairs ViewerModule's buildSectionPayload already derived from this section's
      // own visible litho/alt/vein/structure data (see that function's `legendItems`) through to the
      // Layout image element this snapshot becomes, so a legend can be bound directly to THIS
      // snapshot and show exactly what's drawn in it — a flattened image has no live data of its own
      // to sync from otherwise.
      legendItems: data?.legendItems || null,
    });
    setSnapped(true);
    setTimeout(() => setSnapped(false), 1800);
  };

  // A drawn contact is always the UPPER contact of a specific litho unit — not a freeform-named line —
  // so the unit is picked BEFORE drawing starts, from the real litho vocabulary this property actually
  // uses (data.lithoUnits, threaded through from ViewerModule's litho_units — see launchSection's
  // comment), rather than typed in after the fact via a prompt(). That's what #98 (feed drawn contacts
  // into 3D surface generation) needs: gatherLithoSurfaceSpec already builds a unit's top surface from
  // litho interval tops, so a drawn contact tagged with the SAME unit name + "this is the upper
  // contact" slots in as an extra interface point for that exact surface, no separate matching step.
  const [unitPick, setUnitPick] = useState("");
  const lithoUnits = data?.lithoUnits || [];
  const startDrawing = () => { if (!unitPick) return; setDrawing(true); setDrawPoints([]); };
  const cancelDrawing = () => { setDrawing(false); setDrawPoints([]); };
  const undoPoint = () => setDrawPoints((p) => p.slice(0, -1));
  const finishContact = () => {
    if (drawPoints.length < 2 || !unitPick) { cancelDrawing(); return; }
    const id = `contact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setContacts((p) => [...p, { id, unit: unitPick, isUpperContact: true, color: hashColor(unitPick), points: drawPoints }]);
    setDrawing(false); setDrawPoints([]);
  };
  const removeContact = (id) => setContacts((p) => p.filter((c) => c.id !== id));

  const saveContacts = () => {
    if (!data?.id) return;
    sendSectionContacts({ id: data.id, contacts });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  // TASKS.csv #14 — export directly from the pop-out, rather than forcing a snapshot-to-Layout round
  // trip first. PNG/SVG mirror the export pattern already used for geochem plots (GeochemModule.jsx);
  // PDF reuses the SAME "export-pdf" IPC handler the main window's toolbar uses for the Layout page —
  // it was already written generically (BrowserWindow.getFocusedWindow() || mainWindow in
  // electron/main.js), so calling it from here just prints this window instead, no main-process
  // changes needed.
  const baseName = (data?.title || "section").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
  const exportSVG = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    saveFile({ suggestedName: `${baseName}.svg`, filters: [{ name: "SVG", extensions: ["svg"] }], content: xml });
  };
  const exportPNG = () => {
    const svg = svgRef.current;
    const dims = svgDims();
    if (!svg || !dims) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const scale = 2; // export at 2x the on-screen SVG resolution for print-quality output
      const canvas = document.createElement("canvas");
      canvas.width = dims.w * scale; canvas.height = dims.h * scale;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const b64 = canvas.toDataURL("image/png").split(",")[1];
      saveFile({ suggestedName: `${baseName}.png`, filters: [{ name: "PNG", extensions: ["png"] }], content: b64, encoding: "base64" });
    };
    img.src = url;
  };
  const exportPDF = () => savePDF(`${baseName}.pdf`);

  if (!data) return <div style={{ padding: 20, color: "#55606e", fontFamily: "'Exo 2', system-ui, sans-serif" }}>Waiting for section data…</div>;

  return (
    <div style={{ height: "100vh", background: "#ffffff", color: "#1a2028", fontFamily: "'Exo 2', system-ui, sans-serif", display: "flex", flexDirection: "column" }}>
      <div className="ge-section-toolbar" style={{ padding: "10px 16px", borderBottom: "1px solid #d9dce1", fontSize: 14, color: "#8a6a1f", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span>{data.title || "Cross-section"} <span style={{ color: "#94a1b0", fontSize: 11, marginLeft: 8 }}>azimuth {data.section?.azimuth?.toFixed(0)}° · buffer ±{data.section?.corridor}m</span></span>
        <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: "#94a1b0", fontSize: 11 }}>{data.holes?.length || 0} holes · {data.intervals?.length || 0} intervals · {data.points?.length || 0} points · {data.planes?.length || 0} structures{data.elevationProfile?.length > 1 ? " · terrain profile" : ""}{data.voxelSlices?.length ? ` · ${data.voxelSlices.map((v) => v.name).join(", ")}` : ""}</span>
          {!drawing ? (
            <>
              {/* Unit picked BEFORE drawing starts — a contact is always a specific unit's upper
                  contact, not a freeform name (see finishContact's comment). Falls back to a text box
                  if this property has no litho data loaded yet (data.lithoUnits empty) rather than
                  blocking the tool entirely. */}
              {lithoUnits.length > 0 ? (
                <select value={unitPick} onChange={(e) => setUnitPick(e.target.value)} style={selectStyle}>
                  <option value="">Unit…</option>
                  {lithoUnits.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              ) : (
                <input value={unitPick} onChange={(e) => setUnitPick(e.target.value)} placeholder="Unit name (no litho data loaded)" style={{ ...selectStyle, width: 170 }} />
              )}
              <button onClick={startDrawing} disabled={!unitPick} style={{ ...btnStyle(false), opacity: unitPick ? 1 : 0.5 }} title={unitPick ? `Draw ${unitPick}'s upper contact` : "Pick a unit first"}>
                <Pencil size={13} /> Draw upper contact
              </button>
            </>
          ) : (
            <>
              <span style={{ color: "#e2a63c", fontSize: 11 }}>Click points along {unitPick}'s upper contact… ({drawPoints.length} so far)</span>
              <button onClick={undoPoint} disabled={!drawPoints.length} style={{ ...btnStyle(false), opacity: drawPoints.length ? 1 : 0.5 }}><Undo2 size={13} /> Undo point</button>
              <button onClick={finishContact} disabled={drawPoints.length < 2} style={{ ...btnStyle(true), opacity: drawPoints.length >= 2 ? 1 : 0.5 }}><Check size={13} /> Finish</button>
              <button onClick={cancelDrawing} style={btnStyle(false)}><X size={13} /> Cancel</button>
            </>
          )}
          <button onClick={saveContacts} disabled={!contacts.length && !drawing} style={{ ...btnStyle(saved), opacity: contacts.length || drawing ? 1 : 0.5 }}>
            <Save size={13} /> {saved ? "Saved ✓" : "Save contacts"}
          </button>
          <button onClick={snapshotToLayout} style={btnStyle(snapped)}>
            <Camera size={13} /> {snapped ? "Sent ✓" : "Snapshot to Layout"}
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#55606e" }} title="Vertical exaggeration — 1x is true scale (vertical and horizontal axes at the same real-world-units-per-pixel)">
            VE
            <input type="number" min="0.1" max="20" step="0.5" value={vExag} onChange={(e) => setVExag(Math.max(0.1, Number(e.target.value) || 1))} style={{ width: 46, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 4, color: "#1a2028", fontSize: 11, padding: "3px 5px" }} />
            ×
          </label>
          <button onClick={exportPNG} style={btnStyle(false)} title="Export section → PNG"><Download size={13} /> PNG</button>
          <button onClick={exportSVG} style={btnStyle(false)} title="Export section → SVG"><Download size={13} /> SVG</button>
          <button onClick={exportPDF} style={btnStyle(false)} title="Export section → PDF"><FileText size={13} /> PDF</button>
        </span>
      </div>

      {contacts.length > 0 && (
        <div className="ge-section-chips" style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "8px 16px", borderBottom: "1px solid #e6e8eb" }}>
          {contacts.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 8px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 12, fontSize: 10.5 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: c.color, display: "inline-block" }} />
              {c.unit} <span style={{ color: "#94a1b0" }}>(upper contact)</span>
              <X size={11} style={{ cursor: "pointer", color: "#8a5555" }} onClick={() => removeContact(c.id)} />
            </div>
          ))}
        </div>
      )}

      <div className="ge-section-body" style={{ flex: 1, overflow: "auto", padding: 16 }}>
        <SectionSVG data={data} svgRef={svgRef} contacts={contacts} drawing={drawing} drawPoints={drawPoints} onAddPoint={(pt) => setDrawPoints((p) => [...p, pt])} vExag={vExag} geomRef={geomRef} />
      </div>
    </div>
  );
}

function btnStyle(active) {
  return { display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: active ? "#1e3629" : "#f4f5f7", border: active ? "1px solid #3d6b52" : "1px solid #d9dce1", borderRadius: 6, color: active ? "#8fd9ab" : "#1a2028", fontSize: 11.5, cursor: "pointer" };
}
const selectStyle = { padding: "5px 8px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, color: "#1a2028", fontSize: 11.5 };

function SectionSVG({ data, svgRef, contacts, drawing, drawPoints, onAddPoint, vExag, geomRef }) {
  const { holes = [], section, intervals = [], points = [], planes = [], elevationProfile = null, voxelSlices = [] } = data;
  const W = SECTION_W, PAD = 60;
  if (!section) return null;

  const { ax, ay, bx, by } = section;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const along = (x, y) => (x - ax) * ux + (y - ay) * uy;

  let maxL = len, minZ = Infinity, maxZ = -Infinity;
  holes.forEach((h) => h.trace.forEach((p) => { minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }));
  contacts.forEach((c) => c.points.forEach((p) => { minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }));
  // TASKS.csv #112 — elevation profile from SRTM. Fold the topographic profile into the same
  // min/max-elevation pass everything else uses, so the ground surface is never clipped off the top
  // of the page just because it happens to sit above the deepest/shallowest collar.
  (elevationProfile || []).forEach((p) => { minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
  // TASKS.csv — geophysics voxel/block-model slice on the cross-section (user request, reference: a
  // Rogue Geoscience section PDF showing a classified geophysics grid draped behind the drillhole
  // traces). Folded into the same min/max-elevation pass as everything else, so a voxel model that
  // extends above/below the visible collars doesn't get silently clipped off the page.
  voxelSlices.forEach((vs) => vs.rects.forEach((r) => { minZ = Math.min(minZ, r.z0); maxZ = Math.max(maxZ, r.z1); }));
  if (!isFinite(minZ)) { minZ = 0; maxZ = 100; }
  const zPad = (maxZ - minZ) * 0.08 || 10;
  minZ -= zPad; maxZ += zPad;

  // TASKS.csv #15 — vertical exaggeration. hScale is the true, fixed horizontal scale (px per real
  // meter along the section) — SECTION_W's fixed width divided by the section's real length. vScale
  // is that same px/m rate times vExag, so vExag=1 genuinely means "vertical and horizontal read at
  // the same scale" rather than just "whatever ratio happened to fit a fixed box" (which is what this
  // looked like before #15 — H was a constant, so the vertical scale silently varied per section
  // depending on its elevation range, with no way to tell how exaggerated a given view already was).
  // The page's rendered height now follows from vScale rather than the other way around.
  const hScale = (W - 2 * PAD) / maxL;
  const vScale = hScale * (vExag || 1);
  const H = Math.max(200, Math.round((maxZ - minZ) * vScale) + 2 * PAD);
  // Mirrored out for snapshotToLayout (see that function's comment) — a plain ref write, not state,
  // since nothing here needs to re-render when it changes.
  if (geomRef) geomRef.current = { hScale };

  const sx = (l) => PAD + l * hScale;
  const sz = (z) => H - PAD - (z - minZ) * vScale;
  // Inverse of sx/sz — converts a click back to (l, z), then to world (x, y) via the section line's
  // own origin/direction, so a drawn contact point is stored as real-world coordinates, not a
  // screen-relative fraction (see store.jsx's `sections` comment).
  const invSx = (screenX) => (screenX - PAD) / hScale;
  const invSz = (screenY) => minZ + (H - PAD - screenY) / vScale;

  const traceByHole = Object.fromEntries(holes.map((h) => [h.hole_id, h.trace]));

  const handleClick = (e) => {
    if (!drawing) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    const l = Math.max(0, Math.min(maxL, invSx(local.x)));
    const z = invSz(local.y);
    onAddPoint({ l, z, x: ax + l * ux, y: ay + l * uy });
  };

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ background: "#ffffff", borderRadius: 8, cursor: drawing ? "crosshair" : "default" }} onClick={handleClick}>
      <defs>
        <clipPath id="sectionPlotArea"><rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} /></clipPath>
      </defs>
      <rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} fill="#ffffff" stroke="#d9dce1" />

      {/* Geophysics voxel/block-model slice — drawn first (as a background), clipped to the section's
          plot area since a cell's projected rectangle can slightly overhang the drawn extent (see
          buildSectionPayload's comment on the projection method). Cell edges are drawn (thin, low-alpha
          stroke) not just fills, matching how the reference section image shows a visible cell grid
          rather than a smooth gradient — this IS a discrete block model, not a continuous raster, so
          showing its actual cell boundaries is honest about the underlying data's resolution. */}
      {voxelSlices.length > 0 && (
        <g clipPath="url(#sectionPlotArea)">
          {voxelSlices.map((vs) => (
            <g key={vs.id}>
              {vs.rects.map((r, i) => (
                <rect key={i} x={sx(r.l0)} y={sz(r.z1)} width={Math.max(0.5, sx(r.l1) - sx(r.l0))} height={Math.max(0.5, sz(r.z0) - sz(r.z1))} fill={r.color} stroke="#ffffff" strokeWidth="0.15" strokeOpacity="0.35">
                  <title>{vs.name}</title>
                </rect>
              ))}
            </g>
          ))}
        </g>
      )}

      {elevTicks(minZ, maxZ).map((z, i) => (
        <g key={i}>
          <line x1={PAD} y1={sz(z)} x2={W - PAD} y2={sz(z)} stroke="#eceef1" strokeWidth="0.5" />
          <text x={PAD - 8} y={sz(z) + 3} fill="#94a1b0" fontSize="9.5" textAnchor="end">{z.toFixed(0)}</text>
        </g>
      ))}

      {/* TASKS.csv #112 — topographic ground-surface profile sampled from the loaded SRTM/DEM terrain
          along this section line (see ViewerModule.jsx's buildSectionPayload). Drawn as a filled
          profile behind the drillhole traces — the fill drops to the bottom of the page, not to 0
          elevation, so it reads as "everything above this line is above ground" regardless of how far
          the axis has been panned/exaggerated. Absent entirely (not just empty) when no terrain is
          loaded, same as before this feature existed. */}
      {elevationProfile && elevationProfile.length > 1 && (
        <g>
          <polygon
            points={`${sx(0)},${H - PAD} ${elevationProfile.map((p) => `${sx(p.d)},${sz(p.z)}`).join(" ")} ${sx(maxL)},${H - PAD}`}
            fill="#e8dfc8" fillOpacity="0.55" stroke="none"
          />
          <polyline
            points={elevationProfile.map((p) => `${sx(p.d)},${sz(p.z)}`).join(" ")}
            fill="none" stroke="#a9873f" strokeWidth="1.6"
          />
          <text x={W - PAD - 4} y={sz(elevationProfile[elevationProfile.length - 1].z) - 6} fill="#8a6a1f" fontSize="9.5" textAnchor="end">Ground surface (SRTM)</text>
        </g>
      )}

      {holes.map((h, hi) => {
        const pts = h.trace.map((p) => [sx(along(p.x, p.y)), sz(p.z)]);
        return (
          <g key={hi}>
            <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#445064" strokeWidth="1.2" />
            <text x={pts[0][0]} y={pts[0][1] - 6} fill="#1a2028" fontSize="9" textAnchor="middle">{h.hole_id}</text>
          </g>
        );
      })}

      {intervals.map((row, i) => {
        const trace = traceByHole[row.hole_id];
        if (!trace) return null;
        const p1 = interpTrace(trace, row.from), p2 = interpTrace(trace, row.to);
        if (!p1 || !p2) return null;
        return <line key={i} x1={sx(along(p1.x, p1.y))} y1={sz(p1.z)} x2={sx(along(p2.x, p2.y))} y2={sz(p2.z)} stroke={row.color} strokeWidth="4" strokeLinecap="butt"><title>{row.label}</title></line>;
      })}

      {points.map((row, i) => {
        const trace = traceByHole[row.hole_id];
        if (!trace) return null;
        const p = interpTrace(trace, row.md);
        if (!p) return null;
        return <circle key={i} cx={sx(along(p.x, p.y))} cy={sz(p.z)} r="3.5" fill={row.color} stroke="#ffffff" strokeWidth="0.5"><title>{row.label}</title></circle>;
      })}

      {planes.map((row, i) => {
        const trace = traceByHole[row.hole_id];
        if (!trace) return null;
        const p = interpTrace(trace, row.depth);
        if (!p) return null;
        const cx = sx(along(p.x, p.y)), cy = sz(p.z);
        const angle = row.apparentDip != null ? row.apparentDip : 45;
        const rad = (angle * Math.PI) / 180;
        const len2 = 12;
        const ddx = Math.cos(rad) * len2, ddy = Math.sin(rad) * len2;
        return <line key={i} x1={cx - ddx} y1={cy - ddy} x2={cx + ddx} y2={cy + ddy} stroke={row.color} strokeWidth="2.5"><title>{row.label}</title></line>;
      })}

      {/* User-drawn interpreted contacts (TASKS.csv) — rendered on top of everything else so they're
          always visible while sketching over the drillhole data. */}
      {contacts.map((c) => (
        <g key={c.id}>
          <polyline points={c.points.map((p) => `${sx(p.l)},${sz(p.z)}`).join(" ")} fill="none" stroke={c.color} strokeWidth="2.5" strokeDasharray="6 3" />
          {c.points.map((p, i) => <circle key={i} cx={sx(p.l)} cy={sz(p.z)} r="2.5" fill={c.color} />)}
          <text x={sx(c.points[0].l)} y={sz(c.points[0].z) - 8} fill={c.color} fontSize="10" fontWeight="600">{c.unit}</text>
        </g>
      ))}
      {drawing && drawPoints.length > 0 && (
        <g>
          <polyline points={drawPoints.map((p) => `${sx(p.l)},${sz(p.z)}`).join(" ")} fill="none" stroke="#e2a63c" strokeWidth="2" strokeDasharray="4 3" />
          {drawPoints.map((p, i) => <circle key={i} cx={sx(p.l)} cy={sz(p.z)} r="3" fill="#e2a63c" stroke="#ffffff" strokeWidth="1" />)}
        </g>
      )}

      <text x={W / 2} y={H - 14} fill="#55606e" fontSize="11" textAnchor="middle">Distance along section (m)</text>
      <text x={16} y={H / 2} fill="#55606e" fontSize="11" textAnchor="middle" transform={`rotate(-90 16 ${H / 2})`}>Elevation (m)</text>
    </svg>
  );
}

function interpTrace(trace, md) {
  for (let i = 0; i < trace.length - 1; i++) {
    if (md >= trace[i].md - 0.01 && md <= trace[i + 1].md + 0.01) {
      const span = trace[i + 1].md - trace[i].md, t = span <= 0 ? 0 : (md - trace[i].md) / span;
      return { x: trace[i].x + (trace[i + 1].x - trace[i].x) * t, y: trace[i].y + (trace[i + 1].y - trace[i].y) * t, z: trace[i].z + (trace[i + 1].z - trace[i].z) * t };
    }
  }
  return trace[trace.length - 1];
}
function elevTicks(min, max) { const n = 8, step = (max - min) / n; return Array.from({ length: n + 1 }, (_, i) => min + i * step); }
