// TASKS.csv #1136 — the Targeting tab's planned-hole form, rows and checks, moved out of ViewerModule (loaded when the
// Targeting tab first shows them, not at startup)
import React, { useState, useEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, Trash2 } from "./icons.js";
import { activateOnKey, iconAction } from "../lib/a11y.js";
import { t as tr } from "../lib/i18n.js";
import { colors } from "../lib/theme.js";
import { lazyModal } from "../lib/lazyModal.jsx";
import { solveOrientationToTarget, plannedTrace, solveCollarForTarget, isShallowDip, SHALLOW_DIP_DEG, nearestCollarsToTarget } from "../lib/holePlanning.js"; // nearestCollarsToTarget: #2250; // solveCollarForTarget / shallow: TASKS.csv #1835
import { azimuthToGridOffset, loadIgrf, wrap360 } from "../lib/azimuthRef.js"; // TASKS.csv #1729
import { planGeometryKey, drilledTraceIndex, isTargetModel, targetBandIndex, planChecks, COLLAR_ZONE_M } from "../lib/plannedHoleChecks.js"; // TASKS.csv #1039; COLLAR_ZONE_M: #1454
import { piercePoints as surfacePierces } from "../lib/piercePoints.js"; // TASKS.csv #1009
import { collarGround, collarsLookUnderground } from "../lib/pitShell.js"; // TASKS.csv #2100 — the ground between the collars when there is no terrain; underground: #2251 / #2253

const PlannedHoleTargeting = lazyModal(() => import("./PlannedHoleTargeting.jsx")); // TASKS.csv #119
// the same one-line wrapper ViewerModule keeps (see its plannedHoleTrace comment): holePlanning.plannedTrace builds every plan's trace
const plannedHoleTrace = (hole) => plannedTrace(hole);


