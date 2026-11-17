// TASKS.csv #2640 (Stage 1) — "Which contacts can this survey see?": the sensitivity pass of a structure-based inversion, inside Geophysics >
// Gravity / Magnetics beside the geology forward model (#760). It reads the last GemPy run of this project (store.lastImplicitRequest), asks for
// the properties of its units and the interpreted points to test (drillhole contacts never move), and runs the engine's 'structfit' job
// (python-sidecar/app/geophys/structfit.py): for each point, how much the survey's response changes per metre the contact moves, in the survey's
// own uncertainty, and the shift that would move the data by one uncertainty. Vertical moves only.
// TASKS.csv #2640 Stage 2 — then 'Fit the seen points': the same job in 'fit' mode moves the seen points (each within the distance typed) until the
// model's response matches the readings to their stated uncertainty, and lists the moves (from, to, metres) for audit.
import React, { useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store.jsx";
import { useKeptState } from "../lib/keptState.js";
import { runStructfitJob, saveFile } from "../lib/desktop.js";
import { requestModuleAction } from "../lib/menuRequests.js"; // #2640 Stage 2 — the fitted model as a new version
import { movableSurfaces, propertyUnits, modelProblem, buildStructfitRequest, everyNth, resultRows, verdictPoints, recordIsFull, buildFitRequest, fitRows, fitPointsCsv, FIT_STOPPED, MAX_FIT_POINTS, recordWithFit } from "../lib/structFit.js";
import { SURVEY_METHODS, surveyKey } from "../lib/geophysSurveys.js";
import { t as tr } from "../lib/i18n.js";

const fmt = (v, d = 3) => (v == null || !Number.isFinite(v) ? "–" : Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : Number(v.toPrecision(d)).toLocaleString());

export default function StructFitPanel({ method, unit, keptScope, prepareForward, unc, setUnc, field, ui }) {
  const { lastImplicitRequest: record, setLayers, updateGeophysSurvey, goToModule } = useStore(); // goToModule: #2640 Stage 2
  const { small, inp, row, lbl, pBtn } = ui;
  const [st, setSt] = useKeptState(keptScope, "inversion.structfit", { props: {}, surface: "", picked: [], maxM: "", resolve: false, bounds: {} });
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [out, setOut] = useState(null); // { result, rows, units, request }
  const [fit, setFit] = useState(null); // #2640 Stage 2 — { result, rows }
  const abort = useRef(null);
  const surfaces = useMemo(() => movableSurfaces(record), [record]);
  const units = useMemo(() => propertyUnits(record), [record]);
  const problem = modelProblem(record);
  const surf = surfaces.find((s) => s.name === st.surface) || surfaces.find((s) => s.points.length) || null;
  const set = (patch) => setSt((p) => ({ ...p, ...patch }));
  const pickedHere = (st.picked || []).filter((m) => m.surface === surf?.name);
  const isPicked = (index) => pickedHere.some((m) => m.index === index);
  const toggle = (index) => set({ picked: isPicked(index) ? st.picked.filter((m) => !(m.surface === surf.name && m.index === index)) : (st.picked.length >= 20 ? st.picked : [...st.picked, { surface: surf.name, index }]) });

  // TASKS.csv #3632 — the tested points into the 3D View, coloured by their sensitivity (a geophysics point survey, replaced by a new run)
  const show3d = () => {
    const name = `${method === "mag" ? "Magnetics" : "Gravity"} · contact sensitivity`;
    const rows = verdictPoints(out.rows, name);
    if (!rows.length) { setMsg({ ok: false, text: tr("No tested point has a sensitivity to show.") }); return; }
    setLayers((l) => ({ ...l, geophys_pts: [...(l.geophys_pts || []).filter((r) => surveyKey(r) !== name), ...rows] }));
    updateGeophysSurvey(name, { method: "structfit_sens", units: SURVEY_METHODS.structfit_sens.units });
    setMsg({ ok: true, text: tr("Added \"{name}\": {n} tested points in the 3D View, coloured by log₁₀ σ per m (the warm end: the survey sees that contact).", { name, n: rows.length }) });
  };
  const run = async () => {
    setMsg(null);
    const p = prepareForward?.();
    if (!p || p.problems) { setMsg({ ok: false, text: (p?.problems || [tr("Set up the survey first.")]).join(" ") }); return; }
    const built = buildStructfitRequest({
      record, method, stations: p.request.stations, observed: p.request.observed, uncertainty: unc, field: p.request.field,
      props: st.props, movable: st.picked, maxM: st.maxM,
      resolve: st.resolve ? Object.fromEntries(units.map((u) => [u.id, [st.bounds?.[u.id]?.lo ?? "", st.bounds?.[u.id]?.hi ?? ""]])) : null,
    });
    if (built.problems) { setMsg({ ok: false, text: built.problems.map((x) => tr(x)).join(" ") }); return; }
    const ctl = new AbortController();
    abort.current = ctl;
    setBusy({ text: tr("Starting the Python engine…") });
    const res = await runStructfitJob(built.request, { signal: ctl.signal, onProgress: (ev) => setBusy({ text: ev.stage === "points" && ev.iter && ev.maxIter ? tr("Point {k} of {n}.", { k: ev.iter, n: ev.maxIter - 1 }) + (Number.isFinite(ev.etaS) ? " " + tr("About {s} s left.", { s: ev.etaS }) : "") : ev.message || tr("Working…") }) });
    abort.current = null;
    setBusy(null);
    if (!res.ok) { setMsg({ ok: false, text: res.cancelled ? tr("Cancelled.") : res.error }); return; }
    setOut({ result: res.data, rows: resultRows(res.data, record), units, request: built.request });
    setFit(null);
    setMsg({ ok: true, text: tr("Tested {n} point(s) in {s} s.", { n: res.data.points.length, s: Math.round(res.data.seconds) }) });
  };

  // TASKS.csv #2640 Stage 2 — the fit of the points the pass found seen (at most MAX_FIT_POINTS, each with the distance it was tested with)
  const seenPoints = (out?.rows || []).filter((r) => r.verdict === "seen").slice(0, MAX_FIT_POINTS);
  const runFit = async () => {
    setMsg(null);
    const p = prepareForward?.();
    if (!p || p.problems) { setMsg({ ok: false, text: (p?.problems || [tr("Set up the survey first.")]).join(" ") }); return; }
    const built = buildFitRequest({
      record, method, stations: p.request.stations, observed: p.request.observed, uncertainty: unc, field: p.request.field,
      props: out?.result?.resolved ? { ...out.result.properties } : st.props, // the re-solved values when the pass re-solved them
      movable: seenPoints.map((r) => ({ surface: r.surface, index: r.index, maxM: r.maxM })), maxM: st.maxM,
    }, { maxIter: 6 });
    if (built.problems) { setMsg({ ok: false, text: built.problems.map((x) => tr(x)).join(" ") }); return; }
    const ctl = new AbortController();
    abort.current = ctl;
    setBusy({ text: tr("Starting the Python engine…") });
    const res = await runStructfitJob(built.request, { signal: ctl.signal, onProgress: (ev) => setBusy({ text: (ev.message || tr("Working…")) + (Number.isFinite(ev.etaS) ? " " + tr("About {s} s left.", { s: ev.etaS }) : "") }) });
    abort.current = null;
    setBusy(null);
    if (!res.ok) { setMsg({ ok: false, text: res.cancelled ? tr("Cancelled.") : res.error }); return; }
    setFit({ result: res.data, rows: fitRows(res.data, record), record }); // record: the run the fit started from
    setMsg({ ok: true, text: tr("Fit in {s} s ({n} model solves).", { s: Math.round(res.data.seconds), n: res.data.solves }) });
  };
  const saveFitCsv = () => saveFile({ suggestedName: "structure_fit_points.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: fitPointsCsv(fit.rows) });
  // the fitted heights run through the app's own model run, at its full resolution, as '<surface> (fitted)' beside the original (never over it)
  const runFittedVersion = () => { requestModuleAction("run-fitted-model", { record: recordWithFit(fit.record || record, fit.rows) }); goToModule?.("viewer"); };

  return (
    <div style={{ paddingLeft: 4 }}>
      <div style={small}>{tr("Which contacts of your geology model can this survey see? Each point you mark is moved up a little, the model re-solved, and the survey's response recomputed: the table says how much the data change per metre, in the survey's own uncertainty, and how far the contact would have to move for the data to notice. It says nothing about where the contact is: potential fields cannot fix a depth, so a fit would be one geometry that agrees with the survey, never the answer.")}</div>
      <div style={small}>{tr("Points move vertically only. Points from drillhole contacts are observations and never move.")}{" "}{recordIsFull(record) ? tr("The model is rebuilt from the last model run in this project as it was sent: its relation (erode or onlap), conformable packages, fault offsets, potential-field range and precision.") : tr("The model is rebuilt from the last model run in this project with each unit eroding the ones below it; a model run with onlap, conformable packages or a custom range may differ.")}</div>
      {!method ? <div style={small}>{tr("Choose magnetics or gravity first.")}</div> : problem ? <div role="status" style={{ ...small, color: "var(--color-text)" }}>{tr(problem)}</div> : (<>
        <div style={{ ...small, marginTop: 4 }}>{tr("Model from the run \"{tool}\" ({n} surfaces).", { tool: record.tool || tr("last run"), n: record.surfaces.length })}</div>
        <div style={{ ...row, flexWrap: "wrap" }}><span style={lbl}>{tr("Data uncertainty")}</span>
          <input type="number" min="0" step="any" value={unc?.floor ?? ""} onChange={(e) => setUnc?.((u) => ({ ...u, floor: e.target.value }))} style={inp} aria-label={tr("Uncertainty floor ({unit})", { unit })} />
          <span style={small}>{unit}</span>
          <input type="number" min="0" step="any" value={unc?.percent ?? ""} onChange={(e) => setUnc?.((u) => ({ ...u, percent: e.target.value }))} style={{ ...inp, width: 44 }} aria-label={tr("Uncertainty, percent of each reading")} />
          <span style={small}>%</span>
        </div>
        <div style={small}>{tr("The floor is required and never assumed: it sets how much a change in the data counts. The same values as the inversion's.")}</div>
        <div style={{ ...small, marginTop: 4, color: "var(--color-text)" }}>{method === "grav" ? tr("Density of each unit (g/cm³). The background is the space above every top, outside the model.") : tr("Susceptibility of each unit (SI). The background is the space above every top, outside the model.")}</div>
        {units.map((u) => (
          <div key={u.id} style={row}>
            <span style={lbl}>{u.label == null ? tr("Background") : u.label}</span>
            <input type="number" step="any" value={st.props?.[u.id] ?? ""} onChange={(e) => set({ props: { ...st.props, [u.id]: e.target.value } })} style={inp} aria-label={`${u.label == null ? tr("Background") : u.label} (${method === "grav" ? "g/cm³" : "SI"})`} />
            {st.resolve && u.id > 1 && <><input type="number" step="any" placeholder={tr("from")} value={st.bounds?.[u.id]?.lo ?? ""} onChange={(e) => set({ bounds: { ...st.bounds, [u.id]: { ...st.bounds?.[u.id], lo: e.target.value } } })} style={{ ...inp, width: 52 }} aria-label={tr("Lowest value of {u}", { u: u.label == null ? tr("Background") : u.label })} />
              <input type="number" step="any" placeholder={tr("to")} value={st.bounds?.[u.id]?.hi ?? ""} onChange={(e) => set({ bounds: { ...st.bounds, [u.id]: { ...st.bounds?.[u.id], hi: e.target.value } } })} style={{ ...inp, width: 52 }} aria-label={tr("Highest value of {u}", { u: u.label == null ? tr("Background") : u.label })} /></>}
          </div>
        ))}
        <label style={{ ...row, justifyContent: "flex-start", gap: 4 }}><input type="checkbox" checked={!!st.resolve} onChange={(e) => set({ resolve: e.target.checked })} />{tr("Also re-solve the unit values within bounds, from the survey, and show them beside the entered ones")}</label>
        {st.resolve && <div style={small}>{tr("Free re-solving can hide a geometry misfit, and densities are often measured: keep the entered values unless you know better. Needs the survey's readings; the contacts are tested with the re-solved values. The background stays as entered: it is the reference.")}</div>}
        <div style={{ ...row, marginTop: 6 }}><span style={lbl}>{tr("Surface")}</span>
          <select value={surf?.name || ""} onChange={(e) => set({ surface: e.target.value })} style={{ ...inp, width: "auto", maxWidth: 200 }} aria-label={tr("Surface to test")}>
            {surfaces.filter((s) => s.points.length).map((s) => <option key={s.name} value={s.name}>{s.name} ({s.points.length})</option>)}
          </select>
        </div>
        {surf && surf.fromHoles > 0 && <div style={small}>{tr("{n} of this surface's points come from drillhole contacts and cannot move.", { n: surf.fromHoles })}</div>}
        {surf && (<>
          <div style={{ maxHeight: 130, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 4, padding: "2px 6px", marginTop: 4 }}>
            {surf.points.slice(0, 400).map((p) => (
              <label key={p.index} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "var(--font-size-xs)" }}>
                <input type="checkbox" checked={isPicked(p.index)} onChange={() => toggle(p.index)} />{tr("Point {i}: {x}, {y}, {z} m", { i: p.index + 1, x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) })}
              </label>
            ))}
            {surf.points.length > 400 && <div style={small}>{tr("The first 400 points are listed; use the button to spread points over all of them.")}</div>}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
            <button type="button" onClick={() => set({ picked: [...(st.picked || []).filter((m) => m.surface !== surf.name), ...everyNth(surf.points, surf.name, 20)].slice(0, 20) })} style={{ ...pBtn, width: "auto", margin: 0 }}>{tr("Spread up to 20 over this surface")}</button>
            <button type="button" onClick={() => set({ picked: [] })} style={{ ...pBtn, width: "auto", margin: 0 }}>{tr("Clear")}</button>
          </div>
        </>)}
        <div style={{ ...small, marginTop: 4 }}>{tr("{n} of at most 20 points marked.", { n: (st.picked || []).length })}</div>
        <div style={row}><span style={lbl}>{tr("Each may move (m)")}</span><input type="number" min="0" step="any" value={st.maxM} onChange={(e) => set({ maxM: e.target.value })} style={inp} aria-label={tr("Distance each point may move (m)")} /></div>
        <div style={small}>{tr("The distance you would believe: a contact is called seen when the survey would notice a move within it. Each point costs one model solve; if one solve times the points would take over 10 minutes the run is refused before it starts.")}</div>
        {busy ? (
          <div role="status" style={{ ...small, display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}><span style={{ flex: 1 }}>{busy.text}</span>
            <button type="button" onClick={() => abort.current?.abort()} style={{ ...pBtn, width: "auto", margin: 0 }}>{tr("Cancel")}</button></div>
        ) : <button type="button" onClick={run} style={{ ...pBtn, marginTop: 6, marginBottom: 0 }}>{tr("Find which contacts the survey can see")}</button>}
      </>)}
      {msg && <div role={msg.ok ? "status" : "alert"} style={{ ...small, marginTop: 6, color: msg.ok ? "var(--color-text-secondary)" : "var(--color-danger-fg)" }}>{msg.text}</div>}
      {out && (
        <div style={{ marginTop: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-xs)" }} aria-label={tr("Which contacts the survey can see")}>
            <thead><tr style={{ textAlign: "left", color: "var(--color-text-muted)" }}><th>{tr("Point")}</th><th title={tr("How much the readings change per metre the contact moves, in the survey's uncertainty (RMS over the stations)")}>{tr("σ per m")}</th><th title={tr("The shift that moves the readings by one uncertainty")}>{tr("m for 1 σ")}</th><th>{tr("Verdict")}</th></tr></thead>
            <tbody>{out.rows.map((r) => (
              <tr key={`${r.surface}:${r.index}`} title={`${r.surface}: ${Math.round(r.x)}, ${Math.round(r.y)}, ${Math.round(r.z)}`}>
                <td>{r.surface} #{r.index + 1}</td><td>{fmt(r.rmsPerM)}</td><td>{r.shiftForOneSigma == null ? "–" : fmt(r.shiftForOneSigma)}</td>
                <td style={{ color: r.verdict === "seen" ? "var(--color-text)" : "var(--color-text-muted)" }}>{r.verdict === "seen" ? tr("seen") : r.verdict === "none" ? tr("no contact here") : tr("not constrained by this survey")}</td>
              </tr>))}</tbody>
          </table>
          <button type="button" onClick={show3d} style={{ ...pBtn, marginTop: 6, marginBottom: 0 }}>{tr("Show the tested points in the 3D View")}</button>
          <div style={{ ...small, marginTop: 4 }}>{tr("Seen: the survey would notice a move within the distance you gave. Not constrained: it would not, so a fit could move that contact without the data objecting. A move of a quarter of a model cell was tested; the response is linear in it.")}</div>
          {/* TASKS.csv #2640 Stage 2 — the fit */}
          {seenPoints.length > 0 && !busy && (
            <div style={{ marginTop: 8, borderTop: "1px solid var(--color-border)", paddingTop: 6 }}>
              <div style={small}>{tr("Fit moves the seen points (at most {n}), each within the distance you gave, until the model's response matches the readings to their stated uncertainty. Drillhole contacts never move, and a step that would change which units touch is refused. Potential fields cannot fix a contact's depth: the result is one geometry that fits the survey to the stated uncertainty, not the answer.", { n: MAX_FIT_POINTS })}</div>
              <button type="button" onClick={runFit} style={{ ...pBtn, marginTop: 6, marginBottom: 0 }}>{tr("Fit the {n} seen point(s)", { n: seenPoints.length })}</button>
            </div>
          )}
          {fit && (
            <div style={{ marginTop: 8 }}>
              <div style={{ ...small, color: "var(--color-text)" }}>{tr(FIT_STOPPED[fit.result.stopped] || fit.result.stopped)} {tr("Misfit in uncertainties: {a} at the start, {b} after ({r} round(s)).", { a: fmt(fit.result.rmsStart), b: fmt(fit.result.rmsEnd), r: fit.result.history.length - 1 })}</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-xs)", marginTop: 4 }} aria-label={tr("The fitted points")}>
                <thead><tr style={{ textAlign: "left", color: "var(--color-text-muted)" }}><th>{tr("Point")}</th><th>{tr("From (m)")}</th><th>{tr("To (m)")}</th><th>{tr("Moved (m)")}</th><th>{tr("Allowed (m)")}</th></tr></thead>
                <tbody>{fit.rows.map((r) => (
                  <tr key={"f" + r.surface + ":" + r.index} title={r.surface + ": " + Math.round(r.x) + ", " + Math.round(r.y)} style={{ color: r.constrained ? "var(--color-text)" : "var(--color-text-muted)" }}>
                    <td>{r.surface} #{r.index + 1}</td><td>{fmt(r.zStart, 5)}</td><td>{fmt(r.z, 5)}</td><td>{r.constrained ? (r.movedM >= 0 ? "+" : "") + fmt(r.movedM) : tr("not constrained")}</td><td>{fmt(r.maxM)}{r.atLimit ? " " + tr("(at the limit)") : ""}</td>
                  </tr>))}</tbody>
              </table>
              {fit.rows.some((r) => r.atLimit) && <div style={small}>{tr("A point at the limit of its distance: the survey would move it further. Check the unit values and the uncertainty before allowing more.")}</div>}
              {fit.result.history.some((h) => h.reasons?.length) && <div style={small}>{tr("Steps refused: {list}", { list: [...new Set(fit.result.history.flatMap((h) => h.reasons || []))].slice(0, 3).join("; ") })}</div>}
              {fit.rows.some((r) => r.constrained && Math.abs(r.movedM) > 1e-6) && <button type="button" onClick={runFittedVersion} style={{ ...pBtn, marginTop: 6, marginBottom: 0 }}>{tr("Run the fitted model as a new version")}</button>}
              <button type="button" onClick={saveFitCsv} style={{ ...pBtn, marginTop: 6, marginBottom: 0 }}>{tr("Save the moved points (CSV)")}</button>
              <div style={{ ...small, marginTop: 4 }}>{tr("The fit runs on the model at up to 32 cells a side. A new version runs the fitted model at its full resolution in 3D Modelling, each surface named '(fitted)' beside the original; the original model is not changed.")}</div>
            </div>
          )}
          {out.result.resolved && (
            <div style={{ marginTop: 6 }}>
              <div style={small}>{tr("Unit values re-solved from the survey, beside the ones entered (misfit in uncertainties: {a} re-solved, {b} entered):", { a: fmt(out.result.resolved.rms), b: fmt(out.result.resolved.rmsEntered) })}</div>
              {out.units.filter((u) => u.id > 1 && out.result.resolved.properties[String(u.id)] != null).map((u) => (
                <div key={u.id} style={small}>{u.label == null ? tr("Background") : u.label}: {fmt(+out.request.properties[String(u.id)])} → {fmt(out.result.resolved.properties[String(u.id)])}</div>
              ))}
              <div style={small}>{tr("Base level removed: {v} ({unit}).", { v: fmt(out.result.resolved.baseLevel), unit })}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
