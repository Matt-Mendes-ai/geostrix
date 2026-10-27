// TASKS.csv #643 — "True 3D inversion": every saved line's readings in ONE 3D model (python-sidecar app/geophys/dcip3d.py).
// Matt: "Is it possible to make a true 3d inversion?" The lines are placed as they were for 2D (#602 / #634); an estimate
// (mesh, memory, time, solver) comes first, then the job runs in the engine like the 2D one (progress and Cancel in the
// status bar), and the result lands as resistivity / chargeability block models. The 2D lines and their merge (#640)
// stay the quick route; this is the thorough one.
import React, { useEffect, useMemo, useState } from "react";
import { Play, Box } from "./icons.js";
import { useStore, useSetTaskProgress } from "../lib/store.jsx";
import { lineIn3d, suggest3d, build3dRequest, cells3d, linesHaveIp } from "../lib/dcip3d.js";
import { sidecarPlanDcip3d, ensureSidecarUp } from "../lib/desktop.js";
import { subscribeInversionJob, startInversionJob, cancelInversionJob } from "../lib/inversionJobs.js";
import { logStops, sequentialStops, ipFitOf } from "../lib/inversion.js";
import { percentile } from "../lib/sectionMerge.js";
import { version as APP_VERSION } from "../../package.json";
import { t as tr } from "../lib/i18n.js";

const num = (v) => (v === "" || v == null ? NaN : Number(v));
const minutes = (s) => (s < 90 ? tr("{s} s", { s: Math.round(s) }) : s < 5400 ? tr("{m} min", { m: Math.round(s / 60) }) : tr("{h} h", { h: (s / 3600).toFixed(1) }));
const REASONS = { "not placed": "not placed", "slope distances need stations or a terrain": "slope distances need stations or a terrain", "no ground elevation (stations, terrain or a flat ground)": "no ground elevation (stations, terrain or a flat ground)" };

