// TASKS.csv #650 — "we need to find a way to introduce structural trends in geology models and grade models"
import { iconAction } from "../lib/a11y.js"; // TASKS.csv #687 — Enter / Space on the icon actions
// (Matt, with Leapfrog's Trend tab). Named trends saved with the project (structuralTrends), each a plane (dip, dip
// azimuth), the direction of greatest continuity in it (pitch) and the ellipsoid ratios; every model type picks
// one or none. The maths is lib/trend.js; this is the list, the editor and the "used by" table.
import React, { useMemo, useState } from "react";
import { Plus, Trash2, Pencil } from "./icons.js";
import { cleanTrend, describeTrend, DEFAULT_TREND, planeFromPoles, poleOf, planeFromPoints } from "../lib/trend.js";
import { fisherStats, fabricShape } from "../lib/stereonet.js"; // TASKS.csv #672
import { fitPlane } from "../lib/vein.js"; // TASKS.csv #672 — planarity / collinearity
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

export const TREND_USERS = [
  ["implicit", "Geology models (implicit surfaces, stacks)"], // stack faults follow the stack's trend
  ["structural", "Structural surfaces"], // TASKS.csv #679 — a fault is oblique to the stratigraphic trend by definition: its own slot, none by default
  ["alteration", "Alteration halos"],
  ["gradeShell", "Grade shells"],
  ["estimation", "Block estimation"],
  ["geoml", "Predictive (geoML)"],
  ["explicit", "Explicit surfaces"], // TASKS.csv #881
];
const newId = () => `trend_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

// TASKS.csv #670 — a number field edited as a draft and applied on blur / Enter (Escape cancels). Every keystroke used
// to go through cleanTrend: typing "1" into Maximum of 3:2:1 re-sorted to 2:1:1 under the cursor, a leading "0" of
// 0.5 became 0.001, clearing a field to retype it snapped it to 0.
function DraftNumber({ value, onCommit, label, style, ...rest }) {
  const [draft, setDraft] = useState(null);
  const commit = () => {
    if (draft == null) return;
    const v = Number(draft);
    setDraft(null);
    if (draft.trim() !== "" && Number.isFinite(v) && v !== Number(value)) onCommit(v);
  };
  return (
    <input type="number" step="any" value={draft ?? String(value)} aria-label={label} style={style} {...rest}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") setDraft(null); }} />
  );
}

// #670 — the three ratios as one editor: what was typed stays on screen and the set is applied as soon as it is in
// order (Maximum >= Intermediate >= Minimum, all above zero), whichever field is edited first. They are no longer
// reordered behind the user's back: Leapfrog lists its three values per AXIS (along the pitch / across it in the
// plane / across the plane), and its "Max 2, Intermed 3" was silently turned into 3 along the pitch.
function RatiosEditor({ trend, onApply, field, inputStyle, small }) {
  const [vals, setVals] = useState(() => ({ ...trend.ratios }));
  const [msg, setMsg] = useState(null);
  const tryApply = (next) => {
    const r = { max: Number(next.max), int: Number(next.int), min: Number(next.min) };
    if (![r.max, r.int, r.min].every((v) => Number.isFinite(v) && v > 0)) { setMsg(tr("Each ratio must be a number above zero — not applied yet.")); return; }
    if (!(r.max >= r.int && r.int >= r.min)) {
      setMsg(tr("Not applied yet: the ratios must go Maximum ≥ Intermediate ≥ Minimum (now {max} : {int} : {min}). Leapfrog lists its values per axis — if its largest one is the in-plane axis across the pitch, enter it as Maximum and add 90° to the pitch.", { max: r.max, int: r.int, min: r.min }));
      return;
    }
    setMsg(null);
    if (r.max !== trend.ratios.max || r.int !== trend.ratios.int || r.min !== trend.ratios.min) onApply(r);
  };
  const box = (key, label) => (
    <label style={field}>{label}
      <input type="number" step="any" min="0.01" value={vals[key]} aria-label={tr("{name} ratio {label}", { name: trend.name, label })} style={{ ...inputStyle, width: "100%" }}
        onChange={(e) => setVals((v) => ({ ...v, [key]: e.target.value }))}
        onBlur={() => tryApply(vals)}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") { setVals({ ...trend.ratios }); setMsg(null); } }} />
    </label>
  );
  return (
    <>
      <div style={{ display: "flex", gap: 6, marginBottom: msg ? 2 : 6 }}>{box("max", tr("Maximum"))}{box("int", tr("Intermediate"))}{box("min", tr("Minimum"))}</div>
      {msg && <div role="status" style={{ ...small, color: "var(--color-warn-text)", marginBottom: 6 }}>{msg}</div>}
    </>
  );
}

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
      const all = (structurePicks || []).filter((p) => String(p.value ?? "?") === key);
      const picks = all.filter((p) => Number.isFinite(p.dip) && Number.isFinite(p.azimuth));
      const unoriented = all.length - picks.length;
      plane = planeFromPoles(picks.map((p) => poleOf(p.dip, p.azimuth)));
      // TASKS.csv #672 — the stereonet's own statistics: spread (alpha95), shape, and the girdle refusal it applies,
      // so a near-random or folded population is not turned into a confident trend plane without a word.
      const st = picks.length >= 2 ? fisherStats(picks) : null;
      const fab = st ? fabricShape(st.s1, st.s2, st.s3, picks.length) : null;
      if (fab && picks.length >= 4 && fab.shape === "girdle") {
        setNote({ id: t.id, text: tr("Not set: the {picks} {key} picks form a girdle (spread along a great circle — a fold), so a single mean plane is not a real orientation. Filter to one fold limb in the Stereonet first, or use the fold axis.", { picks: picks.length, key }) });
        return;
      }
      // #1066 — no α95 for a population random planes would match (k ≈ 2 with the stereonet's hemisphere-aligned estimate)
      // TASKS.csv #1116 — whole phrases with their own plurals, in the interface language
      const SHAPE = { cluster: tr("cluster"), girdle: tr("girdle"), weak: tr("weak"), moderate: tr("moderate"), few: tr("few") };
      const quality = st ? ` (S1 ${st.s1.toFixed(2)}, ${st.noPreferred ? tr("k {k}, no preferred orientation", { k: st.k.toFixed(1) }) : `α95 ${st.alpha95.toFixed(1)}°`}, ${picks.length < 4 ? tr("too few picks to judge the shape") : SHAPE[fab.shape] || fab.shape})` : "";
      const warn = st?.noPreferred && picks.length >= 4 ? " " + tr("The picks are no more aligned than random planes — this plane is not a real orientation; check them on the Stereonet before relying on it.")
        : fab && picks.length >= 4 && fab.shape === "weak" ? " " + tr("The picks barely share an orientation (weak fabric) — check them on the Stereonet before relying on this plane.") : "";
      what = tr(picks.length === 1 ? "the mean of {n} {key} measurement" : "the mean of {n} {key} measurements", { n: picks.length, key }) + quality
        + (unoriented ? "; " + tr(unoriented === 1 ? "{n} {key} row has no dip / dip direction and was left out" : "{n} {key} rows have no dip / dip direction and were left out", { n: unoriented, key }) : "")
        + "." + warn + " " + tr("Not corrected for drillhole sampling bias (Terzaghi) — the Stereonet can");
    } else if (kind === "surface") {
      const s = (surfaces || []).find((x) => x.id === key);
      const pts = surfacePoints?.(key) || [];
      plane = planeFromPoints(pts);
      // TASKS.csv #672 — how planar the surface is (vein.js fitPlane: RMS off the plane over its in-plane spread) and a
      // refusal for points along one line, where the plane could rotate freely about it. A sphere, a fold or a closed
      // shell all used to return a confident dip.
      const fit = pts.length >= 3 ? fitPlane(pts) : null;
      if (fit && fit.collinearity < 0.02) { setNote({ id: t.id, text: tr("Not set: the points of {v} lie along a single line, so no plane is fixed by them.", { v: s?.name || tr("this surface") }) }); return; }
      const closed = /shell|envelope|halo|solid/i.test(`${s?.type || ""} ${s?.name || ""}`);
      const rough = fit && Number.isFinite(fit.planarity) ? fit.planarity : null;
      what = tr("the best-fit plane of {name}", { name: s?.name || tr("the surface") })
        + (rough != null ? ` (${tr("RMS off the plane {pct}% of its extent", { pct: (rough * 100).toFixed(0) })}${rough > 0.25 ? " — " + tr("far from planar: this surface is not well described by one plane") : ""})` : "")
        + (closed ? " — " + tr("a closed shell: this is its flattening plane, not a contact") : "");
    }
    if (!plane) { setNote({ id: t.id, text: tr("Not enough data to fit a plane.") }); return; }
    update(t.id, { dip: Math.round(plane.dip * 10) / 10, dipAzimuth: Math.round(plane.dipAzimuth * 10) / 10 });
    setNote({ id: t.id, text: tr("Dip {dip}° → {dipAzimuth}° from {what}. Pitch and ratios unchanged.", { dip: plane.dip.toFixed(1), dipAzimuth: plane.dipAzimuth.toFixed(1), what }) });
  };

  const field = { display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" };
  const num = (t, key, extra = {}) => (
    <DraftNumber value={t[key]} onCommit={(v) => update(t.id, { [key]: v })} label={`${t.name} ${key}`} style={{ ...inputStyle, width: "100%" }} {...extra} />
  );

  return (
    <div>
      <div style={{ ...small, marginBottom: 8 }}>{tr("A trend is the direction the geology is most continuous in: a plane (dip, dip azimuth), the line of greatest continuity within it (pitch, measured in the plane from the strike direction — dip azimuth − 90°, right-hand rule — towards down dip: 90° = down dip, 0° and 180° are the two strike ends) and how much more continuous it is along that line than across it (ratios). The plunge and trend of that line are shown under each trend. Each kind of model below can follow one.")}</div>
      {trends.map((t) => {
        const editing = editId === t.id;
        return (
          <div key={t.id} style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", marginBottom: 6, background: "var(--color-bg-subtle)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                <div style={small}>{describeTrend(t)}</div>
              </div>
              {onView && <button type="button" onClick={() => onView(viewingId === t.id ? null : t)} style={{ ...btnStyle, width: "auto", padding: "2px 7px", marginBottom: 0 }} title={tr("Show this trend's plane and ellipsoid in the 3D view")}>{viewingId === t.id ? tr("Hide") : tr("View")}</button>}
              <Pencil size={14} style={{ cursor: "pointer", color: editing ? "var(--color-accent)" : "var(--color-text-secondary)" }} {...iconAction(() => setEditId(editing ? null : t.id), tr("Edit {name}", { name: t.name }))} />
              <Trash2 size={14} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(() => { if (window.confirm(tr("Delete trend \"{name}\"? Models using it will no longer follow a trend.", { name: t.name }))) remove(t.id); }, tr("Delete {name}", { name: t.name }))} />
            </div>
            {editing && (
              <div style={{ marginTop: 6 }}>
                <input value={t.name} onChange={(e) => update(t.id, { name: e.target.value })} aria-label={tr("Trend name")} style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginBottom: 6 }} />
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <label style={field}>{tr("Dip°{v}", { v: num(t, "dip", { min: 0, max: 90 }) })}</label>
                  <label style={field}>{tr("Dip azimuth°{v}", { v: num(t, "dipAzimuth", { min: 0, max: 360 }) })}</label>
                  <label style={field}>{tr("Pitch°{v}", { v: num(t, "pitch", { min: 0, max: 180 }) })}</label>
                </div>
                <RatiosEditor key={t.id} trend={t} onApply={(r) => update(t.id, { ratios: r })} field={field} inputStyle={inputStyle} small={small} />
                <select value="" onChange={(e) => setFrom(t, e.target.value)} aria-label={tr("Set the plane from")} style={{ ...inputStyle, width: "100%" }}>
                  <option value="">{tr("Set the plane from…")}</option>
                  {codes.length > 0 && <optgroup label={tr("Structure measurements (mean)")}>{codes.map(([c, n]) => <option key={c} value={`code:${c}`}>{c} ({n})</option>)}</optgroup>}
                  {(surfaces || []).length > 0 && <optgroup label={tr("Generated surface (best-fit plane)")}>{surfaces.map((s) => <option key={s.id} value={`surface:${s.id}`}>{s.name}</option>)}</optgroup>}
                </select>
                {note?.id === t.id && <div style={{ ...small, marginTop: 4 }}>{note.text}</div>}
              </div>
            )}
          </div>
        );
      })}
      <button type="button" onClick={add} style={{ ...btnStyle, marginBottom: 10 }}><Plus size={14} />{" "}{tr("New trend")}</button>
      {trends.length > 0 && (
        <>
          <div style={{ ...small, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 4 }}>{tr("Used by")}</div>
          {TREND_USERS.map(([tool, label]) => (
            <label key={tool} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
              <span style={{ flex: 1, minWidth: 0 }}>{tr(label)}</span>{/* tr: TASKS.csv #893 */}
              <select value={use[tool] || ""} onChange={(e) => setUse(tool, e.target.value)} aria-label={tr("Trend for {label}", { label: tr(label) })} style={{ ...inputStyle, width: 130 }}>
                <option value="">{tr("No trend")}</option>
                {trends.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          ))}
        </>
      )}
    </div>
  );
}
