// TASKS.csv #811 — the Explicit surface tool: a named surface built ONLY from the geologist's own picks (clicked on
// hole traces or anything else in the 3D view) and the section lines drawn with its name; it passes exactly through
// every one of them (lib/explicitSurface.js) and rebuilds as soon as a pick or a tagged line changes. The result is an
// ordinary generated surface, so sections, volumes, export and "Solid blocks from surfaces" use it as they are.
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Crosshair, Undo2, Trash2, X as XIcon } from "./icons.js";
import { t as tr } from "../lib/i18n.js";
import { explicitPoints, fitExplicitSurface } from "../lib/explicitSurface.js";
import { findOnTraceWorld } from "../lib/viewer/modelHelpers.js";
import { sampleTerrainElevation } from "../lib/viewer/geomath.js";

const MAX_POINTS = 800; // ~0.4 s to solve on a laptop (1,200 took 1.2 s); section lines are thinned to fit
const LINE_SPACING = 10; // m between the points taken along a drawn section line

// a short, stable fingerprint of what the surface is built from: rebuilt only when it changes
function inputKey(def, ep, hasTerrain) {
  const s = JSON.stringify([ep.points.map((p) => [p.x, p.y, p.z].map((v) => Math.round(v * 100))), def.margin ?? null, def.resolution || 80, !!(def.cutAtTerrain && hasTerrain)]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${ep.points.length}:${(h >>> 0).toString(36)}`;
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
    const from = Number(row.from), to = Number(row.to);
    if (snap) md = Math.abs(md - from) <= Math.abs(md - to) ? from : to;
    const w = findOnTraceWorld(t, md);
    if (w) return { id, x: w[0], y: w[1], z: w[2], hole_id: row.hole_id, md, src: snap ? "boundary" : "trace" };
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
  const tip = `${def.name} — explicit surface\n${res.n} points (${info.picks} picks, ${info.lines} section lines)`;
  const params = { tool: "explicit surface (thin-plate spline exactly through hand-picked contacts)", picks: info.picks, sectionLines: info.lines, sections: info.sections, lineSpacingM: info.spacing ? Math.round(info.spacing * 10) / 10 : null, points: res.n,
    frame: res.frame.steep ? `over its best-fit plane (dip ${res.frame.dip.toFixed(1)}°)` : "elevation over the map", maxMisfitM: Number(res.residualMax.toExponential(2)), marginM: Math.round(res.margin), cutAtTerrain: res.groundCut > 0, builtAt: new Date().toISOString() };
  sc.activity.current = Date.now();
  const old = def.surfaceId && sc.meshes.current[def.surfaceId];
  if (old) {
    old.geometry.dispose();
    old.geometry = geo;
    old.material.color?.set(def.color);
    old.userData = { ...old.userData, tip };
    sc.setSurfaces((p) => p.map((s) => (s.id === def.surfaceId ? { ...s, name: def.name, vertexCount: nVerts, faceCount: nTris, params } : s)));
    return def.surfaceId;
  }
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: def.color, side: THREE.DoubleSide, transparent: true, opacity: 0.75 }));
  mesh.userData = { tip };
  sc.group.current?.add(mesh);
  const id = `impl_${Date.now()}_explicit`;
  sc.meshes.current[id] = mesh;
  sc.setSurfaces((p) => [...p, { id, name: def.name, visible: true, vertexCount: nVerts, faceCount: nTris, type: "explicit_surface", relationships: [], params }]);
  return id;
}

export default function ExplicitSurfacePanel({ defs, setDefs, sections, terrain, pickFor, setPickFor, snap, setSnap, scene: sc, onRemove, askPrompt, pBtn, smallSel, numInput }) {
  const hasTerrain = !!terrain?.bbox;
  const groundAt = (x, y) => {
    const [x0, y0, x1, y1] = terrain.bbox;
    return x < x0 || x > x1 || y < y0 || y > y1 ? NaN : sampleTerrainElevation(terrain, x, y);
  };
  // 3D clicks reach this panel through the view's click ref while it is open; closing it stops picking
  useEffect(() => {
    sc.clickRef.current = (hits, raycaster) => {
      const pick = pickFromHits(hits, raycaster, sc, snap);
      if (pick) setDefs((p) => p.map((d) => (d.id === pickFor ? { ...d, picks: [...(d.picks || []), pick] } : d)));
    };
  }, [sc, snap, pickFor, setDefs]);
  useEffect(() => () => { sc.clickRef.current = null; setPickFor(null); }, []); // on unmount only
  const [selId, setSelId] = useState(defs[0]?.id || "");
  const def = defs.find((d) => d.id === selId) || defs[0] || null;
  const [status, setStatus] = useState(null); // { ok, text }
  const [showPicks, setShowPicks] = useState(false);
  const update = (patch) => setDefs((p) => p.map((d) => (d.id === def.id ? { ...d, ...patch } : d)));
  const ep = useMemo(() => (def ? explicitPoints(def, sections, { spacing: LINE_SPACING, maxPoints: MAX_POINTS }) : null), [def, sections]);

  const newSurface = () => askPrompt(tr("Name of the new explicit surface (e.g. Top of SILBX):"), "", (name) => {
    const n = (name || "").trim();
    if (!n) return;
    const id = `expl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const palette = ["#e07b39", "#3b8ed0", "#5aa469", "#c94f7c", "#8e6bd3", "#c9a227"];
    setDefs((p) => [...p, { id, name: n, color: palette[p.length % palette.length], picks: [], margin: null, resolution: 80, cutAtTerrain: true, surfaceId: null, builtKey: null }]);
    setSelId(id);
    setPickFor(id);
  });

  // rebuild when the inputs change (debounced, so a burst of picks builds once)
  const timer = useRef(null);
  useEffect(() => {
    if (!def || !ep) return undefined;
    const key = inputKey(def, ep, hasTerrain);
    if (key === def.builtKey && def.surfaceId && sc.meshes.current[def.surfaceId]) return undefined;
    if (ep.points.length < 3) { setStatus({ ok: false, text: tr("Pick at least 3 contacts (in 3D or as lines on sections) to build the surface.") }); return undefined; }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        const t0 = performance.now();
        const res = fitExplicitSurface(ep.points, { margin: def.margin, resolution: def.resolution || 80, groundAt: def.cutAtTerrain && hasTerrain ? groundAt : null });
        const ms = Math.round(performance.now() - t0);
        const surfaceId = upsertMesh(sc, def, res, { picks: ep.picks, lines: ep.lines, sections: ep.sections, spacing: ep.spacing });
        setDefs((p) => p.map((d) => (d.id === def.id ? { ...d, surfaceId, builtKey: key } : d)));
        setStatus({ ok: true, text: tr("Built through {n} points ({picks} picks, {lines} section lines) in {ms} ms; largest misfit at a point {mm} mm. {frame}{cut}", {
          n: res.n, picks: ep.picks, lines: ep.lines, ms, mm: (res.residualMax * 1000).toFixed(3),
          frame: res.frame.steep ? tr("Steep surface (best-fit plane dips {d}°): modelled over its own plane.", { d: res.frame.dip.toFixed(0) }) : tr("Modelled as elevation over the map."),
          cut: res.groundCut ? tr(" Cut at the terrain.") : "",
        }) + (res.warnings.length ? ` ${res.warnings.join(" ")}` : "") });
      } catch (e) { setStatus({ ok: false, text: e.message || String(e) }); }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [def, ep, hasTerrain]); // terrain and the scene refs are read at build time

  const lineHint = def ? tr("To add a hard line: in a section window choose \"Upper contact\", then \"{name}\" under Explicit surfaces, and draw it.", { name: def.name }) : "";
  const row = { display: "flex", alignItems: "center", gap: 6, marginBottom: 6 };
  return (
    <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
        {tr("A surface that passes exactly through your own picks: contacts clicked on holes (or anything else) in the 3D view, and lines drawn on sections with its name. Nothing is interpolated away; it rebuilds as you pick.")}
      </div>
      <div style={row}>
        <select value={def?.id || ""} onChange={(e) => { setSelId(e.target.value); setPickFor(null); }} disabled={!defs.length} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Explicit surface")}>
          {!defs.length && <option value="">{tr("No explicit surfaces yet")}</option>}
          {defs.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.picks.length})</option>)}
        </select>
        <button onClick={newSurface} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "5px 8px" }}>{tr("+ New")}</button>
      </div>
      {def && (<>
        <div style={row}>
          <input type="color" value={def.color} onChange={(e) => update({ color: e.target.value })} aria-label={tr("Colour")} style={{ width: 28, height: 24, padding: 0, border: "none", background: "none" }} />
          <button onClick={() => setPickFor(pickFor === def.id ? null : def.id)} aria-pressed={pickFor === def.id}
            style={{ ...pBtn, flex: 1, marginBottom: 0, justifyContent: "center", ...(pickFor === def.id ? { background: "var(--color-accent)", color: "var(--color-on-accent, #fff)" } : {}) }}>
            <Crosshair size={14} />{" "}{pickFor === def.id ? tr("Picking — click contacts in 3D (click to stop)") : tr("Pick contacts in 3D")}
          </button>
        </div>
        <label style={{ ...row, cursor: "pointer" }} title={tr("A click on a lithology interval snaps to its nearer logged boundary (its top or base); untick to take the exact point clicked on the trace")}>
          <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />{tr("Snap to logged contacts")}
        </label>
        <div style={row}>
          <button onClick={() => update({ picks: def.picks.slice(0, -1) })} disabled={!def.picks.length} style={{ ...pBtn, flex: 1, marginBottom: 0, opacity: def.picks.length ? 1 : 0.5 }}><Undo2 size={14} />{" "}{tr("Undo last pick")}</button>
          <button onClick={() => { setPickFor(null); onRemove(def); setSelId(""); }} title={tr("Delete this explicit surface and its mesh")} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "5px 8px" }}><Trash2 size={14} /></button>
        </div>
        <div style={{ fontSize: "var(--font-size-xs)", marginBottom: 6, lineHeight: 1.4 }}>
          {ep.lines ? tr("{lines} section line(s) on {sections} section(s) are hard lines of this surface (a point every {sp} m along them).", { lines: ep.lines, sections: ep.sections, sp: Math.round(ep.spacing || LINE_SPACING) }) : tr("No section lines yet.")}{" "}<span style={{ color: "var(--color-text-muted)" }}>{lineHint}</span>
        </div>
        <div style={row}>
          <span style={{ width: 120, flexShrink: 0 }}>{tr("Extend beyond picks")}</span>
          <input type="number" min={0} step={10} value={def.margin ?? ""} placeholder={tr("auto")} onChange={(e) => update({ margin: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} style={{ ...numInput, width: 64 }} /><span>m</span>
        </div>
        <div style={row}>
          <span style={{ width: 120, flexShrink: 0 }}>{tr("Mesh detail")}</span>
          <select value={def.resolution || 80} onChange={(e) => update({ resolution: Number(e.target.value) })} style={smallSel}>
            <option value={40}>{tr("Coarse")}</option><option value={80}>{tr("Standard")}</option><option value={140}>{tr("Fine")}</option>
          </select>
        </div>
        <label style={{ ...row, cursor: hasTerrain ? "pointer" : "default", opacity: hasTerrain ? 1 : 0.5 }}>
          <input type="checkbox" checked={!!def.cutAtTerrain} disabled={!hasTerrain} onChange={(e) => update({ cutAtTerrain: e.target.checked })} />{hasTerrain ? tr("Cut at the terrain") : tr("Cut at the terrain (no terrain loaded)")}
        </label>
        {status && <div role="status" style={{ fontSize: "var(--font-size-xs)", lineHeight: 1.4, marginBottom: 6, color: status.ok ? "var(--color-text-secondary)" : "var(--color-warning, #b7791f)" }}>{status.text}</div>}
        <div role="button" tabIndex={0} onClick={() => setShowPicks((v) => !v)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setShowPicks((v) => !v); }} style={{ cursor: "pointer", fontSize: "var(--font-size-xs)", marginBottom: 4 }}>
          {showPicks ? "▾" : "▸"} {tr("Picks ({n})", { n: def.picks.length })}
        </div>
        {showPicks && def.picks.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-xs)", marginBottom: 2 }}>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.hole_id ? tr("{hole} at {md} m ({how})", { hole: p.hole_id, md: p.md.toFixed(1), how: p.src === "boundary" ? tr("logged contact") : tr("on the trace") }) : tr("3D point")} · {Math.round(p.z)} m
            </span>
            <button onClick={() => update({ picks: def.picks.filter((q) => q.id !== p.id) })} aria-label={tr("Remove this pick")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", padding: 0 }}><XIcon size={12} /></button>
          </div>
        ))}
      </>)}
    </div>
  );
}