// TASKS.csv #188/follow-up — Targeting module: add-planned-hole form. Originally "Use cursor" just
// read the live status-bar cursor value (store.cursor) at the moment of the click — which is wherever
// the mouse last was over the 3D view BEFORE moving onto this sidebar button, not the point the user
// actually meant to pick. Real user report: "there is a bug on the select from cursor button. it
// should let me click on the view to retrieve the coordinates, instead it just grab the coordinates of
// the exact moment I click on the button." Now a real two-step pick: clicking the button ARMS
// pickHoleMode (in the parent — same shape as sectionMode/measureMode's own click-to-place tools) and
// changes its own label/style to "Click on the view…"; the next click anywhere in the 3D view raycasts
// a real world point (onPickHoleClick, terrain/voxel/drillhole-aware, not just a flat plane) and this
// form picks it up via the `pickedPoint` prop.
// TASKS.csv #239 — mineral-exploration/QGIS-specialist audit finding: "no utility to pick a target
// point and solve azimuth/dip from a chosen collar." Straight-line solve only (matches how a planned
// hole is already designed here — a single azimuth/dip/length, not a multi-segment survey plan): given
// a start point (an existing real collar, or the x/y/z fields above) and a typed target point, computes
// the azimuth/dip a straight hole from the start would need to pass through the target, and the
// straight-line distance (pre-filled into Length so "+ Add hole" produces a hole that actually reaches
// it, not the previous default length falling short or overshooting).
// TASKS.csv #119 — this used to be a local 10-line implementation here. It is now a thin adapter over
// holePlanning.js's solveOrientationToTarget, which is the same math (verified bit-identical over
// 200,000 random collar/target pairs: max azimuth/dip difference 0.000e+0 deg, max length difference
// 9.095e-13 m) but lives in a pure, Node-unit-tested module that the per-hole targeting panel
// (components/PlannedHoleTargeting.jsx) also uses. Two copies of the same trigonometry in one app is
// exactly how the two halves of a feature drift apart.
//
// The one behavioural difference is deliberate: solveOrientationToTarget returns null when the target
// IS the collar (no direction is defined) where the old local version silently returned az 0 / dip 0 /
// distance 0. Callers here already gate on targetReady/fromReady, and the `|| { ... }` fallback below
// preserves the old shape for that degenerate case so no call site has to change.
function solveAzDipToTarget(from, to) {
  const s = solveOrientationToTarget(from, to) || { azimuth: 0, dip: 0, length: 0 };
  return { azimuth: s.azimuth, dip: s.dip, distance: s.length };
}
// TASKS.csv #1456 (review #1352) — presetTarget ({ x, y, z, at }): a target handed over from Targeting (an undrilled zone's centre);
// the target typed or handed over is saved on the new hole (its Target panel opened empty and had to be typed again), and the
// solve runs PAST_TARGET_M beyond it like that panel's default (the first solve ended the hole on the target, 14 m into the zone)
const PAST_TARGET_M = 30;
export function PlannedHoleAddForm({ onAdd, pickMode, onStartPick, pickedPoint, collars, noTerrain, presetTarget = null, epsg = null, groundAt = null, survey = null }) {
  const [draft, setDraft] = useState({ name: "", x: "", y: "", z: "", azimuth: 0, dip: -60, length: 100 });
  // TASKS.csv #1835 (review #1646, Kodiak) — where the collar's Elev came from, kept on the hole and written to the rig sheet
  // (z_source): a picked Elev is whatever the click hit (the top of an IP cell, there), and it reached the CSV / GPX unmarked
  const [zSource, setZSource] = useState("typed");
  // TASKS.csv #2100 (review #2013, Woodjam) — no terrain: the ground interpolated between the nearest collars (as Undrilled zones, the pit
  // and the dump already use, #1557 / #1616), before a flat plane: Woodjam's pick read 967 m where the collars around stand at 1,001-1,019 m
  const collarZ = useMemo(() => (!groundAt && collars?.length ? collarGround(collars) : null), [groundAt, collars]);
  const ground = groundAt || collarZ;
  // TASKS.csv #2251 / #2253 (review #2174, WA gold) — on a project drilled from underground the surface through the collars is a level between
  // drill positions, not the ground, and an uphole is a normal design: said so, in place of the surface-drilling wording
  const underground = useMemo(() => !groundAt && (collars?.length || 0) > 1 && collarsLookUnderground(collars, survey || []).underground, [groundAt, collars, survey]);
  const [collarNote, setCollarNote] = useState(null);
  // TASKS.csv #1729 (review #1645, Copley) — which north the typed azimuth is from. Stored holes stay grid (every check and the rig
  // sheet read grid); a true or magnetic entry is converted at the collar and kept beside it. Copley designs in true north: typed as
  // grid, its hole turned 1.45 deg and the as-drilled comparison counted the convergence as drift.
  const [azRef, setAzRef] = useState("grid");
  const [igrfReady, setIgrfReady] = useState(false);
  useEffect(() => { if (azRef === "magnetic") loadIgrf().then(() => setIgrfReady(true)).catch(() => {}); }, [azRef]);
  const today = new Date().toISOString().slice(0, 10);
  const azOffset = useMemo(() => { if (azRef === "grid") return { offset: 0 }; if (azRef === "magnetic" && !igrfReady) return null; try { return azimuthToGridOffset(azRef, Number(draft.x), Number(draft.y), epsg, today); } catch { return null; } }, [azRef, igrfReady, draft.x, draft.y, epsg, today]);
  const [fromCollarId, setFromCollarId] = useState("");
  const [target, setTarget] = useState({ x: "", y: "", z: "" });
  const lastPreset = useRef(null);
  const [upward, setUpward] = useState(false);
  useEffect(() => {
    if (!presetTarget || presetTarget === lastPreset.current) return;
    lastPreset.current = presetTarget;
    const r = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : ""); // #1456 — an overlay's place has no elevation: left blank to type
    setTarget({ x: r(presetTarget.x), y: r(presetTarget.y), z: r(presetTarget.z) });
  }, [presetTarget]);
  const set = (k, v) => setDraft((p) => ({ ...p, [k]: v }));
  const lastAppliedPick = useRef(null);
  useEffect(() => {
    if (!pickedPoint || pickedPoint === lastAppliedPick.current) return;
    lastAppliedPick.current = pickedPoint;
    const zc = !pickedPoint.on && collarZ ? collarZ(pickedPoint.x, pickedPoint.y) : NaN; // #2100 — the click hit nothing
    setDraft((p) => ({ ...p, x: Math.round(pickedPoint.x * 10) / 10, y: Math.round(pickedPoint.y * 10) / 10, z: Math.round((Number.isFinite(zc) ? zc : pickedPoint.z) * 10) / 10 }));
    setZSource(Number.isFinite(zc) ? "the ground interpolated between the nearest collars (no terrain)" : `picked on the view (${pickedPoint.on || "a flat plane through the data"})`); setCollarNote(null); // #1835
  }, [pickedPoint]);
  const applyFromCollar = (holeId) => {
    setFromCollarId(holeId);
    const c = collars.find((h) => h.hole_id === holeId);
    if (c) { setDraft((p) => ({ ...p, name: p.name || `${holeId}-target`, x: c.x, y: c.y, z: c.z })); setZSource(`collar ${holeId}`); setCollarNote(null); } // zSource: #1835
  };
  const targetReady = ["x", "y", "z"].every((k) => target[k] !== "" && !isNaN(Number(target[k])));
  const fromReady = draft.x !== "" && draft.y !== "" && draft.z !== "" && !isNaN(Number(draft.x)) && !isNaN(Number(draft.y)) && !isNaN(Number(draft.z));
  const solveTarget = () => {
    if (!targetReady || !fromReady) return;
    const { azimuth, dip, distance } = solveAzDipToTarget(
      { x: Number(draft.x), y: Number(draft.y), z: Number(draft.z) },
      { x: Number(target.x), y: Number(target.y), z: Number(target.z) },
    );
    const shown = azOffset ? wrap360(azimuth - azOffset.offset) : azimuth; // #1729 — the solved grid bearing in the chosen north
    setDraft((p) => ({ ...p, azimuth: Math.round(shown * 10) / 10, dip: Math.round(dip * 10) / 10, length: Math.round((distance + PAST_TARGET_M) * 10) / 10 })); // #1456 — past the target
    setUpward(dip > 0); // #1557 — a target above the collar: an upward hole, said
  };
  // TASKS.csv #2250 — from the existing collars nearest the target (an underground rig stands at a cuddy): each with the hole it needs
  const nearest = useMemo(() => (targetReady ? nearestCollarsToTarget(collars, { x: Number(target.x), y: Number(target.y), z: Number(target.z) }) : []), [targetReady, collars, target]);
  const planFromNearest = (n) => {
    setFromCollarId(n.hole_id);
    const shown = azOffset ? wrap360(n.azimuth - azOffset.offset) : n.azimuth;
    setDraft((p) => ({ ...p, name: p.name || `${n.hole_id}-target`, x: n.x, y: n.y, z: n.z, azimuth: Math.round(shown * 10) / 10, dip: Math.round(n.dip * 10) / 10, length: Math.round((n.length + PAST_TARGET_M) * 10) / 10 }));
    setZSource(`collar ${n.hole_id}`); setCollarNote(null); setUpward(n.dip > 0);
  };
  // TASKS.csv #1835 — the other way round: keep the dip and azimuth, move the collar to where that line through the target meets
  // the terrain (or the typed Elev when no terrain is loaded)
  const collarReady = targetReady && Number(draft.dip) < 0 && !isNaN(Number(draft.azimuth)) && !!azOffset && (!!ground || (draft.z !== "" && !isNaN(Number(draft.z)))); // ground: #2100
  const solveCollar = () => {
    if (!collarReady) return;
    const az = wrap360(Number(draft.azimuth) + azOffset.offset); // grid
    const r = solveCollarForTarget({ x: Number(target.x), y: Number(target.y), z: Number(target.z) }, az, Number(draft.dip), { groundAt: ground || null, surfaceZ: draft.z === "" ? NaN : Number(draft.z) }); // ground: #2100 — the collars' ground without a terrain
    if (!r) { setCollarNote({ warn: true, text: ground ? tr("No collar: a line through the target at this dip does not reach the terrain (the target may be above the ground, or the line leaves the terrain).") : tr("No collar: with no terrain the typed Elev stands for the ground, and it must be above the target for a downward hole.") }); return; }
    setDraft((p) => ({ ...p, x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, z: Math.round(r.z * 10) / 10, length: Math.round((r.length + PAST_TARGET_M) * 10) / 10 }));
    const onCollars = r.source === "terrain" && !groundAt; // #2100 — 'terrain' from the solver means the ground function it was given
    setZSource(onCollars ? "solved on the ground interpolated between the collars (no terrain)" : r.source === "terrain" ? "solved on the terrain" : "solved at the typed elevation");
    setCollarNote({ warn: r.source !== "terrain" || onCollars, text: onCollars
      ? (underground ? tr("No terrain, and the collars look underground: the collar is placed where this line meets a surface through the drill collars (a level between drill positions, not the ground), {h} m from the target in plan. Type the drill level's RL, or load a terrain.", { h: Math.round(r.horizontal) }) /* #2253 */ : tr("No terrain: the collar is placed where this line meets the ground interpolated between the nearest collars, {h} m from the target in plan. Check that elevation before using it, or load a terrain.", { h: Math.round(r.horizontal) }))
      : r.source === "terrain"
      ? tr("Collar placed where this line meets the terrain, {h} m from the target in plan; the length runs {m} m past the target.", { h: Math.round(r.horizontal), m: PAST_TARGET_M })
      : tr("No terrain: the collar is placed at the typed Elev {z} m, {h} m from the target in plan. Check that elevation against the ground before using it.", { z: Math.round(r.z * 10) / 10, h: Math.round(r.horizontal) }) });
    setUpward(false);
  };
  const shallow = isShallowDip(Number(draft.dip)); // #1835
  const canAdd = draft.x !== "" && draft.y !== "" && draft.z !== "" && !isNaN(Number(draft.x)) && !isNaN(Number(draft.y)) && !isNaN(Number(draft.z)) && !isNaN(Number(draft.azimuth)) && !isNaN(Number(draft.dip)) && Number(draft.length) > 0 && !!azOffset;
  const gridAz = azOffset ? Math.round(wrap360(Number(draft.azimuth) + azOffset.offset) * 100) / 100 : null;
  const submit = () => {
    if (!canAdd) return;
    onAdd({ name: draft.name.trim() || undefined, x: Number(draft.x), y: Number(draft.y), z: Number(draft.z), azimuth: azRef === "grid" ? Number(draft.azimuth) : gridAz, dip: Number(draft.dip), length: Number(draft.length),
      ...(azRef !== "grid" ? { azimuthEntered: { value: Number(draft.azimuth), ref: azRef, date: today } } : {}), // #1729
      zSource, // #1835
      ...(targetReady ? { target: { x: Number(target.x), y: Number(target.y), z: Number(target.z) }, pastTargetM: PAST_TARGET_M } : {}) }); // #1456 — the target goes with the hole
    setDraft({ name: "", x: "", y: "", z: "", azimuth: 0, dip: -60, length: 100 });
    setFromCollarId(""); setTarget({ x: "", y: "", z: "" }); setZSource("typed"); setCollarNote(null);
  };
  return (
    <div style={{ padding: "8px 9px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6 }}>
      <input placeholder={tr("Hole name (optional)")} value={draft.name} onChange={(e) => set("name", e.target.value)} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", fontSize: "var(--font-size-base)", color: "var(--color-text)", marginBottom: 5 }} />
      {collars.length > 0 && (
        <select aria-label={tr("Planned hole collar")}
          value={fromCollarId}
          onChange={(e) => applyFromCollar(e.target.value)}
          style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", fontSize: "var(--font-size-sm)", color: "var(--color-text)", marginBottom: 5 }}
          title={tr("Fill E/N/Elev below from an existing real collar, to design a new hole starting there")}
        >
          <option value="">{tr("Collar (E/N/Elev): custom, typed below")}</option>
          {collars.map((c) => <option key={c.hole_id} value={c.hole_id}>{c.hole_id}</option>)}
        </select>
      )}
      <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
        <NumField label="E" value={draft.x} onChange={(v) => set("x", v)} />
        <NumField label="N" value={draft.y} onChange={(v) => set("y", v)} />
        <NumField label={tr("Elev")} value={draft.z} onChange={(v) => { set("z", v); setZSource("typed"); }} />{/* zSource: #1835 */}
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
        <NumField label={tr("Az°")} value={draft.azimuth} onChange={(v) => set("azimuth", v)} />
        <NumField label={tr("Dip°")} value={draft.dip} onChange={(v) => set("dip", v)} />
        <NumField label={tr("Length m")} value={draft.length} onChange={(v) => set("length", v)} />
      </div>
      {shallow && <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 5, lineHeight: 1.4 }}>{tr("Dip {d}° is shallow: flatter than about {s}° a rig is hard to set up and the hole wanders more. Keep a dip you can drill and solve the collar for it below, or accept this one knowingly.", { d: draft.dip, s: -SHALLOW_DIP_DEG })}</div>}{/* #1835 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{/* #1729 */}
        <label>{tr("Azimuth from")} <select value={azRef} onChange={(e) => setAzRef(e.target.value)} aria-label={tr("North reference of the azimuth")} style={{ fontSize: "var(--font-size-xs)" }}>
          <option value="grid">{tr("grid north")}</option><option value="true">{tr("true north")}</option><option value="magnetic">{tr("magnetic north (today)")}</option>
        </select></label>
        {azRef !== "grid" && (azOffset && gridAz != null ? <span>{tr("= {g}° grid at this collar", { g: gridAz })}</span> : <span style={{ color: "var(--color-warn-text)" }}>{tr("Enter the collar and a project CRS to convert it.")}</span>)}
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        <button
          onClick={onStartPick}
          style={{ ...miniBtn, flex: 1, background: pickMode ? "var(--color-primary)" : miniBtn.background, border: pickMode ? "1px solid var(--color-primary)" : miniBtn.border, color: pickMode ? "var(--color-bg)" : miniBtn.color }}
          title={tr("Click, then click anywhere in the 3D view to place a hole there")}
        >
          {pickMode ? tr("Click on the view…") : tr("Pick on view")}
        </button>
        <button onClick={submit} disabled={!canAdd} style={{ ...miniBtn, flex: 1, background: canAdd ? "var(--color-selected-bg)" : "var(--color-bg-subtle)", borderColor: canAdd ? "var(--color-selected-border)" : "var(--color-border-light)", opacity: canAdd ? 1 : 0.5 }}>{tr("+ Add hole")}</button>
      </div>
      {/* TASKS.csv #1182 — with no terrain a click on empty space gets its Elev from a flat plane at the data's origin, and that value reached the rig sheet's CSV and GPX unmarked */}
      {noTerrain && pickedPoint && <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginTop: 4, lineHeight: 1.4 }}>{pickedPoint.onCollarSurface && !underground ? tr("No terrain is loaded: the E / N are where your click meets the ground interpolated between the nearest collars, and the Elev is that ground. Check it before using it, or load a terrain.") /* #2574 */ : zSource.startsWith("the ground interpolated") ? tr(underground ? "No terrain is loaded and the collars look underground: the Elev is on a surface through the drill collars, a level between drill positions, not the ground (the flat plane through the data would have given {p} m). Type the drill level's RL, or load a terrain." /* #2253 */ : "No terrain is loaded: the Elev is the ground interpolated between the nearest collars (the flat plane through the data would have given {p} m). Check it before using it, or load a terrain.", { p: Math.round(pickedPoint.z) }) : tr("No terrain is loaded, so a picked Elev is whatever the click hit, or a flat plane through the data. Check it before using it, or load a terrain.")}</div>}{/* #2100 */}
      <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 7, paddingTop: 7 }}>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 4 }}>{tr("Solve azimuth/dip/length to hit a target from the E/N/Elev above (the length runs {m} m past it; the target is kept on the hole)", { m: PAST_TARGET_M })}</div>
        <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
          <NumField label={tr("Target E")} value={target.x} onChange={(v) => setTarget((p) => ({ ...p, x: v }))} />
          <NumField label={tr("Target N")} value={target.y} onChange={(v) => setTarget((p) => ({ ...p, y: v }))} />
          <NumField label={tr("Target Elev")} value={target.z} onChange={(v) => setTarget((p) => ({ ...p, z: v }))} />
        </div>
        {upward && <div role="note" style={{ fontSize: "var(--font-size-xs)", color: underground ? "var(--color-text-secondary)" : "var(--color-warn-text)", marginBottom: 4, lineHeight: 1.4 }}>{underground ? tr("The target is above the collar, so the solved hole is an uphole: normal from underground development (this project's collars look underground). From a surface collar it could not be drilled.") /* #2251 */ : tr("The target is above the collar, so the solved hole points upward. From a surface collar that is not a hole you can drill: check the target's elevation.")}</div>}
        <button onClick={solveTarget} disabled={!targetReady || !fromReady} style={{ ...miniBtn, width: "100%", background: targetReady && fromReady ? "var(--color-selected-bg)" : "var(--color-bg-subtle)", borderColor: targetReady && fromReady ? "var(--color-selected-border)" : "var(--color-border-light)", opacity: targetReady && fromReady ? 1 : 0.5 }}>{tr("Solve az/dip/length to target")}</button>
        <button onClick={solveCollar} disabled={!collarReady} style={{ ...miniBtn, width: "100%", marginTop: 4, opacity: collarReady ? 1 : 0.5 }} title={tr("Keep the azimuth and dip above and move the collar: to where a line through the target at that dip meets the terrain, or the typed Elev when no terrain is loaded")}>{tr("Solve collar for this dip/azimuth")}</button>{/* #1835 */}
        {nearest.length > 0 && collars.length > 1 && (
          <div style={{ marginTop: 6 }}>{/* TASKS.csv #2250 */}
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 3 }}>{tr("From the nearest existing collars (the hole each needs to reach the target):")}</div>
            {nearest.map((n) => (
              <div key={n.hole_id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-xs)", marginBottom: 2 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tr("{id}: az {az}°, dip {dip}°, {len} m", { id: n.hole_id, az: Math.round(n.azimuth), dip: (n.dip > 0 ? "+" : "") + Math.round(n.dip), len: Math.round(n.length) })}</span>
                <button onClick={() => planFromNearest(n)} style={{ ...miniBtn, padding: "1px 7px" }} aria-label={tr("Plan from {id}", { id: n.hole_id })}>{tr("Use")}</button>
              </div>
            ))}
          </div>
        )}
        {collarNote && <div role="note" style={{ fontSize: "var(--font-size-xs)", color: collarNote.warn ? "var(--color-warn-text)" : "var(--color-text-muted)", marginTop: 4, lineHeight: 1.4 }}>{collarNote.text}</div>}
      </div>
    </div>
  );
}
function NumField({ label, value, onChange, placeholder }) {
  return (
    <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--font-size-xs)", color: "var(--color-text-faint)" }}>
      {label}
      <input type="number" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 5px", fontSize: "var(--font-size-sm)", color: "var(--color-text)" }} />
    </label>
  );
}

