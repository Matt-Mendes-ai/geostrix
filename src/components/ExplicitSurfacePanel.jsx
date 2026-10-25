// TASKS.csv #811 — the Explicit surface tool: a named surface built ONLY from the geologist's own picks (clicked on
// hole traces or anything else in the 3D view) and the section lines drawn with its name; it passes exactly through
// every one of them (lib/explicitSurface.js) and rebuilds as soon as a pick or a tagged line changes. The result is an
// ordinary generated surface, so sections, volumes, export and "Solid blocks from surfaces" use it as they are.
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Crosshair, Move, Undo2, Trash2, X as XIcon, Pencil } from "./icons.js";
import { t as tr } from "../lib/i18n.js";
import { LOO_MAX_POINTS, explicitPoints } from "../lib/explicitSurface.js";
import { fitExplicitSurfaceAsync } from "../lib/explicitSurfaceClient.js"; // TASKS.csv #865
import { findOnTraceWorld, traceDirWorld } from "../lib/viewer/modelHelpers.js";
import { sampleTerrainElevation } from "../lib/viewer/geomath.js";
import { dragTarget, holeContacts, nearestContact, SNAP_REACH_M } from "../lib/explicitDrag.js"; // TASKS.csv #813; contacts: #868
import { mapContactPairs, mapContactLines, dipGuideLines } from "../lib/explicitMapLines.js"; // TASKS.csv #817
import { imagePlane, rayPlane, facingCamera, densify3, medianApparentDip, sectionSnapTargets, constrainOnImage, groundProfileOnImage, nearestOnPolyline, pointOnSegment, insertPoint, splitAt, joinLines, extendTo } from "../lib/sectionDigitize3d.js"; // TASKS.csv #824 / #825 / #828
import { useStore } from "../lib/store.jsx"; // TASKS.csv #828 — Undo / Redo
import { confirmDestructive } from "../lib/confirmDestructive.js"; // TASKS.csv #885
import { unitOf, contactOf, layerLabel, unitSummary, splitByElevation, nextLayer, seedPicksFromTops } from "../lib/explicitUnits.js"; // TASKS.csv #830 / #831 / #832; seed: #871
import { stackOrder } from "../lib/stackOrder.js"; // TASKS.csv #873

const MAX_POINTS = 800; // ~0.4 s to solve on a laptop (1,200 took 1.2 s); section lines are thinned to fit
// TASKS.csv #902 — the Unit select's "New unit..." value: a private-use character, not the NUL it used to be (a NUL byte made
// ripgrep / Grep treat this file as binary and skip it in searches)
const NEW_UNIT = "\uE000new";
const LINE_SPACING = 10; // m between the points taken along a drawn section line
const MAP_STEP = 25; // m between the points taken along a mapped contact (#817)

// a short, stable fingerprint of what the surface is built from: rebuilt only when it changes
function inputKey(def, ep, hasTerrain, faultGeo = null, trend = null) {
  const s = JSON.stringify([ep.points.map((p) => [p.x, p.y, p.z].map((v) => Math.round(v * 100))), def.margin ?? null, def.resolution || 80, !!(def.cutAtTerrain && hasTerrain), ...(def.shape ? [def.shape] : []),
    ...(def.boundedBy ? [def.boundedBy.surfaceId, def.boundedBy.side, faultGeo] : []), ...(trend ? [[trend.dip, trend.dipAzimuth, trend.pitch, trend.ratios?.max, trend.ratios?.int]] : [])]); /* trend: #881 (none: same key as before) */ // boundedBy: TASKS.csv #861 (absent: same key as before) // shape: #824 (absent on older surfaces: same key as before, no rebuild)
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${ep.points.length}:${(h >>> 0).toString(36)}`;
}

// TASKS.csv #861 — a scene mesh in world coordinates (E, N, elevation), for trimming at a fault
function worldMesh(mesh, o) {
  const p = mesh.geometry?.attributes?.position?.array || [], n = p.length / 3, w = new Float64Array(p.length);
  for (let i = 0; i < n; i++) { w[i * 3] = p[i * 3] + o.x; w[i * 3 + 1] = o.y - p[i * 3 + 2]; w[i * 3 + 2] = p[i * 3 + 1] + o.z; }
  return { positions: w, indices: mesh.geometry?.index ? Array.from(mesh.geometry.index.array) : Array.from({ length: n }, (_, i) => i) };
}
// +1 / -1: the side the fault's triangle normals point to / away from. For a dipping fault whose normals point up, the
// + side is above it: the hanging wall. -> { plus, minus } labels
function faultSideLabels(w) {
  let nx = 0, ny = 0, nz = 0;
  const P = w.positions, I = w.indices;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    nx += e1[1] * e2[2] - e1[2] * e2[1]; ny += e1[2] * e2[0] - e1[0] * e2[2]; nz += e1[0] * e2[1] - e1[1] * e2[0];
  }
  const L = Math.hypot(nx, ny, nz) || 1, z = nz / L;
  if (Math.abs(z) < 0.1 || Math.abs(z) > 0.995) return { plus: tr("Side A (+)"), minus: tr("Side B (−)") }; // vertical or flat: no hanging wall
  return z > 0 ? { plus: tr("Hanging-wall side"), minus: tr("Footwall side") } : { plus: tr("Footwall side"), minus: tr("Hanging-wall side") };
}

// 3D-view hits -> a pick (world E, N, elevation). On a lithology interval: the point on that hole's trace nearest the
// click, snapped to the nearer logged boundary of the interval unless snapping is off. On any other real feature
// (terrain, a surface, a voxel): the point hit. Never the view's flat fallback plane: that is not a contact.
function pickFromHits(hits, raycaster, sc, snap) {
  if (!hits.length) return null;
  const id = `pk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const lh = hits.find((h) => h.object.userData?.lithoRow);
  const row = lh?.object.userData.lithoRow;
  const t = row && sc.traces.current.find((tc) => tc.hole_id === row.hole_id);
  if (t && t.pts.length > 1) {
    let best = Infinity, md = Number(row.from);
    for (let i = 0; i < t.pts.length - 1; i++) {
      const a = t.pts[i], b = t.pts[i + 1], ab = [b.x - a.x, b.y - a.y, b.z - a.z], L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
      const q = lh.point, s = L2 > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * ab[0] + (q.y - a.y) * ab[1] + (q.z - a.z) * ab[2]) / L2)) : 0;
      const dd = Math.hypot(a.x + s * ab[0] - q.x, a.y + s * ab[1] - q.y, a.z + s * ab[2] - q.z);
      if (dd < best) { best = dd; md = a.md + s * (b.md - a.md); }
    }
    // TASKS.csv #868 — snap to the nearest logged CONTACT of the hole (where the unit changes; a same-unit logging split is
    // not one) within SNAP_REACH_M down-hole - it used to take the nearer end of whatever interval was hit, splits and all,
    // however far; the pick keeps the units either side
    const c = snap ? nearestContact(holeContacts(sc.litho, row.hole_id), md) : null;
    if (c) md = c.md;
    const w = findOnTraceWorld(t, md);
    if (w) return { id, x: w[0], y: w[1], z: w[2], hole_id: row.hole_id, md, src: c ? "boundary" : "trace", ...(c ? { above: c.above, below: c.below } : {}) };
  }
  const w = sc.worldPointFromHits(raycaster, hits);
  return w ? { id, x: w.x, y: w.y, z: w.z, src: "point" } : null;
}

// a build result -> the explicit surface's generated surface: replaced in place (same id, so its list entry, style and
// relationships stay) or created the first time. Returns the surface id.
function upsertMesh(sc, def, res, info) {
  const o = sc.origin.current, P = res.positions;
  const pos = new Float32Array(P.length);
  for (let i = 0; i < P.length; i += 3) { pos[i] = P[i] - o.x; pos[i + 1] = P[i + 2] - o.z; pos[i + 2] = o.y - P[i + 1]; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(res.indices, 1));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  const nVerts = P.length / 3, nTris = res.indices.length / 3;
  const tip = `${def.name} — explicit surface\n${res.n} points (${info.picks} picks, ${info.lines} section lines${info.mapLines ? `, ${info.mapLines} mapped contact lines` : ""}${info.guideLines ? `, ${info.guideLines} dip guide lines` : ""})`;
  const params = { tool: "explicit surface (thin-plate spline exactly through hand-picked contacts)", picks: info.picks, sectionLines: info.lines, sections: info.sections, lineSpacingM: info.spacing ? Math.round(info.spacing * 10) / 10 : null, points: res.n,
    mapContacts: (def.mapContacts || []).map((c) => c.units.join(" | ")), mapLines: info.mapLines || 0, dipGuide: info.guideLines ? { depthM: def.dipGuide?.depth, lines: info.guideLines, constructed: true } : null, // #817
    frame: res.frame.steep ? `over its best-fit plane (dip ${res.frame.dip.toFixed(1)}°)` : "elevation over the map", maxMisfitM: Number(res.residualMax.toExponential(2)), marginM: Math.round(res.margin),
    // TASKS.csv #857 / #870 — the quality figures (maxMisfitM is only solver health: the fit at the inputs is exact by construction)
    looRmsM: res.quality.looRmsM == null ? null : Number(res.quality.looRmsM.toFixed(2)), looMaxM: res.quality.looMaxM == null ? null : Number(res.quality.looMaxM.toFixed(2)),
    overshootM: Number(res.quality.overshootM.toFixed(1)), extrapolatedPct: Math.round(res.quality.beyondPct), furthestFromInputM: Math.round(res.quality.furthestM), cutAtTerrain: res.groundCut > 0, builtAt: new Date().toISOString(),
    ...(res.trend ? { trend: { name: info.trendName || null, ratio: Number(res.trend.ratio.toFixed(2)), alongAzimuthDeg: Math.round(res.trend.azimuthDeg) } } : {}), // TASKS.csv #881
    builtKey: info.key }; // TASKS.csv #886 — saved with the surface, so a reopened project does not rebuild (and dirty) it
  sc.activity.current = Date.now();
  const old = def.surfaceId && sc.meshes.current[def.surfaceId];
  if (old) {
    old.geometry.dispose();
    old.geometry = geo;
    old.material.color?.set(def.color);
    old.userData = { ...old.userData, tip, builtKey: info.key }; // builtKey: #828
    // TASKS.csv #879 — a rebuild replaces the mesh, so any hand-edit record of the old one goes with it
    sc.setSurfaces((p) => p.map((s) => (s.id === def.surfaceId ? { ...s, name: def.name, vertexCount: nVerts, faceCount: nTris, params, edited: false, editCount: 0, edits: [] } : s)));
    return def.surfaceId;
  }
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: def.color, side: THREE.DoubleSide, transparent: true, opacity: 0.75 }));
  mesh.userData = { tip, builtKey: info.key }; // builtKey: #828
  sc.group.current?.add(mesh);
  const id = def.surfaceId || `impl_${Date.now()}_explicit`; // #828: new surfaces carry their mesh id from the start
  sc.meshes.current[id] = mesh;
  sc.setSurfaces((p) => [...p, { id, name: def.name, visible: true, vertexCount: nVerts, faceCount: nTris, type: "explicit_surface", relationships: [], params }]);
  return id;
}

