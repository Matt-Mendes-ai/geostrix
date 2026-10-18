// TASKS.csv #650 — "we need to find a way to introduce structural trends in geology models and grade models"
import { iconAction } from "../lib/a11y.js"; // TASKS.csv #687 — Enter / Space on the icon actions
// (Matt, with Leapfrog's Trend tab). Named trends saved with the project (structuralTrends), each a plane (dip, dip
// azimuth), the direction of greatest continuity in it (pitch) and the ellipsoid ratios; every model type picks
// one or none. The maths is lib/trend.js; this is the list, the editor and the "used by" table.
import React, { useMemo, useState } from "react";
import { Plus, Trash2, Pencil } from "./icons.js";
import { cleanTrend, describeTrend, DEFAULT_TREND, planeFromPoles, poleOf, planeFromPoints } from "../lib/trend.js";

export const TREND_USERS = [
  ["implicit", "Geology models (implicit surfaces, stacks)"],
  ["alteration", "Alteration halos"],
  ["gradeShell", "Grade shells"],
  ["estimation", "Block estimation"],
  ["geoml", "Predictive (geoML)"],
];
const newId = () => `trend_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

// structurePicks: [{ value (code), dip, azimuth (dip direction) }]; surfaces: [{ id, name }]; surfacePoints(id) -> [{x, y, z}]
export default function TrendsPanel({ structuralTrends, setStructuralTrends, structurePicks, surfaces, surfacePoints, onView, viewingId, small, inputStyle, btnStyle }) {
  const { trends = [], use = {} } = structuralTrends || {};
  const [editId, setEditId] = useState(null);
  const [note, setNote] = useState(null);
  const codes = useMemo(() => {
    const m = new Map();
    (structurePicks || []).forEach((p) => { if (Number.isFinite(p.dip) && Number.isFinite(p.azimuth)) m.set(String(p.value ?? "?"), (m.get(String(p.value ?? "?")) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [structurePicks]);

  const update = (id, patch) => setStructuralTrends((s) => ({ ...s, trends: s.trends.map((t) => (t.id === id ? cleanTrend({ ...t, ...patch }) : t)) }));
  const add = () => {
    const t = { ...cleanTrend({ ...DEFAULT_TREND, name: `Trend ${trends.length + 1}` }), id: newId() };
    setStructuralTrends((s) => ({ ...s, trends: [...(s.trends || []), t] }));
    setEditId(t.id);
  };
  const remove = (id) => setStructuralTrends((s) => ({ trends: s.trends.filter((t) => t.id !== id), use: Object.fromEntries(Object.entries(s.use || {}).filter(([, v]) => v !== id)) }));
  const setUse = (tool, id) => setStructuralTrends((s) => ({ ...s, use: { ...(s.use || {}), [tool]: id || undefined } }));

  const setFrom = (t, src) => {
    if (!src) return;
    const [kind, key] = src.split(":");
    let plane = null, what = "";
    if (kind === "code") {
      const picks = (structurePicks || []).filter((p) => String(p.value ?? "?") === key && Number.isFinite(p.dip) && Number.isFinite(p.azimuth));
      plane = planeFromPoles(picks.map((p) => poleOf(p.dip, p.azimuth)));
      what = `the mean of ${picks.length} ${key} measurement${picks.length === 1 ? "" : "s"}${plane ? ` (S1 ${plane.s1.toFixed(2)}; 1 = all parallel)` : ""}`;
    } else if (kind === "surface") {
      const s = (surfaces || []).find((x) => x.id === key);
      plane = planeFromPoints(surfacePoints?.(key) || []);
      what = `the best-fit plane of ${s?.name || "the surface"}`;
    }
    if (!plane) { setNote({ id: t.id, text: "Not enough data to fit a plane." }); return; }
    update(t.id, { dip: Math.round(plane.dip * 10) / 10, dipAzimuth: Math.round(plane.dipAzimuth * 10) / 10 });
    setNote({ id: t.id, text: `Dip ${plane.dip.toFixed(1)}° → ${plane.dipAzimuth.toFixed(1)}° from ${what}. Pitch and ratios unchanged.` });
  };

  const field = { display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" };
  const num = (t, key, extra = {}) => (
    <input type="number" step="any" value={t[key]} onChange={(e) => update(t.id, { [key]: e.target.value })} aria-label={`${t.name} ${key}`} style={{ ...inputStyle, width: "100%" }} {...extra} />
  );
  const ratio = (t, key) => (
    <input type="number" step="any" min="0.01" value={t.ratios[key]} onChange={(e) => update(t.id, { ratios: { ...t.ratios, [key]: e.target.value } })} aria-label={`${t.name} ratio ${key}`} style={{ ...inputStyle, width: "100%" }} />
  );

  return (
    <div>
      <div style={{ ...small, marginBottom: 8 }}>
        A trend is the direction the geology is most continuous in: a plane (dip, dip azimuth), the line of greatest continuity within it (pitch: 0° = along strike, 90° = down dip) and how much more continuous it is along that line than across it (ratios). Each kind of model below can follow one.
      </div>
      {trends.map((t) => {
        const editing = editId === t.id;
        return (
          <div key={t.id} style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", marginBottom: 6, background: "var(--color-bg-subtle)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                <div style={small}>{describeTrend(t)}</div>
              </div>
              {onView && <button type="button" onClick={() => onView(viewingId === t.id ? null : t)} style={{ ...btnStyle, width: "auto", padding: "2px 7px", marginBottom: 0 }} title="Show this trend's plane and ellipsoid in the 3D view">{viewingId === t.id ? "Hide" : "View"}</button>}
              <Pencil size={14} style={{ cursor: "pointer", color: editing ? "var(--color-accent)" : "var(--color-text-secondary)" }} {...iconAction(() => setEditId(editing ? null : t.id), `Edit ${t.name}`)} />
              <Trash2 size={14} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(() => { if (window.confirm(`Delete trend "${t.name}"? Models using it will no longer follow a trend.`)) remove(t.id); }, `Delete ${t.name}`)} />
            </div>
            {editing && (
              <div style={{ marginTop: 6 }}>
                <input value={t.name} onChange={(e) => update(t.id, { name: e.target.value })} aria-label="Trend name" style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginBottom: 6 }} />
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <label style={field}>Dip°{num(t, "dip", { min: 0, max: 90 })}</label>
                  <label style={field}>Dip azimuth°{num(t, "dipAzimuth", { min: 0, max: 360 })}</label>
                  <label style={field}>Pitch°{num(t, "pitch", { min: 0, max: 180 })}</label>
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <label style={field}>Maximum{ratio(t, "max")}</label>
                  <label style={field}>Intermediate{ratio(t, "int")}</label>
                  <label style={field}>Minimum{ratio(t, "min")}</label>
                </div>
                <select value="" onChange={(e) => setFrom(t, e.target.value)} aria-label="Set the plane from" style={{ ...inputStyle, width: "100%" }}>
                  <option value="">Set the plane from…</option>
                  {codes.length > 0 && <optgroup label="Structure measurements (mean)">{codes.map(([c, n]) => <option key={c} value={`code:${c}`}>{c} ({n})</option>)}</optgroup>}
                  {(surfaces || []).length > 0 && <optgroup label="Generated surface (best-fit plane)">{surfaces.map((s) => <option key={s.id} value={`surface:${s.id}`}>{s.name}</option>)}</optgroup>}
                </select>
                {note?.id === t.id && <div style={{ ...small, marginTop: 4 }}>{note.text}</div>}
              </div>
            )}
          </div>
        );
      })}
      <button type="button" onClick={add} style={{ ...btnStyle, marginBottom: 10 }}><Plus size={13} /> New trend</button>
      {trends.length > 0 && (
        <>
          <div style={{ ...small, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 4 }}>Used by</div>
          {TREND_USERS.map(([tool, label]) => (
            <label key={tool} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
              <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
              <select value={use[tool] || ""} onChange={(e) => setUse(tool, e.target.value)} aria-label={`Trend for ${label}`} style={{ ...inputStyle, width: 130 }}>
                <option value="">No trend</option>
                {trends.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          ))}
        </>
      )}
    </div>
  );
}
