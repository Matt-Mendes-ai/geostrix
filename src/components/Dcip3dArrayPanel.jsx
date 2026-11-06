// TASKS.csv #1967 — a true 3D DC / IP survey inverted from its raw readings. Matt (2026-11-04): "I want to invert raw IP data and
// see if I get a similar block model as theirs" (Kodiak, SJ Geophysics' 2023 3D IP export). The readings carry every electrode's
// coordinates (offline diamond dipoles, fixed remote current electrodes), so the line-based 3D route cannot place them; here the
// file is read as it is (lib/dcipArray.js), the same 3D engine runs on it (each reading's own geometric factor from the file), an
// estimate comes first, and the result lands as block models that can be compared with the contractor's model.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Play, Box, Upload } from "./icons.js";
import { useStore, useSetTaskProgress } from "../lib/store.jsx";
import { parseElectrodeArrayText, selectArrayReadings, buildArrayRequest, suggestArrayMesh, medianRelErrorPct, compareBlockModels } from "../lib/dcipArray.js";
import { voxel3dModels } from "../lib/dcip3d.js";
import { voxKinds, addedText, VoxelChoice } from "./Dcip3dPanel.jsx"; // TASKS.csv #1978
import { sidecarPlanDcip3d, ensureSidecarUp } from "../lib/desktop.js";
import { subscribeInversionJob, startInversionJob, cancelInversionJob } from "../lib/inversionJobs.js";
import { terrainElevationAt } from "../lib/inversion.js";
import { version as APP_VERSION } from "../../package.json";
import { t as tr } from "../lib/i18n.js";

const num = (v) => (v === "" || v == null ? NaN : Number(v));
const minutes = (s) => (s < 90 ? tr("{s} s", { s: Math.round(s) }) : s < 5400 ? tr("{m} min", { m: Math.round(s / 60) }) : tr("{h} h", { h: (s / 3600).toFixed(1) }));
const fmt = (v) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : +v.toPrecision(3));