export default function Dcip3dPanel({ pBtn, numInput }) {
  const { terrain, dcipLines, addVoxelModelToTab, getProjectToken } = useStore();
  const setTaskProgress = useSetTaskProgress();
  const placed = useMemo(() => dcipLines.map((e) => ({ e, l: lineIn3d(e, terrain) })), [dcipLines, terrain]);
  const usable = placed.filter((p) => p.l.ok);
  const [off, setOff] = useState({}); // line id -> left out
  const chosen = usable.filter((p) => !off[p.e.id]);
  const sug = suggest3d(chosen.map((p) => p.l)); // cheap: a few numbers per line
  // TASKS.csv #929 — an option the chosen lines share (their 2D settings), else nothing: the first line's value used to stand
  // in for all of them, the geometric-factor mode included
  const common = (k) => { const v = chosen.map((p) => p.e.opts?.[k] ?? ""); return v.length && v.every((x) => String(x) === String(v[0])) && v[0] !== "" ? v[0] : undefined; };
  const first = { pct: common("pct"), floor: common("floor"), ipPct: common("ipPct"), ipFloor: common("ipFloor") };
  const gfModes = [...new Set(chosen.map((p) => p.e.opts?.geomFactor || "flat"))];
  const errLines = (kind) => chosen.filter((p) => p.l.err && p.l.errKind === kind).map((p) => p.e.name);
  const [o, setO] = useState({ core: "", depth: "", step: 1, pct: "", floor: "", ipPct: "", ipFloor: "", maxIter: 12, cutoff: 0.02 }); // cutoff: #926 — the 2D default
  const set = (k, v) => { setO((p) => ({ ...p, [k]: v })); setPlan(null); };
  const val = (k, fallback) => (o[k] !== "" && o[k] != null ? o[k] : fallback);
  const withIp = linesHaveIp(chosen.map((p) => p.l)); // #929 — the request's own rule
  const noIp = withIp ? [] : chosen.filter((p) => !(Array.isArray(p.l.ip) && p.l.ip.length === p.l.rho.length)).map((p) => p.e.name);
  const ipLeftOut = !withIp && noIp.length < chosen.length; // some lines have chargeability, not all
  const [plan, setPlan] = useState(null);
  const [msg, setMsg] = useState(null);
  const [job, setJob] = useState(null);
  useEffect(() => subscribeInversionJob((j) => setJob(j ? { ...j } : null)), []);
  const running = job?.status?.state === "running";

  if (usable.length < 2) {
    return dcipLines.length >= 2 ? (
      <div style={{ marginTop: 14 }}>
        <div className="ge-section-label">{tr("True 3D inversion")}</div>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 }}>{tr("Needs at least two saved lines placed in the project (their GPS / station file, or two points each).")}</div>
      </div>
    ) : null;
  }

  const request = () => build3dRequest(chosen.map((p) => p.l), terrain, {
    core: num(val("core", sug.core)), depth: num(val("depth", sug.depth)), step: Number(o.step) || 1, maxIter: Number(o.maxIter) || 12,
    pct: val("pct", first.pct), floor: val("floor", first.floor), ipPct: val("ipPct", first.ipPct), ipFloor: val("ipFloor", first.ipFloor),
    geometricFactor: gfModes[0] || "flat", useIp: withIp,
  });
  const problems = () => {
    const p = [];
    if (!(num(val("pct", first.pct)) > 0) && !(num(val("floor", first.floor)) > 0)) p.push(tr("Enter the resistivity data uncertainty (% and / or a floor) — how far you trust each reading."));
    if (withIp && !(num(val("ipPct", first.ipPct)) > 0) && !(num(val("ipFloor", first.ipFloor)) > 0)) p.push(tr("Enter the chargeability uncertainty (% and / or a floor in mV/V)."));
    if (!(num(val("core", sug.core)) >= 5)) p.push(tr("The cell size must be at least 5 m."));
    if (gfModes.length > 1) p.push(tr("The chosen lines differ in how their apparent resistivities were computed (flat-ground or draped geometric factor, in each line's options). Make them the same, or leave one kind out.")); // #929
    return p;
  };
  const estimate = async () => {
    const p = problems();
    if (p.length) { setMsg({ ok: false, text: p.join(" ") }); return; }
    setMsg({ ok: true, text: tr("Building the 3D mesh to estimate the run…") });
    await ensureSidecarUp();
    const r = await sidecarPlanDcip3d(request());
    if (!r.ok) { setMsg({ ok: false, text: r.error }); setPlan(null); return; }
    setPlan(r.data); setMsg(null);
  };
  const run = async () => {
    const p = problems();
    if (p.length) { setMsg({ ok: false, text: p.join(" ") }); return; }
    const req = request();
    const names = chosen.map((x) => x.e.name);
    const token = getProjectToken();
    const params = {
      tool: "3D DC resistivity / IP inversion of several lines (SimPEG, octree mesh, reciprocity)", lines: names.join(", "), lineCount: names.length, readings: req.rho.length,
      currentPositions: Number(o.step) > 1 ? `every ${o.step}nd current position of each line` : "all", mesh: { coreM: req.mesh.core, verticalCoreM: req.mesh.core / 2, coreDepthM: req.mesh.depth },
      uncertainty: { resistivityPercent: req.uncertainty.percent, resistivityFloor: req.uncertainty.floor, ...(req.ipUncertainty ? { chargeabilityPercent: req.ipUncertainty.percent, chargeabilityFloorMvV: req.ipUncertainty.floor } : {}), source: errLines("rhoPct").length || (req.ipUncertainty && errLines("ipMvV").length) ? `entered by user; per-reading floors from the error columns of ${[errLines("rhoPct").length ? `${errLines("rhoPct").join(", ")} (resistivity error, %)` : "", req.ipUncertainty && errLines("ipMvV").length ? `${errLines("ipMvV").join(", ")} (chargeability error, mV/V)` : ""].filter(Boolean).join("; ")}` : "entered by user" }, // #929
      ...(req.topoSkipped ? { terrainSamplesSkipped: `${req.topoSkipped} (off the terrain or over its filled nodes; the station elevations define the ground there)` } : {}), // TASKS.csv #927
      geometricFactor: req.geometricFactor, interpretation: "One smooth 3D model fitting every line's readings to the stated uncertainty. In each column, cells below the deepest one the data see (support at or above the cutoff) are left out of the block model: below that the values are the regularization's extrapolation, not data. No depth-of-investigation (DOI) index is computed in 3D.",
    };
    const res = await startInversionJob(req, { label: tr("3D DC/IP inversion ({n} lines)", { n: names.length }), dcip3d: true }, {
      kind: "dcip3d", setTaskProgress,
      onDone: (result) => {
        const cut = Number(o.cutoff) || 0, maxCell = 2 * req.mesh.core;
        const runParams = { ...params, fit: { phiD: result.phi_d, target: result.target, reachedTarget: result.reachedTarget, iterations: result.iterations, fitChoice: result.fitChoice, ...(result.ip ? { ip: { phiD: result.ip.phi_d, iterations: result.ip.iterations, ...ipFitOf(result) } } : {}) } /* #970 — the #682 rule */,
          solver: result.solver, versions: result.versions, runSeconds: Math.round(result.seconds), supportCutoff: cut, generatedAt: new Date().toISOString(), app: APP_VERSION };
        const added = [];
        for (const [field, method, property] of [["resistivity", "dc", "Resistivity (ohm·m)"], ["chargeability", "ip", "Chargeability (mV/V)"]]) {
          const cells = cells3d(result, field, { cutoff: cut, maxCell });
          if (!cells.length) continue;
          const v = cells.map((c) => c.value), lo = percentile(v, 0.02), hi = percentile(v, 0.98);
          addVoxelModelToTab(token, { name: `${property} — 3D inversion (${names.length} lines)`, property, method: `${method}-3d`, source: "simpeg", colorMode: "continuous", cells,
            min: lo, max: hi, stops: method === "dc" ? logStops(lo, hi) : sequentialStops(0, hi), threshold: method === "dc" ? lo : percentile(v, 0.75), opacity: 0.85, supportCutoff: cut, params: runParams });
          added.push(`${cells.length.toLocaleString()} ${method === "dc" ? tr("resistivity") : tr("chargeability")}`);
        }
        const fit = result.phi_d / result.target;
        setMsg({ ok: true, text: tr("3D inversion done in {t}: resistivity misfit {fit}x the target{ip}; added {cells} blocks (support ≥ {cut}).", { t: minutes(result.seconds), fit: fit.toFixed(2), ip: result.ip ? (ipFitOf(result).dcUnfitted ? tr(", chargeability {v}x but computed on a resistivity model that did not fit, so treat it as unfinished too", { v: (result.ip.phi_d / result.target).toFixed(2) }) : tr(", chargeability {v}x", { v: (result.ip.phi_d / result.target).toFixed(2) })) : "", cells: added.join(" + "), cut }) });
      },
    });
    if (!res.ok) setMsg({ ok: false, text: res.error });
    else setMsg({ ok: true, text: tr("Inverting {n} readings from {k} lines in 3D…", { n: req.rho.length.toLocaleString(), k: names.length }) + (req.topoSkipped ? " " + tr("{n} of the terrain samples were left out: they are off the terrain or over its filled (no-data) area, so the station elevations define the ground there.", { n: req.topoSkipped.toLocaleString() }) : "") });
  };

  const small = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
  const row = { display: "flex", alignItems: "center", gap: 6, marginTop: 5 };
  const lbl = { width: 104, flexShrink: 0, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
  const inp = { ...numInput, width: 70, flex: "0 1 70px", minWidth: 0 };
  const ram = plan ? plan.peakRamBytes / 1e9 : 0;
  return (
    <div style={{ marginTop: 14 }}>
      <div className="ge-section-label">{tr("True 3D inversion")}</div>
      <div style={small}>{tr("Inverts every reading of the chosen lines in one 3D model, cross lines included, instead of each line on its own. Far heavier than the 2D lines: check the estimate first.")}</div>
      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
        {placed.map(({ e, l }) => (
          <label key={e.id} style={{ fontSize: "var(--font-size-xs)", color: l.ok ? "var(--color-text-secondary)" : "var(--color-text-faint)" }} title={l.ok ? "" : tr(REASONS[l.reason] || l.reason)}>
            <input type="checkbox" disabled={!l.ok} checked={l.ok && !off[e.id]} onChange={(ev) => { setOff((p) => ({ ...p, [e.id]: !ev.target.checked })); setPlan(null); }} />{" "}
            {tr("{name} — {n} readings", { name: e.name, n: e.readings.length })}{l.ok ? "" : ` (${tr(REASONS[l.reason] || l.reason)})`}
          </label>
        ))}
      </div>
      <div style={row} title={tr("Smallest cell, at the electrodes (half as tall). Cost grows quickly as it shrinks.")}><span style={lbl}>{tr("Cell size (m)")}</span><input type="number" min={5} value={o.core} placeholder={String(sug.core)} onChange={(e) => set("core", e.target.value)} style={inp} aria-label={tr("3D cell size (m)")} /></div>
      <div style={row} title={tr("How deep the fine cells reach under the lines.")}><span style={lbl}>{tr("Depth (m)")}</span><input type="number" min={10} value={o.depth} placeholder={String(sug.depth)} onChange={(e) => set("depth", e.target.value)} style={inp} aria-label={tr("3D model depth (m)")} /></div>
      <div style={row} title={tr("Every 2nd current position halves the readings and about halves the time; the model is coarser in what it resolves.")}><span style={lbl}>{tr("Current positions")}</span>
        <select value={o.step} onChange={(e) => set("step", Number(e.target.value))} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label={tr("Current positions")}><option value={1}>{tr("All")}</option><option value={2}>{tr("Every 2nd (faster)")}</option></select>
      </div>
      <div style={row}><span style={lbl}>{tr("Uncertainty")}</span><input type="number" min={0} value={o.pct} placeholder={first.pct ? String(first.pct) : "%"} onChange={(e) => set("pct", e.target.value)} style={inp} aria-label={tr("Resistivity uncertainty (%)")} /><span style={small}>%</span><input type="number" min={0} value={o.floor} placeholder={first.floor ? String(first.floor) : tr("floor")} onChange={(e) => set("floor", e.target.value)} style={inp} aria-label={tr("Resistivity uncertainty floor (ohm·m)")} /></div>
      {withIp && <div style={row}><span style={lbl}>{tr("IP uncertainty")}</span><input type="number" min={0} value={o.ipPct} placeholder={first.ipPct ? String(first.ipPct) : "%"} onChange={(e) => set("ipPct", e.target.value)} style={inp} aria-label={tr("Chargeability uncertainty (%)")} /><span style={small}>%</span><input type="number" min={0} value={o.ipFloor} placeholder={first.ipFloor ? String(first.ipFloor) : "mV/V"} onChange={(e) => set("ipFloor", e.target.value)} style={inp} aria-label={tr("Chargeability uncertainty floor (mV/V)")} /></div>}
      {(errLines("rhoPct").length > 0 || (withIp && errLines("ipMvV").length > 0)) && <div style={{ ...small, marginTop: 4 }}>{tr("Each reading's floor is also at least its own error, from the error column of: {lines}.", { lines: [errLines("rhoPct").length ? tr("{names} (resistivity, %)", { names: errLines("rhoPct").join(", ") }) : "", withIp && errLines("ipMvV").length ? tr("{names} (chargeability, mV/V)", { names: errLines("ipMvV").join(", ") }) : ""].filter(Boolean).join("; ") })}</div>}
      {ipLeftOut && <div style={{ ...small, marginTop: 4, color: "var(--color-warn-text)" }}>{tr("Chargeability is left out of this run: {names} have no chargeability for every reading. Leave them out to invert IP in 3D.", { names: noIp.join(", ") })}</div>}
      <div style={row} title={tr("In each column, cells below the deepest one whose support (how much the data see it, 0-1) reaches this are left out of the block models: below that the values are the regularization's extrapolation, not data.")}><span style={lbl}>{tr("Support cutoff")}</span><input type="number" min={0} max={1} step={0.001} value={o.cutoff} onChange={(e) => setO((p) => ({ ...p, cutoff: e.target.value }))} style={inp} aria-label={tr("Support cutoff")} /></div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button onClick={estimate} disabled={running} style={{ ...pBtn, flex: 1, opacity: running ? 0.5 : 1 }}><Box size={14} />{" "}{tr("Estimate")}</button>
        <button onClick={run} disabled={running || !plan?.ok} title={plan ? "" : tr("Estimate first")} style={{ ...pBtn, flex: 1, opacity: running || !plan?.ok ? 0.5 : 1 }}><Play size={14} />{" "}{tr("Invert in 3D")}</button>
        {running && job?.meta?.dcip3d && <button onClick={() => cancelInversionJob()} style={{ ...pBtn, width: "auto" }}>{tr("Cancel")}</button>}
      </div>
      {plan && (
        <div style={{ ...small, marginTop: 6, color: plan.ok ? "var(--color-text-secondary)" : "var(--color-danger-fg)" }}>
          {tr("{readings} readings, {electrodes} electrodes; mesh {cells} cells ({active} below ground). Memory about {ram} GB; time about {t} on a typical laptop.", {
            readings: plan.readings.toLocaleString(), electrodes: plan.electrodes, cells: plan.cells.toLocaleString(), active: plan.active.toLocaleString(), ram: ram.toFixed(1), t: minutes(plan.seconds),
          })}{plan.ok ? "" : ` ${plan.reasons.join(" ")}`}
        </div>
      )}
      {msg && <div role="status" style={{ ...small, marginTop: 6, color: msg.ok ? "var(--color-text-secondary)" : "var(--color-danger-fg)" }}>{msg.text}</div>}
    </div>
  );
}
