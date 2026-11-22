// TASKS.csv #3962 (P1) — "Probable grade" in Targeting > Planned drillholes: each planned hole's chance of an intercept and the low /
// middle / high (P10 / P50 / P90) of what it cuts, from the drilled composites (Review data\Drill planner\design.md, 1.1-1.2, 3.1 and 5).
// The grade model takes Grade estimation's settings (lib/drillPlanner/predictionInputs.js); the composites are made here as Grade
// estimation makes them (compositeSliced.js), and the model is fitted and sampled in a worker (drillPlannerClient.js). Each prediction is
// frozen on its hole (`prediction`): Predict again replaces it on purpose, a drilled hole keeps its own. Loaded with the pane, not at start.
import React, { useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store.jsx";
import { t as tr } from "../lib/i18n.js";
import { rowsOf } from "../lib/rowTable.js";
import { excludeQAQC } from "../lib/qaqc.js";
import { desurveyHole } from "../lib/desurvey.js";
import { plannedTrace } from "../lib/plannedTrace.js";
import { compositeDownholeSliced, samplePointsSliced } from "../lib/compositeSliced.js";
import { preferredElement } from "../lib/preferredElement.js";
import { useLeadCommodity } from "../lib/useLeadCommodity.js"; // #1523 — the project's lead commodity opens the list
import { estimateSources, freshSource, suggestedCutoff, modelStamp, predictionRecord, predictionState, fmt } from "../lib/drillPlanner/predictionInputs.js";
import { runPlanner } from "../lib/drillPlanner/drillPlannerClient.js";
import { askConfirm } from "../lib/confirmDialog.js";
import NumberInput from "./NumberInput.jsx";
import DrillProgramSection from "./DrillProgramSection.jsx"; // TASKS.csv #3962 (P2) — the suggested program, in the same chunk

// the protective lines, always in view (design.md 5); written out in tr() so the guards (protectiveWarnings3899, the word count) read them
const cautions = () => [
  tr("Exploration targeting, not a resource estimate: no figure here is a Mineral Resource under NI 43-101 or JORC."),
  tr("The range (P10–P90) comes from the spacing of the holes and the variogram only, not from the geology being wrong."),
  tr("A planned hole's grade is a prediction from nearby holes, not a measurement."),
];

const box = { marginTop: 10, padding: "9px 10px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6 };
const label = { display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" };
const btn = { width: "100%", padding: "6px 8px", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)", color: "var(--color-text)" };

export default function ProbableGradePanel({ plannedHoles, collars, survey, voxelModels, desurveyMethod, surfaces = [] }) {
  const { assays, assayElements, updatePlannedHole } = useStore();
  const elementUnits = useMemo(() => Object.fromEntries((assayElements || []).map((e) => [e.symbol, e.unit])), [assayElements]);
  const estimates = useMemo(() => estimateSources(voxelModels), [voxelModels]);
  const symbols = useMemo(() => (assayElements || []).map((e) => e.symbol), [assayElements]);
  const options = useMemo(() => [...estimates, ...symbols.map((s) => freshSource(s, elementUnits[s]))], [estimates, symbols, elementUnits]);
  const lead = useLeadCommodity();
  const [pick, setPick] = useState(null); // null: the newest Grade estimation run, else the lead commodity fitted now
  const source = options.find((o) => o.id === pick) || options.find((o) => o.id === (estimates[0]?.id || `fit:${preferredElement(symbols, "intercepts", lead)}`)) || options[0] || null;
  const unit = source ? source.unit || elementUnits[source.element] || "" : "";
  const [cutoff, setCutoff] = useState(null), [minLength, setMinLength] = useState(null), [dilution, setDilution] = useState(null);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [note, setNote] = useState(null), [error, setError] = useState(null);
  const abort = useRef(null);
  const step = source?.compositeLengthM || 2;
  const minL = minLength ?? 2 * step, dil = dilution ?? step;
  const todo = plannedHoles.filter((h) => predictionState(h) !== "kept");
  const kept = plannedHoles.length - todo.length;

  // the composites and the fitted model, kept for the session while the data and the source are the same (the program below reuses them).
  // -> { model, values, points } | null (said in `error`, or the weak fit declined)
  const prepared = useRef(null);
  const prepare = async (signal, onError, ask = true) => {
    const key = [source.id, unit, step];
    const hit = prepared.current;
    if (hit && hit.assays === assays && hit.collars === collars && hit.survey === survey && hit.key.join("|") === key.join("|")) return hit.value;
    const rows = excludeQAQC(rowsOf(assays));
    const intervals = await compositeDownholeSliced(rows, source.element, unit, elementUnits, { length: step, minCoverage: source.minCoverage, capValue: source.capValue }, { signal });
    const { points } = await samplePointsSliced(intervals, collars, survey, desurveyHole, desurveyMethod, { signal });
    const values = points.map((p) => p.value).filter(Number.isFinite);
    const model = await runPlanner({ kind: "fit", points: points.map((p) => ({ x: p.x, y: p.y, z: p.z, value: p.value, hole_id: p.hole_id })), modelType: source.vgModel, searchTrend: source.searchTrend }, { signal });
    if (model.error) { onError(model.error === "few" ? tr("Only {n} {element} composites could be placed: too few for a grade model.", { n: model.n, element: source.element }) : tr("No variogram could be fitted to the {element} composites' normal scores (too few pairs at most lags).", { element: source.element })); return null; }
    if (ask && model.fit.weak && !(await askConfirm(tr("The variogram of the {element} normal scores fits weakly (r² {r2}): the ranges will be less reliable. Predict anyway?", { element: source.element, r2: fmt(model.fit.rSquared) })))) return null;
    const value = { model, values, points };
    prepared.current = { key, assays, collars, survey, value };
    return value;
  };
  const rulesOf = (values) => ({ cutoff: cutoff ?? suggestedCutoff(values), minLength: minL, maxInternalDilution: dil });

  const run = async () => {
    if (!source || !todo.length) return;
    setBusy(true); setError(null); setNote(null); setProgress(0);
    const ac = new AbortController(); abort.current = ac;
    try {
      const prep = await prepare(ac.signal, setError);
      if (!prep) return;
      const { model, values } = prep;
      const cut = rulesOf(values).cutoff;
      const rules = { cutoff: cut, minLength: minL, maxInternalDilution: dil };
      const holes = todo.map((h) => ({ id: h.id, trace: plannedTrace(h).map((p) => ({ md: p.md, x: p.x, y: p.y, z: p.z })) }));
      const preds = await runPlanner({ kind: "predict", model, holes, rules, opts: { step, searchRadius: source.searchRadiusM || model.vg.range } }, { signal: ac.signal, onProgress: setProgress });
      const stamp = modelStamp(source, model, values), date = new Date().toISOString();
      let beyond = 0;
      for (const h of todo) { const p = preds[h.id]; if (!p) continue; if (p.beyond) beyond++; updatePlannedHole(h.id, { prediction: predictionRecord(p, { source, model, rules, hole: h, stamp, date }) }); }
      if (cutoff == null) setCutoff(cut);
      setNote({ n: todo.length, beyond, model, cut });
    } catch (e) {
      if (!e?.cancelled) setError(e?.message || String(e));
    } finally { setBusy(false); abort.current = null; }
  };

  if (!symbols.length) return null;
  return (
    <div style={box} data-probable-grade="">
      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)", fontWeight: 600, marginBottom: 6 }}>{tr("Probable grade")}</div>
      <ul style={{ listStyle: "none", margin: "0 0 8px", padding: "6px 8px", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 6, fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", lineHeight: 1.4 }}>
        {cautions().map((c) => <li key={c}>{c}</li>)}
      </ul>
      <label style={{ ...label, marginBottom: 6 }}>{tr("Grade model")}
        <select value={source?.id || ""} onChange={(e) => { setPick(e.target.value); setCutoff(null); }} disabled={busy} style={{ fontSize: "var(--font-size-base)" }}>
          {estimates.map((e) => <option key={e.id} value={e.id}>{tr("{element}: the settings of \"{name}\"", { element: e.element, name: e.name })}</option>)}
          {options.filter((o) => o.id.startsWith("fit:")).map((o) => <option key={o.id} value={o.id}>{tr("{element}: 2 m composites, fitted now", { element: o.element })}</option>)}
        </select>
      </label>
      {source && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>
        {tr("{m} m composites of {element}; the variogram of their normal scores is fitted when you press Predict.", { m: fmt(step), element: source.element })}
        {source.capValue ? " " + tr("Capped at {v} {unit}, as in Grade estimation.", { v: source.capValue, unit }) : ""}
        {source.searchTrend ? " " + tr("In the trend \"{name}\".", { name: source.searchTrend.name }) : ""}
      </div>}
      <div style={{ display: "flex", gap: 4, marginBottom: 6, alignItems: "flex-end" }}>
        <label style={label}>{tr("Cut-off ({unit})", { unit })}<NumberInput value={cutoff ?? ""} allowEmpty placeholder={tr("upper quartile")} onChange={(v) => setCutoff(v == null ? null : Math.max(0, v))} disabled={busy} style={{ width: "100%" }} /></label>
        <label style={label}>{tr("Min. length (m)")}<NumberInput value={minL} onChange={(v) => setMinLength(Math.max(0, v))} disabled={busy} style={{ width: "100%" }} /></label>
        <label style={label}>{tr("Internal dilution (m)")}<NumberInput value={dil} onChange={(v) => setDilution(Math.max(0, v))} disabled={busy} style={{ width: "100%" }} /></label>
      </div>
      {busy ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
          <span style={{ flex: 1 }} role="status">{tr("Predicting… {p} %", { p: Math.round(progress * 100) })}</span>
          <button type="button" onClick={() => abort.current?.abort()} style={{ ...btn, width: "auto" }}>{tr("Cancel")}</button>
        </div>
      ) : (
        <button type="button" onClick={run} disabled={!todo.length || !source} style={btn} title={tr("Each hole's chance of an intercept and the low / middle / high of what it cuts, from 200 runs of the grade model; kept on the hole until you predict again")}>
          {tr(todo.length === 1 ? "Predict {n} planned hole" : "Predict {n} planned holes", { n: todo.length })}
        </button>
      )}
      {kept > 0 && <div style={{ marginTop: 4, fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr(kept === 1 ? "{n} drilled hole keeps the prediction it had." : "{n} drilled holes keep the predictions they had.", { n: kept })}</div>}
      {error && <div role="alert" style={{ marginTop: 6, fontSize: "var(--font-size-xs)", color: "var(--color-danger-text)", lineHeight: 1.4 }}>{error}</div>}
      {note && <div role="status" style={{ marginTop: 6, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", lineHeight: 1.4 }}>
        {tr(note.n === 1 ? "Predicted {n} hole at a cut-off of {c} {unit}, from {d} composites in {h} holes. Normal-score variogram: {model}, range {r} m, nugget {nug} % of the sill (r² {r2})." : "Predicted {n} holes at a cut-off of {c} {unit}, from {d} composites in {h} holes. Normal-score variogram: {model}, range {r} m, nugget {nug} % of the sill (r² {r2}).", { n: note.n, c: fmt(note.cut), unit, d: note.model.n, h: note.model.holes, model: note.model.vg.model, r: fmt(note.model.vg.range), nug: Math.round(note.model.vg.nugget * 100), r2: fmt(note.model.fit.rSquared) })}
        {note.beyond > 0 && " " + tr(note.beyond === 1 ? "{n} hole is beyond the drilling: no prediction." : "{n} holes are beyond the drilling: no prediction.", { n: note.beyond })}
      </div>}
      {source && <DrillProgramSection source={source} unit={unit} step={step} prepare={prepare} rulesOf={rulesOf} onCutoff={(c) => { if (cutoff == null) setCutoff(c); }}
        collars={collars} survey={survey} plannedHoles={plannedHoles} surfaces={surfaces} busyElsewhere={busy} />}{/* TASKS.csv #3962 (P2) */}
    </div>
  );
}