export default function ExplicitSurfacePanel({ surfaces = [] /* #861 */, tracesSeq = 0 /* #888 */, trend = null /* #881 */, topsOfUnit = null /* #871 */, defs: rawDefs, setDefs, sections, terrain, mapLayers, surfaceStructures, sectionImages = [], unitChoices = [] /* #831 */, onDigitizeImage, pickFor, setPickFor, snap, setSnap, scene: sc, onRemove, askPrompt, pBtn, smallSel, numInput }) {
  // TASKS.csv #899 — a definition saved without picks / lines (hand-edited or from an older build) reads as empty, not a crash
  const defs = useMemo(() => (rawDefs || []).map((d) => (Array.isArray(d.picks) && (d.lines == null || Array.isArray(d.lines)) ? d : { ...d, picks: Array.isArray(d.picks) ? d.picks : [], lines: Array.isArray(d.lines) ? d.lines : [] })), [rawDefs]);
  const hasTerrain = !!terrain?.bbox;
  const groundAt = (x, y) => {
    const [x0, y0, x1, y1] = terrain.bbox;
    return x < x0 || x > x1 || y < y0 || y > y1 ? NaN : sampleTerrainElevation(terrain, x, y);
  };
  // 3D clicks reach this panel through the view's click ref while it is open; closing it stops picking
  useEffect(() => {
    sc.clickRef.current = (hits, raycaster) => {
      if (digRef.current.drawing) { digRef.current.add(raycaster); return; } // #824 — drawing a line on a section image
      // TASKS.csv #883 — a click that lands on this surface's own mesh is not a contact (it used to add a "3D point" there)
      const own = defRef.current?.id === pickFor && defRef.current.surfaceId ? sc.meshes.current[defRef.current.surfaceId] : null;
      const pick = pickFromHits(own ? hits.filter((h) => h.object !== own && h.object.parent !== own) : hits, raycaster, sc, snap);
      if (pick) setDefs((p) => p.map((d) => (d.id === pickFor ? { ...d, picks: [...(d.picks || []), pick] } : d)));
    };
  }, [sc, snap, pickFor, setDefs]);
  useEffect(() => () => { sc.clickRef.current = null; setPickFor(null); }, []); // on unmount only
  const [selId, setSelId] = useState(defs[0]?.id || "");
  const def = defs.find((d) => d.id === selId) || defs[0] || null;
  const [status, setStatus] = useState(null); // { ok, text }
  const [showPicks, setShowPicks] = useState(null); // null: open while the surface has few picks (TASKS.csv #864)
  const update = (patch) => setDefs((p) => p.map((d) => (d.id === def.id ? { ...d, ...patch } : d)));
  // TASKS.csv #866 — holes picked more than once (on an inclined hole the stacked-point test cannot see it)
  const dupHoles = useMemo(() => { const m = new Map(); for (const p of def?.picks || []) if (p.hole_id) m.set(p.hole_id, (m.get(p.hole_id) || 0) + 1); return new Map([...m].filter(([, n]) => n > 1)); }, [def?.picks]);
  // TASKS.csv #861 — fault choices: every other generated surface (faults first); side names from the fault's normal
  const faultChoices = useMemo(() => (surfaces || []).filter((x) => x.id !== def?.surfaceId && x.visible !== false).sort((a, b) => (b.type === "fault") - (a.type === "fault")), [surfaces, def?.surfaceId]);
  const sideLabels = useMemo(() => {
    const m = def?.boundedBy && sc.meshes.current[def.boundedBy.surfaceId];
    return m ? faultSideLabels(worldMesh(m, sc.origin.current)) : { plus: tr("Side A (+)"), minus: tr("Side B (−)") };
  }, [def?.boundedBy, surfaces, sc]); // surfaces: the fault may have been rebuilt
  const otherBlock = () => askPrompt(tr("Name of the surface for the other block:"), `${def.name} — ${def.boundedBy.side > 0 ? sideLabels.minus : sideLabels.plus}`, (name) => {
    const n = (name || "").trim();
    if (!n) return;
    const id = `expl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setDefs((p) => [...p, { id, name: n, color: def.color, picks: [], margin: def.margin, resolution: def.resolution || 80, cutAtTerrain: def.cutAtTerrain, shape: def.shape || "auto", unit: unitOf(def), contact: contactOf(def), layer: def.layer || "", boundedBy: { surfaceId: def.boundedBy.surfaceId, side: -def.boundedBy.side }, surfaceId: `impl_${Date.now()}_explicit_${Math.random().toString(36).slice(2, 6)}`, builtKey: null }]);
    setSelId(id); setPickFor(id);
  });
  const picksOpen = showPicks ?? ((def?.picks?.length || 0) < 6);
  // TASKS.csv #871 — the unit's logged tops (the surface's unit, else its name) and which holes already carry a pick
  const seedUnit = def ? unitOf(def) || def.name : "";
  const seedInfo = useMemo(() => (def && topsOfUnit && seedUnit ? topsOfUnit(seedUnit) : null), [def, seedUnit, topsOfUnit]);
  const pickedHoles = useMemo(() => new Set((def?.picks || []).filter((p) => p.hole_id).map((p) => p.hole_id)), [def?.picks]);
  const [seedNote, setSeedNote] = useState(null);
  const seedTops = () => {
    if (!def || !seedInfo) return;
    const stamp = Date.now();
    const r = seedPicksFromTops(def.picks, seedInfo.tops, (hole, md) => { const t = sc.traces.current.find((tc) => tc.hole_id === hole); return t ? findOnTraceWorld(t, md) : null; }, (i) => `pk_${stamp}_${i}`);
    if (r.picks.length) update({ picks: [...(def.picks || []), ...r.picks] });
    const k = seedInfo.skipped, why = [k.belowRole ? tr("{n} under casing, overburden or a cross-cutting unit", { n: k.belowRole }) : null, k.holeStart ? tr("{n} at a hole start", { n: k.holeStart }) : null,
      k.gap ? tr("{n} below an unlogged gap", { n: k.gap }) : null, k.olderAbove ? tr("{n} below an older unit", { n: k.olderAbove }) : null].filter(Boolean);
    setSeedNote(tr("Added {n} pick(s) at the logged tops of {unit}.", { n: r.picks.length, unit: seedUnit }) + (r.had ? ` ${tr("{n} hole(s) already had a pick and were left as they were.", { n: r.had })}` : "")
      + (r.noTrace ? ` ${tr("{n} hole(s) are not drawn (no survey or collar).", { n: r.noTrace })}` : "") + (why.length ? ` ${tr("Not tops of {unit}: {why}.", { unit: seedUnit, why: why.join("; ") })}` : ""));
  };
  // TASKS.csv #878 — keep the current build as a frozen version: a copy of the mesh in the surface list, and the live
  // surface marked as superseding it (the #93 version chain, so the list shows v1 / v2 and the versions can be compared)
  const [keptNote, setKeptNote] = useState(null);
  const keepVersion = () => {
    const live = def && surfaces.find((s) => s.id === def.surfaceId), mesh = def?.surfaceId && sc.meshes.current[def.surfaceId];
    if (!live || !mesh) return;
    const at = new Date().toISOString(), id = `impl_${Date.now()}_kept`;
    const copy = new THREE.Mesh(mesh.geometry.clone(), mesh.material.clone());
    copy.userData = { tip: `${def.name} — version kept ${at.slice(0, 16).replace("T", " ")}` };
    sc.group.current?.add(copy);
    sc.meshes.current[id] = copy;
    const p = { ...(live.params || {}) }; delete p.builtKey; // a frozen copy never rebuilds
    sc.setSurfaces((list) => [...list.map((s) => (s.id === live.id ? { ...s, supersedes: id } : s)),
      { ...live, id, name: tr("{name} (kept {at})", { name: def.name, at: at.slice(0, 16).replace("T", " ") }), type: "explicit_surface_kept", relationships: [], params: { ...p, keptAt: at, keptFrom: def.name, picksWhenKept: (def.picks || []).length }, supersedes: live.supersedes, accepted: false }]);
    setKeptNote(tr("Kept this build as a version in the surface list; this surface now supersedes it."));
  };
  const pickLabel = (p) => `${p.hole_id ? tr("{hole} at {md} m ({how})", { hole: p.hole_id, md: Number(p.md).toFixed(1), how: p.above ? `${p.above} | ${p.below}` : p.src === "boundary" ? tr("logged contact") : tr("on the trace") }) : tr("3D point")} · ${Math.round(p.z)} m`;
  const keepShallowest = () => { const best = new Map(); for (const p of def.picks) if (p.hole_id && (!best.has(p.hole_id) || p.md < best.get(p.hole_id).md)) best.set(p.hole_id, p); update({ picks: def.picks.filter((p) => !p.hole_id || best.get(p.hole_id) === p) }); };
  // TASKS.csv #817 — mapped contacts (draped on the terrain) and their dip guides as further hard lines
  const polys = useMemo(() => (mapLayers || []).filter((l) => l.geomType === "polygon"), [mapLayers]);
  // TASKS.csv #872 — mapped faults: line features whose attributes name a fault / thrust / shear (the Model-from-map rule)
  const faultLines = useMemo(() => (mapLayers || []).filter((l) => l.geomType === "line" || l.geomType === "polyline").flatMap((l) => (l.features || [])
    .filter((f) => Object.values(f.attributes || {}).some((v) => /fault|thrust|shear/i.test(String(v)))).flatMap((f) => (f.parts || [f.geometry]).filter((g) => Array.isArray(g) && g.length > 1))), [mapLayers]);
  const bedding = useMemo(() => (surfaceStructures || []).flatMap((s) => s.rows || []).filter((r) => r.cls === "bedding").map((r) => ({ x: r.x, y: r.y, dip: r.dip, dipDir: r.dipDir })), [surfaceStructures]);
  const mapPart = useMemo(() => { try { // TASKS.csv #898 — a failure is reported, it does not close the 3D View tab
    if (!def?.mapContacts?.length || !hasTerrain) return { lines: [], guides: null, missing: (def?.mapContacts || []).length && !hasTerrain ? def.mapContacts.length : 0, offTerrain: 0 };
    let missing = 0, offTerrain = 0;
    const lines = [];
    for (const c of def.mapContacts) {
      const layer = polys.find((l) => l.id === c.layerId);
      const r = layer ? mapContactLines(layer, c.field, c.units, groundAt, { step: MAP_STEP }) : null;
      if (!r?.lines.length) { missing++; continue; }
      offTerrain += r.offTerrain;
      lines.push(...r.lines);
    }
    // #872 — the units' own readings and readings on this side of the faults only, unless the geologist allows the others
    const unitPolys = def.dipGuide?.otherUnits ? null : def.mapContacts.flatMap((c) => { const layer = polys.find((l) => l.id === c.layerId); return (layer?.features || []).filter((f) => c.units.map(String).includes(String(f.attributes?.[c.field] ?? "").trim())).map((f) => f.parts || [f.geometry]); });
    const g = def.dipGuide?.on && lines.length ? dipGuideLines(lines, { unitPolys, faults: def.dipGuide?.acrossFaults ? [] : faultLines, measurements: bedding, depthM: Number(def.dipGuide.depth) || 100, radiusM: Number.isFinite(Number(def.dipGuide.radius)) && def.dipGuide.radius !== "" ? Number(def.dipGuide.radius) : 500 }) : null;
    return { lines, guides: g, missing, offTerrain };
  } catch (e) { return { lines: [], guides: null, missing: (def?.mapContacts || []).length, offTerrain: 0, error: e.message || String(e) }; } // #898
  }, [def?.mapContacts, def?.dipGuide, polys, bedding, hasTerrain, terrain, faultLines]); // groundAt reads terrain
  // TASKS.csv #824 — lines digitized on section images in the 3D view: hard lines too (a point every 10 m along them)
  const drawn = useMemo(() => { try { return (def?.lines || []).filter((l) => l.pts?.length >= 2).map((l) => ({ ref: `drawn ${l.id}`, src: "drawn", pts: densify3(l.pts, LINE_SPACING) })); } catch { return []; } }, [def?.lines]); // try: #898
  // TASKS.csv #856 — each pick on a hole carries the hole's direction there, so a pick set taken along one drill section is
  // recognized as such (its best-fit plane is the section, not the contact)
  // TASKS.csv #888 — a pick on a hole is a DEPTH on that hole: it is placed on the hole's CURRENT trace at every build, so
  // a survey re-import, collar correction or desurvey-method change moves it with the hole (the stored x / y / z is the
  // record of where it was picked); moved: how many moved more than 0.5 m, and the largest move
  const ep = useMemo(() => { try { // try: #898 — on a failure the build is refused with the reason (tooMany carries any refusal)
    if (!def) return null;
    let moved = 0, maxMove = 0;
    const withDir = { ...def, picks: (def.picks || []).map((p) => {
      const t = p.hole_id && Number.isFinite(p.md) && sc.traces.current.find((tc) => tc.hole_id === p.hole_id);
      if (!t) return p;
      const dir = traceDirWorld(t, p.md), w = findOnTraceWorld(t, p.md);
      const q = w ? { ...p, x: w[0], y: w[1], z: w[2] } : p;
      const d = w ? Math.hypot(w[0] - p.x, w[1] - p.y, w[2] - p.z) : 0;
      if (d > 0.5) { moved++; maxMove = Math.max(maxMove, d); }
      return dir ? { ...q, dir } : q;
    }) };
    return { ...explicitPoints(withDir, sections, { spacing: LINE_SPACING, maxPoints: MAX_POINTS, extraLines: [...drawn, ...mapPart.lines, ...(mapPart.guides?.lines || [])] }), moved, maxMove };
  } catch (e) { return { tooMany: tr("The surface's inputs could not be read: {e}", { e: e.message || String(e) }), points: [], picks: 0, lines: 0, sections: 0, mapLines: 0, guideLines: 0, drawnLines: 0, moved: 0, maxMove: 0 }; }
  }, [def, sections, mapPart, drawn, sc, tracesSeq]);
  const [mapLayerId, setMapLayerId] = useState("");
  const mapLayer = polys.find((l) => l.id === mapLayerId) || polys[0] || null;
  const fieldsOf = (l) => (l?.fields || []);
  const [mapField, setMapField] = useState("");
  const unitField = fieldsOf(mapLayer).includes(mapField) ? mapField : (mapLayer?.styleField || fieldsOf(mapLayer)[0] || "");
  const pairs = useMemo(() => { try { return mapContactPairs(mapLayer, unitField); } catch { return []; } }, [mapLayer, unitField]);
  const [pairKey, setPairKey] = useState("");
  const pair = pairs.find((p) => p.units.join("|") === pairKey) || pairs[0] || null;

  // TASKS.csv #813 — "Edit picks": a press within 10 px of one of this surface's picks drags it (the view does not orbit);
  // its point in the overlay follows the mouse and the surface rebuilds once on release
  const [editing, setEditing] = useState(false);
  const defRef = useRef(def);
  defRef.current = def;
  const sectionImagesRef = useRef(sectionImages); // #824
  sectionImagesRef.current = sectionImages;
  useEffect(() => {
    if (!editing || !def) { sc.dragHookRef.current = null; return undefined; }
    sc.dragHookRef.current = (e, mx, my) => {
      const d = defRef.current, cam = sc.camera.current, dom = sc.renderer.current?.domElement;
      if ((!d?.picks?.length && !d?.lines?.length) || !cam || !dom) return false; // lines: #824 / #825 — a surface drawn only on sections has no picks
      const o = sc.origin.current, rect = dom.getBoundingClientRect(), v = new THREE.Vector3();
      // TASKS.csv #828 — line tools: insert a point, split, join, extend (Move is the drag below)
      const tool = lineToolRef.current;
      if (tool !== "move") {
        const lines = d.lines || [];
        const scrOf = (p) => { v.set(p.x - o.x, p.z - o.z, o.y - p.y).project(cam); return v.z > 1 ? null : [(v.x + 1) / 2 * rect.width, (1 - v.y) / 2 * rect.height]; };
        const nearVertex = () => { let best = 10, r = null; lines.forEach((ln, a) => ln.pts.forEach((p, b) => { const q = scrOf(p); if (!q) return; const dd = Math.hypot(q[0] - mx, q[1] - my); if (dd < best) { best = dd; r = { li: a, vi: b }; } })); return r; };
        const nearSegment = (polys) => { let best = 8, r = null; polys.forEach((pts, a) => { const S = pts.map(scrOf); if (S.some((x) => !x)) return; const n = nearestOnPolyline(S, [mx, my]); if (n && n.d < best) { best = n.d; r = { li: a, i: n.i, t: n.t }; } }); return r; };
        const endOf = (h) => (h ? (h.vi === 0 ? "start" : h.vi === lines[h.li].pts.length - 1 ? "end" : null) : null);
        const newId = () => `ln_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const setLines = (fn) => setDefs((p) => p.map((x) => (x.id === d.id ? { ...x, lines: fn(x.lines || []) } : x)));
        if (tool === "insert") {
          const sg = nearSegment(lines.map((l) => l.pts));
          if (!sg) return false;
          const q = pointOnSegment(lines[sg.li].pts, sg.i, sg.t);
          setLines((L) => L.map((ln, a) => (a === sg.li ? { ...ln, pts: insertPoint(ln.pts, sg.i, q) } : ln)));
          setToolHint(tr("Point added."));
          return true;
        }
        if (tool === "split") {
          const h = nearVertex();
          if (!h) return false;
          const parts = splitAt(lines[h.li].pts, h.vi);
          if (!parts) { setToolHint(tr("Split: click a point in the middle of a line, not an end.")); return true; }
          setLines((L) => L.flatMap((ln, a) => (a === h.li ? [{ ...ln, pts: parts[0] }, { ...ln, id: newId(), pts: parts[1] }] : [ln])));
          setToolHint(tr("Split into two lines."));
          return true;
        }
        if (tool === "join") {
          const h = nearVertex(), end = endOf(h);
          if (!h) return false;
          if (!end) { setToolHint(tr("Join: click the END of a line.")); return true; }
          const first = pendRef.current;
          if (!first) { pendRef.current = { id: lines[h.li].id, end }; setToolHint(tr("Join: now click an end of the line to join it to.")); return true; }
          const a = lines.find((l) => l.id === first.id), b = lines[h.li];
          pendRef.current = null;
          if (!a || a.id === b.id || a.imageId !== b.imageId) { setToolHint(tr("Join: pick the ends of two different lines on the same image.")); return true; }
          const joined = joinLines(a.pts, first.end, b.pts, end);
          setLines((L) => L.filter((l) => l.id !== b.id).map((l) => (l.id === a.id ? { ...l, pts: joined } : l)));
          setToolHint(tr("Joined into one line."));
          return true;
        }
        if (tool === "extend") {
          const first = pendRef.current;
          if (!first) {
            const h = nearVertex(), end = endOf(h);
            if (!h) return false;
            if (!end) { setToolHint(tr("Extend: click the END of a line.")); return true; }
            pendRef.current = { id: lines[h.li].id, end };
            setToolHint(tr("Extend: now click the line it should reach (another line on this image, or the ground)."));
            return true;
          }
          const a = lines.find((l) => l.id === first.id), im = a && (sectionImagesRef.current || []).find((x) => x.id === a.imageId);
          if (!a || !im) { pendRef.current = null; return true; }
          const pl = imagePlane(im.corners);
          const ground = groundAtRef.current ? groundProfileOnImage(pl, groundAtRef.current, 200) : [];
          const targets = [...(allDefsRef.current || []).flatMap((x) => (x.lines || []).filter((l) => l.imageId === a.imageId && l.id !== a.id).map((l) => l.pts)), ...(ground.length ? [ground] : [])];
          const sg = nearSegment(targets);
          if (!sg) { setToolHint(tr("Extend: click on another line on this image, or on the ground.")); return true; }
          const out = extendTo(a.pts, first.end, targets[sg.li], pl);
          pendRef.current = null;
          setLines((L) => L.map((l) => (l.id === a.id ? { ...l, pts: out } : l)));
          setToolHint(tr("Extended."));
          return true;
        }
        return false;
      }
      let hit = -1, bestPx = 10;
      d.picks.forEach((p, i) => {
        v.set(p.x - o.x, p.z - o.z, o.y - p.y).project(cam);
        if (v.z > 1) return; // behind the camera
        const px = Math.hypot((v.x + 1) / 2 * rect.width - mx, (1 - v.y) / 2 * rect.height - my);
        if (px < bestPx) { bestPx = px; hit = i; }
      });
      if (hit < 0) {
        // TASKS.csv #824 — a vertex of a line digitized on a section image: it slides on that image's plane
        let li = -1, vi = -1, bestL = 10;
        (d.lines || []).forEach((ln, a) => ln.pts.forEach((p, b) => {
          v.set(p.x - o.x, p.z - o.z, o.y - p.y).project(cam);
          if (v.z > 1) return;
          const px = Math.hypot((v.x + 1) / 2 * rect.width - mx, (1 - v.y) / 2 * rect.height - my);
          if (px < bestL) { bestL = px; li = a; vi = b; }
        }));
        const im = li >= 0 && (sectionImagesRef.current || []).find((x) => x.id === d.lines[li].imageId);
        if (!im) return false;
        if (e.altKey) { // #825 — Alt + click a line's point: delete it (a line left with one point goes)
          setDefs((p) => p.map((x) => (x.id === d.id ? { ...x, lines: x.lines.map((ln, a) => (a === li ? { ...ln, pts: ln.pts.filter((_, b) => b !== vi) } : ln)).filter((ln) => ln.pts.length >= 2) } : x)));
          return true;
        }
        const pl = imagePlane(im.corners), rayL = new THREE.Raycaster();
        let movedL = null;
        const onMoveL = (ev) => {
          const r = dom.getBoundingClientRect();
          rayL.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), cam);
          const w = rayPlane([rayL.ray.origin.x + o.x, o.y - rayL.ray.origin.z, rayL.ray.origin.y + o.z], [rayL.ray.direction.x, -rayL.ray.direction.z, rayL.ray.direction.y], pl);
          if (!w) return;
          movedL = { x: w[0], y: w[1], z: w[2] };
          showHover({ p: movedL, snapped: false }); // #890
        };
        const onUpL = () => {
          dom.removeEventListener("pointermove", onMoveL); dom.removeEventListener("pointerup", onUpL); dom.removeEventListener("pointercancel", onUpL);
          try { dom.releasePointerCapture(e.pointerId); } catch { /* already released */ }
          showHover(null);
          if (movedL) setDefs((p) => p.map((x) => (x.id === d.id ? { ...x, lines: x.lines.map((ln, a) => (a === li ? { ...ln, pts: ln.pts.map((q, b) => (b === vi ? movedL : q)) } : ln)) } : x)));
        };
        dom.setPointerCapture(e.pointerId);
        dom.addEventListener("pointermove", onMoveL); dom.addEventListener("pointerup", onUpL); dom.addEventListener("pointercancel", onUpL);
        return true;
      }
      const pts = (sc.overlay.current?.children || []).find((c) => c.userData.explicitId === d.id);
      let moved = d.picks[hit];
      const ray = new THREE.Raycaster();
      const onMove = (ev) => {
        const r = dom.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), cam);
        const next = dragTarget(d.picks[hit], ray.ray, sc, snap, ev.shiftKey);
        if (!next) return;
        moved = next;
        if (pts) { pts.geometry.attributes.position.setXYZ(hit, next.x - o.x, next.z - o.z, o.y - next.y); pts.geometry.attributes.position.needsUpdate = true; }
        sc.activity.current = Date.now();
      };
      const onUp = () => {
        dom.removeEventListener("pointermove", onMove);
        dom.removeEventListener("pointerup", onUp);
        dom.removeEventListener("pointercancel", onUp);
        try { dom.releasePointerCapture(e.pointerId); } catch { /* already released */ }
        if (moved !== d.picks[hit]) setDefs((p) => p.map((x) => (x.id === d.id ? { ...x, picks: x.picks.map((q, i) => (i === hit ? moved : q)) } : x)));
      };
      dom.setPointerCapture(e.pointerId);
      dom.addEventListener("pointermove", onMove);
      dom.addEventListener("pointerup", onUp);
      dom.addEventListener("pointercancel", onUp);
      return true;
    };
    return () => { sc.dragHookRef.current = null; };
  }, [editing, def?.id, snap]); // the scene refs are stable
  useEffect(() => () => { sc.dragHookRef.current = null; }, []); // on unmount only

  // ---- TASKS.csv #824 — digitize contact lines on a georeferenced section image, CAD-like, in the 3D view: a click is
  // where the ray meets the image's PLANE (so the line lies on the section whatever is in front), a vertex snaps to any
  // vertex already drawn on that image within 10 px (lines join exactly), a rubber band follows the mouse; Enter or a
  // double-click finishes the line (and the next click starts another), Backspace takes the last vertex back, Esc stops.
  const images = sectionImages.filter((im) => im.corners?.length === 4);
  const [digImageId, setDigImageId] = useState("");
  const digImage = images.find((im) => im.id === digImageId) || images[0] || null;
  const plane = useMemo(() => (digImage ? imagePlane(digImage.corners) : null), [digImage]);
  const [digDrawing, setDigDrawing] = useState(false);
  const [digPts, setDigPts] = useState([]);
  // TASKS.csv #890 — the hover point lives in a ref and moves the preview's geometry in place: a pointer move used to set
  // state (re-rendering this whole pane) and dispose / recreate up to four geometries, the 758-point snap cloud among them
  const hoverRef = useRef(null); // { p, snapped, label }
  const previewRef = useRef(null); // { line, marks, n }: the line being drawn and its point markers, sized for one more point
  const [hoverLabel, setHoverLabel] = useState(null); // state only for the snap label text
  const showHover = (r) => {
    hoverRef.current = r;
    const pv = previewRef.current;
    if (pv) {
      const put = (obj, count) => {
        if (!obj) return;
        const a = obj.geometry.attributes.position;
        if (r && a.count > pv.n) { const q = toScene(r.p); a.setXYZ(pv.n, q[0], q[1], q[2]); a.needsUpdate = true; obj.geometry.computeBoundingSphere(); }
        obj.geometry.setDrawRange(0, count);
      };
      put(pv.line, r && pv.n ? pv.n + 1 : pv.n);
      put(pv.marks, r ? pv.n + 1 : pv.n);
      if (pv.marks) { pv.marks.material.color.set(r?.snapped ? "#ffffff" : def?.color || "#e07b39"); pv.marks.material.size = r?.snapped ? 12 : 7; }
      sc.activity.current = Date.now();
    }
    const label = r?.label || null;
    setHoverLabel((old) => (old === label ? old : label));
  };
  const toScene = (p) => { const o = sc.origin.current; return [p.x - o.x, p.z - o.z, o.y - p.y]; };
  const rayWorld = (ray) => { const o = sc.origin.current; return { origin: [ray.origin.x + o.x, o.y - ray.origin.z, ray.origin.y + o.z], dir: [ray.direction.x, -ray.direction.z, ray.direction.y] }; };
  // a world point on the image plane for a ray, snapped to a vertex already drawn on this image (any surface)
  // TASKS.csv #825 — what a point can snap to on this image besides drawn vertices: logged contacts of holes on or near
  // the section (moved onto it) and where holes cross it
  // TASKS.csv #828 — line tools (in Edit mode) and the ground line of the section
  const { undo, redo, canUndo, canRedo } = useStore();
  const [lineTool, setLineTool] = useState("move");
  const lineToolRef = useRef("move");
  lineToolRef.current = lineTool;
  const pendRef = useRef(null); // join / extend: the end picked first
  const [toolHint, setToolHint] = useState(null);
  const groundAtRef = useRef(null);
  groundAtRef.current = hasTerrain ? groundAt : null;
  const allDefsRef = useRef(defs);
  allDefsRef.current = defs;
  const groundLine = useMemo(() => (plane && hasTerrain && digDrawing ? groundProfileOnImage(plane, groundAt, 200) : []), [plane, hasTerrain, terrain, digDrawing]); // groundAt reads terrain
  const snapTargets = useMemo(() => { try { return digDrawing && plane ? sectionSnapTargets(plane, sc.traces.current, sc.litho || [], { maxOffM: 15 }) : []; } catch { return []; } }, [digDrawing, plane, sc.litho]); // try: #898
  const shiftRef = useRef(false);
  const planePoint = (ray) => {
    if (!plane) return null;
    const { origin, dir } = rayWorld(ray);
    const hit = rayPlane(origin, dir, plane);
    if (!hit) return null;
    const cam = sc.camera.current, dom = sc.renderer.current?.domElement;
    let p = { x: hit[0], y: hit[1], z: hit[2] }, snapped = false, label = null;
    // #825 — Shift: the segment from the last point turns to level / vertical / 45° on the image (no snapping then)
    if (shiftRef.current && digPts.length) return { p: constrainOnImage(digPts[digPts.length - 1], p, plane), snapped: false, label: tr("Shift: level / vertical / 45°") };
    if (cam && dom) {
      const rect = dom.getBoundingClientRect(), v = new THREE.Vector3();
      const scr = (q) => { v.set(...toScene(q)).project(cam); return [(v.x + 1) / 2 * rect.width, (1 - v.y) / 2 * rect.height]; };
      const [hx, hy] = scr(p);
      // nearest within 10 px, drawn vertices first (lines join exactly), then logged contacts, then hole crossings
      const tiers = [
        [...defs.flatMap((d) => (d.lines || []).filter((l) => l.imageId === digImage.id).flatMap((l) => l.pts)), ...digPts].map((q) => ({ p: q, label: tr("a drawn point") })),
        snapTargets.filter((t) => t.kind === "contact").map((t) => ({ p: t.p, label: tr("contact {v}", { v: t.label }) })),
        snapTargets.filter((t) => t.kind === "crossing").map((t) => ({ p: t.p, label: tr("{hole} crossing the section at {md} m", { hole: t.hole, md: t.md.toFixed(1) }) })),
      ];
      for (const tier of tiers) {
        let best = 10, pick = null;
        for (const c of tier) { const [qx, qy] = scr(c.p); const dpx = Math.hypot(qx - hx, qy - hy); if (dpx < best) { best = dpx; pick = c; } }
        if (pick) { p = { x: pick.p.x, y: pick.p.y, z: pick.p.z }; snapped = true; label = pick.label; break; }
      }
      if (!snapped) { // #828 — onto a drawn line or the ground line, anywhere along it
        const lines = [...defs.flatMap((d) => (d.lines || []).filter((l) => l.imageId === digImage.id).map((l) => ({ pts: l.pts, label: tr("on a drawn line") }))), ...(groundLine.length ? [{ pts: groundLine, label: tr("on the ground") }] : [])];
        let best = 10, pick = null;
        for (const l of lines) { const n = nearestOnPolyline(l.pts.map(scr), [hx, hy]); if (n && n.d < best) { best = n.d; pick = { p: pointOnSegment(l.pts, n.i, n.t), label: l.label }; } }
        if (pick) { p = pick.p; snapped = true; label = pick.label; }
      }
    }
    return { p, snapped, label };
  };
  const finishLine = () => {
    if (digPts.length >= 2 && def && digImage) {
      const id = `ln_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, pts = digPts;
      setDefs((p) => p.map((d) => (d.id === def.id ? { ...d, lines: [...(d.lines || []), { id, imageId: digImage.id, pts }] } : d)));
    }
    setDigPts([]);
  };
  const stopDigitizing = () => { setDigDrawing(false); setDigPts([]); showHover(null); setPickFor(null); };
  const digRef = useRef({ drawing: false, add: () => {} });
  digRef.current = {
    drawing: digDrawing,
    add: (raycaster) => {
      const r = planePoint(raycaster.ray);
      if (!r) return;
      setDigPts((pts) => { const last = pts[pts.length - 1]; return last && Math.hypot(last.x - r.p.x, last.y - r.p.y, last.z - r.p.z) < 1e-6 ? pts : [...pts, r.p]; });
    },
  };
  // the rubber band, Enter / Backspace / Esc / double-click while drawing
  useEffect(() => {
    if (!digDrawing) return undefined;
    const dom = sc.renderer.current?.domElement, cam = sc.camera.current;
    if (!dom || !cam) return undefined;
    const ray = new THREE.Raycaster();
    const onMove = (e) => {
      shiftRef.current = e.shiftKey; // #825
      const r = dom.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), sc.camera.current);
      showHover(planePoint(ray.ray)); // #890 — no state, no re-render
    };
    const onKey = (e) => {
      if (e.target?.tagName === "INPUT" || e.target?.tagName === "SELECT" || e.target?.tagName === "TEXTAREA") return;
      if (e.key === "Enter") { e.preventDefault(); finishLine(); }
      else if (e.key === "Escape") { e.preventDefault(); finishLine(); stopDigitizing(); }
      else if (e.key === "Backspace") { e.preventDefault(); setDigPts((p) => p.slice(0, -1)); }
    };
    const onDbl = (e) => { e.preventDefault(); finishLine(); };
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("dblclick", onDbl);
    window.addEventListener("keydown", onKey);
    return () => { dom.removeEventListener("pointermove", onMove); dom.removeEventListener("dblclick", onDbl); window.removeEventListener("keydown", onKey); };
  }, [digDrawing, plane, defs, digPts, def?.id]);
  // the line being drawn + the rubber band, drawn over everything. #890: built when the drawn points change, sized for
  // one more point - the hover point, which showHover moves in place
  useEffect(() => {
    const grp = sc.group.current;
    if (!grp) return undefined;
    const g = new THREE.Group();
    g.name = "explicitDigitizePreview";
    const n = digPts.length, mk = (count) => { const a = new Float32Array((count + 1) * 3); digPts.forEach((q, i) => a.set(toScene(q), i * 3)); return a; };
    let line = null;
    if (digDrawing && n >= 1) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(mk(n), 3));
      line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: def?.color || "#e07b39", depthTest: false, transparent: true }));
      line.renderOrder = 12; line.frustumCulled = false;
      g.add(line);
    }
    const mgeo = new THREE.BufferGeometry();
    mgeo.setAttribute("position", new THREE.BufferAttribute(mk(n), 3));
    const marks = new THREE.Points(mgeo, new THREE.PointsMaterial({ color: def?.color || "#e07b39", size: 7, sizeAttenuation: false, depthTest: false, transparent: true }));
    marks.renderOrder = 12; marks.frustumCulled = false; // also a line point being dragged (Edit picks)
    g.add(marks);
    grp.add(g);
    previewRef.current = { line, marks, n };
    showHover(hoverRef.current);
    sc.activity.current = Date.now();
    return () => { previewRef.current = null; grp.remove(g); g.children.forEach((c) => { c.geometry.dispose(); c.material.dispose(); }); sc.activity.current = Date.now(); };
  }, [digPts, digDrawing, def?.color]);
  // #890 — the ground line and the snap targets, once per drawing session (not per pointer move)
  useEffect(() => {
    const grp = sc.group.current;
    if (!grp || !digDrawing) return undefined;
    const g = new THREE.Group();
    g.name = "explicitDigitizeGuides";
    if (groundLine.length) { // #828 — where the terrain crosses the section
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(groundLine.flatMap(toScene)), 3));
      const gl = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: "#8a6a1f", dashSize: 8, gapSize: 5, depthTest: false, transparent: true }));
      gl.computeLineDistances();
      gl.renderOrder = 12;
      g.add(gl);
    }
    if (snapTargets.length) { // #825 — the logged contacts (and crossings) a point can snap to
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(snapTargets.flatMap((t) => toScene(t.p))), 3));
      const m = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#1a2028", size: 5, sizeAttenuation: false, depthTest: false, transparent: true, opacity: 0.8 }));
      m.renderOrder = 12;
      g.add(m);
    }
    grp.add(g);
    sc.activity.current = Date.now();
    return () => { grp.remove(g); g.children.forEach((c) => { c.geometry.dispose(); c.material.dispose(); }); sc.activity.current = Date.now(); };
  }, [digDrawing, snapTargets, groundLine]);
  useEffect(() => () => { digRef.current.drawing = false; }, []);
  // the other section images step aside while one is drawn on
  useEffect(() => { onDigitizeImage?.(digDrawing && digImage ? digImage.id : null); }, [digDrawing, digImage?.id]);
  useEffect(() => () => onDigitizeImage?.(null), []);
  // square on to the image
  const faceImage = () => {
    if (!plane || !sc.camState) return;
    const dom = sc.renderer.current?.domElement, cam = sc.camera.current;
    const f = facingCamera(plane, { fovDeg: cam?.fov || 45, aspect: dom ? dom.clientWidth / Math.max(1, dom.clientHeight) : 1.6 });
    const o = sc.origin.current, cs = sc.camState.current;
    cs.theta = f.theta; cs.phi = f.phi; cs.radius = f.radius;
    cs.target.set(f.target[0] - o.x, f.target[2] - o.z, o.y - f.target[1]);
    cam?.__update?.();
    sc.activity.current = Date.now();
  };
  const startDigitizing = () => { if (!def || !digImage) return; setEditing(false); setDigDrawing(true); setDigPts([]); setPickFor(def.id); faceImage(); };

  const newSurface = () => askPrompt(tr("Name of the new explicit surface (e.g. Top of basalt):"), "", (name) => {
    const n = (name || "").trim();
    if (!n) return;
    const id = `expl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const palette = ["#e07b39", "#3b8ed0", "#5aa469", "#c94f7c", "#8e6bd3", "#c9a227"];
    setDefs((p) => [...p, { id, name: n, color: palette[p.length % palette.length], picks: [], margin: null, resolution: 80, cutAtTerrain: true, shape: "auto", surfaceId: `impl_${Date.now()}_explicit_${Math.random().toString(36).slice(2, 6)}`, builtKey: null }]); // shape: #824; surfaceId set now (#828): a build never writes to the def, so it is never an Undo step
    setSelId(id);
    setPickFor(id);
  });

  // TASKS.csv #882 — colour is not a build input (inputKey leaves it out), so it never reached the mesh until the next
  // rebuild: the dots changed, the sheet did not, and toggling the surface off and on looked like the way to refresh it
  useEffect(() => {
    const m = def?.surfaceId && sc.meshes.current[def.surfaceId];
    if (!m || !def.color || !m.material?.color) return;
    m.material.color.set(def.color);
    sc.activity.current = Date.now();
  }, [def?.color, def?.surfaceId, sc]);

  // TASKS.csv #883 — Escape stops picking and Edit mode, like every other armed tool (drawing on an image has its own Esc)
  useEffect(() => {
    if (!pickFor && !editing) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (document.querySelector("[role=dialog], [aria-modal=true]") || digRef.current.drawing) return;
      setPickFor(null); setEditing(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickFor, editing, setPickFor]);

  // rebuild when the inputs change (debounced, so a burst of picks builds once)
  const timer = useRef(null);
  const wantKey = useRef(null); // TASKS.csv #865 — the build the inputs ask for now: an older result arriving later is dropped
  useEffect(() => {
    if (!def || !ep) return undefined;
    const faultMesh = def.boundedBy ? sc.meshes.current[def.boundedBy.surfaceId] : null;
    const key = inputKey(def, ep, hasTerrain, def.boundedBy ? faultMesh?.geometry?.uuid || "missing" : null, trend);
    wantKey.current = key;
    // #828 — the key the MESH was built from (an Undo brings back an older def.builtKey together with the older inputs, so
    // comparing with def.builtKey alone would leave the newer mesh on screen); def.builtKey for a mesh opened from a file
    const meshNow = def.surfaceId && sc.meshes.current[def.surfaceId];
    if (meshNow && key === (meshNow.userData?.builtKey ?? def.builtKey)) return undefined;
    const stale = meshNow ? ` ${tr("The surface shown is the previous build; it is not updated until the surface can be built again.")}` : ""; // TASKS.csv #889
    if (ep.tooMany) { setStatus({ ok: false, text: ep.tooMany + stale }); return undefined; } // TASKS.csv #869
    if (ep.points.length < 3) { setStatus({ ok: false, text: tr("Pick at least 3 contacts (in 3D or as lines on sections) to build the surface.") + stale }); return undefined; }
    // TASKS.csv #824 — lines on ONE section only (and nothing off it): every point lies in that section's plane, so the
    // "surface" would be a sheet standing in the section, which says nothing about the contact in 3D
    const drawnImages = new Set((def.lines || []).filter((l) => l.pts?.length >= 2).map((l) => l.imageId));
    if (!ep.picks && !ep.mapLines && drawnImages.size + ep.sections === 1) {
      setStatus({ ok: false, text: tr("All of this surface's lines are on one section, so they cannot give it a shape across the sections. Draw the contact on a second section (or pick it on holes off this one) to build it.") + stale });
      return undefined;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      // TASKS.csv #865 — the fit runs in a worker: the old surface stays on screen and the view keeps moving meanwhile
      const slow = setTimeout(() => { if (wantKey.current === key) setStatus({ ok: true, text: tr("Building the surface…") }); }, 150);
      try {
        const t0 = performance.now();
        // TASKS.csv #824 — the shape: chosen, or automatic; automatic with lines drawn on sections follows the lines' own
        // apparent dips (under 45°: elevation over the map), not a best-fit plane that can stand across the sections
        const sectionLines = [...(def.lines || []).filter((l) => l.pts?.length >= 2), ...(sections || []).flatMap((sct) => (sct.contacts || []).filter((c) => c.unit === def.name && c.isUpperContact !== false && (!c.kind || c.kind === "contact")).map((c) => ({ pts: c.points })))];
        const appDip = sectionLines.length ? medianApparentDip(sectionLines) : null;
        // a surface made before #824 has no shape: it keeps the best-fit-plane rule it was built with
        const frame = def.shape === "map" || def.shape === "plane" ? def.shape : def.shape === "auto" && appDip != null ? (appDip < 45 ? "map" : "plane") : "auto";
        const res = await fitExplicitSurfaceAsync(ep.points, { margin: def.margin, resolution: def.resolution || 80, frame, trend }, def.cutAtTerrain && hasTerrain ? terrain : null); // trend: #881
        clearTimeout(slow);
        if (wantKey.current !== key) return; // the inputs changed while it was building: a newer build is on its way
        // TASKS.csv #861 — Matt: each fault block gets its own surface, trimmed at the fault (nothing invented: the picks of
        // the block carry the throw). The spline is fitted through this surface's inputs, then cut at the fault and only
        // the chosen side kept; where the fault ends inside the surface no cut point exists and those edges stay whole.
        let trimNote = "";
        if (def.boundedBy) {
          const fname = surfaces.find((x) => x.id === def.boundedBy.surfaceId)?.name || "?";
          if (!faultMesh) trimNote = tr("The fault \"{f}\" is no longer in the project, so the surface is not trimmed.", { f: fname });
          else {
            const { splitAcrossSurface } = await import("../lib/crosscut.js");
            if (wantKey.current !== key) return;
            const fw = worldMesh(faultMesh, sc.origin.current);
            const sp = splitAcrossSurface({ positions: res.positions, indices: Array.from(res.indices) }, fw);
            if (!sp.ok || !sp.changed) trimNote = tr("The fault \"{f}\" does not cross this surface, so nothing was trimmed.", { f: fname });
            else {
              const part = def.boundedBy.side > 0 ? sp.positive : sp.negative, lab = faultSideLabels(fw);
              // the clipper keeps every input vertex: keep only the ones a triangle uses
              const remap = new Int32Array(part.positions.length / 3).fill(-1), pos = [], idx = new Uint32Array(part.indices.length);
              for (let k = 0; k < part.indices.length; k++) { const v = part.indices[k]; if (remap[v] < 0) { remap[v] = pos.length / 3; pos.push(part.positions[3 * v], part.positions[3 * v + 1], part.positions[3 * v + 2]); } idx[k] = remap[v]; }
              res.positions = Float64Array.from(pos); res.indices = idx;
              trimNote = tr("Trimmed at the fault \"{f}\"; kept: {side}.", { f: fname, side: def.boundedBy.side > 0 ? lab.plus : lab.minus })
                + (sp.stats.unresolvedEdges ? ` ${tr("The fault ends inside the surface: {n} edge(s) near its tip were left whole (no cut point exists beyond the fault).", { n: sp.stats.unresolvedEdges })}` : "");
            }
          }
        }
        const ms = Math.round(performance.now() - t0);
        const sculpted = (def.surfaceId && surfaces.find((s) => s.id === def.surfaceId)?.editCount) || 0; // TASKS.csv #879
        const surfaceId = upsertMesh(sc, def, res, { trendName: trend?.name, picks: ep.picks, lines: ep.lines, sections: ep.sections, spacing: ep.spacing, mapLines: ep.mapLines, guideLines: ep.guideLines, key });
        // #828 — the mesh remembers its key (userData.builtKey); the def is only written when it had no mesh id yet (a
        // surface from before #828), so building is never an Undo step of its own that would hide the real edit
        if (surfaceId !== def.surfaceId) setDefs((p) => p.map((d) => (d.id === def.id ? { ...d, surfaceId } : d)));
        // TASKS.csv #857 / #870 — what tells a geologist something: leave-one-out and how much is extrapolated (the old
        // "largest misfit 0.000 mm" was the solver's round-off at the inputs, always ~0 by construction)
        const q = res.quality, w = q.looWorst;
        const at = !w ? "" : w.hole ? tr("{hole} at {md} m", { hole: w.hole, md: Number(w.md).toFixed(1) }) : w.src === "pick" ? tr("a 3D point") : w.src === "section" ? tr("a line on section {s}", { s: w.ref }) : tr("a line point");
        const loo = q.looRmsM != null ? ` ${tr("Leave-one-out: each input predicted from the others misses by {rms} m RMS, worst {max} m ({at}).", { rms: q.looRmsM.toFixed(1), max: q.looMaxM.toFixed(1), at })}` : q.looSkipped ? ` ${tr("Leave-one-out not computed above {n} points.", { n: LOO_MAX_POINTS })}` : "";
        const beyond = ` ${tr("{p} % of the surface lies beyond the inputs and is extrapolated (up to {d} m from the nearest).", { p: Math.round(q.beyondPct), d: Math.round(q.furthestM) })}`;
        setStatus({ ok: true, built: true, text: tr("Built through {n} points ({picks} picks, {lines} section lines) in {ms} ms.", { n: res.n, picks: ep.picks, lines: ep.lines, ms }) + loo + beyond + " " + tr("{frame}{cut}", {
          frame: res.frame.steep ? tr("Modelled over its best-fit plane (dips {d}°).", { d: res.frame.dip.toFixed(0) }) : tr("Modelled as elevation over the map."),
          cut: res.groundCut ? tr(" Cut at the terrain.") : "",
        }) + (ep.drawnLines ? ` ${tr("Includes {n} line(s) digitized on section images.", { n: ep.drawnLines })}` : "") + (ep.mapLines ? ` ${tr("Includes {m} mapped contact line(s){g}.", { m: ep.mapLines, g: ep.guideLines ? tr(" and {g} dip guide line(s) (constructed, {d} m down-dip)", { g: ep.guideLines, d: Number(def.dipGuide?.depth) || 100 }) : "" })}` : "")
          + (ep.lineTolM > 0 ? ` ${tr("To keep the build fast, the section lines were simplified to within {t} m ({k} of {n} vertices kept, corners and ends included).", { t: ep.lineTolM, k: ep.lineVerticesKept, n: ep.lineVerticesIn })}` : "")
          + (ep.extraTolM > 0 ? ` ${tr("To keep the build fast, the map lines were simplified to within {t} m (ends and corners kept).", { t: ep.extraTolM })}` : "") // TASKS.csv #869
          + (res.trend ? ` ${tr("Follows the trend {name}: {r} times smoother along {az}° than across.", { name: trend?.name || "", r: res.trend.ratio.toFixed(1), az: Math.round(res.trend.azimuthDeg) })}` : "") // #881
          + (sculpted ? ` ${tr("{n} manual sculpt(s) of the previous surface were discarded by this rebuild.", { n: sculpted })}` : "") // #879
          + (trimNote ? ` ${trimNote}` : "") + (res.warnings.length ? ` ${res.warnings.join(" ")}` : "") });
      } catch (e) { clearTimeout(slow); if (wantKey.current === key) setStatus({ ok: false, text: (e.message || String(e)) + stale }); }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [def, ep, hasTerrain, surfaces, trend]); // terrain and the scene refs are read at build time; surfaces: a fault it is trimmed at may rebuild (#861); trend: #881

  // TASKS.csv #830 / #831 / #832 — the unit this surface bounds, upper or lower contact, and the unit's layers
  const [unitNote, setUnitNote] = useState(null);
  const summary = useMemo(() => unitSummary(defs), [defs]);
  const allUnits = useMemo(() => [...new Set([...summary.map((u) => u.unit), ...unitChoices.filter(Boolean)])], [summary, unitChoices]);
  const curUnit = def ? unitOf(def) : "";
  const unitInfo = summary.find((u) => u.unit === curUnit);
  const unitCount = unitInfo ? unitInfo.layers.reduce((k, l) => k + l.upper.length + l.lower.length, 0) : 0;
  const layerOpts = def ? [...new Set([...(unitInfo?.layers || []).map((l) => l.layer).filter(Boolean), nextLayer(defs, curUnit), ...(def.layer ? [def.layer] : [])])].sort((a, b) => (a.length - b.length) || (a < b ? -1 : 1)) : [];
  const assignUnit = (u) => { update({ unit: u, layer: "" }); setUnitNote(null); };
  const newUnit = () => askPrompt(tr("Name of the unit this surface bounds (e.g. Basalt):"), "", (name) => { const n = (name || "").trim(); if (n) assignUnit(n); });
  // a typical elevation of a surface: the median of its mesh (or of its picks before it is built)
  const elevationOf = (d) => {
    const m = d.surfaceId && sc.meshes.current[d.surfaceId], a = m?.geometry?.attributes?.position?.array;
    const zs = [];
    if (a?.length) { const step = Math.max(1, Math.floor(a.length / 3 / 2000)); for (let i = 1; i < a.length; i += 3 * step) zs.push(a[i] + sc.origin.current.z); }
    else for (const p of d.picks || []) zs.push(p.z);
    zs.sort((x, y) => x - y);
    return zs.length ? zs[zs.length >> 1] : NaN;
  };
  const splitUnit = () => {
    const mine = defs.filter((d) => unitOf(d) === curUnit);
    // TASKS.csv #873 — the built ones are ordered pairwise where both exist (scene y is the elevation; x, z the map)
    const built = mine.map((d) => ({ d, a: d.surfaceId && sc.meshes.current[d.surfaceId]?.geometry })).filter((x) => x.a?.attributes?.position && x.a.index);
    const { rank } = stackOrder(built.map(({ d, a }) => {
      const s = a.attributes.position.array, q = new Float64Array(s.length);
      for (let i = 0; i < s.length; i += 3) { q[i] = s[i]; q[i + 1] = s[i + 2]; q[i + 2] = s[i + 1]; }
      return { id: d.id, positions: q, indices: a.index.array };
    }));
    const asg = splitByElevation(mine.map((d) => ({ id: d.id, contact: contactOf(d), z: elevationOf(d), rank: rank[d.id] })));
    const left = mine.filter((d) => !asg[d.id]).length, n = new Set(Object.values(asg)).size;
    setDefs((p) => p.map((d) => (asg[d.id] ? { ...d, layer: asg[d.id] } : d)));
    setUnitNote(tr("{unit}: {n} layer(s), lettered from the top down.", { unit: curUnit, n }) + (left ? ` ${tr("{k} surface(s) not built yet were left as they were.", { k: left })}` : ""));
  };

  // TASKS.csv #864 — the fold-outs open by themselves once they hold something
  const unitOpen = !!def && (unitCount > 1 || !!def.layer || contactOf(def) === "lower" || (!!def.unit && def.unit !== def.name));
  const digOpen = !!def && (!!(def.lines || []).length || digDrawing);
  const mapOpen = !!def?.mapContacts?.length;
  const settingsOpen = !!def && (def.margin != null || (!!def.shape && def.shape !== "auto") || (!!def.resolution && def.resolution !== 80));
  const lineHint = def ? tr("To draw this surface on a section: 3D View > Draw section, then in the section window pick \"{name}\" under Explicit surfaces, draw the line and press Save contacts. The surface passes exactly through every such line.", { name: def.name }) : ""; // TASKS.csv #884
  const row = { display: "flex", alignItems: "center", gap: 6, marginBottom: 6 };
  return (
    <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
        {tr("A surface that passes exactly through your own picks: contacts clicked on holes (or anything else) in the 3D view, and lines drawn on sections with its name. Nothing is interpolated away; it rebuilds as you pick.")}{" "}{tr("Between the inputs it is the smoothest surface through them; beyond them it is extended with no data.") /* TASKS.csv #870 */}
      </div>
      <div style={row}>
        <select value={def?.id || ""} onChange={(e) => { if (digDrawing) { finishLine(); setDigDrawing(false); showHover(null); } setSelId(e.target.value); setPickFor(null); }} disabled={!defs.length} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Explicit surface")}>
          {!defs.length && <option value="">{tr("No explicit surfaces yet")}</option>}
          {defs.map((d) => <option key={d.id} value={d.id}>{d.name} ({tr("{p} picks, {l} lines", { p: d.picks.length, l: (d.lines || []).length })}){layerLabel(d) !== d.name ? ` · ${layerLabel(d)}` : ""}</option>)}
        </select>
        <button onClick={newSurface} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "5px 8px" }}>{tr("+ New")}</button>
      </div>
      {def && (<>
        <div style={row}>
          <input type="color" value={def.color} onChange={(e) => update({ color: e.target.value })} aria-label={tr("Colour")} style={{ width: 28, height: 24, padding: 0, border: "none", background: "none" }} />
          <button onClick={() => { setEditing(false); setDigDrawing(false); setDigPts([]); setPickFor(pickFor === def.id && !digDrawing ? null : def.id); }} aria-pressed={pickFor === def.id && !digDrawing}
            style={{ ...pBtn, flex: 1, marginBottom: 0, justifyContent: "center", ...(pickFor === def.id && !digDrawing ? { background: "var(--color-accent)", color: "var(--color-on-accent, #fff)" } : {}) }}>
            <Crosshair size={14} />{" "}{pickFor === def.id && !digDrawing ? tr("Picking — click contacts in 3D (click to stop)") : tr("Pick contacts in 3D")}
          </button>
        </div>
        {seedInfo && seedInfo.holes.length > 0 && ( // TASKS.csv #871 — start from the logged tops, then edit
          <div style={{ fontSize: "var(--font-size-xs)", lineHeight: 1.4, marginBottom: 6, color: "var(--color-text-secondary)" }}>
            {tr("{a} of {b} holes that log {unit} have a pick on this surface.", { a: seedInfo.holes.filter((h) => pickedHoles.has(h)).length, b: seedInfo.holes.length, unit: seedUnit })}{" "}
            {contactOf(def) !== "lower" && seedInfo.tops.some((t) => !pickedHoles.has(t.hole_id)) && <button onClick={seedTops} title={tr("One pick per hole where {unit} starts below a younger unit (not at a hole start, under casing or overburden, or below a gap) — the same tops the implicit tool uses. Check them, then move or delete the outliers.", { unit: seedUnit })} style={{ ...pBtn, width: "auto", display: "inline-flex", marginBottom: 0, padding: "2px 6px" }}>{tr("Add the logged tops of {unit}", { unit: seedUnit })}</button>}
          </div>
        )}
        {(def.log || []).length > 0 && ( // TASKS.csv #878
          <details style={{ fontSize: "var(--font-size-xs)", marginBottom: 6, color: "var(--color-text-secondary)" }}>
            <summary style={{ cursor: "pointer" }}>{tr("History ({n} changes)", { n: def.log.length })}</summary>
            <div style={{ maxHeight: 140, overflowY: "auto", marginTop: 4, lineHeight: 1.4 }}>
              {[...def.log].reverse().slice(0, 50).map((e, i) => <div key={i}><span style={{ color: "var(--color-text-muted)" }}>{e.at.slice(0, 16).replace("T", " ")}</span> {e.what}</div>)}
            </div>
            <button onClick={keepVersion} disabled={!def.surfaceId || !sc.meshes.current[def.surfaceId]} title={tr("Copy the surface as it is now into the surface list as a frozen version (it does not rebuild); this surface is marked as superseding it.")} style={{ ...pBtn, width: "auto", display: "inline-flex", marginTop: 4, marginBottom: 0, padding: "2px 6px" }}>{tr("Keep this build as a version")}</button>
            {keptNote && <div role="status" style={{ marginTop: 3 }}>{keptNote}</div>}
          </details>
        )}
        {seedNote && <div role="status" style={{ fontSize: "var(--font-size-xs)", lineHeight: 1.4, marginBottom: 6, color: "var(--color-text-secondary)" }}>{seedNote}</div>}
        {dupHoles.size > 0 && ( // TASKS.csv #866 — a contact crosses a hole once unless folded or faulted
          <div style={{ fontSize: "var(--font-size-xs)", lineHeight: 1.4, marginBottom: 6, color: "var(--color-warning, #b7791f)" }}>
            {tr("More than one pick on the same hole: {list}. A contact crosses a hole once unless it is folded or faulted; a repeated unit belongs on another layer or surface.", { list: [...dupHoles].map(([h, n]) => `${h} (${n})`).join(", ") })}{" "}
            <button onClick={keepShallowest} style={{ ...pBtn, width: "auto", display: "inline-flex", marginBottom: 0, padding: "2px 6px" }}>{tr("Keep the shallowest pick on each hole")}</button>
          </div>
        )}
        {status && <div role="status" style={{ fontSize: "var(--font-size-xs)", lineHeight: 1.4, marginBottom: 6, color: status.ok ? "var(--color-text-secondary)" : "var(--color-warning, #b7791f)" }}>{status.text}</div>}
        {ep?.moved > 0 && <div style={{ fontSize: "var(--font-size-xs)", lineHeight: 1.4, marginBottom: 6, color: "var(--color-text-secondary)" }}>{tr("{n} pick(s) on holes now sit up to {d} m from where they were picked: they follow the holes' current traces (a survey, collar or desurvey method changed).", { n: ep.moved, d: ep.maxMove.toFixed(1) })}</div>}{/* TASKS.csv #888 */}
        {/* TASKS.csv #883 — every pick says where it landed (a click on the terrain or another surface is not a contact) */}
        {def.picks.length > 0 && <div style={{ fontSize: "var(--font-size-xs)", lineHeight: 1.4, marginBottom: 6, color: "var(--color-text-muted)" }}>{tr("Last pick: {what}", { what: pickLabel(def.picks[def.picks.length - 1]) })}</div>}
        {/* TASKS.csv #863 — after a build, what the surface is for */}
        {status?.built && <div style={{ fontSize: "var(--font-size-xs)", lineHeight: 1.4, marginBottom: 6, color: "var(--color-text-muted)" }}>{tr("Next: Solid blocks from surfaces (under Generated surfaces) fills the units between your contacts, and 3D View > Draw section shows this surface cut. A closed body from outlines drawn on sections: Link into a solid, also under Generated surfaces.")}</div>}
        {/* TASKS.csv #830 / #831 / #832 — unit, layer, upper / lower contact */}
        <details open={unitOpen} style={{ borderTop: "1px solid var(--color-border)", paddingTop: 6, marginBottom: 6 }}>
          <summary style={{ fontWeight: 600, marginBottom: 4, cursor: "pointer" }}>{tr("Unit, layer and contact")}</summary>
        <div style={row}>
          <span style={{ width: 34, flexShrink: 0 }}>{tr("Unit")}</span>
          <select value={curUnit} onChange={(e) => (e.target.value === NEW_UNIT ? newUnit() : assignUnit(e.target.value))} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Unit this surface bounds")}
            title={tr("The modelling unit this surface is a contact of. Solid blocks from surfaces fills the units between their contacts.")}>
            {!allUnits.includes(curUnit) && <option value={curUnit}>{curUnit}</option>}
            {allUnits.map((u) => <option key={u} value={u}>{u}</option>)}
            <option value={NEW_UNIT}>{tr("New unit…")}</option>
          </select>
          <select value={def.layer || ""} onChange={(e) => { update({ layer: e.target.value }); setUnitNote(null); }} style={{ ...smallSel, width: 78, flexShrink: 0 }} aria-label={tr("Layer")}
            title={tr("When the unit occurs as several separate layers in the stack, give each its letter (A, B, C…): each layer becomes a unit of its own in the blocks.")}>
            <option value="">{tr("One layer")}</option>
            {layerOpts.map((l) => <option key={l} value={l}>{tr("Layer {l}", { l })}</option>)}
          </select>
        </div>
        <div style={row} role="radiogroup" aria-label={tr("Contact")}>
          {[["upper", "Upper contact", "This surface is the top of {unit}: the unit lies below it."], ["lower", "Lower contact", "This surface is the base of {unit}: the unit lies above it."]].map(([k, label, hint]) => {
            const on = contactOf(def) === k;
            return <button key={k} role="radio" aria-checked={on} title={tr(hint, { unit: layerLabel(def) })} onClick={() => update({ contact: k })}
              style={{ ...pBtn, flex: 1, marginBottom: 0, justifyContent: "center", padding: "4px 6px", ...(on ? { background: "var(--color-accent)", color: "var(--color-on-accent, #fff)" } : {}) }}>{tr(label)}</button>;
          })}
        </div>
        {unitCount > 1 && (
          <div style={{ fontSize: "var(--font-size-xs)", marginBottom: 6, lineHeight: 1.4 }}>
            <div style={{ color: "var(--color-text-muted)" }}>{unitInfo.layers.map((l) => tr("{layer}: {u} upper, {d} lower", { layer: l.layer ? `${curUnit} ${l.layer}` : curUnit, u: l.upper.length, d: l.lower.length })).join(" · ")}</div>
            <button onClick={splitUnit} title={tr("Letter this unit's surfaces A, B, C… from the top down: each upper contact starts a new layer, and a lower contact closes the layer above it.")}
              style={{ ...pBtn, marginTop: 4, marginBottom: 0, justifyContent: "center", padding: "3px 7px", fontSize: "var(--font-size-xs)" }}>{tr("Split {unit} into layers by elevation", { unit: curUnit })}</button>
            {unitNote && <div role="status" style={{ marginTop: 3, color: "var(--color-text-secondary)" }}>{unitNote}</div>}
          </div>
        )}
        </details>
        {/* TASKS.csv #861 — a fault block: this surface is trimmed at a fault, keeping one side */}
        <details open={!!def.boundedBy} style={{ borderTop: "1px solid var(--color-border)", paddingTop: 6, marginBottom: 6 }}>
          <summary style={{ fontWeight: 600, marginBottom: 4, cursor: "pointer" }}>{tr("Fault block")}</summary>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, marginBottom: 4 }}>{tr("A contact offset by a fault is modelled as one surface per block: pick each block's contacts on its own surface and trim it at the fault. The picks carry the throw; nothing is moved.")}</div>
          <div style={row}>
            <select value={def.boundedBy?.surfaceId || ""} onChange={(e) => update({ boundedBy: e.target.value ? { surfaceId: e.target.value, side: def.boundedBy?.side || 1 } : null })} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Trim at the fault")}>
              <option value="">{tr("Not trimmed at a fault")}</option>
              {faultChoices.map((x) => <option key={x.id} value={x.id}>{x.type === "fault" ? `${x.name} · ${tr("fault")}` : x.name}</option>)}
            </select>
          </div>
          {def.boundedBy && (<>
            <div style={row}>
              <select value={String(def.boundedBy.side)} onChange={(e) => update({ boundedBy: { ...def.boundedBy, side: Number(e.target.value) } })} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Side to keep")}>
                <option value="1">{sideLabels.plus}</option>
                <option value="-1">{sideLabels.minus}</option>
              </select>
            </div>
            <button onClick={otherBlock} style={{ ...pBtn, marginBottom: 0, justifyContent: "center", padding: "3px 7px", fontSize: "var(--font-size-xs)" }}>{tr("New surface for the other block")}</button>
          </>)}
        </details>
        <button onClick={() => { setPickFor(null); setEditing((v) => !v); setLineTool("move"); pendRef.current = null; setToolHint(null); }} aria-pressed={editing} disabled={!def.picks.length && !(def.lines || []).length}
          title={tr("Drag a pick to move it: a pick on a hole slides along that hole (snapping to logged contacts when Snap is on); any other pick moves up and down, or sideways with Shift held. The surface rebuilds when you let go.")}
          style={{ ...pBtn, marginBottom: 6, justifyContent: "center", opacity: def.picks.length || (def.lines || []).length ? 1 : 0.5, ...(editing ? { background: "var(--color-accent)", color: "var(--color-on-accent, #fff)" } : {}) }}>
          <Move size={14} />{" "}{editing ? tr("Editing — drag a pick or a line point (click to stop)") : tr("Edit picks and lines")}
        </button>
        <label style={{ ...row, cursor: "pointer" }} title={tr("A click on a hole snaps to its nearest logged contact (where the unit changes) within {m} m down-hole; untick to take the exact point clicked on the trace", { m: SNAP_REACH_M })}>
          <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />{tr("Snap to logged contacts")}
        </label>
        <div style={row}>
          <button onClick={() => update({ picks: def.picks.slice(0, -1) })} disabled={!def.picks.length} style={{ ...pBtn, flex: 1, marginBottom: 0, opacity: def.picks.length ? 1 : 0.5 }}><Undo2 size={14} />{" "}{tr("Undo last pick")}</button>
          {/* TASKS.csv #892 — Undo / Redo always here (they used to appear only once a line existed), Ctrl+Z named */}
          <button onClick={undo} disabled={!canUndo} title={tr("Undo (Ctrl+Z) — picks, lines and settings")} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "5px 8px", opacity: canUndo ? 1 : 0.5 }}>{tr("Undo")}</button>
          <button onClick={redo} disabled={!canRedo} title={tr("Redo (Ctrl+Y)")} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "5px 8px", opacity: canRedo ? 1 : 0.5 }}>{tr("Redo")}</button>
          <button onClick={() => { if (!confirmDestructive(tr("Delete the explicit surface \"{name}\" with its picks and lines?", { name: def.name }), { undoable: true })) return; setPickFor(null); onRemove(def); setSelId(""); }} title={tr("Delete this explicit surface and its mesh")} aria-label={tr("Delete this explicit surface and its mesh")} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "5px 8px" }}><Trash2 size={14} /></button>
        </div>
        <div style={{ fontSize: "var(--font-size-xs)", marginBottom: 6, lineHeight: 1.4 }}>
          {ep.lines ? tr("{lines} section line(s) on {sections} section(s) are hard lines of this surface (a point every {sp} m along them).", { lines: ep.lines, sections: ep.sections, sp: Math.round(ep.spacing || LINE_SPACING) }) : tr("No section lines yet.")}{" "}<span style={{ color: "var(--color-text-muted)" }}>{lineHint}</span>
        </div>
        {/* TASKS.csv #824 — digitize contacts on a section image in the 3D view */}
        <details open={digOpen} style={{ borderTop: "1px solid var(--color-border)", paddingTop: 6, marginBottom: 6 }}>
          <summary style={{ fontWeight: 600, marginBottom: 4, cursor: "pointer" }}>{tr("Digitize a section image")}</summary>
          {!images.length ? (
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>{tr("Import a hand-drawn or scanned cross-section and georeference it (3D View sidebar > Section images) to draw this surface's contact on it here.")}</div>
          ) : (<>
            <div style={row}>
              <select value={digImage?.id || ""} onChange={(e) => { setDigImageId(e.target.value); setDigPts([]); }} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Section image")}>
                {images.map((im) => <option key={im.id} value={im.id}>{im.name}</option>)}
              </select>
              <button onClick={faceImage} title={tr("Turn the view square on to this section image")} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "5px 8px" }}>{tr("Look square on")}</button>
            </div>
            <button onClick={() => (digDrawing ? (finishLine(), stopDigitizing()) : startDigitizing())} aria-pressed={digDrawing}
              style={{ ...pBtn, marginBottom: 4, justifyContent: "center", ...(digDrawing ? { background: "var(--color-accent)", color: "var(--color-on-accent, #fff)" } : {}) }}>
              <Pencil size={14} />{" "}{digDrawing ? tr("Drawing — click to stop") : tr("Draw contact lines on it")}
            </button>
            {/* TASKS.csv #892 — the keys in one line; what a point snaps to is the tooltip */}
            {digDrawing && <div role="status" title={`${tr("A point within 10 px of one already drawn on this image joins it.")} ${tr("Black dots: logged contacts of holes within 15 m of the section, and hole crossings — a point snaps to them too, and onto drawn lines and the dashed ground line. Hold Shift for level / vertical / 45° segments.")}`} style={{ fontSize: "var(--font-size-xs)", lineHeight: 1.4, marginBottom: 4, color: "var(--color-text-secondary)" }}>
              {tr("Click along {name}'s contact on the image.", { name: def.name })} {tr("Enter or double-click: finish the line · Backspace: remove the last point · Esc: stop · Shift: level / vertical / 45°.")}
              {digPts.length ? ` ${tr("{n} point(s) in this line.", { n: digPts.length })}` : ""}
              {hoverLabel ? <b>{` ${tr("Snap: {v}", { v: hoverLabel })}`}</b> : null}
            </div>}
            {(def.lines || []).map((ln, i) => (
              <div key={ln.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-xs)", marginBottom: 2 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tr("Line {i} on {image} · {n} points", { i: i + 1, image: sectionImages.find((im) => im.id === ln.imageId)?.name || tr("(image removed)"), n: ln.pts.length })}</span>
                <button onClick={() => update({ lines: def.lines.filter((x) => x.id !== ln.id) })} aria-label={tr("Remove this line")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", padding: 0 }}><XIcon size={12} /></button>
              </div>
            ))}
            {!!(def.lines || []).length && (<>
              {/* TASKS.csv #828 — line tools */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "4px 0" }} role="group" aria-label={tr("Line tools")}>
                {[["move", "Move points", "Drag a point to move it along its image; Alt + click deletes it."], ["insert", "Insert point", "Click on a line to add a point there."], ["split", "Split", "Click a point in the middle of a line to cut it in two."], ["join", "Join", "Click the end of one line, then the end of another: they become one line."], ["extend", "Extend", "Click the end of a line, then the line it should reach (another line on the same image, or the ground): it is lengthened, or trimmed, to meet it."]].map(([k, label, hint]) => {
                  const on = editing && lineTool === k;
                  return <button key={k} title={tr(hint)} aria-pressed={on} onClick={() => { setLineTool(k); pendRef.current = null; setToolHint(tr(hint)); if (digDrawing) { finishLine(); setDigDrawing(false); showHover(null); } setPickFor(null); setEditing(true); }}
                    style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 7px", fontSize: "var(--font-size-xs)", ...(on ? { background: "var(--color-accent)", color: "var(--color-on-accent, #fff)" } : {}) }}>{tr(label)}</button>;
                })}
              </div>
              {editing && toolHint && <div role="status" style={{ fontSize: "var(--font-size-xs)", lineHeight: 1.4, marginBottom: 4, color: "var(--color-text-secondary)" }}>{toolHint}</div>}
            </>)}
          </>)}
        </details>
        {/* TASKS.csv #817 — mapped contacts as hard lines, with an optional dip guide */}
        <details open={mapOpen} style={{ borderTop: "1px solid var(--color-border)", paddingTop: 6, marginBottom: 6 }}>
          <summary style={{ fontWeight: 600, marginBottom: 4, cursor: "pointer" }}>{tr("From the geological map")}</summary>
          {!polys.length ? (
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>{tr("Import a geological map (Surface Geology > Geology map) to use its contacts as hard lines where this surface meets the ground.")}</div>
          ) : (<>
            <div style={row}>
              <select value={mapLayer?.id || ""} onChange={(e) => { setMapLayerId(e.target.value); setMapField(""); setPairKey(""); }} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Map layer")}>
                {polys.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <select value={unitField} onChange={(e) => { setMapField(e.target.value); setPairKey(""); }} style={{ ...smallSel, width: 96 }} aria-label={tr("Unit field")} title={tr("The attribute that names the map units")}>
                {fieldsOf(mapLayer).map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div style={row}>
              <select value={pair ? pair.units.join("|") : ""} onChange={(e) => setPairKey(e.target.value)} disabled={!pairs.length} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Mapped contact")}>
                {!pairs.length && <option value="">{tr("No contacts between units on this map")}</option>}
                {pairs.map((p) => <option key={p.units.join("|")} value={p.units.join("|")}>{tr("{a} | {b} ({km} km)", { a: p.units[0], b: p.units[1], km: (p.lengthM / 1000).toFixed(2) })}</option>)}
              </select>
              <button disabled={!pair || !hasTerrain} title={hasTerrain ? tr("This mapped contact, draped on the terrain, becomes a hard line of the surface") : tr("Needs a terrain: the contact is placed on the ground")}
                onClick={() => { const c = { layerId: mapLayer.id, field: unitField, units: pair.units }; if (!(def.mapContacts || []).some((x) => x.layerId === c.layerId && x.field === c.field && x.units.join("|") === c.units.join("|"))) update({ mapContacts: [...(def.mapContacts || []), c] }); }}
                style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "5px 8px", opacity: pair && hasTerrain ? 1 : 0.5 }}>{tr("+ Add")}</button>
            </div>
            {(def.mapContacts || []).map((c, i) => (
              <div key={`${c.layerId}|${c.units.join("|")}`} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-xs)", marginBottom: 2 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.units.join(" | ")} · {polys.find((l) => l.id === c.layerId)?.name || tr("(layer removed)")}</span>
                <button onClick={() => update({ mapContacts: def.mapContacts.filter((_, j) => j !== i) })} aria-label={tr("Remove this mapped contact")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", padding: 0 }}><XIcon size={12} /></button>
              </div>
            ))}
            {!!def.mapContacts?.length && (<>
              <label style={{ ...row, cursor: "pointer", marginTop: 4 }} title={tr("Adds a line below each mapped contact, projected down its dip: the bedding measurements within the radius (weighted by distance), or else the dip fitted to the contact's own trace on the terrain. It is a constructed line, not an observation; the surface passes through it exactly.")}>
                <input type="checkbox" checked={!!def.dipGuide?.on} onChange={(e) => update({ dipGuide: { depth: 100, radius: 500, ...(def.dipGuide || {}), on: e.target.checked } })} />{tr("Dip guide: project the contact down its dip")}
              </label>
              {def.dipGuide?.on && (
                <>
                  <div style={row}>
                    <span style={{ width: 120, flexShrink: 0 }}>{tr("Guide depth")}</span>
                    <input type="number" min={10} step={10} value={def.dipGuide.depth ?? 100} onChange={(e) => update({ dipGuide: { ...def.dipGuide, depth: Math.max(10, Number(e.target.value) || 100) } })} style={{ ...numInput, width: 64 }} aria-label={tr("Guide depth")} /><span>m</span>
                  </div>
                  <div style={row} title={tr("A bedding measurement within this distance of the contact gives its dip; beyond it, the dip fitted to the contact's own trace is used")}>
                    <span style={{ width: 120, flexShrink: 0 }}>{tr("Measurements within")}</span>
                    <input type="number" min={0} step={50} value={def.dipGuide.radius ?? 500} onChange={(e) => update({ dipGuide: { ...def.dipGuide, radius: Math.max(0, Number(e.target.value) || 0) } })} style={{ ...numInput, width: 64 }} aria-label={tr("Measurements within")} /><span>m</span>
                  </div>
                  {/* TASKS.csv #872 — which readings may speak for this contact: the geologist decides (both off by default) */}
                  <label style={{ ...row, cursor: "pointer" }} title={tr("Off: only bedding inside the contact's two units is used. On: bedding of any unit within the radius.")}>
                    <input type="checkbox" checked={!!def.dipGuide.otherUnits} onChange={(e) => update({ dipGuide: { ...def.dipGuide, otherUnits: e.target.checked } })} />{tr("Use bedding from other units")}
                  </label>
                  <label style={{ ...row, cursor: "pointer", opacity: faultLines.length ? 1 : 0.6 }} title={faultLines.length ? tr("Off: a reading on the other side of a mapped fault from the contact is not used. On: it is.") : tr("No mapped faults found (line features named fault, thrust or shear).")}>
                    <input type="checkbox" checked={!!def.dipGuide.acrossFaults} disabled={!faultLines.length} onChange={(e) => update({ dipGuide: { ...def.dipGuide, acrossFaults: e.target.checked } })} />{tr("Use bedding across mapped faults")}
                  </label>
                </>
              )}
              <div style={{ fontSize: "var(--font-size-xs)", lineHeight: 1.4, color: "var(--color-text-muted)" }}>
                {tr("{n} line(s) on the terrain.", { n: mapPart.lines.length })}
                {mapPart.guides ? ` ${tr("Dip guide: {m} point(s) from measurements, {f} from the contact's own trace, {s} without a usable dip (no guide there).", { m: mapPart.guides.measured, f: mapPart.guides.fitted, s: mapPart.guides.skipped })}` : ""}
                {mapPart.guides?.otherUnitReadings ? ` ${tr("{n} bedding reading(s) in other units not used.", { n: mapPart.guides.otherUnitReadings })}` : ""}
                {mapPart.guides?.acrossFaultPoints ? ` ${tr("At {n} point(s) a reading across a mapped fault was not used.", { n: mapPart.guides.acrossFaultPoints })}` : ""}
                {mapPart.guides?.disagree ? <span style={{ color: "var(--color-warn-text)" }}>{` ${tr("At {n} point(s) the bedding and the dip of the contact's own trace disagree by more than 30° (up to {d}°): check which is right there.", { n: mapPart.guides.disagree, d: mapPart.guides.maxDisagreeDeg })}`}</span> : null}{/* #872 */}
                {mapPart.missing ? ` ${hasTerrain ? tr("{k} mapped contact(s) not found on the map or the terrain.", { k: mapPart.missing }) : tr("Load a terrain to place the mapped contacts.")}` : ""}
              </div>
            </>)}
          </>)}
        </details>
        <details open={settingsOpen} style={{ borderTop: "1px solid var(--color-border)", paddingTop: 6, marginBottom: 6 }}>
          <summary style={{ fontWeight: 600, marginBottom: 4, cursor: "pointer" }}>{tr("Surface settings")}</summary>
        <div style={row} title={tr("Auto: 15 % of the inputs' span. Everything beyond the inputs is extrapolated, not data.") /* TASKS.csv #870 */}>
          <span style={{ width: 120, flexShrink: 0 }}>{tr("Extend beyond picks")}</span>
          <input type="number" min={0} step={10} value={def.margin ?? ""} placeholder={tr("auto")} onChange={(e) => update({ margin: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} style={{ ...numInput, width: 64 }} aria-label={tr("Extend beyond picks")} /><span>m</span>
        </div>
        <div style={row} title={tr("Automatic: lines drawn on sections decide (an overall dip under 45° on the sections gives elevation over the map); otherwise the best-fit plane of the points (steeper than 30°: over that plane)")}>
          <span style={{ width: 120, flexShrink: 0 }}>{tr("Shape")}</span>
          <select value={def.shape || "legacy"} onChange={(e) => update({ shape: e.target.value })} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Shape")}>
            {!def.shape && <option value="legacy">{tr("As built (best-fit plane)")}</option>}
            <option value="auto">{tr("Automatic")}</option><option value="map">{tr("Elevation over the map")}</option><option value="plane">{tr("Over its own plane (steep)")}</option>
          </select>
        </div>
        {def.shape && def.shape !== "legacy" && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "-2px 0 6px 126px", lineHeight: 1.35 }}>{def.shape === "map" ? tr("Elevation over the map: one height per map point — contacts that are flat-lying to moderately dipping.") : def.shape === "plane" ? tr("Over its own plane: steep contacts, dykes and faults.") : tr("Automatic: chosen from the lines on sections and the picks.")}</div>}{/* #892 */}
        <div style={row}>
          <span style={{ width: 120, flexShrink: 0 }}>{tr("Mesh detail")}</span>
          <select value={def.resolution || 80} onChange={(e) => update({ resolution: Number(e.target.value) })} style={smallSel} aria-label={tr("Mesh detail")}>
            <option value={40}>{tr("Coarse")}</option><option value={80}>{tr("Standard")}</option><option value={140}>{tr("Fine")}</option>
          </select>
        </div>
        <label style={{ ...row, cursor: hasTerrain ? "pointer" : "default", opacity: hasTerrain ? 1 : 0.5 }}>
          <input type="checkbox" checked={!!def.cutAtTerrain} disabled={!hasTerrain} onChange={(e) => update({ cutAtTerrain: e.target.checked })} />{hasTerrain ? tr("Cut at the terrain") : tr("Cut at the terrain (no terrain loaded)")}
        </label>
        </details>
        <div role="button" tabIndex={0} aria-expanded={picksOpen} onClick={() => setShowPicks(!picksOpen)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setShowPicks(!picksOpen); }} style={{ cursor: "pointer", fontSize: "var(--font-size-xs)", marginBottom: 4 }}>
          {picksOpen ? "▾" : "▸"} {tr("Picks ({n})", { n: def.picks.length })}
        </div>
        {picksOpen && def.picks.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-xs)", marginBottom: 2 }}>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {dupHoles.has(p.hole_id) ? "⚠ " : ""}{pickLabel(p)}
            </span>
            <button onClick={() => update({ picks: def.picks.filter((q) => q.id !== p.id) })} aria-label={tr("Remove this pick")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", padding: 0 }}><XIcon size={12} /></button>
          </div>
        ))}
      </>)}
    </div>
  );
}