// TASKS.csv #170 — user request: "when you get to the #170/#188 overlap, just fill in the gaps like
// you suggested." #170 was originally scoped as a full drillhole-planning module; #188 (Targeting,
// above) already covers planning against the 3D model, visualizing planned traces, and CSV export.
// The gaps identified against #170's original wishlist were: automated intersection/target-proximity
// checking, collision/spacing checks against existing holes, and cost/meterage estimation. All three
// land here as one "Planned hole checks" panel, computed fresh from React state (collars/survey/
// voxelModels) rather than read from the three.js scene refs, so it can't be stale relative to the
// last render and always agrees with what's actually drawn.
// (the sums live in lib/plannedHoleChecks.js since TASKS.csv #1039)
const cellsVersions = new WeakMap();
let cellsVersionSeq = 0;
function cellsVersion(cells) { if (!cells) return 0; let v = cellsVersions.get(cells); if (!v) { v = ++cellsVersionSeq; cellsVersions.set(cells, v); } return v; }
export function PlannedHoleChecks({ plannedHoles, collars, survey, voxelModels, desurveyMethod, surfaces = [], onExportPierces }) { // #135; surfaces: #1009
  const [minSpacing, setMinSpacing] = useState(25);
  // TASKS.csv #1009 — where each planned hole crosses the visible modelled surfaces (downhole depth, vertical depth, angle)
  // TASKS.csv #1039 — keyed on the holes' geometry, not the array: typing a name or a note re-ran every check (1-8 s per
  // character on a large project). The drilled traces and each narrowed model's in-band blocks are indexed once.
  const geomKey = planGeometryKey(plannedHoles);
  const holesRef = useRef(plannedHoles);
  holesRef.current = plannedHoles;
  const pierces = useMemo(() => new Map(holesRef.current.map((h) => [h.id, surfacePierces(plannedHoleTrace(h), surfaces)])), [geomKey, surfaces]);
  const [costPerM, setCostPerM] = useState("");
  const drilled = useMemo(() => drilledTraceIndex(collars, survey, desurveyMethod), [collars, survey, desurveyMethod]);
  const targetKey = voxelModels.filter(isTargetModel).map((m) => `${m.id}|${m.threshold}|${m.rangeMax}|${m.min}|${m.max}|${m.supportCutoff ?? ""}|${cellsVersion(m.cells)}`).join(";"); // not opacity / colour
  const modelsRef = useRef(voxelModels);
  modelsRef.current = voxelModels;
  const targets = useMemo(() => modelsRef.current.filter(isTargetModel).map(targetBandIndex), [targetKey]);
  const checked = useMemo(() => planChecks(holesRef.current, drilled, targets, plannedHoleTrace), [geomKey, drilled, targets]);
  const results = checked.map((r) => ({ ...r, hole: plannedHoles.find((h) => h.id === r.hole.id) || r.hole })); // the current name
  const totalM = plannedHoles.reduce((s, h) => s + (Number(h.length) || 0), 0);
  const rate = Number(costPerM);
  const totalCost = costPerM !== "" && Number.isFinite(rate) && rate > 0 ? totalM * rate : null;
  const anyTargetModel = voxelModels.some(isTargetModel);

  return (
    <div style={{ marginTop: 10, padding: "9px 10px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6 }}>
      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)", fontWeight: 600, marginBottom: 6 }}>{tr("Planned hole checks")}</div>
      <div style={{ display: "flex", gap: 4, marginBottom: 7 }}>
        <NumField label={tr("Min. spacing (m)")} value={minSpacing} onChange={(v) => setMinSpacing(v === "" ? 0 : Math.max(0, v))} />
        <NumField label={tr("Cost ($/m)")} value={costPerM} placeholder={tr("enter your rate")} onChange={setCostPerM} />
      </div>
      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 7 }}>
        {tr("{plannedHoles} {v}, {totalM} m total{v2}", { plannedHoles: plannedHoles.length, v: tr(plannedHoles.length === 1 ? "hole" : "holes"), totalM: totalM.toLocaleString(), v2: totalCost != null ? tr(" — est. ${totalCost} at ${rate}/m", { totalCost: totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 }), rate }) : "" })}
      </div>
      {voxelModels.length > 0 && !anyTargetModel && (
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 7, lineHeight: 1.4 }}>{tr("Narrow a voxel model's Min/Max range in Targeting > Voxel ranges to check planned holes against a target band.")}</div>
      )}
      {drilled.proposed?.length > 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 7, lineHeight: 1.4 }}>{tr("{n} collar(s) whose status is proposed are not counted as drilled holes: {list}.", { n: drilled.proposed.length, list: drilled.proposed.slice(0, 6).join(", ") + (drilled.proposed.length > 6 ? ` (+${drilled.proposed.length - 6})` : "") })}</div>}{/* #2097 */}
      {results.map(({ hole, nearestReal, samePad = [], targetHits }) => {
        const tooClose = nearestReal && nearestReal.distance < minSpacing;
        return (
          <div key={hole.id} style={{ padding: "6px 8px", marginBottom: 5, borderRadius: 5, background: tooClose ? "var(--color-danger-bg-soft)" : "var(--color-bg-subtle)", border: `1px solid ${tooClose ? "var(--color-danger-fg)" : "var(--color-border)"}`, fontSize: "var(--font-size-sm)" }}>
            <div style={{ color: "var(--color-text)", marginBottom: 2 }}>{hole.name || tr("Planned hole")}</div>
            {samePad.length > 0 && <div style={{ color: "var(--color-text-caption)" }}>{tr("Same pad as {holes}: the first {m} m are not compared.", { holes: samePad.join(", "), m: COLLAR_ZONE_M })}</div>}{/* #1454 */}
            {nearestReal ? (
              <div style={{ color: tooClose ? "var(--color-danger-fg)" : "var(--color-text-caption)" }}>{tr("Nearest existing hole: {hole_id} — {distance} m{v}", { hole_id: nearestReal.hole_id, distance: nearestReal.distance.toFixed(1), v: tooClose ? tr(" (within the {minSpacing} m minimum)", { minSpacing }) : "" })}{nearestReal.md > 0 ? tr(", at {md} m down this hole", { md: Math.round(nearestReal.md) }) : ""}{nearestReal.assumed ? tr(" ({hole_id} has no survey and no azimuth / dip: taken as a vertical hole)", { hole_id: nearestReal.hole_id }) : ""}{/* #2097 */}
              </div>
            ) : (
              <div style={{ color: "var(--color-text-muted)" }}>{tr("No existing drilled holes to compare against.")}</div>
            )}
            {targetHits.length > 0 && (
              <div style={{ color: "var(--color-info)", marginTop: 2 }}>
                {targetHits.map((h) => tr("{m} m in the {band} band of \"{model}\"", { m: h.metres.toFixed(0), band: h.band || tr("target"), model: h.modelName })).join("; ")}{/* #1832 — the band's range and property */}
              </div>
            )}
            {/* TASKS.csv #1009 — pierce points */}
            {surfaces.length > 0 && (() => {
              const ps = pierces.get(hole.id) || [];
              if (!ps.length) return <div style={{ color: "var(--color-text-muted)", marginTop: 3 }}>{tr("Crosses none of the visible modelled surfaces.")}</div>;
              return (
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 4, fontSize: "var(--font-size-sm)" }}>
                  <thead><tr style={{ color: "var(--color-text-muted)", textAlign: "right" }}>
                    <th style={{ textAlign: "start", fontWeight: 500 }}>{tr("Surface")}</th>
                    <th style={{ fontWeight: 500 }} title={tr("Downhole depth along the planned trace (lift and drift included)")}>{tr("Depth (m)")}</th>
                    <th style={{ fontWeight: 500 }} title={tr("Vertical depth below the collar")}>{tr("Vert. (m)")}</th>
                    <th style={{ fontWeight: 500 }} title={tr("Angle between the hole and the surface where they meet: 90° is square on; a low angle gives a long, oblique intercept")}>{tr("Angle (°)")}</th>
                  </tr></thead>
                  <tbody>{ps.map((p, i) => (
                    <tr key={i} style={{ textAlign: "right", color: "var(--color-text)" }} title={`E ${p.x.toFixed(1)}  N ${p.y.toFixed(1)}  ${tr("elevation")} ${p.z.toFixed(1)}`}>
                      <td style={{ textAlign: "start", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{p.surfaceName}</td>
                      <td>{p.md.toFixed(1)}</td><td>{p.verticalDepth.toFixed(1)}</td><td>{p.angle == null ? "—" : p.angle.toFixed(0)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              );
            })()}
          </div>
        );
      })}
      {surfaces.length > 0 && onExportPierces && (
        <button onClick={onExportPierces} style={{ width: "100%", marginTop: 4, padding: "5px 8px", fontSize: "var(--font-size-sm)", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 5, cursor: "pointer", color: "var(--color-text)" }}
          title={tr("Every planned hole's crossings of the visible modelled surfaces: hole, surface, downhole and vertical depth, easting, northing, elevation and angle")}>{tr("Export pierce points (CSV)")}</button>
      )}
      {surfaces.length === 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>{tr("Build or show a modelled surface (3D Modelling) to list where the planned holes cross it.")}</div>}
    </div>
  );
}

// TASKS.csv #188 — Targeting module: one row per planned hole, all fields inline-editable (same
// "click into place, no separate edit modal" pattern as AttributeTableModal's cells) since a planned
// hole is a handful of numbers a geologist will realistically keep nudging while designing a
// program, not a big enough object to warrant a whole edit modal like VoxelLegendEditor's.
export function PlannedHoleRow({ hole, onUpdate, onRemove, collars, survey }) { // #119 - collars/survey for the as-drilled comparison
  const [expanded, setExpanded] = useState(false);
  const raw = plannedHoleTrace(hole);
  const toe = raw.length ? raw[raw.length - 1] : null;
  return (
    <div style={{ marginBottom: 6, padding: "7px 9px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-base)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => onUpdate(hole.id, { visible: hole.visible === false })} style={{ cursor: "pointer", color: hole.visible !== false ? colors.planned : "var(--color-text-disabled)", flexShrink: 0 }} title={hole.visible !== false ? tr("Hide") : tr("Show")}>
          {hole.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
        </div>
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setExpanded((v) => !v)} style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}>{hole.name || tr("Planned hole")}</div>
        {expanded ? <ChevronUp size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(() => setExpanded(false), tr("Collapse this planned hole"))} /> : <ChevronDown size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(() => setExpanded(true), tr("Expand this planned hole"))} />}
        <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => { if (window.confirm(tr("Remove planned hole \"{v}\"?", { v: hole.name || hole.id }))) onRemove(hole.id); }, tr("Remove planned hole \"{v}\"", { v: hole.name || hole.id }))} />
      </div>
      <div style={{ marginTop: 3, fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("Az {v}° / Dip {v2}° / {v3} m{v4}", { v: Math.round(hole.azimuth), v2: Math.round(hole.dip), v3: Math.round(hole.length), v4: toe ? tr(" — toe E {x} N {y} Elev {z}", { x: toe.x.toFixed(0), y: toe.y.toFixed(0), z: toe.z.toFixed(0) }) : "" })}
      </div>
      {expanded && (
        <div style={{ marginTop: 6, borderTop: "1px solid var(--color-divider)", paddingTop: 6 }}>
          <input placeholder={tr("Name")} value={hole.name || ""} onChange={(e) => onUpdate(hole.id, { name: e.target.value })} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", fontSize: "var(--font-size-base)", color: "var(--color-text)", marginBottom: 5 }} />
          <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
            <NumField label="E" value={hole.x} onChange={(v) => onUpdate(hole.id, { x: v })} />
            <NumField label="N" value={hole.y} onChange={(v) => onUpdate(hole.id, { y: v })} />
            <NumField label={tr("Elev")} value={hole.z} onChange={(v) => onUpdate(hole.id, { z: v })} />
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
            <NumField label={tr("Az° grid")} value={hole.azimuth} onChange={(v) => onUpdate(hole.id, { azimuth: v, azimuthEntered: undefined })} />{/* #1729 — stored grid; an edit here is grid */}
            <NumField label={tr("Dip°")} value={hole.dip} onChange={(v) => onUpdate(hole.id, { dip: v })} />
            <NumField label={tr("Length m")} value={hole.length} onChange={(v) => onUpdate(hole.id, { length: v })} />
          </div>
          {hole.azimuthEntered && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 4 }}>{tr("Entered as {v}° {ref} ({date}).", { v: hole.azimuthEntered.value, ref: tr(hole.azimuthEntered.ref === "true" ? "true north" : "magnetic north"), date: hole.azimuthEntered.date })}</div>}
          <textarea placeholder={tr("Notes")} value={hole.notes || ""} onChange={(e) => onUpdate(hole.id, { notes: e.target.value })} rows={2} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", fontSize: "var(--font-size-sm)", color: "var(--color-text)", resize: "vertical" }} />
          {/* TASKS.csv #119 - drill-to-target solver and planned-vs-as-drilled comparison. `raw` is
              this row's already-built trace, so the panel never desurveys the planned hole again. */}
          <PlannedHoleTargeting hole={hole} onUpdate={onUpdate} plannedPts={raw} collars={collars} survey={survey} />
        </div>
      )}
    </div>
  );
}

const miniBtn = { width: 60, padding: "5px 0", borderRadius: 6, fontSize: "var(--font-size-sm)", cursor: "pointer", border: "1px solid var(--color-border-light)", background: "var(--color-bg-subtle)", color: "var(--color-text-secondary)" };
