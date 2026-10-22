// TASKS.csv #817 — "Model from map": a 3D stratigraphic model from the geological map and the outcrop measurements alone
// (no drillholes). Matt: "tool should suggest strat order and let the user adjust it". The order is suggested by
// lib/pileOrder.js (bedding younging across each contact + each contact's own dip fitted from its trace on the terrain,
// faulted contacts left out) and shown WITH its evidence; the geologist reorders units, changes roles, sets each fault's
// dip, then runs the ordinary GemPy stack (modellingRuns.runMapModel).
import React, { useEffect, useMemo, useState } from "react";
import { ChevronUp, ChevronDown } from "./icons.js";
import { t as tr } from "../lib/i18n.js";
import { suggestPileOrder } from "../lib/pileOrder.js";
import { sampleTerrainElevation } from "../lib/viewer/geomath.js";

const ROLES = ["stratigraphic", "intrusion", "cross-cutting", "other"];
const roleLabel = (r) => ({ stratigraphic: tr("stratigraphic"), intrusion: tr("intrusion"), "cross-cutting": tr("cross-cutting"), other: tr("other (left out)") }[r] || r);
const fieldsOf = (l) => l?.fields || Object.keys(l?.features?.[0]?.attributes || {});

export default function MapModelPanel({ mapLayers, surfaceStructures, terrain, busy, onRun, pBtn, smallSel }) {
  const polys = (mapLayers || []).filter((l) => l.geomType === "polygon");
  const lines = (mapLayers || []).filter((l) => l.geomType === "line" || l.geomType === "polyline"); // the importer names them "polyline"
  const [layerId, setLayerId] = useState("");
  const layer = polys.find((l) => l.id === layerId) || polys[0] || null;
  const [field, setField] = useState("");
  const unitField = fieldsOf(layer).includes(field) ? field : (layer?.styleField || fieldsOf(layer)[0] || "");
  const [descField, setDescField] = useState("");
  const descGuess = fieldsOf(layer).find((f) => f !== unitField && /lith|desc|name|unit/i.test(f)) || "";
  const desc = fieldsOf(layer).includes(descField) ? descField : descGuess;
  // measurements: classes present in the imported structure sets
  const allRows = useMemo(() => (surfaceStructures || []).flatMap((s) => s.rows || []), [surfaceStructures]);
  const classCounts = useMemo(() => { const m = new Map(); allRows.forEach((r) => m.set(r.cls, (m.get(r.cls) || 0) + 1)); return [...m]; }, [allRows]);
  const [classes, setClasses] = useState(["bedding"]);
  const bedding = useMemo(() => allRows.filter((r) => classes.includes(r.cls)).map((r) => ({ x: r.x, y: r.y, dip: r.dip, dipDir: r.dipDir })), [allRows, classes]);
  // faults: features of a line layer whose attributes mention a fault
  const [faultLayerId, setFaultLayerId] = useState("");
  const faultLayer = lines.find((l) => l.id === faultLayerId) || null;
  const faultFeatures = useMemo(() => (faultLayer?.features || []).filter((f) => Object.values(f.attributes || {}).some((v) => /fault|thrust|shear/i.test(String(v)))), [faultLayer]);
  const measuredFaults = useMemo(() => allRows.filter((r) => r.cls === "fault"), [allRows]);
  const [faultSet, setFaultSet] = useState({}); // index -> { dip, dipDir, on }
  const faults = useMemo(() => faultFeatures.map((f, i) => {
    const line = f.parts?.[0] || f.geometry;
    const a = line[0], b = line[line.length - 1];
    const strike = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
    const perp = [((strike + 90) % 360 + 360) % 360, ((strike - 90) % 360 + 360) % 360];
    // the nearest measured fault within 500 m of the trace, if any, suggests the dip and the side
    let near = null, best = 500;
    for (const m of measuredFaults) for (const q of line) { const d = Math.hypot(m.x - q[0], m.y - q[1]); if (d < best) { best = d; near = m; } }
    const angle = (x, y) => Math.abs(((x - y + 540) % 360) - 180);
    const side = near ? (angle(near.dipDir, perp[0]) <= angle(near.dipDir, perp[1]) ? 0 : 1) : 0;
    const s = faultSet[i] || {};
    const name = String(Object.values(f.attributes || {}).find((v) => /fault|thrust|shear/i.test(String(v))) || tr("Fault")) + ` ${i + 1}`;
    return { i, name, line, perp, on: s.on ?? true, dip: s.dip ?? (near ? near.dip : 45), dipDir: s.dipDir ?? perp[side], measured: !!near };
  }), [faultFeatures, measuredFaults, faultSet]);
  const setFault = (i, patch) => setFaultSet((p) => ({ ...p, [i]: { ...(p[i] || {}), ...patch } }));

  // the suggestion (recomputed when the inputs change), then the user's order and roles
  const groundAt = useMemo(() => {
    if (!terrain?.bbox) return null;
    const [x0, y0, x1, y1] = terrain.bbox;
    return (x, y) => (x < x0 || x > x1 || y < y0 || y > y1 ? NaN : sampleTerrainElevation(terrain, x, y));
  }, [terrain]);
  const suggestion = useMemo(() => {
    if (!layer || !unitField) return null;
    try { return suggestPileOrder({ layer, field: unitField, descField: desc || null, bedding, faults: faults.filter((f) => f.on).map((f) => f.line), groundAt }); } catch { return null; }
  }, [layer, unitField, desc, bedding, faults, groundAt]);
  const [order, setOrder] = useState([]);
  const [roles, setRoles] = useState({});
  useEffect(() => { if (suggestion) { setOrder(suggestion.order); setRoles(suggestion.roles); } }, [suggestion]);
  const move = (i, d) => setOrder((p) => { const q = p.slice(); const j = i + d; if (j < 0 || j >= q.length) return p; [q[i], q[j]] = [q[j], q[i]]; return q; });
  const setRole = (u, r) => {
    setRoles((p) => ({ ...p, [u]: r }));
    setOrder((p) => (r === "stratigraphic" ? (p.includes(u) ? p : [...p, u]) : p.filter((x) => x !== u)));
  };
  const [relation, setRelation] = useState("onlap");
  const [showWhy, setShowWhy] = useState(false);
  const unitInfo = new Map((suggestion?.units || []).map((u) => [u.unit, u]));
  const leftOut = Object.keys(roles).filter((u) => roles[u] !== "stratigraphic");
  const why = (u) => {
    const i = unitInfo.get(u);
    if (!i) return "";
    if (i.evidence === "bedding") return i.score > 0.15 ? tr("younger than its neighbours") : i.score < -0.15 ? tr("older than its neighbours") : tr("weak evidence");
    if (i.evidence === "elevation") return tr("by elevation only");
    return tr("no evidence (by area)");
  };
  const planes = useMemo(() => (suggestion?.pairs || []).flatMap((p) => p.fittedPlanes || []).map((q) => ({ x: q.x, y: q.y, dip: q.dip, dipDir: q.dipDir })), [suggestion]);
  const row = { display: "flex", alignItems: "center", gap: 6, marginBottom: 6 };
  const sel = { ...smallSel, flex: 1, minWidth: 0 };

  if (!polys.length) return <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>{tr("Import a geological map (polygons with a unit attribute) under Maps > Surface mapping first, and the outcrop measurements beside it.")}</div>;
  return (
    <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
        {tr("Builds a stratigraphic model from the geological map and outcrop measurements alone: the map contacts on the terrain become the tops of units, the bedding and the contacts' own dips become orientations. The order below is a suggestion from the map — check it.")}
      </div>
      <div style={row}><span style={{ width: 70, flexShrink: 0 }}>{tr("Map")}</span>
        <select value={layer?.id || ""} onChange={(e) => setLayerId(e.target.value)} style={sel} aria-label={tr("Geological map")}>{polys.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
      <div style={row}><span style={{ width: 70, flexShrink: 0 }}>{tr("Unit field")}</span>
        <select value={unitField} onChange={(e) => setField(e.target.value)} style={sel} aria-label={tr("Unit field")}>{fieldsOf(layer).map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
      <div style={row}><span style={{ width: 70, flexShrink: 0 }}>{tr("Description")}</span>
        <select value={desc} onChange={(e) => setDescField(e.target.value)} style={sel} aria-label={tr("Description field")}><option value="">{tr("(none)")}</option>{fieldsOf(layer).filter((f) => f !== unitField).map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
      <div style={{ marginBottom: 6 }}>
        <div style={{ marginBottom: 3 }}>{tr("Orientations from")}</div>
        {classCounts.length ? classCounts.map(([c, n]) => (
          <label key={c} style={{ marginRight: 8, cursor: "pointer", whiteSpace: "nowrap" }}><input type="checkbox" checked={classes.includes(c)} onChange={(e) => setClasses((p) => (e.target.checked ? [...p, c] : p.filter((x) => x !== c)))} /> {c} ({n})</label>
        )) : <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("no outcrop measurements imported — the contacts' own dips are used")}</span>}
      </div>
      <div style={row}><span style={{ width: 70, flexShrink: 0 }}>{tr("Faults")}</span>
        <select value={faultLayer?.id || ""} onChange={(e) => setFaultLayerId(e.target.value)} style={sel} aria-label={tr("Fault lines")}><option value="">{tr("(none)")}</option>{lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
      {faults.map((f) => (
        <div key={f.i} style={{ ...row, fontSize: "var(--font-size-xs)" }}>
          <input type="checkbox" checked={f.on} onChange={(e) => setFault(f.i, { on: e.target.checked })} aria-label={f.name} />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.measured ? tr("dip and side from the nearest measured fault") : tr("no measured fault nearby: set the dip")}>{f.name}</span>
          <input type="number" min={1} max={90} value={f.dip} onChange={(e) => setFault(f.i, { dip: Number(e.target.value) })} style={{ ...smallSel, width: 46 }} aria-label={tr("Dip")} />°
          <select value={Math.round(f.dipDir)} onChange={(e) => setFault(f.i, { dipDir: Number(e.target.value) })} style={{ ...smallSel, width: 62 }} aria-label={tr("Dips towards")}>
            {f.perp.map((a) => <option key={a} value={Math.round(a)}>{tr("to {a}°", { a: Math.round(a) })}</option>)}
          </select>
        </div>
      ))}
      <div style={{ margin: "8px 0 4px", color: "var(--color-text)" }}>{tr("Stratigraphic order (youngest at the top)")}</div>
      {!groundAt && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warning, #b7791f)", marginBottom: 4 }}>{tr("No terrain: the contacts' dips cannot be fitted and the model cannot run. Fetch a terrain first.")}</div>}
      {order.map((u, i) => (
        <div key={u} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 5, marginBottom: 3, fontSize: "var(--font-size-xs)" }}>
          <button onClick={() => move(i, -1)} disabled={!i} aria-label={tr("Move up")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, opacity: i ? 1 : 0.3 }}><ChevronUp size={13} /></button>
          <button onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={tr("Move down")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, opacity: i < order.length - 1 ? 1 : 0.3 }}><ChevronDown size={13} /></button>
          <span style={{ fontWeight: 600 }}>{u}</span>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-text-muted)" }} title={unitInfo.get(u)?.description || ""}>{unitInfo.get(u)?.description || ""} · {why(u)}</span>
          <select value={roles[u] || "stratigraphic"} onChange={(e) => setRole(u, e.target.value)} style={{ ...smallSel, width: 96 }} aria-label={tr("Role of {u}", { u })}>{ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select>
        </div>
      ))}
      {leftOut.length > 0 && (
        <div style={{ fontSize: "var(--font-size-xs)", marginTop: 4, marginBottom: 6 }}>
          {tr("Left out of the stack:")}{" "}
          {leftOut.map((u) => (
            <span key={u} style={{ marginRight: 6, whiteSpace: "nowrap" }}>{u} <select value={roles[u]} onChange={(e) => setRole(u, e.target.value)} style={{ ...smallSel, width: 90 }} aria-label={tr("Role of {u}", { u })}>{ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select></span>
          ))}
        </div>
      )}
      <div role="button" tabIndex={0} onClick={() => setShowWhy((v) => !v)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setShowWhy((v) => !v); }} style={{ cursor: "pointer", fontSize: "var(--font-size-xs)", marginBottom: 4 }}>{showWhy ? "▾" : "▸"} {tr("Why this order (contact by contact)")}</div>
      {showWhy && (suggestion?.pairs || []).filter((p) => p.weight || p.faulted).sort((a, b) => (b.weight || 0) - (a.weight || 0)).map((p) => (
        <div key={`${p.a}|${p.b}`} style={{ fontSize: "var(--font-size-xs)", marginBottom: 2 }}>
          {p.faulted ? tr("{a} | {b}: follows a mapped fault — not used", { a: p.a, b: p.b })
            : tr("{y} over {o}: {pct}% agreement ({beds} bedding, {planes} contact dips)", { y: p.younger, o: p.older, pct: Math.round(100 * p.agreement), beds: p.measurements, planes: p.trace?.planes || 0 })}
        </div>
      ))}
      <div style={row}><span style={{ width: 70, flexShrink: 0 }}>{tr("Contacts")}</span>
        <select value={relation} onChange={(e) => setRelation(e.target.value)} style={sel} aria-label={tr("Contact relation")}>
          <option value="onlap">{tr("Conformable (units onlap)")}</option><option value="erode">{tr("Erosional (each unit truncates those below)")}</option>
        </select></div>
      <button onClick={() => onRun({ layer, field: unitField, order, bedding, planes, faults: faults.filter((f) => f.on).map((f) => ({ name: f.name, line: f.line, dip: f.dip, dipDir: f.dipDir })), relation, leftOut })}
        disabled={busy || !groundAt || order.length < 2} style={{ ...pBtn, justifyContent: "center", opacity: busy || !groundAt || order.length < 2 ? 0.5 : 1 }}>
        {busy ? tr("Running…") : tr("Build the model (GemPy)")}
      </button>
    </div>
  );
}
