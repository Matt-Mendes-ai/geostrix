// TASKS.csv #3796 — beside the Stope outlines: the narrow-vein route. The model's own cell is the narrowest a stope outline can be; for a vein narrower than a
// mining width the honest figure is the intercepts composited at the cut-off, taken to their true width (the typed dip) and diluted to the minimum mining width.
// Maths: lib/miningWidthIntercepts.js. Computed when the section is opened.
import React, { useMemo, useState } from "react";
import { useStore } from "../lib/store.jsx";
import { computeBestIntercepts } from "../lib/geochem.js";
import { desurveyHole } from "../lib/desurvey.js";
import { diluteIntercepts } from "../lib/miningWidthIntercepts.js";
import { t as tr } from "../lib/i18n.js";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const cell = { textAlign: "right", padding: "2px 4px", borderBottom: "1px solid var(--color-border)", whiteSpace: "nowrap" };

export default function MiningWidthIntercepts({ element, unit, cutoff, minWidth, dipDeg, dipDirDeg }) {
  const { assays = [], assayElements = [], collars = [], survey = [], desurveyMethod } = useStore();
  const [open, setOpen] = useState(false);
  const el = assayElements.find((e) => e.symbol === element) || null;
  const sameUnit = !!el && el.unit === unit;
  const rows = useMemo(() => {
    if (!open || !el || !sameUnit || !(cutoff >= 0) || !(minWidth > 0)) return null;
    const comps = computeBestIntercepts(assays, element, el.unit, Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), { cutoff, maxInternalDilution: 2, minLength: 0 });
    const byHole = new Map(); for (const s of survey) { if (!byHole.has(s.hole_id)) byHole.set(s.hole_id, []); byHole.get(s.hole_id).push(s); }
    const traces = new Map(); for (const c of collars) { try { const t = desurveyHole(c, byHole.get(c.hole_id) || [], desurveyMethod); if (t?.length) traces.set(c.hole_id, t); } catch (_) { /* no trace for it */ } }
    const comp = Array.isArray(comps) ? comps : comps?.composites || comps?.rows || [];
    return diluteIntercepts(comp, traces, { dipDeg, dipDirDeg, minWidth });
  }, [open, assays, assayElements, collars, survey, desurveyMethod, element, el, sameUnit, cutoff, minWidth, dipDeg, dipDirDeg]);
  const f = (v, p = 3) => (v == null ? "—" : Number(v.toPrecision(p)));
  return (
    <details style={{ marginTop: 6 }} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary style={{ cursor: "pointer", color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }}>{tr("Intercepts diluted to the minimum mining width")}</summary>
      <div style={note}>{tr("For a body narrower than the model's columns: each intercept at the cut-off, at its true width from the body's dip, diluted to the minimum mining width at no grade.")}</div>
      {!el && <div style={note}>{tr("No assays of {el} are loaded.", { el: element || "?" })}</div>}
      {el && !sameUnit && <div style={note}>{tr("The assays of {el} are in {u1} and the model's cut-off is in {u2}: not compared here.", { el: element, u1: el.unit, u2: unit })}</div>}
      {el && sameUnit && !(minWidth > 0) && <div style={note}>{tr("Type a minimum mining width above.")}</div>}
      {rows && !Number.isFinite(dipDeg) && <div style={{ ...note, color: "var(--color-warn-text-strong)" }}>{tr("No dip of the body typed: the width is the downhole length, as if every hole crossed the vein at right angles.")}</div>}
      {rows && rows.length === 0 && <div style={note}>{tr("No intercept reaches the cut-off.")}</div>}
      {rows && rows.length > 0 && (
        <div style={{ marginTop: 4, maxHeight: 180, overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 4 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "var(--font-size-xs)" }}>
            <thead><tr style={{ position: "sticky", top: 0, background: "var(--color-bg)" }}>{[tr("Hole"), tr("From–to (m)"), tr("True width (m)"), tr("Grade"), tr("Diluted grade")].map((h) => <th key={h} style={{ textAlign: "right", padding: "2px 4px", borderBottom: "1px solid var(--color-border)", fontWeight: 600 }}>{h}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 40).map((r, i) => <tr key={i}><td style={cell}>{r.hole_id}</td><td style={cell}>{f(r.from, 4)}–{f(r.to, 4)}</td><td style={cell}>{r.trueWidthM == null ? `(${f(r.downholeM, 3)} downhole)` : f(r.trueWidthM, 3)}</td><td style={cell}>{f(r.grade)}</td><td style={cell}>{r.diluted ? `${f(r.dilutedGrade)} @ ${f(r.widthM, 3)} m` : f(r.dilutedGrade)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {rows && rows.length > 40 && <div style={note}>{tr("The 40 best of {n} intercepts, by grade × width.", { n: rows.length })}</div>}
    </details>
  );
}
