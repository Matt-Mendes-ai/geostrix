import React, { useEffect, useMemo, useState, useRef } from "react";
import { Camera, Pencil, Check, Undo2, X, Save, Download, FileText, Crosshair } from "./icons.js";
import { onSectionData, getSectionData, sendSectionSnapshot, sendSectionContacts, saveFile, savePDF } from "../lib/desktop.js";
import { solveOrientationToTarget } from "../lib/holePlanning.js"; // TASKS.csv #395
import { snapTargets, snapClick, moveVertex, deleteVertex, insertVertex, nearestSegment, setTieVertex } from "../lib/sectionDigitise.js"; // TASKS.csv #519
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { placeLabels, leaderEnd } from "../lib/sectionLabels.js"; // TASKS.csv #823

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
  // TASKS.csv #519 — snap clicks to the logged contacts / traces, and edit a finished string's vertices
  const [snapOn, setSnapOn] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [drawPoints, setDrawPoints] = useState([]);
  // TASKS.csv #395 — design a planned hole on the section: click the collar (snapped to the ground
  // profile when the section has one), then the target. holePlanning's solver turns the two world
  // points into azimuth / dip / length, and "Add planned hole" relays it to the main window's
  // plannedHoles (Targeting) over the same channel drawn contacts use.
  const [planning, setPlanning] = useState(false);
  const [planPts, setPlanPts] = useState([]); // [collar, target], each { l, z, x, y }
  const [planName, setPlanName] = useState("");
  const [planPast, setPlanPast] = useState(0); // metres drilled past the target
  const [planAdded, setPlanAdded] = useState([]); // drawn here at once; the main window has the real list

  // TASKS.csv #15 — vertical exaggeration. 1x means the vertical (elevation) scale matches the
  // horizontal (distance-along-section) scale exactly — true 1:1 — computed from the section's own
  // real-world width (SECTION_W maps to `maxL` meters) so "1x" means something real, not just
  // "however tall SectionSVG's old fixed box happened to make it look". >1 stretches the vertical axis
  // (subtle dips/steps in contacts and drillhole traces become easier to read); <1 compresses it. The
  // page height itself grows/shrinks with the exaggerated z-range rather than squeezing a fixed box,
  // since faking exaggeration inside a fixed box would just be a different, undisclosed distortion.
  const [vExag, setVExag] = useState(1);
  const [showSectionImages, setShowSectionImages] = useState(true); // TASKS.csv #631
  const [showModel, setShowModel] = useState(true); // TASKS.csv #759
  // TASKS.csv #823 — hole labels: where (collar / end of hole / both / off), leader lines (auto: when a label had to move;
  // always; off) and the labels the geologist dragged ({ "<hole>|collar": { dx, dy } }, SVG units from the anchor). Saved
  // with the section (relayed to the main window like contacts), so a re-opened section and its Layout snapshot keep them.
  const [labels, setLabels] = useState({ mode: "collar", leaders: "auto", offsets: {} });
  const changeLabels = (patch) => setLabels((p) => {
    const next = { ...p, ...patch };
    if (data?.id) sendSectionContacts({ id: data.id, labels: next });
    return next;
  });

  // Layout's "assign a scale bar" feature (mirrors the existing viewport worldHeightAtTarget pattern —
  // see LayoutModule.jsx's onSyncScaleBar) needs to know the true real-world scale of whatever gets
  // snapshotted, so a scale bar can be computed/re-derived even after the image is resized on the page.
  // SectionSVG computes hScale (px per real meter along the section, viewBox units) fresh every render
  // — mirrored into this ref (not state; a plain read at snapshot time, no need to re-render this
  // component when it changes) so snapshotToLayout below can convert the captured pixel width into a
  // real-world width in meters.
  const geomRef = useRef({ hScale: 1 });

  useEffect(() => {
    const takeLabels = (d) => { if (!d) return; setLabels(d.labels ? { mode: "collar", leaders: "auto", ...d.labels, offsets: d.labels.offsets || {} } : { mode: "collar", leaders: "auto", offsets: {} }); }; // #823 — a section without saved labels starts from the defaults
    // TASKS.csv #876 — a quiet refresh (an explicit surface was rebuilt) updates the drawing but keeps what is being drawn
    const off = onSectionData((d) => { if (d.refreshOnly) { setData((prev) => ({ ...d, contacts: prev?.contacts })); const r = document.documentElement.dataset; r.sectionRefreshes = String((Number(r.sectionRefreshes) || 0) + 1); return; } setData(d); setContacts(d.contacts || []); takeLabels(d); });
    // TASKS.csv #617 — ask for the data too: the push from main can arrive before this lazy component listens
    getSectionData().then((d) => { if (d) { setData((prev) => prev || d); setContacts((prev) => (prev.length ? prev : d.contacts || [])); takeLabels(d); } }).catch(() => {});
    const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
    const id = params.get("id");
    if (id) {
      const raw = sessionStorage.getItem(id);
      if (raw) { const d = JSON.parse(raw); setData(d); setContacts(d.contacts || []); takeLabels(d); }
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
      verticalExaggeration: vExag || 1, // TASKS.csv #944 — Layout states it beside the section's plot scale
      // User request ("the legend needs to update matching the cross section"): carry the exact
      // {label,color} pairs ViewerModule's buildSectionPayload already derived from this section's
      // own visible litho/alt/vein/structure data (see that function's `legendItems`) through to the
      // Layout image element this snapshot becomes, so a legend can be bound directly to THIS
      // snapshot and show exactly what's drawn in it — a flattened image has no live data of its own
      // to sync from otherwise.
      legendItems: data?.legendItems ? data.legendItems.filter(([label]) => showModel || !data.modelBackdrop || !label.startsWith("Model: ")) : null, // #759
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
  // TASKS.csv #409 — what is being drawn: a unit's upper contact (feeds modelling), a fault, or a free
  // interpretation string. Faults and strings take a typed name.
  const [kindPick, setKindPick] = useState("contact");
  const lithoUnits = data?.lithoUnits || [];
  // TASKS.csv #810 — modelling codes and lithology groups as tags too (a stack unit "X (code)" or a group matches them)
  const tagCodes = (data?.unitTags?.codes || []).filter((c) => !lithoUnits.includes(c)), tagGroups = data?.unitTags?.groups || [];
  const tagExplicit = data?.unitTags?.explicit || []; // TASKS.csv #811 — a line drawn for an explicit surface is one of its hard lines
  const startDrawing = () => { if (!unitPick) return; setDrawing(true); setDrawPoints([]); };
  const cancelDrawing = () => { setDrawing(false); setDrawPoints([]); };
  const undoPoint = () => setDrawPoints((p) => p.slice(0, -1));
  const finishContact = () => {
    if (drawPoints.length < (kindPick === "outline" ? 3 : 2) || !unitPick) { cancelDrawing(); return; } // #570: an outline is a closed loop
    const id = `contact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setContacts((p) => [...p, { id, unit: unitPick, kind: kindPick, isUpperContact: kindPick === "contact", color: kindPick === "fault" ? "#d9534f" : hashColor(unitPick), points: drawPoints }]);
    setDrawing(false); setDrawPoints([]);
  };
  const removeContact = (id) => { setContacts((p) => p.filter((c) => c.id !== id)); if (editingId === id) setEditingId(null); };
  const editPoints = (id, fn) => setContacts((p) => p.map((c) => (c.id === id ? { ...c, points: fn(c.points) } : c)));
  // what a click snaps to: the drawn / edited string's unit tops (contacts) or every logged boundary (faults, strings)
  const editing = contacts.find((c) => c.id === editingId) || null;
  const offHoles = (data?.holes || []).filter((h) => h.minOffset != null && Math.max(Math.abs(h.minOffset), Math.abs(h.maxOffset)) > 5).length; // TASKS.csv #897
  // #810 — a modelling code or group is not a logged label, so its contact snaps to any logged boundary (like a fault)
  // TASKS.csv #868 — an explicit surface's line snaps like its unit's upper contact when that unit is a logged one
  const snapUnit = (unit) => { const u = data?.unitTags?.explicitUnits?.[unit]; return u && lithoUnits.includes(u) ? u : unit; };
  const snapKind = (unit, kind) => (kind === "contact" && !lithoUnits.includes(snapUnit(unit)) ? "boundary" : kind);
  const targets = useMemo(() => snapTargets(data?.intervals, editing ? { unit: snapUnit(editing.unit), kind: snapKind(editing.unit, editing.kind || "contact"), holes: data?.holes } : { unit: snapUnit(unitPick), kind: snapKind(unitPick, kindPick), holes: data?.holes }), [data?.intervals, data?.holes, editing, unitPick, kindPick]); // holes: #569 up-holes

  // TASKS.csv #395 — ground elevation at distance l along the section, from the terrain profile.
  const groundAt = (l) => {
    const prof = data?.elevationProfile;
    if (!prof || prof.length < 2) return null;
    if (l <= prof[0].d) return prof[0].z;
    for (let i = 1; i < prof.length; i++) {
      if (l <= prof[i].d) { const a = prof[i - 1], b = prof[i], t = (l - a.d) / ((b.d - a.d) || 1); return a.z + t * (b.z - a.z); }
    }
    return prof[prof.length - 1].z;
  };
  const addPlanPoint = (pt) => {
    setPlanPts((p) => {
      if (p.length >= 2) return p;
      if (p.length === 0) { const g = groundAt(pt.l); return [g != null ? { ...pt, z: g, snapped: true } : pt]; }
      return [...p, pt];
    });
  };
  const planSolution = planPts.length === 2 ? solveOrientationToTarget(planPts[0], planPts[1]) : null;
  const startPlanning = () => { setDrawing(false); setDrawPoints([]); setPlanning(true); setPlanPts([]); };
  const cancelPlanning = () => { setPlanning(false); setPlanPts([]); };
  const addPlannedHole = () => {
    if (!planSolution || !data?.id) return;
    const c = planPts[0];
    const length = Math.round((planSolution.length + Math.max(0, Number(planPast) || 0)) * 10) / 10;
    const hole = {
      ...(planName.trim() ? { name: planName.trim() } : {}), // empty -> the store names it PLAN-n
      x: Math.round(c.x * 100) / 100, y: Math.round(c.y * 100) / 100, z: Math.round(c.z * 100) / 100,
      azimuth: Math.round(planSolution.azimuth * 10) / 10, dip: Math.round(planSolution.dip * 10) / 10, length,
      notes: tr("Designed on section \"{v}\": target at {v2}E {v3}N {v4} m elev, {v5} m down-hole{v6}.", { v: data.title || "section", v2: Math.round(planPts[1].x), v3: Math.round(planPts[1].y), v4: Math.round(planPts[1].z), v5: Math.round(planSolution.length), v6: Number(planPast) > 0 ? tr(", +{v} m past it", { v: Number(planPast) }) : "" }),
    };
    sendSectionContacts({ id: data.id, plannedHole: hole });
    const rad = Math.PI / 180, dirH = Math.cos(hole.dip * rad);
    const end = { x: c.x + Math.sin(hole.azimuth * rad) * dirH * length, y: c.y + Math.cos(hole.azimuth * rad) * dirH * length, z: c.z + Math.sin(hole.dip * rad) * length };
    setPlanAdded((p) => [...p, { name: hole.name || "new plan", trace: [{ x: c.x, y: c.y, z: c.z }, end] }]);
    setPlanning(false); setPlanPts([]); setPlanName("");
  };

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

  if (!data) return <div style={{ padding: 20, color: "#55606e", fontFamily: "'Exo 2', system-ui, sans-serif" }}>{tr("Waiting for section data…")}</div>;

  return (
    <div style={{ height: "100vh", background: "#ffffff", color: "#1a2028", fontFamily: "'Exo 2', system-ui, sans-serif", display: "flex", flexDirection: "column" }}>
      <div className="ge-section-toolbar" style={{ padding: "10px 16px", borderBottom: "1px solid #d9dce1", fontSize: 14, color: "#8a6a1f", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span>{data.title || tr("Cross-section")} <span style={{ color: "#65717e", fontSize: 11, marginLeft: 8 }}>{tr("azimuth {v}° · buffer ±{v2}m", { v: data.section?.azimuth?.toFixed(0), v2: data.section?.corridor })}</span></span>
        <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: "#65717e", fontSize: 11 }}>{tr("{v} holes · {v2} intervals · {v3} points · {v4} structures{v5}{v6}", { v: data.holes?.length || 0, v2: data.intervals?.length || 0, v3: data.points?.length || 0, v4: data.planes?.length || 0, v5: data.elevationProfile?.length > 1 ? tr(" · terrain profile") : "", v6: data.voxelSlices?.length ? ` · ${data.voxelSlices.map((v) => v.name).join(", ")}` : "" })}</span>
          {!drawing ? (
            <>
              {/* Unit picked BEFORE drawing starts — a contact is always a specific unit's upper
                  contact, not a freeform name (see finishContact's comment). Falls back to a text box
                  if this property has no litho data loaded yet (data.lithoUnits empty) rather than
                  blocking the tool entirely. */}
              <select value={kindPick} onChange={(e) => { setKindPick(e.target.value); setUnitPick(""); }} style={selectStyle} aria-label={tr("What to draw")}>
                <option value="contact">{tr("Upper contact")}</option>
                <option value="fault">{tr("Fault")}</option>
                <option value="string">{tr("String")}</option>
                <option value="outline">{tr("Outline (closed, for a solid)")}</option>{/* TASKS.csv #570 */}
              </select>
              {kindPick !== "contact" ? (
                <><input value={unitPick} onChange={(e) => setUnitPick(e.target.value)} list={kindPick === "outline" ? "ge-outline-names" : undefined} placeholder={kindPick === "fault" ? tr("Fault name") : kindPick === "outline" ? tr("Body name (same on every section)") : tr("String name")} style={{ ...selectStyle, width: 140 }} />
                {kindPick === "outline" && <datalist id="ge-outline-names">{(data.outlineNames || []).map((n) => <option key={n} value={n} />)}</datalist>}{/* TASKS.csv #874 — names used on other sections */}</>
              ) : lithoUnits.length > 0 ? (
                <select value={unitPick} onChange={(e) => setUnitPick(e.target.value)} style={selectStyle} aria-label={tr("Unit")}>{/* aria-label: TASKS.csv #893 */}
                  <option value="">{tr("Unit…")}</option>
                  {lithoUnits.map((u) => <option key={u} value={u}>{u}</option>)}
                  {tagCodes.length > 0 && <optgroup label={tr("Modelling codes")}>{tagCodes.map((u) => <option key={`c:${u}`} value={u}>{u}</option>)}</optgroup>}
                  {tagGroups.length > 0 && <optgroup label={tr("Groups")}>{tagGroups.map((u) => <option key={`g:${u}`} value={u}>{u}</option>)}</optgroup>}
                  {tagExplicit.length > 0 && <optgroup label={tr("Explicit surfaces")}>{tagExplicit.map((u) => <option key={`e:${u}`} value={u}>{u}</option>)}</optgroup>}
                </select>
              ) : (
                <input value={unitPick} onChange={(e) => setUnitPick(e.target.value)} placeholder={tr("Unit name (no litho data loaded)")} style={{ ...selectStyle, width: 170 }} />
              )}
              <button onClick={startDrawing} disabled={!unitPick} style={{ ...btnStyle(false), opacity: unitPick ? 1 : 0.5 }} title={unitPick ? tr("Draw {unitPick}'s upper contact", { unitPick }) : tr("Pick a unit first")}>
                <Pencil size={14} /> {kindPick === "contact" && tagExplicit.includes(unitPick) ? tr("Draw a line of {name}", { name: unitPick }) /* TASKS.csv #884 */ : kindPick === "contact" ? tr("Draw upper contact") : kindPick === "fault" ? tr("Draw fault") : kindPick === "outline" ? tr("Draw outline") : tr("Draw string")}
              </button>
            </>
          ) : (
            <>
              <span style={{ color: "#e2a63c", fontSize: 11 }}>{kindPick === "contact" && tagExplicit.includes(unitPick) ? tr("Click points along the line of {name}… ({drawPoints} so far). Finish, then Save contacts to send it to the surface.", { name: unitPick, drawPoints: drawPoints.length }) : kindPick === "contact" ? tr("Click points along {unitPick}'s upper contact… ({drawPoints} so far)", { unitPick, drawPoints: drawPoints.length }) : kindPick === "outline" ? tr("Click points around the {unitPick} outline; it closes itself on Finish… ({drawPoints} so far)", { unitPick, drawPoints: drawPoints.length }) : tr("Click points along {unitPick}… ({drawPoints} so far)", { unitPick, drawPoints: drawPoints.length })}</span>
              {offHoles > 0 && <span style={{ color: "#65717e", fontSize: 11 }} title={tr("A point snapped to a hole takes the hole's real position, off the section; a free point lies on the section plane. A line mixing the two kinks between them.")}>{tr("{n} hole(s) lie more than 5 m off the section (offset printed at the end of the trace); points not snapped to a hole sit on the section plane.", { n: offHoles })}</span>}{/* TASKS.csv #897 */}
              <button onClick={undoPoint} disabled={!drawPoints.length} style={{ ...btnStyle(false), opacity: drawPoints.length ? 1 : 0.5 }}><Undo2 size={14} />{" "}{tr("Undo point")}</button>
              <button onClick={finishContact} disabled={drawPoints.length < (kindPick === "outline" ? 3 : 2)} style={{ ...btnStyle(true), opacity: drawPoints.length >= (kindPick === "outline" ? 3 : 2) ? 1 : 0.5 }}><Check size={14} />{" "}{tr("Finish")}</button>
              <button onClick={cancelDrawing} style={btnStyle(false)}><X size={14} />{" "}{tr("Cancel")}</button>
            </>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#55606e" }} title={tr("Clicks within ~12 px of a hole snap to the chosen unit's logged top (any logged boundary for faults / strings), else to the trace; the snapped vertex keeps the hole's exact position and depth (square marker)")}>
            <input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} />{" "}{tr("Snap to holes")}</label>
          {/* TASKS.csv #876 — step to the parallel section beside this one, and refresh what the main window draws on it */}
          <button onClick={() => sendSectionContacts({ id: data.id, step: -1 })} title={tr("Open the parallel section on the right of this one (looking along it from its start); a new one is made at the section spacing when there is none. Save your contacts first.")} style={btnStyle(false)}>‹</button>
          <button onClick={() => sendSectionContacts({ id: data.id, step: 1 })} title={tr("Open the parallel section on the left of this one (looking along it from its start); a new one is made at the section spacing when there is none. Save your contacts first.")} style={btnStyle(false)}>›</button>
          <button onClick={() => sendSectionContacts({ id: data.id, refresh: true })} title={tr("Redraw the surface traces, models and neighbouring sections' strings on this section from the main window (what you are drawing is kept).")} style={btnStyle(false)}>{tr("Refresh")}</button>
          <button onClick={saveContacts} disabled={!contacts.length && !drawing} style={{ ...btnStyle(saved), opacity: contacts.length || drawing ? 1 : 0.5 }}>
            <Save size={14} /> {saved ? tr("Saved ✓") : tr("Save contacts")}
          </button>
          <button onClick={snapshotToLayout} style={btnStyle(snapped)}>
            <Camera size={14} /> {snapped ? tr("Sent ✓") : tr("Snapshot to Layout")}
          </button>
          {data.modelBackdrop && ( // TASKS.csv #759
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#55606e" }} title={tr("{name}: the modelled units on this section, behind the logged holes, {source}. Grey: above the youngest modelled top (younger rock, or air where no terrain clips it).", { name: data.modelBackdrop.name, source: data.modelBackdrop.source })}>
              <input type="checkbox" checked={showModel} onChange={(e) => setShowModel(e.target.checked)} />{" "}{tr("Modelled units")}</label>
          )}
          {data.sectionImages?.length > 0 && ( // TASKS.csv #631
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#55606e" }} title={tr("Georeferenced section image(s) on this line, drawn behind the holes and contacts: {v}", { v: data.sectionImages.map((i) => i.name).join(", ") })}>
              <input type="checkbox" checked={showSectionImages} onChange={(e) => setShowSectionImages(e.target.checked)} />{" "}{tr("Section image")}</label>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#55606e" }} title={tr("Vertical exaggeration — 1x is true scale (vertical and horizontal axes at the same real-world-units-per-pixel)")}>{tr("VE")}<input type="number" min="0.1" max="20" step="0.5" value={vExag} onChange={(e) => setVExag(Math.max(0.1, Number(e.target.value) || 1))} style={{ width: 46, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 4, color: "#1a2028", fontSize: 11, padding: "3px 5px" }} />
            ×
          </label>
          <button onClick={exportPNG} style={btnStyle(false)} title={tr("Export section → PNG")}><Download size={14} />{" "}{tr("PNG")}</button>
          <button onClick={exportSVG} style={btnStyle(false)} title={tr("Export section → SVG")}><Download size={14} />{" "}{tr("SVG")}</button>
          <button onClick={exportPDF} style={btnStyle(false)} title={tr("Export section → PDF")}><FileText size={14} />{" "}{tr("PDF")}</button>
        </span>
      </div>

      {/* TASKS.csv #395 — planned-hole design bar */}
      <div className="ge-section-chips" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "6px 16px", borderBottom: "1px solid #e6e8eb", fontSize: 11 }}>
        {!planning ? (
          <button onClick={startPlanning} style={btnStyle(false)} title={tr("Click the collar (snapped to the ground profile when there is one), then the target — gives azimuth, dip and length for a new planned hole")}><Crosshair size={14} />{" "}{tr("Plan a hole")}</button>
        ) : (
          <>
            <span style={{ color: "#b06a1f" }}>
              {planPts.length === 0 ? tr("Click the collar position{v}…", { v: data.elevationProfile?.length > 1 ? tr(" (snaps to the ground surface)") : tr(" (no terrain on this section: the click's elevation is used)") }) : planPts.length === 1 ? tr("Click the target…") : null}
            </span>
            {planSolution && (
              <>
                <span style={{ color: "#1a2028" }}>{tr("Az")}{" "}<b>{planSolution.azimuth.toFixed(1)}°</b>{" "}{tr("· dip")}{" "}<b>{planSolution.dip.toFixed(1)}°</b> · <b>{Math.round(planSolution.length)} m</b>{" "}{tr("to target")}</span>
                <label style={{ display: "flex", alignItems: "center", gap: 4, color: "#55606e" }}>{tr("+ past target")}{" "}<input type="number" min="0" step="10" value={planPast} onChange={(e) => setPlanPast(e.target.value)} style={{ width: 52, ...selectStyle, padding: "3px 5px" }} aria-label={tr("Metres past target")} /> m</label>
                <input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder={tr("Name (optional)")} style={{ ...selectStyle, width: 120 }} aria-label={tr("Planned hole name")} />
                <button onClick={addPlannedHole} style={btnStyle(true)}><Check size={14} />{" "}{tr("Add planned hole")}</button>
              </>
            )}
            {planPts.length > 0 && <button onClick={() => setPlanPts((p) => p.slice(0, -1))} style={btnStyle(false)}><Undo2 size={14} />{" "}{tr("Undo point")}</button>}
            <button onClick={cancelPlanning} style={btnStyle(false)}><X size={14} />{" "}{tr("Cancel")}</button>
          </>
        )}
        {/* TASKS.csv #823 — hole labels */}
        <span style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", color: "#55606e" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>{tr("Hole labels")}
            <select value={labels.mode} onChange={(e) => changeLabels({ mode: e.target.value })} style={{ ...selectStyle, padding: "3px 5px" }} aria-label={tr("Hole labels")}>
              <option value="collar">{tr("at the collar")}</option><option value="end">{tr("at the end of the hole")}</option><option value="both">{tr("at both ends")}</option><option value="off">{tr("off")}</option>
            </select></label>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }} title={tr("Leader lines from a label to its hole: automatic draws one when a label had to move away from its hole (crowded collars, or dragged)")}>{tr("Leaders")}
            <select value={labels.leaders} onChange={(e) => changeLabels({ leaders: e.target.value })} disabled={labels.mode === "off"} style={{ ...selectStyle, padding: "3px 5px" }} aria-label={tr("Leader lines")}>
              <option value="auto">{tr("automatic")}</option><option value="always">{tr("always")}</option><option value="off">{tr("off")}</option>
            </select></label>
          <button onClick={() => changeLabels({ offsets: {} })} disabled={!Object.keys(labels.offsets).length} style={{ ...btnStyle(false), opacity: Object.keys(labels.offsets).length ? 1 : 0.5 }}
            title={tr("Put every dragged label back where GeoStrix places it. Drag a label to move it.")}><Undo2 size={14} />{" "}{tr("Reset labels")}</button>
        </span>
        {planAdded.length > 0 && !planning && <span style={{ color: "#2e7d4f" }}>{tr("Added {planAdded} {v} to Targeting.", { planAdded: planAdded.length, v: tr(planAdded.length > 1 ? "planned holes" : "planned hole") })}</span>}
      </div>

      {contacts.length > 0 && (
        <div className="ge-section-chips" style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "8px 16px", borderBottom: "1px solid #e6e8eb" }}>
          {contacts.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 8px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 12, fontSize: 10.5 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: c.color, display: "inline-block" }} />
              {c.unit} <span style={{ color: "#65717e" }}>{tr("({v}, {points} pts)", { v: c.kind === "fault" ? tr("fault") : c.kind === "string" ? tr("string") : c.kind === "outline" ? tr("outline") : tr("upper contact"), points: c.points.length })}</span>
              <Pencil role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Edit the vertices of {unit}", { unit: c.unit })} size={12} style={{ cursor: "pointer", color: editingId === c.id ? "#b06a1f" : "#55606e" }} onClick={() => { setDrawing(false); setEditingId(editingId === c.id ? null : c.id); }}><title>{tr("Edit vertices: drag to move, Alt-click to delete, click the line to insert")}</title></Pencil>
              <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Remove {v} \"{unit}\"", { v: c.kind === "fault" ? "fault" : c.kind === "string" ? "string" : "contact", unit: c.unit })} size={12} style={{ cursor: "pointer", color: "#8a5555" }} onClick={() => removeContact(c.id)} />
            </div>
          ))}
        </div>
      )}

      <div className="ge-section-body" style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {editingId && <div style={{ fontSize: 11, color: "#b06a1f", marginBottom: 6 }}>{tr("Editing \"{v}\": drag a vertex to move it, Alt-click a vertex to delete it, click the line to insert one{v2}. Click the pencil again to finish; Save contacts keeps the changes.", { v: editing?.unit, v2: snapOn ? tr(" (snapping to holes)") : "" })}{editing?.kind === "outline" ? ` ${tr("Shift-click a vertex to make it the tie point: it is linked to the tie point of the outline on the next section.")}` : ""}</div>}
        <SectionSVG showSectionImages={showSectionImages} showModel={showModel} data={planAdded.length ? { ...data, plannedHoles: [...(data.plannedHoles || []), ...planAdded] } : data} svgRef={svgRef} contacts={contacts} drawing={drawing || planning} drawPoints={drawPoints} onAddPoint={(pt) => (planning ? addPlanPoint(pt) : setDrawPoints((p) => [...p, pt]))} vExag={vExag} geomRef={geomRef} planPts={planning ? planPts : []}
          snap={snapOn && !planning ? targets : null} editingId={editingId} onEditPoints={editPoints}
          labels={labels} onMoveLabel={(key, off) => changeLabels({ offsets: { ...labels.offsets, [key]: off } })} /* #823 */ />
      </div>
    </div>
  );
}

function btnStyle(active) {
  return { display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: active ? "#1e3629" : "#f4f5f7", border: active ? "1px solid #3d6b52" : "1px solid #d9dce1", borderRadius: 6, color: active ? "#8fd9ab" : "#1a2028", fontSize: 11.5, cursor: "pointer" };
}
const selectStyle = { padding: "5px 8px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, color: "#1a2028", fontSize: 11.5 };

function SectionSVG({ showSectionImages = true, showModel = true, data, svgRef, contacts, drawing, drawPoints, onAddPoint, vExag, geomRef, planPts = [], snap = null, editingId = null, onEditPoints, labels = { mode: "collar", leaders: "auto", offsets: {} }, onMoveLabel }) {
  const dragRef = useRef(null); // #519 — the vertex being dragged (before the early return: a hook)
  const labelDragRef = useRef(null); // #823 — the label being dragged: { key, ax, ay, grabDx, grabDy }
  const [labelDrag, setLabelDrag] = useState(null); // its live offset while dragging: { key, dx, dy }
  const { holes = [], section, intervals = [], points = [], planes = [], elevationProfile = null, voxelSlices = [], surfaceTraces = [], plannedHoles = [], title = "", sectionImages = [] } = data;
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
  plannedHoles.forEach((h) => h.trace.forEach((p) => { minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); })); // #395
  if (showSectionImages) sectionImages.forEach((im) => [im.tl, im.tr, im.bl].forEach(([, z]) => { minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); })); // #631
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
  // TASKS.csv #392 — ribbon offsets per interval layer (px): 0, +7, -7, +14, -14 ... in first-seen order.
  const ribbonOffset = {};
  intervals.forEach((r) => { const k = r.layer || "_"; if (!(k in ribbonOffset)) { const n = Object.keys(ribbonOffset).length; ribbonOffset[k] = n === 0 ? 0 : (n % 2 ? 1 : -1) * 7 * Math.ceil(n / 2); } });
  const ribbonReach = Math.max(3, ...Object.values(ribbonOffset).map((o) => Math.abs(o) + 3));
  const BAR_MAX = 36;
  const assayMax = {};
  points.forEach((r) => { if (r.assay && Number.isFinite(r.assay.value)) assayMax[r.assay.sym] = Math.max(assayMax[r.assay.sym] || 0, r.assay.value); });
  // label the 8 highest values per element in this section, not every sample (unreadable at section scale)
  const labelledAssays = new Set();
  Object.keys(assayMax).forEach((sym) => points.filter((r) => r.assay?.sym === sym).sort((x, y) => y.assay.value - x.assay.value).slice(0, 8).forEach((r) => labelledAssays.add(r)));

  // TASKS.csv #519 — screen -> section point, snapped to a hole when snapping is on
  const localOf = (e) => {
    const svg = svgRef?.current || e.currentTarget?.ownerSVGElement || e.currentTarget;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    return ctm ? pt.matrixTransform(ctm.inverse()) : null;
  };
  const pointAt = (local) => {
    if (snap) {
      const s = snapClick({ sx: local.x, sy: local.y }, { holes, targets: snap, toScreen: (x, y, z) => [sx(along(x, y)), sz(z)], along, radius: 12,
        strings: contacts.map((c) => ({ id: c.id, points: c.points, closed: c.kind === "outline" })), skip: dragRef.current ? { id: dragRef.current.id, i: dragRef.current.i } : null }); // strings: #876
      if (s) return s;
    }
    const l = Math.max(0, Math.min(maxL, invSx(local.x)));
    const z = invSz(local.y);
    return { l, z, x: ax + l * ux, y: ay + l * uy };
  };
  const handleClick = (e) => {
    if (!drawing) return;
    const local = localOf(e);
    if (!local) return;
    onAddPoint(pointAt(local));
  };
  const handleMove = (e) => {
    const ld = labelDragRef.current; // #823
    if (ld) { const local = localOf(e); if (local && (e.buttons & 1)) setLabelDrag({ key: ld.key, dx: local.x - ld.grabDx - ld.ax, dy: local.y - ld.grabDy - ld.ay }); return; }
    const d = dragRef.current;
    if (!d || !(e.buttons & 1)) return;
    const local = localOf(e);
    if (local) { d.moved = true; const pt = pointAt(local); onEditPoints(d.id, (pts) => moveVertex(pts, d.i, pt)); }
  };
  const handleUp = () => {
    dragRef.current = null;
    if (labelDragRef.current) { // #823 — a dragged label keeps its new place
      if (labelDrag && labelDrag.key === labelDragRef.current.key) onMoveLabel?.(labelDrag.key, { dx: Math.round(labelDrag.dx * 10) / 10, dy: Math.round(labelDrag.dy * 10) / 10 });
      labelDragRef.current = null; setLabelDrag(null);
    }
  };
  const insertAt = (c, e) => {
    if (c.id !== editingId) return;
    e.stopPropagation();
    const local = localOf(e);
    if (!local) return;
    const seg = nearestSegment(c.points, (p) => [sx(p.l), sz(p.z)], { sx: local.x, sy: local.y }, 8);
    if (seg >= 0) { const pt = pointAt(local); onEditPoints(c.id, (pts) => insertVertex(pts, seg, pt)); }
  };

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ background: "#ffffff", borderRadius: 8, cursor: drawing ? "crosshair" : "default" }} onClick={handleClick} onMouseMove={handleMove} onMouseUp={handleUp} onMouseLeave={handleUp}>
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
      {/* TASKS.csv #759 — the last model's units on this section, one pixel per evaluated node, stretched over its
          (distance, elevation) box so it follows the vertical exaggeration; pixelated, not smoothed, so its spacing shows. */}
      {showModel && data.modelBackdrop && (
        <g clipPath="url(#sectionPlotArea)">
          <image href={data.modelBackdrop.dataUrl} x={sx(0)} y={sz(data.modelBackdrop.z1)} width={Math.max(1, sx(data.modelBackdrop.len) - sx(0))} height={Math.max(1, sz(data.modelBackdrop.z0) - sz(data.modelBackdrop.z1))} preserveAspectRatio="none" opacity={0.5} style={{ imageRendering: "pixelated" }}>
            <title>{`${data.modelBackdrop.name}, ${data.modelBackdrop.source}`}</title>
          </image>
        </g>
      )}
      {/* TASKS.csv #631 — a georeferenced section image on this line (an old interpretation, a report figure), stretched
          onto its corners in (distance, elevation) — so it follows the vertical exaggeration — behind holes and contacts. */}
      {showSectionImages && sectionImages.length > 0 && (
        <g clipPath="url(#sectionPlotArea)">
          {sectionImages.map((im) => {
            const tl = [sx(im.tl[0]), sz(im.tl[1])], trc = [sx(im.tr[0]), sz(im.tr[1])], bl = [sx(im.bl[0]), sz(im.bl[1])];
            const m = [(trc[0] - tl[0]) / im.width, (trc[1] - tl[1]) / im.width, (bl[0] - tl[0]) / im.height, (bl[1] - tl[1]) / im.height, tl[0], tl[1]];
            return <image key={im.id} href={im.dataUrl} width={im.width} height={im.height} preserveAspectRatio="none" transform={`matrix(${m.join(" ")})`} opacity={Math.min(1, im.opacity) * 0.85}><title>{im.name}</title></image>;
          })}
        </g>
      )}

      {/* TASKS.csv #393 — round-number elevation ticks (were 8 equal steps: 612 / 683 / 754 ...) and a
          distance axis with ticks, plus the section's end coordinates and title/azimuth/VE drawn INSIDE
          the figure, so an exported PNG/SVG/PDF still says where and what it is. */}
      {niceTicks(minZ, maxZ, 8).map((z, i) => (
        <g key={i}>
          <line x1={PAD} y1={sz(z)} x2={W - PAD} y2={sz(z)} stroke="#eceef1" strokeWidth="0.5" />
          <text x={PAD - 8} y={sz(z) + 3} fill="#65717e" fontSize="10" textAnchor="end">{z.toFixed(0)}</text>
        </g>
      ))}
      {niceTicks(0, maxL, 8).filter((l) => l >= 0 && l <= maxL).map((l, i) => (
        <g key={`d${i}`}>
          <line x1={sx(l)} y1={H - PAD} x2={sx(l)} y2={H - PAD + 4} stroke="#65717e" strokeWidth="0.8" />
          <text x={sx(l)} y={H - PAD + 14} fill="#65717e" fontSize="10" textAnchor="middle">{l.toFixed(0)}</text>
        </g>
      ))}
      <text x={PAD} y={H - PAD + 30} fill="#55606e" fontSize="10" textAnchor="start">{`${Math.round(ax).toLocaleString()} E  ${Math.round(ay).toLocaleString()} N`}</text>
      <text x={W - PAD} y={H - PAD + 30} fill="#55606e" fontSize="10" textAnchor="end">{`${Math.round(bx).toLocaleString()} E  ${Math.round(by).toLocaleString()} N`}</text>
      <text x={PAD} y={PAD - 22} fill="#1a2028" fontSize="12" fontWeight="600">{title || tr("Cross-section")}</text>
      <text x={PAD} y={PAD - 8} fill="#55606e" fontSize="10">{tr("Azimuth {v}° · {v2}{v3} · elevation in m", { v: Number(section.azimuth ?? (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360).toFixed(0), v2: vExag && vExag !== 1 ? tr("{vExag}x vertical exaggeration", { vExag }) : tr("no vertical exaggeration"), v3: section.corridor ? tr(" · data within ±{corridor} m of the line (dashed = trace projected from further away)", { corridor: section.corridor }) : "" })}</text>

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
          <text x={W - PAD - 4} y={sz(elevationProfile[elevationProfile.length - 1].z) - 6} fill="#8a6a1f" fontSize="9.5" textAnchor="end">{tr("Ground surface (SRTM)")}</text>
        </g>
      )}

      {holes.map((h, hi) => {
        const pts = h.trace.map((p) => [sx(along(p.x, p.y)), sz(p.z)]);
        // TASKS.csv #499 — solid only where the hole is inside the corridor; the rest is projected onto the
        // section from further away, so it is drawn faint and dashed (and carries no data: the main window
        // clips intervals / assays / structures to the in-corridor runs). Older payloads without runs: solid.
        const runs = h.runs;
        const at = (md) => { // trace position at a measured depth, interpolated
          const trace = h.trace;
          let i = 1; while (i < trace.length - 1 && trace[i].md < md) i++;
          const p0 = trace[i - 1], p1 = trace[i], t = p1.md === p0.md ? 0 : Math.max(0, Math.min(1, (md - p0.md) / (p1.md - p0.md)));
          return [sx(along(p0.x + t * (p1.x - p0.x), p0.y + t * (p1.y - p0.y))), sz(p0.z + t * (p1.z - p0.z))];
        };
        const solid = runs ? runs.map(([m0, m1]) => [at(m0), ...h.trace.filter((p) => p.md > m0 && p.md < m1).map((p) => [sx(along(p.x, p.y)), sz(p.z)]), at(m1)]) : [pts];
        const off = h.minOffset != null ? (Math.abs(h.maxOffset - h.minOffset) < 0.5 ? `${h.minOffset >= 0 ? "+" : ""}${h.minOffset.toFixed(0)} m` : `${h.minOffset >= 0 ? "+" : ""}${h.minOffset.toFixed(0)}…${h.maxOffset >= 0 ? "+" : ""}${h.maxOffset.toFixed(0)} m`) : null;
        return (
          <g key={hi}>
            {runs && <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#9aa5b3" strokeWidth="1" strokeDasharray="4 3"><title>{tr("{hole_id}: outside the ±{corridor} m buffer — projected onto the section, no data drawn here", { hole_id: h.hole_id, corridor: section.corridor })}</title></polyline>}
            {solid.map((seg, si) => <polyline key={si} points={seg.map((p) => p.join(",")).join(" ")} fill="none" stroke="#445064" strokeWidth="1.2"><title>{`${h.hole_id}${off ? tr(": {off} from the section line", { off }) : ""}`}</title></polyline>)}
            {/* TASKS.csv #897 — the offset in view, not only in the tooltip, when the hole is more than 5 m off the section */}
            {off && Math.max(Math.abs(h.minOffset), Math.abs(h.maxOffset)) > 5 && (() => { const end = solid.length ? solid[solid.length - 1].at(-1) : pts.at(-1); return end ? <text x={end[0] + 4} y={end[1] + 10} fill="#7a8494" fontSize="9" pointerEvents="none">{off}</text> : null; })()}
          </g>
        );
      })}

      {/* TASKS.csv #357 — model surfaces / imported solids cut by the section plane. */}
      {surfaceTraces.length > 0 && (
        <g clipPath="url(#sectionPlotArea)">
          {surfaceTraces.map((st) => (
            <g key={st.id}>
              <path d={st.segs.map((sg) => `M${sx(sg[0]).toFixed(1)},${sz(sg[1]).toFixed(1)}L${sx(sg[2]).toFixed(1)},${sz(sg[3]).toFixed(1)}`).join("")} stroke={st.color} strokeWidth="2" fill="none" strokeLinecap="round"><title>{tr("Model surface: {name}", { name: st.name })}</title></path>
            </g>
          ))}
        </g>
      )}
      {/* TASKS.csv #395 — planned holes, dashed. #1010 — with depth ticks (every 50 m, labelled every 100 m, as the drilled
          holes), the planned end depth, and a labelled marker where the hole crosses each visible modelled surface. */}
      {plannedHoles.map((ph, i) => {
        const pts = ph.trace.map((p) => [sx(along(p.x, p.y)), sz(p.z)]);
        const t = ph.trace, hasMd = t.length > 1 && t.every((p) => Number.isFinite(p.md));
        const marks = [];
        if (hasMd) {
          const eoh = t[t.length - 1].md;
          for (let md = 50; md < eoh - 5; md += 50) {
            const p = interpTrace(t, md), q = interpTrace(t, Math.min(eoh, md + 1));
            if (!p || !q) continue;
            const x = sx(along(p.x, p.y)), y = sz(p.z);
            const [nx, ny] = screenNormal(x, y, sx(along(q.x, q.y)), sz(q.z));
            marks.push(<g key={`m${md}`}><line x1={x - nx * 3} y1={y - ny * 3} x2={x - nx * 7} y2={y - ny * 7} stroke="#b06a1f" strokeWidth="0.8" />{md % 100 === 0 && <text x={x - nx * 10} y={y - ny * 10 + 3} fill="#b06a1f" fontSize="8" textAnchor={nx >= 0 ? "end" : "start"}>{md}</text>}</g>);
          }
          const last = t[t.length - 1];
          marks.push(<text key="eoh" x={sx(along(last.x, last.y))} y={sz(last.z) + 11} fill="#b06a1f" fontSize="9" textAnchor="middle">{tr("planned EOH {v} m", { v: Math.round(eoh) })}</text>);
        }
        (ph.pierces || []).forEach((q, k) => {
          const x = sx(along(q.x, q.y)), y = sz(q.z);
          marks.push(<g key={`p${k}`}><circle cx={x} cy={y} r="3.2" fill="#fff" stroke="#b06a1f" strokeWidth="1.4" /><text x={x + 6} y={y - 4} fill="#7a4512" fontSize="9" fontWeight="600">{tr("{md} m · {surface}", { md: q.md.toFixed(1), surface: q.name })}</text><title>{tr("{hole} crosses {surface} at {md} m downhole", { hole: ph.name, surface: q.name, md: q.md.toFixed(1) })}</title></g>);
        });
        return (
          <g key={`ph${i}`}>
            <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#b06a1f" strokeWidth="1.6" strokeDasharray="6 4"><title>{tr("Planned hole: {name}", { name: ph.name })}</title></polyline>
            {marks}
          </g>
        );
      })}

      {/* TASKS.csv #392 — one ribbon per interval layer, offset to alternate sides of the trace (the first
          layer on the trace itself), instead of every layer as the same 4 px stroke on top of each other,
          where whichever layer drew last (usually alteration) hid lithology. */}
      {intervals.map((row, i) => {
        const trace = traceByHole[row.hole_id];
        if (!trace) return null;
        const p1 = interpTrace(trace, row.from), p2 = interpTrace(trace, row.to);
        if (!p1 || !p2) return null;
        const x1 = sx(along(p1.x, p1.y)), y1 = sz(p1.z), x2 = sx(along(p2.x, p2.y)), y2 = sz(p2.z);
        const off = ribbonOffset[row.layer || "_"] || 0;
        const [nx, ny] = screenNormal(x1, y1, x2, y2);
        return <line key={i} x1={x1 + nx * off} y1={y1 + ny * off} x2={x2 + nx * off} y2={y2 + ny * off} stroke={row.color} strokeWidth="5" strokeLinecap="butt"><title>{row.label}</title></line>;
      })}

      {/* TASKS.csv #392 — assays as grade bars perpendicular to the trace, beyond the ribbons, length
          proportional to grade (per element, to the highest value in this section); the highest values
          are labelled. Non-assay point data stay dots. */}
      {points.map((row, i) => {
        const trace = traceByHole[row.hole_id];
        if (!trace) return null;
        if (row.assay) {
          const a = row.assay;
          const q1 = interpTrace(trace, a.from), q2 = interpTrace(trace, a.to);
          if (!q1 || !q2) return null;
          const x1 = sx(along(q1.x, q1.y)), y1 = sz(q1.z), x2 = sx(along(q2.x, q2.y)), y2 = sz(q2.z);
          const [nx, ny] = screenNormal(x1, y1, x2, y2);
          const base = ribbonReach + 5 + a.idx * (BAR_MAX + 8);
          const len = assayMax[a.sym] > 0 ? Math.max(1, (a.value / assayMax[a.sym]) * BAR_MAX) : 1;
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          const bx0 = mx + nx * base, by0 = my + ny * base, bx1 = mx + nx * (base + len), by1 = my + ny * (base + len);
          const thick = Math.max(1.5, Math.hypot(x2 - x1, y2 - y1));
          return (
            <g key={i}>
              <line x1={bx0} y1={by0} x2={bx1} y2={by1} stroke={row.color} strokeWidth={Math.min(thick, 6)} strokeLinecap="butt"><title>{`${row.label} (${a.from}–${a.to} m)`}</title></line>
              {labelledAssays.has(row) && <text x={bx1 + nx * 3} y={by1 + ny * 3 + 3} fill="#1a2028" fontSize="9" textAnchor={nx >= 0 ? "start" : "end"}>{a.value}</text>}
            </g>
          );
        }
        const p = interpTrace(trace, row.md);
        if (!p) return null;
        return <circle key={i} cx={sx(along(p.x, p.y))} cy={sz(p.z)} r="3.5" fill={row.color} stroke="#ffffff" strokeWidth="0.5"><title>{row.label}</title></circle>;
      })}

      {/* TASKS.csv #392 — downhole depth ticks (every 50 m, labelled every 100 m) and the end-of-hole depth. */}
      {holes.map((h, hi) => {
        const trace = h.trace;
        if (!trace?.length) return null;
        const eoh = trace[trace.length - 1].md;
        const marks = [];
        for (let md = 50; md < eoh - 5; md += 50) {
          const p = interpTrace(trace, md), q = interpTrace(trace, Math.min(eoh, md + 1));
          if (!p || !q) continue;
          const x = sx(along(p.x, p.y)), y = sz(p.z);
          const [nx, ny] = screenNormal(x, y, sx(along(q.x, q.y)), sz(q.z));
          marks.push(<g key={md}><line x1={x - nx * 3} y1={y - ny * 3} x2={x - nx * 7} y2={y - ny * 7} stroke="#445064" strokeWidth="0.8" />{md % 100 === 0 && <text x={x - nx * 10} y={y - ny * 10 + 3} fill="#65717e" fontSize="8" textAnchor={nx >= 0 ? "end" : "start"}>{md}</text>}</g>);
        }
        const last = trace[trace.length - 1];
        return (
          <g key={`dt${hi}`}>
            {marks}
            {labels.mode !== "end" && labels.mode !== "both" && <text x={sx(along(last.x, last.y))} y={sz(last.z) + 11} fill="#1a2028" fontSize="9" textAnchor="middle">{tr("EOH {v} m", { v: Math.round(eoh) })}</text>}{/* #823: in the end-of-hole label otherwise */}
          </g>
        );
      })}

      {planes.map((row, i) => {
        const trace = traceByHole[row.hole_id];
        if (!trace) return null;
        const p = interpTrace(trace, row.depth);
        if (!p) return null;
        const cx = sx(along(p.x, p.y)), cy = sz(p.z);
        // TASKS.csv #394 — no orientation recorded: an open ring, not an invented 45 deg line.
        if (row.apparentDip == null || !Number.isFinite(row.apparentDip)) {
          return <circle key={i} cx={cx} cy={cy} r="5" fill="none" stroke={row.color} strokeWidth="2"><title>{tr("{label} — orientation not recorded", { label: row.label })}</title></circle>;
        }
        // TASKS.csv #394 — draw the apparent dip at its ON-SCREEN angle: with vertical exaggeration (or any
        // difference between the horizontal and vertical pixel scales) a 45 deg plane must display steeper
        // (63 deg at 2x). tan(screen) = tan(apparent) x (px per vertical metre / px per horizontal metre).
        const kx = Math.abs(sx(1) - sx(0)) || 1, kz = Math.abs(sz(1) - sz(0)) || 1;
        const rad = Math.atan(Math.tan((row.apparentDip * Math.PI) / 180) * (kz / kx));
        const len2 = 12;
        const ddx = Math.cos(rad) * len2, ddy = Math.sin(rad) * len2;
        return <line key={i} x1={cx - ddx} y1={cy - ddy} x2={cx + ddx} y2={cy + ddy} stroke={row.color} strokeWidth="2.5"><title>{tr("{label} — apparent dip {v}°{v2}", { label: row.label, v: Math.abs(row.apparentDip).toFixed(0), v2: Math.abs(kz / kx - 1) > 0.01 ? tr(" (drawn at {v}° for the {v2}x vertical exaggeration)", { v: Math.abs((rad * 180) / Math.PI).toFixed(0), v2: (kz / kx).toFixed(1) }) : "" })}</title></line>;
      })}

      {/* User-drawn interpreted contacts (TASKS.csv) — rendered on top of everything else so they're
          always visible while sketching over the drillhole data. */}
      {/* TASKS.csv #519 — the nearest parallel sections' strings, ghosted (projected onto this section) */}
      {(data.ghostStrings || []).map((g) => g.strings.filter((st) => st.points.length > 1).map((st, i) => (
        <g key={`${g.sectionId}_${i}`} opacity="0.4">
          <polyline points={st.points.map((p) => `${sx(p.l)},${sz(p.z)}`).join(" ")} fill="none" stroke={st.color || "#7a8494"} strokeWidth="1.6" strokeDasharray="2 3" />
          <text x={sx(st.points[st.points.length - 1].l) + 4} y={sz(st.points[st.points.length - 1].z)} fill={st.color || "#7a8494"} fontSize="9">{`${st.unit} — ${g.sectionName} (${g.offset > 0 ? "+" : ""}${Math.round(g.offset)} m)`}</text>
        </g>
      )))}
      {contacts.map((c) => (
        <g key={c.id}>
          {/* a wide transparent hit line: clicking it inserts a vertex while this string is being edited */}
          {c.id === editingId && <polyline points={c.points.map((p) => `${sx(p.l)},${sz(p.z)}`).join(" ")} fill="none" stroke="transparent" strokeWidth="10" style={{ cursor: "copy" }} onClick={(e) => insertAt(c, e)} />}
          {c.kind === "outline" /* TASKS.csv #570 — a closed body outline */
            ? <polygon points={c.points.map((p) => `${sx(p.l)},${sz(p.z)}`).join(" ")} fill={c.color} fillOpacity="0.15" stroke={c.color} strokeWidth={c.id === editingId ? 3 : 2.5} pointerEvents="none" />
            : <polyline points={c.points.map((p) => `${sx(p.l)},${sz(p.z)}`).join(" ")} fill="none" stroke={c.color} strokeWidth={c.id === editingId ? 3 : 2.5} strokeDasharray="6 3" pointerEvents="none" />}
          {c.points.map((p, i) => {
            const common = { fill: c.color, stroke: c.id === editingId ? "#1a2028" : "none", strokeWidth: 1 };
            const handlers = c.id === editingId ? {
              style: { cursor: "move" },
              onMouseDown: (e) => { e.stopPropagation(); if (e.altKey) { onEditPoints(c.id, (pts) => deleteVertex(pts, i)); return; } if (e.shiftKey && c.kind === "outline") { onEditPoints(c.id, (pts) => setTieVertex(pts, i)); return; } /* #874 */ dragRef.current = { id: c.id, i }; },
              onClick: (e) => e.stopPropagation(),
            } : {};
            const r = c.id === editingId ? 4.5 : 2.5;
            if (p.tie) return <g key={i}><circle cx={sx(p.l)} cy={sz(p.z)} r={r + 3.5} fill="none" stroke={c.color} strokeWidth="2" pointerEvents="none" /><circle cx={sx(p.l)} cy={sz(p.z)} r={r} {...common} {...handlers}><title>{tr("Tie point: linked to the tie point of this body's outline on the next section")}</title></circle></g>; /* #874 */
            const tip = p.snap ? `${p.hole_id} @ ${Number(p.md).toFixed(2)} m (snapped to ${p.snap === "boundary" ? "the logged contact" : "the trace"})` : "free point";
            return p.snap
              ? <rect key={i} x={sx(p.l) - r} y={sz(p.z) - r} width={2 * r} height={2 * r} {...common} {...handlers}><title>{tip}</title></rect>
              : <circle key={i} cx={sx(p.l)} cy={sz(p.z)} r={r} {...common} {...handlers}><title>{tip}</title></circle>;
          })}
          <text x={sx(c.points[0].l)} y={sz(c.points[0].z) - 8} fill={c.color} fontSize="10" fontWeight="600">{c.unit}</text>
        </g>
      ))}
      {/* TASKS.csv #395 — the hole being designed */}
      {planPts.length > 0 && (
        <g>
          {planPts.length === 2 && <line x1={sx(planPts[0].l)} y1={sz(planPts[0].z)} x2={sx(planPts[1].l)} y2={sz(planPts[1].z)} stroke="#b06a1f" strokeWidth="2" strokeDasharray="6 4" />}
          <circle cx={sx(planPts[0].l)} cy={sz(planPts[0].z)} r="4" fill="#b06a1f" stroke="#ffffff" strokeWidth="1.2"><title>{tr("Collar")}</title></circle>
          {planPts[1] && <g><circle cx={sx(planPts[1].l)} cy={sz(planPts[1].z)} r="6" fill="none" stroke="#b06a1f" strokeWidth="1.6" /><circle cx={sx(planPts[1].l)} cy={sz(planPts[1].z)} r="1.8" fill="#b06a1f" /><title>{tr("Target")}</title></g>}
        </g>
      )}
      {drawing && drawPoints.length > 0 && (
        <g>
          <polyline points={drawPoints.map((p) => `${sx(p.l)},${sz(p.z)}`).join(" ")} fill="none" stroke="#e2a63c" strokeWidth="2" strokeDasharray="4 3" />
          {drawPoints.map((p, i) => (p.snap
            ? <rect key={i} x={sx(p.l) - 3.5} y={sz(p.z) - 3.5} width="7" height="7" fill="#e2a63c" stroke="#1a2028" strokeWidth="1"><title>{`${p.hole_id} @ ${Number(p.md).toFixed(2)} m (snapped)`}</title></rect>
            : <circle key={i} cx={sx(p.l)} cy={sz(p.z)} r="3" fill="#e2a63c" stroke="#ffffff" strokeWidth="1" />))}
        </g>
      )}

      {/* TASKS.csv #823 — hole labels, placed so none overlap (lib/sectionLabels.js), with leader lines; drag one to move it */}
      {labels.mode !== "off" && (() => {
        const items = [];
        holes.forEach((h) => {
          const t = h.trace;
          if (!t?.length) return;
          const first = t[0], last = t[t.length - 1];
          if (labels.mode === "collar" || labels.mode === "both") items.push({ key: `${h.hole_id}|collar`, text: h.hole_id, ax: sx(along(first.x, first.y)), ay: sz(first.z), dir: -1, color: "#1a2028" });
          if (labels.mode === "end" || labels.mode === "both") items.push({ key: `${h.hole_id}|end`, text: tr("{hole} · EOH {v} m", { hole: h.hole_id, v: Math.round(last.md ?? 0) }), ax: sx(along(last.x, last.y)), ay: sz(last.z), dir: 1, color: "#1a2028" });
        });
        plannedHoles.forEach((ph) => {
          const t = ph.trace;
          if (!t?.length) return;
          const atEnd = labels.mode === "end";
          const p = atEnd ? t[t.length - 1] : t[0];
          items.push({ key: `plan:${ph.name}|${atEnd ? "end" : "collar"}`, text: tr("{name} (planned)", { name: ph.name }), ax: sx(along(p.x, p.y)), ay: sz(p.z), dir: atEnd ? 1 : -1, color: "#b06a1f" });
        });
        const fixed = { ...labels.offsets, ...(labelDrag ? { [labelDrag.key]: { dx: labelDrag.dx, dy: labelDrag.dy } } : {}) };
        const color = Object.fromEntries(items.map((it) => [it.key, it.color]));
        const placed = placeLabels(items, { fontSize: 9, bounds: [4, W - 4], fixed }); // the whole drawing: holes run past the plot frame
        return (
          <g>
            {placed.map((b) => {
              const lead = labels.leaders === "always" ? Math.hypot(b.x - b.ax, b.y - b.ay) > 8 : labels.leaders === "auto" && b.leader;
              const [lx, ly] = leaderEnd(b);
              return (
                <g key={b.key} style={{ cursor: drawing ? "crosshair" : labelDrag?.key === b.key ? "grabbing" : "grab" }}
                  onMouseDown={(e) => {
                    if (drawing || e.button !== 0) return;
                    e.stopPropagation(); e.preventDefault();
                    const local = localOf(e);
                    if (!local) return;
                    labelDragRef.current = { key: b.key, ax: b.ax, ay: b.ay, grabDx: local.x - b.x, grabDy: local.y - b.y };
                  }}>
                  {lead && <><line x1={b.ax} y1={b.ay} x2={lx} y2={ly} stroke="#7a8494" strokeWidth="0.7" /><circle cx={b.ax} cy={b.ay} r="1.6" fill="#7a8494" /></>}
                  <rect x={b.x - b.w / 2} y={b.y - b.h + 1} width={b.w} height={b.h + 1} fill="#ffffff" fillOpacity={lead || b.moved ? 0.85 : 0} />
                  <text x={b.x} y={b.y - 1} fill={color[b.key]} fontSize="9" textAnchor="middle">{b.text}<title>{tr("Drag to move this label")}</title></text>
                </g>
              );
            })}
          </g>
        );
      })()}
      <text x={W / 2} y={H - 14} fill="#55606e" fontSize="11" textAnchor="middle">{tr("Distance along section (m)")}</text>
      <text x={16} y={H / 2} fill="#55606e" fontSize="11" textAnchor="middle" transform={`rotate(-90 16 ${H / 2})`}>{tr("Elevation (m)")}</text>
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
// Unit normal (in screen space) to the segment p1 -> p2, pointing to its right; (1, 0) for a degenerate one.
function screenNormal(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  return L > 1e-6 ? [-dy / L, dx / L] : [1, 0];
}

// TASKS.csv #393 — round-number ticks (1, 2, 2.5 or 5 x 10^k) covering [min, max], about `count` of them.
function niceTicks(min, max, count) {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / count, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}