export default function Dcip3dArrayPanel({ pBtn, numInput }) {
  const { terrain, voxelModels = [], addVoxelModelToTab, getProjectToken } = useStore();
  const setTaskProgress = useSetTaskProgress();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null); // { name, parsed }
  const [readMsg, setReadMsg] = useState(null);
  const [o, setO] = useState({ core: "", depth: "", step: 1, honour: true, fileErr: true, pct: "", floor: "", useIp: true, ipUnits: "ms", ipPct: "", ipFloor: "", maxIter: 12, cutoff: 0.02, voxObserved: true, voxExtrapolated: false }); // vox*: #1978
  const [plan, setPlan] = useState(null);
  const [msg, setMsg] = useState(null);
  const [job, setJob] = useState(null);
  const [made, setMade] = useState(null); // { resistivity: model, chargeability: model } of the last run
  const [against, setAgainst] = useState({ resistivity: "", chargeability: "" });
  useEffect(() => subscribeInversionJob((j) => setJob(j ? { ...j } : null)), []);
  const running = job?.status?.state === "running";
  const set = (k, v) => { setO((p) => ({ ...p, [k]: v })); setPlan(null); };
  const parsed = file?.parsed || null;
  const sel = useMemo(() => (parsed ? selectArrayReadings(parsed, { honourDeleted: o.honour, step: Number(o.step) || 1 }) : null), [parsed, o.honour, o.step]);
  const sug = parsed ? suggestArrayMesh(parsed) : { core: 50, depth: 300 };
  const relErr = parsed && sel ? medianRelErrorPct(parsed, sel.idx) : null;
  const hasIp = !!parsed?.mx;
  const ipDeleted = parsed?.mxDeleted && sel ? sel.idx.filter((i) => parsed.mxDeleted[i]).length : 0;
  const ipUnitLabel = o.ipUnits === "mVV" ? "mV/V" : "ms";

  const read = async (f) => {
    if (!f) return;
    setReadMsg({ ok: true, text: tr("Reading {name}…", { name: f.name }) }); setPlan(null); setMade(null);
    try {
      const text = await f.text();
      const p = parseElectrodeArrayText(text);
      if (!p.ok) { setFile(null); setReadMsg({ ok: false, text: tr("{name} is not a 3D array file GeoStrix can read: {reason}.", { name: f.name, reason: tr(p.reason) }) }); return; }
      setFile({ name: f.name, parsed: p }); setReadMsg(null);
    } catch (e) { setFile(null); setReadMsg({ ok: false, text: e.message }); }
  };

  const request = () => buildArrayRequest(parsed, sel.idx, {
    core: num(o.core !== "" ? o.core : sug.core), depth: num(o.depth !== "" ? o.depth : sug.depth), maxIter: Number(o.maxIter) || 12,
    pct: o.pct, floor: o.floor, useFileErrors: o.fileErr, useIp: o.useIp && hasIp, honourIpDeleted: o.honour, ipUnits: o.ipUnits, ipPct: o.ipPct, ipFloor: o.ipFloor,
    terrain, terrainAt: terrainElevationAt,
  });
  const problems = () => {
    const p = [];
    if (!sel?.idx.length) p.push(tr("No reading is left to invert."));
    if (!(num(o.pct) > 0) && !(num(o.floor) > 0)) p.push(tr("Enter the resistivity data uncertainty (% and / or a floor) — how far you trust each reading."));
    if (o.useIp && hasIp && !(num(o.ipPct) > 0) && !(num(o.ipFloor) > 0)) p.push(tr("Enter the chargeability uncertainty (% and / or a floor, in {u}).", { u: ipUnitLabel }));
    if (!(num(o.core !== "" ? o.core : sug.core) >= 5)) p.push(tr("The cell size must be at least 5 m."));
    if (!voxKinds(o).length) p.push(tr("Tick Observed and / or Extrapolated under 3D voxels: with neither, the run would add no block model.")); // #1978
    if (o.ipUnits === "mVV" && !parsed?.mxWindowMs) p.push(tr("The file does not state its chargeability window, so ms cannot be converted to mV/V: keep ms."));
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
    const token = getProjectToken();
    const params = {
      tool: "3D DC resistivity / IP inversion of a 3D array from its electrode coordinates (SimPEG, octree mesh, reciprocity)", file: file.name,
      readingsInFile: parsed.n, readings: req.rho.length, electrodes: parsed.electrodes,
      remoteElectrodes: parsed.remotes.map((r) => `${r.x.toFixed(1)} E, ${r.y.toFixed(1)} N, ${r.z} m (${r.outsideM} m outside the receivers; a real electrode at its coordinates)`),
      leftOut: { contractorDeleted: o.honour ? sel.leftDeleted : 0, nonPositiveResistivity: sel.leftNonPositive, currentPositions: Number(o.step) > 1 ? `every ${o.step} of ${sel.currentPairs} current-electrode positions` : "none" },
      geometricFactor: `per reading from the file (P / Ra) for ${parsed.gFromFile.toLocaleString()} readings; half-space from the electrode coordinates for the rest`,
      coordinates: parsed.coords === "utm" ? `easting / northing columns${parsed.crsText ? ` (${parsed.crsText})` : ""}` : "local X / Y columns",
      mesh: { coreM: req.mesh.core, verticalCoreM: req.mesh.core / 2, coreDepthM: req.mesh.depth },
      uncertainty: { resistivityPercent: req.uncertainty.percent, resistivityFloor: req.uncertainty.floor, fileErrorsAsFloors: !!req.uncertainty.floorPerReadingPercent,
        ...(req.ipUncertainty ? { chargeabilityPercent: req.ipUncertainty.percent, chargeabilityFloor: req.ipUncertainty.floor, chargeabilityUnit: ipUnitLabel, fileErrorsAsFloors: !!req.ipUncertainty.floorPerReadingMvV } : {}) },
      ...(req.chargeability ? { chargeability: o.ipUnits === "mVV" ? `Mx (ms) x 1000 / ${parsed.mxWindowMs[1] - parsed.mxWindowMs[0]} ms window = mV/V` : "Mx in ms as the file gives it (the decay integrated over the window): comparable with a contractor model made from the same Mx", ...(req.ipUse ? { readingsLeftOutOfIp: req.ipUse.filter((v) => !v).length } : {}) } : {}),
      interpretation: "One smooth 3D model fitting the readings to the stated uncertainty. In each column, cells below the deepest one the data see (support at or above the cutoff) are left out of the block model: below that the values are the regularization's extrapolation.",
    };
    const base = file.name.replace(/\.[^.]+$/, "");
    const res = await startInversionJob(req, { label: tr("3D DC/IP inversion ({name})", { name: base }), dcip3d: true }, {
      kind: "dcip3d", setTaskProgress,
      onDone: (result) => {
        const cut = Number(o.cutoff) || 0, maxCell = 2 * req.mesh.core;
        const runParams = { ...params, fit: { phiD: result.phi_d, target: result.target, reachedTarget: result.reachedTarget, iterations: result.iterations, ...(result.ip ? { ip: { phiD: result.ip.phi_d, target: result.ip.target, reachedTarget: result.ip.reachedTarget, iterations: result.ip.iterations } } : {}) },
          solver: result.solver, versions: result.versions, runSeconds: Math.round(result.seconds), supportCutoff: cut, generatedAt: new Date().toISOString(), app: APP_VERSION };
        // TASKS.csv #1978 — Observed and / or Extrapolated, as the 2D lines' "3D voxels"; the comparison below uses the observed one when made
        const made = voxel3dModels(result, { cut, maxCell, kinds: voxKinds(o), params: runParams,
          fields: [["resistivity", "dc", "Resistivity (ohm·m)", `Resistivity (ohm·m) — 3D inversion of ${base}`], ["chargeability", "ip", `Chargeability (${ipUnitLabel})`, `Chargeability (${ipUnitLabel}) — 3D inversion of ${base}`]] });
        const models = {};
        for (const m of made) { addVoxelModelToTab(token, m.model); if (!models[m.field] || m.kind === "observed") models[m.field] = m.model; }
        setMade(models);
        const fit = result.phi_d / result.target;
        setMsg({ ok: true, text: tr("3D inversion done in {t}: resistivity misfit {fit}x the target{ip}; added {cells}.", {
          t: minutes(result.seconds), fit: fit.toFixed(2), ip: result.ip ? tr(", chargeability {f}x", { f: (result.ip.phi_d / result.ip.target).toFixed(2) }) : "", cells: addedText(made, cut) }) + (fit > 1.5 ? " " + tr("The fit did not reach the target: more iterations, a smaller cell or a larger uncertainty, or bad readings the flags missed.") : "") });
      },
    });
    if (!res.ok) setMsg({ ok: false, text: res.error });
    else setMsg({ ok: true, text: tr("Inverting {n} readings in 3D…", { n: req.rho.length.toLocaleString() }) });
  };

  const small = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
  const row = { display: "flex", alignItems: "center", gap: 6, marginTop: 5 };
  const lbl = { width: 104, flexShrink: 0, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
  const inp = { ...numInput, width: 70, flex: "0 1 70px", minWidth: 0 };
  const ram = plan ? plan.peakRamBytes / 1e9 : 0;
  const others = (field) => voxelModels.filter((m) => m.cells?.length && m.name !== made?.[field]?.name && (field === "resistivity" ? /resist|conduct|ohm|\(res\)|\(con\)|\.res|\.con|dcinv/i.test(`${m.property || ""} ${m.name}`) : /charg|\(chg\)|\.chg|ipinv|\bmx\b/i.test(`${m.property || ""} ${m.name}`)));
  const compare = (field) => {
    const b = voxelModels.find((m) => String(m.id) === String(against[field]));
    if (!made?.[field] || !b) return null;
    const conductivity = field === "resistivity" && /conduct|\(con\)|\.con\b|S\/m/i.test(`${b.property || ""} ${b.name}`); // a UBC .con model: 1 / conductivity
    const bCells = conductivity ? b.cells.map((c) => ({ ...c, value: c.value > 0 ? 1 / c.value : NaN })) : b.cells;
    return compareBlockModels(made[field].cells, bCells, { log: field === "resistivity", minSupport: made[field].supportCutoff || null });
  };
  return (
    <div style={{ marginTop: 14 }}>
      <div className="ge-section-label">{tr("3D survey from electrode coordinates")}</div>
      <div style={small}>{tr("For a true 3D array whose readings carry every electrode's coordinates (C1, C2, P1, P2 easting, northing and elevation), such as an offline or diamond 3D IP export. Each reading is placed where its electrodes were and keeps the geometric factor the contractor used; a remote current electrode is a real electrode at its coordinates.")}</div>
      <button onClick={() => fileRef.current?.click()} disabled={running} style={{ ...pBtn, marginTop: 6 }}><Upload size={14} />{" "}{tr("Read a 3D array file…")}</button>
      <input ref={fileRef} type="file" accept=".txt,.csv,.dat,.xyz" style={{ display: "none" }} onChange={(e) => { read(e.target.files?.[0]); e.target.value = ""; }} aria-label={tr("3D array file")} />
      {readMsg && <div role="status" style={{ ...small, marginTop: 6, color: readMsg.ok ? "var(--color-text-secondary)" : "var(--color-danger-fg)" }}>{readMsg.text}</div>}
      {parsed && (
        <>
          <div style={{ ...small, marginTop: 6, color: "var(--color-text-secondary)" }}>
            {tr("{name}: {n} readings, {e} electrodes ({coords}).", { name: file.name, n: parsed.n.toLocaleString(), e: parsed.electrodes, coords: parsed.coords === "utm" ? (parsed.crsText || tr("easting / northing")) : tr("local X / Y: check they match the project") })}{" "}
            {tr("Geometric factor from the file for {k} readings.", { k: parsed.gFromFile.toLocaleString() })}{" "}
            {parsed.remotes.length > 0 && tr("Remote current electrode(s): {list}.", { list: parsed.remotes.map((r) => tr("{m} m outside the receivers ({n} readings)", { m: r.outsideM.toLocaleString(), n: r.readings.toLocaleString() })).join("; ") })}{" "}
            {hasIp && parsed.mxWindowMs && tr("Chargeability Mx over {a}–{b} ms.", { a: parsed.mxWindowMs[0], b: parsed.mxWindowMs[1] })}
          </div>
          <label style={{ ...row, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}><input type="checkbox" checked={o.honour} onChange={(e) => set("honour", e.target.checked)} />{tr("Leave out the readings the contractor flagged as deleted")}</label>
          <div style={{ ...small, marginTop: 2 }}>
            {tr("{n} readings go in.", { n: sel.idx.length.toLocaleString() })}{" "}
            {sel.leftDeleted > 0 && tr("{n} flagged deleted for resistivity are left out.", { n: sel.leftDeleted.toLocaleString() })}{" "}
            {sel.leftNonPositive > 0 && tr("{n} with a zero or negative apparent resistivity are left out.", { n: sel.leftNonPositive.toLocaleString() })}{" "}
            {o.useIp && hasIp && ipDeleted > 0 && o.honour && tr("{n} more are used for resistivity only: their chargeability was flagged deleted.", { n: ipDeleted.toLocaleString() })}
          </div>
          <div style={row} title={tr("Every 2nd current position halves the readings and about halves the time; the model is coarser in what it resolves.")}><span style={lbl}>{tr("Current positions")}</span>
            <select value={o.step} onChange={(e) => set("step", Number(e.target.value))} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label={tr("Current positions")}>
              <option value={1}>{tr("All ({n})", { n: sel.currentPairs })}</option><option value={2}>{tr("Every 2nd (faster)")}</option><option value={3}>{tr("Every 3rd")}</option><option value={4}>{tr("Every 4th (quick look)")}</option>
            </select>
          </div>
          <div style={row} title={tr("Smallest cell, at the electrodes (half as tall). Cost grows quickly as it shrinks.")}><span style={lbl}>{tr("Cell size (m)")}</span><input type="number" min={5} value={o.core} placeholder={String(sug.core)} onChange={(e) => set("core", e.target.value)} style={inp} aria-label={tr("Cell size (m)")} /><span style={small}>{tr("receiver dipole {d} m", { d: parsed.dipoleM })}</span></div>
          <div style={row} title={tr("How deep the fine cells reach under the electrodes.")}><span style={lbl}>{tr("Depth (m)")}</span><input type="number" min={10} value={o.depth} placeholder={String(sug.depth)} onChange={(e) => set("depth", e.target.value)} style={inp} aria-label={tr("Depth (m)")} /></div>
          <div style={row}><span style={lbl}>{tr("Uncertainty")}</span><input type="number" min={0} value={o.pct} placeholder="%" onChange={(e) => set("pct", e.target.value)} style={inp} aria-label={tr("Resistivity uncertainty (%)")} /><input type="number" min={0} value={o.floor} placeholder={tr("floor Ω·m")} onChange={(e) => set("floor", e.target.value)} style={inp} aria-label={tr("Resistivity uncertainty floor (ohm·m)")} /></div>
          {parsed.rhoErr && <label style={{ ...row, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}><input type="checkbox" checked={o.fileErr} onChange={(e) => set("fileErr", e.target.checked)} />{tr("Each reading's uncertainty is at least its own error from the file (median {p} % of the value)", { p: relErr != null ? relErr.toFixed(1) : "?" })}</label>}
          {hasIp && (
            <>
              <label style={{ ...row, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}><input type="checkbox" checked={o.useIp} onChange={(e) => set("useIp", e.target.checked)} />{tr("Invert the chargeability too")}</label>
              {o.useIp && (
                <>
                  <div style={row} title={tr("ms keeps Mx as the file gives it, so the model compares with a contractor model made from the same Mx; mV/V divides by the window length.")}><span style={lbl}>{tr("Chargeability in")}</span>
                    <select value={o.ipUnits} onChange={(e) => set("ipUnits", e.target.value)} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label={tr("Chargeability units")}>
                      <option value="ms">{tr("ms, as the file (comparable with the contractor's model)")}</option>
                      <option value="mVV" disabled={!parsed.mxWindowMs}>{parsed.mxWindowMs ? tr("mV/V (Mx × 1000 / {w} ms)", { w: parsed.mxWindowMs[1] - parsed.mxWindowMs[0] }) : tr("mV/V (needs the window in the file)")}</option>
                    </select>
                  </div>
                  <div style={row}><span style={lbl}>{tr("IP uncertainty")}</span><input type="number" min={0} value={o.ipPct} placeholder="%" onChange={(e) => set("ipPct", e.target.value)} style={inp} aria-label={tr("Chargeability uncertainty (%)")} /><input type="number" min={0} value={o.ipFloor} placeholder={tr("floor {u}", { u: ipUnitLabel })} onChange={(e) => set("ipFloor", e.target.value)} style={inp} aria-label={tr("Chargeability uncertainty floor")} /></div>
                </>
              )}
            </>
          )}
          <div style={row} title={tr("In each column, cells below the deepest one whose support (how much the data see it, 0-1) reaches this are left out of the block models: below that the values are the regularization's extrapolation, not data.")}><span style={lbl}>{tr("Support cutoff")}</span><input type="number" min={0} max={1} step={0.005} value={o.cutoff} onChange={(e) => set("cutoff", e.target.value)} style={inp} aria-label={tr("Support cutoff")} /></div>
          <VoxelChoice o={o} setO={setO} lbl={lbl} row={row} />{/* #1978 */}
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
          {made && Object.keys(made).length > 0 && (
            <div style={{ marginTop: 10, borderTop: "1px solid var(--color-border)", paddingTop: 8 }}>
              <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--color-text)" }}>{tr("Compare with a loaded model")}</div>
              <div style={small}>{tr("Load the contractor's model under Block models (the UBC mesh with its .con / .res and .chg), then pick it here. Both are shown in the 3D View; Targeting > Voxel ranges hides one or the other.")}</div>
              {Object.keys(made).map((field) => {
                const opts = others(field), c = compare(field);
                return (
                  <div key={field} style={{ marginTop: 6 }}>
                    <div style={row}><span style={lbl}>{field === "resistivity" ? tr("Resistivity vs") : tr("Chargeability vs")}</span>
                      <select value={against[field]} onChange={(e) => setAgainst((a) => ({ ...a, [field]: e.target.value }))} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label={field === "resistivity" ? tr("Compare the resistivity with") : tr("Compare the chargeability with")}>
                        <option value="">{opts.length ? tr("Choose a block model…") : tr("No other model of this kind is loaded")}</option>
                        {opts.map((m) => <option key={m.id} value={m.id}>{m.name}{m.property ? ` (${m.property})` : ""}</option>)}
                      </select>
                    </div>
                    {against[field] && (c ? (
                      <div style={{ ...small, marginTop: 3, color: "var(--color-text-secondary)" }}>
                        {tr("{n} shared cells (where the data see, inside the other model): rank correlation {r}{log}. Medians {a} here, {b} there. The top 2 % of each lie {d} m apart in plan, {v} m apart in elevation.", {
                          n: c.n.toLocaleString(), r: c.rank.toFixed(2), log: field === "resistivity" ? tr(" (on the logs)") : "", a: fmt(c.medianA), b: fmt(c.medianB), d: Math.round(c.offsetM.plan), v: Math.round(Math.abs(c.offsetM.vertical)) })}
                        {field === "chargeability" && o.ipUnits === "mVV" ? " " + tr("This model is in mV/V: a contractor model made from Mx in ms differs by the window factor.") : ""}
                      </div>
                    ) : <div style={{ ...small, marginTop: 3 }}>{tr("Too few cells of the two models overlap to compare.")}</div>)}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
