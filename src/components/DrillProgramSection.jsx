// TASKS.csv #3962 (P2) — "Drill program" under Probable grade (Targeting > Planned holes): a suggested program from the pads, scored by the
// rule the geologist picks, each hole's value per dollar (per metre with no drilling rate), chosen greedily "as if drilled"
// (lib/drillPlanner/program.js, in the worker). The table says why each hole is where it is, and draws the diminishing-returns line;
// the holes are added as planned holes in one Undo step, named by the project's own series, each with its prediction frozen on it.
// Per-hole grade x metres only: no tonnes, no contained metal (Matt, 2026-11-22). Design: Review data\Drill planner\design.md 1.3-1.5, 3.
import React, { useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store.jsx";
import { t as trRaw } from "../lib/i18n.js";
import { currencyOf, withCurrency, moneyText } from "../lib/currency.js";
import { drilledCollars } from "../lib/collarStatus.js";
import { drilledSiteSpacing } from "../lib/evidenceSources.js";
import { minSpacingFrom } from "../lib/plannedHoleChecks.js";
import { collarHoleTypes } from "../lib/drillProgram.js";
import { nextHoleId } from "../lib/holeSeries.js";
import { terrainGroundAt } from "../lib/viewer/geomath.js";
import { collarGround } from "../lib/pitShell.js";
import { buildMeshQuery, intervalsInsideMesh, isMeshClosed } from "../lib/meshQuery.js";
import { padsFromCollars, candidateHoles, insideRuns, PROGRAM_DEFAULTS } from "../lib/drillPlanner/program.js";
import { runPlanner, runProgram } from "../lib/drillPlanner/drillPlannerClient.js";
import { whatChanged, dataStamp } from "../lib/drillPlanner/adaptive.js"; // TASKS.csv #3962 (P3)
import { add_program_holes } from "../lib/drillPlanner/mcpPlanner.js"; // TASKS.csv #3962 (P5) — an AI app's suggested program, added here
import { assayStamp } from "../lib/assayStamp.js";
import { rowsOf } from "../lib/rowTable.js";
import { modelStamp, predictionRecord, fmt } from "../lib/drillPlanner/predictionInputs.js";
import { saveFile } from "../lib/desktop.js";
import { stampEpsg } from "../lib/provenance.js";
import { programCsvText } from "../lib/drillPlanner/programExport.js";
import { version as APP_VERSION } from "../../package.json";
import NumberInput from "./NumberInput.jsx";
import MoreFold from "./MoreFold.jsx"; // #3962: the detail behind More (Matt: less text first)

const label = { display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" };
const row = { display: "flex", gap: 4, marginBottom: 6, alignItems: "flex-end" };
const btn = { width: "100%", padding: "6px 8px", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)", color: "var(--color-text)" };
const RULE_KEYS = ["balanced", "hit", "metal", "learn"];
// project data and export files stay English (CLAUDE.md): the same sentence, filled without translating
const english = (k, v) => String(k).replace(/\{(\w+)\}/g, (_, n) => (v && v[n] != null ? v[n] : ""));

export default function DrillProgramSection({ source, unit, step, prepare, rulesOf, onCutoff, collars, survey, plannedHoles, surfaces, busyElsewhere }) {
  const storeAll = useStore();
  const { project, terrain, assays, addPlannedHole, setDrillPrograms, undoCheckpoint } = storeAll;
  const programs = project?.drillPrograms || []; // TASKS.csv #3962 (P3): kept with the project, like the drill rates
  const stampNow = useMemo(() => dataStamp(assayStamp(rowsOf(assays)), collars), [assays, collars]);
  const cur = currencyOf(project), tr = (k, v) => withCurrency(trRaw(k, v), cur);
  const rates = project?.drillRates || {};
  const hasRate = Object.entries(rates).some(([k, v]) => !k.startsWith("__") && Number(v) > 0);
  const drilled = useMemo(() => drilledCollars(collars).collars, [collars]);
  const drilledPads = useMemo(() => padsFromCollars(drilled), [drilled]);
  const [newPads, setNewPads] = useState([]);
  const pads = useMemo(() => [...drilledPads, ...newPads], [drilledPads, newPads]);
  const [unticked, setUnticked] = useState(() => new Set());
  const [padE, setPadE] = useState(null), [padN, setPadN] = useState(null);
  const closed = useMemo(() => (surfaces || []).filter((s) => s.positions && s.indices && isMeshClosed(s.positions, s.indices).closed), [surfaces]);
  const [targetId, setTargetId] = useState("");
  const [azStep, setAzStep] = useState(PROGRAM_DEFAULTS.azStep), [dipsText, setDipsText] = useState(PROGRAM_DEFAULTS.dips.join(", ")), [maxLength, setMaxLength] = useState(PROGRAM_DEFAULTS.maxLength);
  const [type, setType] = useState("");
  const [maxHoles, setMaxHoles] = useState(PROGRAM_DEFAULTS.maxHoles), [perPad, setPerPad] = useState(PROGRAM_DEFAULTS.perPad), [maxMetres, setMaxMetres] = useState(null), [budget, setBudget] = useState(null);
  const autoSpacing = useMemo(() => minSpacingFrom(drilledSiteSpacing(collars)), [collars]);
  const [spacing, setSpacing] = useState(null);
  const minSpacing = spacing ?? autoSpacing ?? 0;
  const [rule, setRule] = useState("balanced"), [kappa, setKappa] = useState(PROGRAM_DEFAULTS.kappa);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [error, setError] = useState(null), [result, setResult] = useState(null), [added, setAdded] = useState(null);
  const abort = useRef(null);
  const ground = useMemo(() => (terrain ? (x, y) => terrainGroundAt(terrain, x, y) : collarGround(collars, survey)), [terrain, collars, survey]);
  const dips = dipsText.split(/[,;\s]+/).map(Number).filter((d) => Number.isFinite(d) && d < 0 && d >= -90);


  const padName = (p, t = tr) => (p.isNew ? t("New pad {n}", { n: p.n }) : p.holes.length > 1 ? t("{hole} pad (+{n})", { hole: p.holes[0], n: p.holes.length - 1 }) : t("{hole} pad", { hole: p.holes[0] }));
  const addPad = () => {
    if (!Number.isFinite(padE) || !Number.isFinite(padN)) return;
    const z = ground ? ground(padE, padN) : NaN;
    if (!Number.isFinite(z)) { setError(tr("No elevation there: load a terrain, or add the pad nearer the collars.")); return; }
    setNewPads((l) => [...l, { id: `new:${l.length + 1}`, n: l.length + 1, x: padE, y: padN, z, holes: [], isNew: true }]);
    setPadE(null); setPadN(null); setError(null);
  };

  // the section's inputs as a program keeps them (pads by position: drilled pads' ids follow the collars and shift when one is added)
  const currentInputs = () => ({
    target: closed.find((s) => s.id === targetId)?.name || null, pads: pads.filter((p) => !unticked.has(p.id)).map((p) => ({ x: p.x, y: p.y })), newPads,
    azStep: Math.max(5, Number(azStep) || PROGRAM_DEFAULTS.azStep), dips: dips.length ? dips : PROGRAM_DEFAULTS.dips, maxLength: Number(maxLength) || PROGRAM_DEFAULTS.maxLength, type,
    limits: { maxHoles: Number(maxHoles) || PROGRAM_DEFAULTS.maxHoles, perPad: Number(perPad) || 0, maxMetres: Number(maxMetres) || 0, budget: hasRate ? Number(budget) || 0 : 0 }, minSpacing, rule, kappa,
  });
  const suggest = () => runWith(currentInputs(), null);
  // TASKS.csv #3962 (P3) — a saved program re-run on today's data, as many holes as it still has to drill: What changed against them
  const rerun = (prog) => {
    const v = prog.versions[prog.versions.length - 1], left = plannedHoles.filter((h) => h.programId === prog.id && !h.asDrilledHoleId);
    runWith({ ...prog.inputs, limits: { ...prog.inputs.limits, maxHoles: Math.max(1, left.length) } }, { prog, version: v.n, left });
  };

  const runWith = async (inp, rerunOf) => {
    setBusy(true); setError(null); setResult(null); setAdded(null); setProgress(0);
    const ac = new AbortController(); abort.current = ac;
    try {
      const prep = await prepare(ac.signal, setError);
      if (!prep) return;
      const { model, values, points } = prep;
      const rules = rulesOf(values); onCutoff(rules.cutoff);
      const target = inp.target ? closed.find((s) => s.name === inp.target) || null : null;
      if (inp.target && !target) { setError(tr("\"{name}\" is not shown in the 3D view: show it to re-run this program.", { name: inp.target })); return; }
      const q = target ? buildMeshQuery(target.positions, target.indices) : null;
      const insideOf = q ? (trace) => insideRuns(intervalsInsideMesh(q, trace).intervals) : null;
      const azimuths = []; for (let a = 0; a < 360 - 1e-9; a += inp.azStep) azimuths.push(Math.round(a * 10) / 10);
      const runPads = [...drilledPads.filter((p) => inp.pads.some((t) => Math.hypot(t.x - p.x, t.y - p.y) <= PROGRAM_DEFAULTS.padM)), ...(inp.newPads || []).filter((p) => inp.pads.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < 1e-6))];
      const { candidates, outside, capped, total } = candidateHoles(runPads, { azimuths, dips: inp.dips, maxLength: inp.maxLength, minLength: rules.minLength, insideOf });
      if (capped) { setError(tr("{t} candidates, over {n}: tick fewer pads or a coarser step.", { t: total, n: PROGRAM_DEFAULTS.maxCandidates })); return; } // asked, never sampled (design.md 1.3)
      if (!candidates.length) { setError(target ? tr("No hole crosses \"{name}\" for {m} m: tick or add a nearer pad, or allow longer holes.", { name: target.name, m: fmt(rules.minLength) }) : tr("Tick at least one pad.")); return; }
      const drilledPts = { x: Float64Array.from(points, (p) => p.x), y: Float64Array.from(points, (p) => p.y), z: Float64Array.from(points, (p) => p.z), ids: points.map((p) => String(p.hole_id)) };
      const searchRadius = source.searchRadiusM || model.vg.range;
      const r = await runProgram({ kind: "program", model, candidates, rules, opts: { rule: inp.rule, kappa: inp.kappa, step, searchRadius, minSpacing: inp.minSpacing, rates, type: inp.type, pads: Object.fromEntries(runPads.map((p) => [p.id, { isNew: !!p.isNew }])), drilled: drilledPts, limits: inp.limits } }, { signal: ac.signal, onProgress: (f) => setProgress(0.8 * f) });
      // the holes' predictions from the drilling alone (200 runs), the ones the table shows and each hole keeps
      const byId = new Map(candidates.map((c) => [c.id, c]));
      const holes = r.chosen.map((h) => ({ id: h.id, trace: byId.get(h.id).trace }));
      const preds = holes.length ? await runPlanner({ kind: "predict", model, holes, rules, opts: { step, searchRadius } }, { signal: ac.signal, onProgress: (f) => setProgress(0.8 + 0.2 * f) }) : {};
      const changed = rerunOf ? whatChanged(rerunOf.left, r.chosen) : null;
      setResult({ ...r, preds, rules, model, values, inputs: inp, rerunOf, changed, candidates: candidates.length, outside, capped, total, target: target?.name || null, money: r.chosen.some((h) => h.money), padNames: Object.fromEntries(runPads.map((p) => [p.id, padName(p)])), padEnglish: Object.fromEntries(runPads.map((p) => [p.id, padName(p, english)])), type: inp.type });
      if (rerunOf) { // the re-run is the program's next version, said with what it changed
        const v = { n: rerunOf.prog.versions.length + 1, date: new Date().toISOString(), stamp: stampNow, holes: r.chosen.map((h) => ({ order: h.order, x: h.x, y: h.y, azimuth: h.azimuth, dip: h.dip, length: h.length, score: h.score })), changes: { keep: changed.keep.length, drop: changed.drop.length, add: changed.add.length } };
        setDrillPrograms((ps) => ps.map((p) => (p.id === rerunOf.prog.id ? { ...p, versions: [...p.versions, v] } : p)));
      }
    } catch (e) {
      if (!e?.cancelled) setError(e?.message || String(e));
    } finally { setBusy(false); abort.current = null; }
  };

  // the hole names the project's own series gives, one after another
  const namesFor = (n) => {
    const ids = [...(collars || []).map((c) => c.hole_id), ...(plannedHoles || []).map((h) => h.name)], out = [];
    for (let i = 0; i < n; i++) {
      let id = nextHoleId(ids);
      if (!id) { let k = (plannedHoles || []).length + i + 1; while (ids.includes(`PLAN-${k}`)) k++; id = `PLAN-${k}`; }
      out.push(id); ids.push(id);
    }
    return out;
  };
  // a hole's reason, from the numbers the program kept (program.js facts): how far the nearest drilled hole is, how little the model knows there;
  // "near known grade" only within half the variogram's range of a drilled hole (live: "near" at 64 m read wrong)
  const why = (h, t = tr) => {
    const f = h.facts, p = Math.round((f.pHit || 0) * 100);
    if (!f.nearestHole) return t("Far from the drilling: the model knows little there.");
    if (f.unknown != null && f.unknown >= 0.6) return t("Into ground the model knows little, {m} m from {hole}.", { m: f.nearestM, hole: f.nearestHole });
    if (f.pHit >= 0.6 && f.nearestM <= (result?.model?.vg?.range || Infinity) / 2) return t("Near known grade, {m} m from {hole}: a {p} % chance of an intercept.", { m: f.nearestM, hole: f.nearestHole, p });
    return t("Between holes, {m} m from {hole}: a {p} % chance of an intercept.", { m: f.nearestM, hole: f.nearestHole, p });
  };
  const money = (v) => (result?.money ? moneyText(cur, Math.round(v).toLocaleString()) : tr("{v} m", { v: Math.round(v).toLocaleString() }));
  const rows = result ? result.chosen.map((h, i) => ({ h, i, pred: result.preds[h.id] })) : [];
  const above = result ? Math.max(0, result.line) : 0;

  const addHoles = (n, only = null) => {
    if (!result || !n) return;
    const pick = (only ? rows.filter(({ h }) => only.has(h.id)) : rows.slice(0, n)), names = namesFor(pick.length);
    const stamp = modelStamp(source, result.model, result.values), date = new Date().toISOString();
    const programId = result.rerunOf?.prog.id || `prog_${Date.now().toString(36)}`;
    try { undoCheckpoint?.(); } catch { /* no history */ }
    const ids = [];
    pick.forEach(({ h, pred }, k) => {
      const hole = { name: names[k], x: h.x, y: h.y, z: h.z, azimuth: h.azimuth, dip: h.dip, length: h.length, type: result.type || "", programId, status: "proposed", notes: english("Suggested by the drill program ({rule}, #{n}): {why}", { rule: ruleName(result.rule, english), n: h.order, why: why(h, english) }) };
      ids.push(addPlannedHole({ ...hole, ...(pred ? { prediction: predictionRecord(pred, { source, model: result.model, rules: result.rules, hole, stamp, date }) } : {}) }));
    });
    // TASKS.csv #3962 (P3) — the program kept with the project: its inputs and its versions (the holes chosen, the data stamp), so it can be re-run
    if (!result.rerunOf) setDrillPrograms((ps) => [...ps, { id: programId, date, element: source.element, unit, rule: result.rule, kappa: result.kappa, inputs: result.inputs,
      versions: [{ n: 1, date, stamp: stampNow, holes: pick.map(({ h }, k) => ({ plannedId: ids[k], order: h.order, x: h.x, y: h.y, azimuth: h.azimuth, dip: h.dip, length: h.length, score: h.score })) }] }]);
    try { undoCheckpoint?.(trRaw("Add the suggested drill program")); } catch { /* no history */ }
    setAdded({ n: pick.length, first: names[0], last: names[names.length - 1] });
  };
  const ruleName = (k, t = trRaw) => ({ balanced: t("Balanced"), hit: t("Most likely to hit"), metal: t("Most metal found"), learn: t("Learn the most") }[k]);

  const exportCsv = () => {
    if (!result) return;
    const content = programCsvText({ rows, names: namesFor(rows.length), above, money: result.money, cur, unit, type: result.type, why: (h) => why(h, english), padName: (id) => result.padEnglish[id] || id,
      rule: result.rule, ruleName: ruleName(result.rule, english), kappa: result.kappa, source, model: result.model, rules: result.rules, step, target: result.target, version: APP_VERSION, epsg: stampEpsg(project) });
    saveFile({ suggestedName: `drill_program_${source.element}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content });
  };

  const off = busy || busyElsewhere;
  return (
    <div data-drill-program="" style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--color-divider)" }}>
      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)", fontWeight: 600, marginBottom: 2 }}>{tr("Drill program")}</div>
      <MoreFold style={{ marginBottom: 6, fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>
        <div>{tr("Suggests holes from the pads, the best value per $ first, each chosen as if the ones before it were drilled. A suggestion: you decide.")}</div>
        <div>{tr("Balanced: the middle grade × metres plus κ × its spread, per $.")}</div>
        <div>{tr("Most likely to hit: the chance of an intercept, per $; near known grade.")}</div>
        <div>{tr("Most metal found: the expected grade × metres, per $.")}</div>
        <div>{tr("Learn the most: the ground the model knows least, per $; step-outs.")}</div>
      </MoreFold>
      <label style={{ ...label, marginBottom: 6 }}>{tr("Target")}
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)} disabled={off} style={{ fontSize: "var(--font-size-base)" }}>
          <option value="">{tr("Anywhere the model reaches")}</option>
          {closed.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <details style={{ marginBottom: 6, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
        <summary style={{ cursor: "pointer" }}>{tr("Pads: {k} of {n} ticked", { k: pads.filter((p) => !unticked.has(p.id)).length, n: pads.length })}</summary>
        <div style={{ maxHeight: 140, overflowY: "auto", margin: "4px 0" }}>
          {pads.map((p) => (
            <label key={p.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={!unticked.has(p.id)} onChange={(e) => setUnticked((s) => { const n = new Set(s); if (e.target.checked) n.delete(p.id); else n.add(p.id); return n; })} disabled={off} />
              <span>{padName(p)}</span>
            </label>))}
        </div>
        <div style={row}>
          <label style={label}>{tr("New pad E")}<NumberInput value={padE ?? ""} allowEmpty onChange={setPadE} disabled={off} style={{ width: "100%" }} /></label>
          <label style={label}>{tr("New pad N")}<NumberInput value={padN ?? ""} allowEmpty onChange={setPadN} disabled={off} style={{ width: "100%" }} /></label>
          <button type="button" onClick={addPad} disabled={off || !Number.isFinite(padE) || !Number.isFinite(padN)} style={{ ...btn, width: "auto" }}>{tr("Add pad")}</button>
        </div>
      </details>
      <details style={{ marginBottom: 6, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
        <summary style={{ cursor: "pointer" }}>{tr("Angles and limits: up to {n} holes", { n: maxHoles })}</summary>
      <div style={row}>
        <label style={label}>{tr("Azimuth step (°)")}<NumberInput value={azStep} min={5} max={180} onChange={setAzStep} disabled={off} style={{ width: "100%" }} /></label>
        <label style={label}>{tr("Dips (°)")}<input value={dipsText} onChange={(e) => setDipsText(e.target.value)} disabled={off} style={{ width: "100%", fontSize: "var(--font-size-base)" }} /></label>
        <label style={label}>{tr("Max. length (m)")}<NumberInput value={maxLength} min={10} onChange={setMaxLength} disabled={off} style={{ width: "100%" }} /></label>
      </div>
      <div style={row}>
        <label style={label}>{tr("Hole type")}<input list="drill-program-types" value={type} onChange={(e) => setType(e.target.value)} disabled={off} style={{ width: "100%", fontSize: "var(--font-size-base)" }} />
          <datalist id="drill-program-types">{collarHoleTypes(collars).map((t) => <option key={t} value={t} />)}</datalist></label>
        <label style={label}>{tr("Max. holes")}<NumberInput value={maxHoles} min={1} max={100} onChange={setMaxHoles} disabled={off} style={{ width: "100%" }} /></label>
        <label style={label}>{tr("Holes per pad")}<NumberInput value={perPad} min={1} onChange={setPerPad} disabled={off} style={{ width: "100%" }} /></label>
      </div>
      <div style={row}>
        <label style={label}>{tr("Max. metres")}<NumberInput value={maxMetres ?? ""} allowEmpty placeholder={tr("none")} onChange={setMaxMetres} disabled={off} style={{ width: "100%" }} /></label>
        <label style={label}>{tr("Budget ($)")}<NumberInput value={budget ?? ""} allowEmpty placeholder={hasRate ? tr("none") : tr("no rate set")} onChange={setBudget} disabled={off || !hasRate} style={{ width: "100%" }} /></label>
        <label style={label}>{tr("Min. spacing (m)")}<NumberInput value={minSpacing || ""} allowEmpty placeholder={tr("none")} onChange={(v) => setSpacing(v == null ? 0 : Math.max(0, v))} disabled={off} style={{ width: "100%" }} /></label>
      </div>
      </details>
      <label style={{ ...label, marginBottom: 2 }}>{tr("Rule")}
        <select value={rule} onChange={(e) => setRule(e.target.value)} disabled={off} style={{ fontSize: "var(--font-size-base)" }}>
          {RULE_KEYS.map((k) => <option key={k} value={k}>{ruleName(k)}</option>)}
        </select>
      </label>
      {rule === "balanced" && <label style={{ ...label, flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span>{tr("Near known grade")}</span><input type="range" min={0} max={2} step={0.25} value={kappa} onChange={(e) => setKappa(Number(e.target.value))} disabled={off} style={{ flex: 1 }} aria-label={tr("Balance")} /><span>{tr("Into the unknown")}</span>
      </label>}
      {!hasRate && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6 }}>{tr("No drilling rate: compared per metre.")}</div>}
      {busy ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
          <span style={{ flex: 1 }} role="status">{tr("Suggesting… {p} %", { p: Math.round(progress * 100) })}</span>
          <button type="button" onClick={() => abort.current?.abort()} style={{ ...btn, width: "auto" }}>{tr("Cancel")}</button>
        </div>
      ) : (
        <button type="button" onClick={suggest} disabled={off} style={btn}>{tr("Suggest a program")}</button>
      )}
      {error && <div role="alert" style={{ marginTop: 6, fontSize: "var(--font-size-xs)", color: "var(--color-danger-text)", lineHeight: 1.4 }}>{error}</div>}
      {programs.length > 0 && (
        <div data-drill-programs="" style={{ marginTop: 8, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
          {programs.slice(-3).reverse().map((prog) => {
            const mine = plannedHoles.filter((h) => h.programId === prog.id), drilledN = mine.filter((h) => h.asDrilledHoleId).length, v = prog.versions[prog.versions.length - 1];
            // TASKS.csv #3962 (P5) — suggested by an AI app (run_drill_planner) and not added yet: added here in one Undo step, as add_program_holes does
            if (prog.scenario && mine.length === 0) return (
              <div key={prog.id} data-drill-program-row="" style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                <span style={{ flex: 1 }}>{tr("Program of {date} by {by}: {n} holes suggested, not added.", { date: String(prog.date).slice(0, 10), by: prog.by || "?", n: v.holes.length })}</span>
                <button type="button" disabled={off} onClick={() => { try { undoCheckpoint?.(); } catch { /* no history */ } add_program_holes({ program_id: prog.id, holes: "all" }, { ...storeAll, plannedHoles }); try { undoCheckpoint?.(trRaw("Add the suggested drill program")); } catch { /* no history */ } }} style={{ ...btn, width: "auto" }}>{tr("Add")}</button>
              </div>);
            return (
              <div key={prog.id} data-drill-program-row="" style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                <span style={{ flex: 1 }}>{tr("Program of {date}: {n} holes, {k} drilled.", { date: String(prog.date).slice(0, 10), n: mine.length, k: drilledN })}
                  {v.stamp !== stampNow && <span style={{ color: "var(--color-warn-text)" }}>{" "}{tr("New data since.")}</span>}</span>
                <button type="button" onClick={() => rerun(prog)} disabled={off || !mine.length || drilledN === mine.length} style={{ ...btn, width: "auto" }}>{tr("Re-run")}</button>
              </div>);
          })}
        </div>
      )}
      {result?.changed && (
        <div data-what-changed="" role="status" style={{ marginTop: 8, padding: "6px 8px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-xs)", color: "var(--color-text)", lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600 }}>{tr("What changed (version {n})", { n: result.rerunOf.prog.versions.length + 1 })}</div>
          {result.changed.keep.length > 0 && <div>{tr("Still suggested: {list}.", { list: result.changed.keep.map((k) => `${k.hole.name} (#${k.order})`).join(", ") })}</div>}
          {result.changed.drop.length > 0 && <div style={{ color: "var(--color-warn-text)" }}>{tr("Consider dropping: {list}.", { list: result.changed.drop.map((h) => h.name).join(", ") })}</div>}
          {result.changed.add.length > 0 && <div>{tr("Consider adding: {list}.", { list: result.changed.add.map((c) => `#${c.order} ${result.padNames[c.pad] || ""} ${c.azimuth}° / ${c.dip}°`).join(", ") })}</div>}
          {result.changed.add.length > 0 && <button type="button" onClick={() => addHoles(1, new Set(result.changed.add.map((c) => c.id)))} style={{ ...btn, marginTop: 4 }}>{tr(result.changed.add.length === 1 ? "Add the new one" : "Add the {n} new ones", { n: result.changed.add.length })}</button>}
        </div>
      )}
      {result && (
        <div data-program-result="" style={{ marginTop: 8 }}>
          <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", lineHeight: 1.4, marginBottom: 6 }}>
            {result.chosen.length ? tr("{n} holes, {m} m, {cost}.", { n: result.chosen.length, m: Math.round(result.chosen[result.chosen.length - 1].cumMetres).toLocaleString(), cost: money(result.chosen[result.chosen.length - 1].cumCost) }) : tr("No hole fits the limits.")}
          </div>
          <MoreFold style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", lineHeight: 1.4 }}>
            {result.chosen.length > 0 && tr("Expected grade × metres, summed: {gt}; expected holes with an intercept: {hits}.", { gt: fmt(rows.reduce((t, r) => t + (r.pred?.gtMean || 0), 0)), hits: fmt(rows.reduce((t, r) => t + (r.pred?.pHit || 0), 0)) })}
            {" "}{tr("From {c} candidates ({t} twins of drilled or chosen holes, {b} beyond the drilling).", { c: result.candidates, t: result.counts.twins, b: result.counts.beyond })}
            {result.outside > 0 && " " + tr("{n} never crossed the target.", { n: result.outside })}
          </MoreFold>
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {rows.map(({ h, i, pred }) => (
              <React.Fragment key={h.id}>
                {i === above && i < rows.length && <li data-program-line="" style={{ borderTop: "2px dashed var(--color-warn-border)", margin: "4px 0", paddingTop: 3, fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)" }}>{tr("Below the line: each hole worth under a quarter of the first.")}</li>}
                <li data-program-hole="" style={{ marginBottom: 6, padding: "5px 7px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)", fontSize: "var(--font-size-xs)", color: "var(--color-text)", lineHeight: 1.4, opacity: i < above ? 1 : 0.65 }}>
                  <div style={{ fontWeight: 600 }}>{tr("#{n} from {pad}: az {a}° / dip {d}° / {L} m, {cost} (total {cum})", { n: h.order, pad: result.padNames[h.pad] || h.pad, a: h.azimuth, d: h.dip, L: h.length, cost: money(h.cost), cum: money(h.cumCost) })}</div>
                  {pred && !pred.beyond ? <div>{tr("A {p} % chance of an intercept; grade × metres, low / middle / high: {a} / {b} / {c}", { p: Math.round(pred.pHit * 100), a: fmt(pred.gt[0]), b: fmt(pred.gt[1]), c: fmt(pred.gt[2]) })}</div> : <div>{tr("Beyond the drilling: no prediction.")}</div>}
                  <div style={{ color: "var(--color-text-secondary)" }}>{why(h)}</div>
                </li>
              </React.Fragment>
            ))}
          </ol>
          {rows.length > 0 && !result.rerunOf && ( /* a re-run adds only its new holes, from What changed */
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {above > 0 && above < rows.length && <button type="button" onClick={() => addHoles(above)} style={btn}>{tr("Add the {n} above the line", { n: above })}</button>}
              <button type="button" onClick={() => addHoles(rows.length)} style={btn}>{tr("Add all {n}", { n: rows.length })}</button>
              <button type="button" onClick={exportCsv} style={btn}>{tr("Export the program (CSV)")}</button>
            </div>
          )}
          {added && <div role="status" style={{ marginTop: 4, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>{tr(added.n === 1 ? "Added {first}." : "Added {first} to {last}.", added)}</div>}
        </div>
      )}
    </div>
  );
}
