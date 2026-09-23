// TASKS.csv #321 — SimPEG potential-field modelling in the Geophysics tab ("Magnetics / gravity
// modelling (SimPEG)"). Scope and rules come from the #321 specialist panel; the short version:
//   * Two tools on one survey: TEST A BODY (forward-model a dipping plate against the data — deterministic,
//     the most honest answer to "does this body explain the anomaly?") and INVERT (one smooth L2 model).
//   * Every physical input is entered by the user and nothing is defaulted: data type/units, what the
//     station z means, the inducing field (or "Compute from IGRF-14" for a stated date, which fills the
//     boxes and is recorded as such), and the data uncertainty. Run stays disabled until they are all set.
//   * Cost is estimated and checked BEFORE running (the sidecar refuses an oversize run); progress is real
//     (stage, iteration, misfit vs target) and Cancel really stops the worker process.
//   * Output says what it is: "one smooth model of many that fit", a plain fit verdict, a misfit curve,
//     observed / predicted / residual maps, provenance on the model, and no volume or tonnage anywhere.
// The job itself lives in lib/inversionJobs.js so it survives tab switches.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Activity, Square, Compass, Play, Gauge } from "lucide-react";
import { useStore, useSetTaskProgress } from "../lib/store.jsx";
import InfoButton from "./InfoButton.jsx";
import { activateOnKey } from "../lib/a11y.js";
import { pythonHealth, sidecarPlanPotential } from "../lib/desktop.js";
import { toLonLat } from "../lib/reproject.js";
import { igrfField, decimalYear } from "../lib/igrf.js";
import {
  gridDeclination, terrainElevationAt, terrainPoints, thinStationIndices, medianNearestSpacing, crsProblem, formatBytes,
  fitVerdict, resultToVoxelModel, sequentialStops, divergingStops,
} from "../lib/inversion.js";
import { subscribeInversionJob, startInversionJob, cancelInversionJob } from "../lib/inversionJobs.js";
import { orientationAt } from "../lib/mapLayers.js";

const METHODS = {
  mag: { label: "Magnetics (TMI)", unit: "nT", confirm: "These values are the total-field ANOMALY in nT — the IGRF/regional field has already been removed (not RTP, not a derivative, not the raw total field).", property: "susceptibility (SI)", contrastLabel: "Susceptibility (SI)" },
  grav: { label: "Gravity (gz)", unit: "mGal", confirm: "These values are Bouguer/residual gravity in mGal, positive over dense rock (terrain-corrected, regional removed).", property: "density contrast (g/cc)", contrastLabel: "Density contrast (g/cc)" },
};

const num = (v) => (v === "" || v == null ? NaN : Number(v));

export default function InversionPanel({ pBtn, numInput }) {
  const { layers, terrain, project, addVoxelModel, surfaceStructures } = useStore();
  const setTaskProgress = useSetTaskProgress();
  const rows = useMemo(() => (layers.geophys_pts || []).filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.value)), [layers.geophys_pts]);

  const [open, setOpen] = useState(false);
  const [engine, setEngine] = useState(null); // null = checking, {ok, available, simpeg} otherwise
  const [method, setMethod] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [zMode, setZMode] = useState(""); // "sensor" | "drape"
  const [sensorHeight, setSensorHeight] = useState("");
  const [thin, setThin] = useState("");
  const [field, setField] = useState({ strength: "", inclination: "", declination: "", date: "", source: "" });
  const [unc, setUnc] = useState({ floor: "", percent: "" });
  const [mesh, setMesh] = useState({ coreCell: "", depth: "" });
  const [adv, setAdv] = useState({ open: false, maxIter: 15, lx: 1, ly: 1, lz: 1, lower: "", upper: "", supportCutoff: 0.005 });
  // supportCutoff default 0.005, MEASURED not guessed (TASKS.csv #321): normalised sensitivity falls off
  // steeply with depth (0.97 beside the stations, ~0.017 at 200 m, ~0.005 at 400 m on the synthetic plate
  // test). The first default, 0.02, hid 41% of the strongest recovered cells — the anomaly itself; 0.005
  // hides none of them and still drops the deep, far-edge cells the data genuinely cannot see.
  const [plate, setPlate] = useState({ open: false, cx: "", cy: "", cz: "", dipDirection: "", dip: "", strikeLength: "", dipExtent: "", thickness: "", contrast: "", sweep: false });
  const [plan, setPlan] = useState(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [job, setJob] = useState(null);
  const [lastResult, setLastResult] = useState(null); // { result, prepared, verdict }

  useEffect(() => subscribeInversionJob((j) => setJob(j ? { ...j } : null)), []);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    pythonHealth().then((h) => { if (alive) setEngine({ ok: h.ok, available: !!h.capabilities?.potentialFields?.available, simpeg: h.capabilities?.potentialFields?.simpeg, apiVersion: h.api_version }); });
    return () => { alive = false; };
  }, [open]);

  const M = METHODS[method];
  const running = job?.status?.state === "running";
  const xs = rows.map((r) => r.x), ys = rows.map((r) => r.y);
  const spacing = useMemo(() => (rows.length > 1 ? medianNearestSpacing(xs, ys) : null), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const crsIssue = crsProblem(project?.epsg);

  // ---------- data preparation (all in the renderer; the sidecar only ever sees clean numbers) ----------
  const prepare = (kind) => {
    const problems = [];
    if (!M) problems.push("Choose magnetics or gravity.");
    if (!confirmed) problems.push("Confirm what the data values are.");
    if (!zMode) problems.push("Say what the station z values mean.");
    if (zMode === "drape" && !(num(sensorHeight) > 0)) problems.push("Enter the sensor height above the terrain.");
    if (zMode === "drape" && !terrain) problems.push("A terrain surface is needed to drape the stations on.");
    if (kind === "inversion" && !terrain) problems.push("An inversion needs a terrain surface (Terrain section above) to know which cells are underground.");
    if (crsIssue) problems.push(crsIssue);
    if (method === "mag") {
      if (!(num(field.strength) > 20000 && num(field.strength) < 70000)) problems.push("Enter the field strength (nT, e.g. from IGRF for the survey date).");
      if (!(Math.abs(num(field.inclination)) <= 90)) problems.push("Enter the field inclination.");
      if (!(Math.abs(num(field.declination)) <= 180)) problems.push("Enter the field declination.");
    }
    if (kind === "inversion" && !(num(unc.floor) > 0)) problems.push(`Enter the data uncertainty floor (${M?.unit || "units"}).`);
    if (!(num(mesh.coreCell) >= 1)) problems.push("Enter the core cell size.");
    if (!(num(mesh.depth) >= num(mesh.coreCell))) problems.push("Enter the model depth (at least one cell).");
    if (problems.length) return { problems };

    let idx = rows.map((_, i) => i);
    if (num(thin) > 0) idx = thinStationIndices(xs, ys, num(thin));
    let dropped = 0;
    const stations = [], observed = [];
    idx.forEach((i) => {
      const r = rows[i];
      const z = zMode === "sensor" ? r.z : terrainElevationAt(terrain, r.x, r.y) + num(sensorHeight);
      if (!Number.isFinite(z)) { dropped++; return; }
      stations.push([r.x, r.y, z]); observed.push(r.value);
    });
    if (!stations.length) return { problems: ["No usable stations (none inside the terrain surface?)."] };
    const cx = stations.reduce((s, p) => s + p[0], 0) / stations.length;
    const cy = stations.reduce((s, p) => s + p[1], 0) / stations.length;
    let decl = null;
    if (method === "mag") { decl = gridDeclination(num(field.declination), cx, cy, project.epsg); if (!decl) return { problems: ["Could not compute grid convergence for this CRS."] }; }
    const cell = num(mesh.coreCell);
    const padReach = cell * (1.3 + 1.69 + 2.197 + 2.856 + 3.713 + 4.827) + 3 * cell;
    const sx = stations.map((p) => p[0]), sy = stations.map((p) => p[1]);
    const box = [Math.min(...sx) - padReach, Math.min(...sy) - padReach, Math.max(...sx) + padReach, Math.max(...sy) + padReach];
    const topo = terrain ? terrainPoints(terrain, box, 40000) : null;
    const request = {
      method, kind, stations,
      ...(topo ? { topo: topo.points } : {}),
      ...(method === "mag" ? { field: { strength: num(field.strength), inclination: num(field.inclination), declination: decl.grid } } : {}),
      mesh: { coreCell: cell, depth: num(mesh.depth), padCells: 6, padFactor: 1.3 },
    };
    if (kind === "inversion") {
      request.observed = observed;
      request.uncertainty = { floor: num(unc.floor), percent: Number.isFinite(num(unc.percent)) ? num(unc.percent) : 0 };
      request.reg = { maxIter: Number(adv.maxIter) || 15, lengthX: Number(adv.lx) || 1, lengthY: Number(adv.ly) || 1, lengthZ: Number(adv.lz) || 1 };
      const lo = num(adv.lower), up = num(adv.upper);
      request.bounds = { ...(Number.isFinite(lo) ? { lower: lo } : {}), ...(Number.isFinite(up) ? { upper: up } : {}) };
    } else {
      request.observed = observed;
    }
    const notes = [];
    if (dropped) notes.push(`${dropped} station(s) fell outside the terrain and were left out.`);
    if (topo && !topo.covers) notes.push("The terrain does not cover the whole model mesh (padding included); cells beyond it follow the nearest terrain edge — load a larger terrain for an honest result near the edges.");
    if (topo && topo.spacing > cell) notes.push(`The terrain grid (${Math.round(topo.spacing)} m) is coarser than the core cell (${cell} m), so ground level between terrain samples is interpolated.`);
    return { request, meta: { stationsUsed: stations.length, stationsTotal: rows.length, thinnedTo: num(thin) > 0 ? num(thin) : null, dropped, convergence: decl?.convergence ?? null, gridDeclination: decl?.grid ?? null, centre: [cx, cy], topoSpacing: topo?.spacing ?? null, terrainCovers: topo?.covers ?? null }, notes, stations, observed };
  };

  const computeIgrf = async () => {
    if (!rows.length) return;
    const d = decimalYear(field.date);
    if (!Number.isFinite(d)) { setMsg({ ok: false, text: "Enter the survey date first — the field changes by tens of nT per year." }); return; }
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length, cy = ys.reduce((a, b) => a + b, 0) / ys.length;
    const ll = await toLonLat(cx, cy, project.epsg);
    if (!ll) { setMsg({ ok: false, text: `Can't convert EPSG:${project.epsg} to longitude/latitude for IGRF.` }); return; }
    const lon = ll.lon ?? ll[0], lat = ll.lat ?? ll[1];
    const zs = rows.map((r) => r.z).filter(Number.isFinite);
    const hKm = zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length / 1000 : 0;
    try {
      const f = igrfField(lon, lat, hKm, d);
      setField((p) => ({ ...p, strength: f.total.toFixed(0), inclination: f.inclination.toFixed(2), declination: f.declination.toFixed(2),
        source: `IGRF-14 for ${field.date} at ${lat.toFixed(3)}, ${lon.toFixed(3)}, ${Math.round(hKm * 1000)} m (survey centre)` }));
      setMsg({ ok: true, text: `Filled from IGRF-14 for ${field.date}: ${f.total.toFixed(0)} nT, inclination ${f.inclination.toFixed(2)}°, declination ${f.declination.toFixed(2)}° (true north). Check them against your survey report — the contractor's values win.` });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  };

  // `extra` is merged into the request BEFORE the sidecar sees it: the forward tool's plates must be part of
  // the planned request (the sidecar validates a forward request as a whole and rejects one with no body).
  const doPlan = async (kind, extra = {}) => {
    const p = prepare(kind);
    if (p.problems) { setPlan(null); setMsg({ ok: false, text: p.problems.join(" ") }); return null; }
    Object.assign(p.request, extra);
    setPlanBusy(true);
    const r = await sidecarPlanPotential(p.request);
    setPlanBusy(false);
    if (!r.ok) { setPlan(null); setMsg({ ok: false, text: r.error }); return null; }
    setPlan({ ...r.data, kind, notes: p.notes });
    setMsg(r.data.ok ? null : { ok: false, text: r.data.reasons.join(" ") });
    return r.data.ok ? p : null;
  };

  const runInversion = async () => {
    const p = await doPlan("inversion");
    if (!p) return;
    const meta = { label: `${M.label} inversion`, surveyName: `${rows.length} ${M.unit} stations`, ...p.meta };
    const params = {
      tool: `${method === "mag" ? "magnetic" : "gravity"} inversion (SimPEG)`,
      interpretation: "One smooth (L2) model that fits the data to the stated uncertainty — not the only one. Amplitudes are underestimated and bodies are smeared with depth. Not a geological boundary, not an orebody, not a volume.",
      dataUnits: M.unit, dataStatement: M.confirm, stationZ: zMode === "sensor" ? "sensor elevation (z column)" : `terrain + ${num(sensorHeight)} m (draped — an assumption)`,
      stationsUsed: p.meta.stationsUsed, stationsTotal: p.meta.stationsTotal, thinnedToM: p.meta.thinnedTo, droppedOutsideTerrain: p.meta.dropped,
      uncertainty: { floor: num(unc.floor), percent: Number.isFinite(num(unc.percent)) ? num(unc.percent) : 0, units: M.unit, source: "entered by user" },
      ...(method === "mag" ? { inducingField: { strengthNT: num(field.strength), inclination: num(field.inclination), declinationTrue: num(field.declination), declinationGrid: p.meta.gridDeclination, gridConvergence: p.meta.convergence, surveyDate: field.date || null, source: field.source || "entered by user" } } : { signConvention: "positive gz over dense rock (converted to/from SimPEG's up-positive gz)" }),
      mesh: { type: "tensor", coreCellM: num(mesh.coreCell), depthM: num(mesh.depth), padCells: 6, padFactor: 1.3, terrainSpacingM: p.meta.topoSpacing, terrainCoversMesh: p.meta.terrainCovers },
      regularization: { type: "WeightedLeastSquares (smooth L2)", lengthScales: [Number(adv.lx) || 1, Number(adv.ly) || 1, Number(adv.lz) || 1], sensitivityWeighting: true, beta0Ratio: 10, cooling: "x0.5 per iteration", maxIter: Number(adv.maxIter) || 15, bounds: p.request.bounds },
      crs: `EPSG:${project.epsg}`,
    };
    const res = await startInversionJob(p.request, meta, {
      setTaskProgress,
      onDone: (result) => {
        const verdict = fitVerdict(result);
        const model = resultToVoxelModel(result, meta);
        const vals = model.cells.map((c) => c.value);
        const vmin = Math.min(...vals), vmax = Math.max(...vals);
        const absMax = Math.max(Math.abs(vmin), Math.abs(vmax));
        addVoxelModel({
          ...model,
          stops: method === "mag" ? sequentialStops(Math.max(0, vmin), vmax) : divergingStops(absMax),
          colorMode: "continuous",
          supportCutoff: Number(adv.supportCutoff) || 0,
          params: { ...params, versions: result.versions, fit: { phiD: result.phi_d, target: result.target, chiFactor: verdict.chi, reachedTarget: result.reachedTarget, iterations: result.iterations, verdict: verdict.text }, localOrigin: result.localOrigin, generatedAt: new Date().toISOString(), runSeconds: Math.round(result.seconds) },
          history: result.history,
        });
        setLastResult({ result, prepared: p, verdict });
      },
    });
    if (!res.ok) setMsg({ ok: false, text: res.error });
  };

  const platesFor = () => {
    const base = { cx: num(plate.cx), cy: num(plate.cy), cz: num(plate.cz), dipDirection: num(plate.dipDirection), strikeLength: num(plate.strikeLength), dipExtent: num(plate.dipExtent), thickness: num(plate.thickness), contrast: num(plate.contrast) };
    if (!Object.values(base).every(Number.isFinite) || !(Math.abs(num(plate.dip)) <= 90)) return null;
    if (!plate.sweep) return [{ ...base, dip: num(plate.dip) }];
    return [10, 20, 30, 40, 50, 60, 70, 80, 90].map((d) => ({ ...base, dip: d }));
  };

  const runForward = async () => {
    const plates = platesFor();
    if (!plates) { setMsg({ ok: false, text: "Fill in every plate field (centre, dip, dip direction, sizes and the contrast)." }); return; }
    const p = await doPlan("forward", { plates });
    if (!p) return;
    const meta = { label: `${M.label} forward model`, surveyName: `${rows.length} stations`, ...p.meta };
    const res = await startInversionJob(p.request, meta, { setTaskProgress, onDone: (result) => setLastResult({ result, prepared: p, verdict: null }) });
    if (!res.ok) setMsg({ ok: false, text: res.error });
  };

  const nearestOrientation = () => {
    const meas = (surfaceStructures || []).flatMap((s) => s.rows || []);
    const cx = num(plate.cx), cy = num(plate.cy);
    if (!meas.length || !Number.isFinite(cx) || !Number.isFinite(cy)) return;
    const o = orientationAt(cx, cy, meas, 1000);
    if (!o) { setMsg({ ok: false, text: "No outcrop measurement within 1 km of the plate centre." }); return; }
    setPlate((q) => ({ ...q, dip: o.dip.toFixed(0), dipDirection: o.dipDir.toFixed(0) }));
    setMsg({ ok: true, text: `Dip set from ${o.count} outcrop measurement(s) within 1 km (nearest ${Math.round(o.nearestM)} m): ${o.dip.toFixed(0)}° toward ${o.dipDir.toFixed(0)}°.` });
  };

  // ---------- rendering ----------
  const small = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
  const row = { display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
  const lbl = { width: 104, flexShrink: 0 };
  const inp = { ...numInput, width: 78, flex: "none" };
  const step = (n, title, children) => (
    <fieldset style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: "7px 9px 9px", margin: "8px 0 0" }}>
      <legend style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)", padding: "0 4px" }}>{n}. {title}</legend>
      {children}
    </fieldset>
  );
  const status = job?.status;
  const prog = status?.progress || {};

  return (
    <>
      <div className="ge-section-label" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
        <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Magnetics / gravity modelling (SimPEG)
        </span>
        <InfoButton title="Magnetics / gravity modelling" width={420} text={"Uses SimPEG (simpeg.xyz, MIT) in GeoStrix's Python engine, on the survey points loaded in Point cloud above.\n\nTest a body: forward-models a dipping plate you define and compares its response with your data — the most direct way to ask whether a mapped or drilled body explains the anomaly. A dip sweep shows whether the data can tell the dip at all.\n\nInvert: finds ONE smooth 3D susceptibility or density-contrast model that fits the data to the uncertainty you give it. Many other models fit equally well; the smooth one is simply the least complicated. Expect amplitudes to be underestimated and bodies to be blurred and deeper-looking than reality. Remanent magnetisation (common in pyrrhotite-bearing Golden Triangle rocks) breaks the assumption behind a susceptibility inversion.\n\nNothing physical is assumed for you: data type, station heights, the inducing field and the data uncertainty must all be entered."} />
      </div>
      {open && (
        <div style={{ fontSize: "var(--font-size-sm)" }}>
          {engine === null && <div style={small}>Checking the Python engine…</div>}
          {engine && !engine.ok && <div style={small}>Needs GeoStrix's Python engine, which isn't running (status bar: Py). It starts with the desktop app.</div>}
          {engine && engine.ok && !engine.available && <div style={small}>The running Python engine has no SimPEG — update GeoStrix to a version that includes it.</div>}
          {engine?.available && !rows.length && <div style={small}>Import a magnetic or gravity survey in Point cloud (CSV) above first — x, y, z and the measured value per station.</div>}
          {engine?.available && rows.length > 0 && (
            <>
              <div style={small}>{rows.length.toLocaleString()} survey stations loaded{spacing ? `, median spacing ${spacing.toFixed(spacing < 10 ? 1 : 0)} m` : ""}. SimPEG {engine.simpeg}.</div>
              {step(1, "Data", <>
                <div role="radiogroup" aria-label="Survey type" style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  {Object.entries(METHODS).map(([k, m]) => (
                    <label key={k} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                      <input type="radio" name="inv-method" checked={method === k} onChange={() => { setMethod(k); setConfirmed(false); setPlan(null); }} /> {m.label}
                    </label>
                  ))}
                </div>
                {M && (
                  <label style={{ ...row, alignItems: "flex-start", cursor: "pointer" }}>
                    <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
                    <span style={small}>{M.confirm}</span>
                  </label>
                )}
                <div role="radiogroup" aria-label="What the station z values are" style={{ marginTop: 6 }}>
                  <div style={small}>Station heights:</div>
                  <label style={{ ...row, marginTop: 2, cursor: "pointer" }}><input type="radio" name="inv-z" checked={zMode === "sensor"} onChange={() => setZMode("sensor")} /> z column is the sensor elevation</label>
                  <label style={{ ...row, marginTop: 2, cursor: "pointer" }}><input type="radio" name="inv-z" checked={zMode === "drape"} onChange={() => setZMode("drape")} /> Sensor is a fixed height above terrain</label>
                  {zMode === "drape" && <div style={row}><span style={lbl}>Height above ground</span><input type="number" min={0} value={sensorHeight} onChange={(e) => setSensorHeight(e.target.value)} style={inp} /> m</div>}
                </div>
                <div style={row} title="Keep one station per cell of this size. Every station costs a row of the sensitivity matrix, and neighbouring readings along a line add little. Leave empty to use every station.">
                  <span style={lbl}>Thin to one per</span><input type="number" min={0} value={thin} onChange={(e) => setThin(e.target.value)} style={inp} /> m
                  {num(thin) > 0 && <span style={small}>→ {thinStationIndices(xs, ys, num(thin)).length.toLocaleString()} stations</span>}
                </div>
              </>)}
              {method === "mag" && step(2, "Inducing field", <>
                <div style={row}><span style={lbl}>Survey date</span><input type="date" value={field.date} onChange={(e) => setField((p) => ({ ...p, date: e.target.value }))} style={{ ...numInput, flex: "none" }} /></div>
                {[["strength", "Strength (nT)"], ["inclination", "Inclination (°)"], ["declination", "Declination (° true)"]].map(([k, l]) => (
                  <div key={k} style={row}><span style={lbl}>{l}</span><input type="number" value={field[k]} onChange={(e) => setField((p) => ({ ...p, [k]: e.target.value, source: "entered by user" }))} style={inp} /></div>
                ))}
                <button onClick={computeIgrf} disabled={!field.date} style={{ ...pBtn, marginTop: 7, marginBottom: 0, opacity: field.date ? 1 : 0.5 }} title="Fill the three values from the IGRF-14 model for the survey date at the survey centre. Your survey report's values take precedence.">
                  <Compass size={13} /> Compute from IGRF-14 for the survey date
                </button>
                {field.source && <div style={{ ...small, marginTop: 4 }}>Source: {field.source}</div>}
              </>)}
              {step(method === "mag" ? 3 : 2, "Uncertainty & mesh", <>
                <div style={row} title="How far you trust each reading. Too small and the model invents detail to chase noise; too large and real bodies are smoothed away. There is no default."><span style={lbl}>Uncertainty floor</span><input type="number" min={0} value={unc.floor} onChange={(e) => setUnc((p) => ({ ...p, floor: e.target.value }))} style={inp} /> {M?.unit || ""}</div>
                <div style={row}><span style={lbl}>+ percent of value</span><input type="number" min={0} value={unc.percent} onChange={(e) => setUnc((p) => ({ ...p, percent: e.target.value }))} style={inp} /> %</div>
                <div style={row} title="Cell size in the core of the model. Around half the station spacing is usual; smaller cells cost memory (data x cells).">
                  <span style={lbl}>Core cell</span><input type="number" min={1} value={mesh.coreCell} onChange={(e) => setMesh((p) => ({ ...p, coreCell: e.target.value }))} style={inp} /> m
                  {spacing && !mesh.coreCell && <button onClick={() => setMesh((p) => ({ ...p, coreCell: String(Math.max(5, Math.round(spacing / 2 / 5) * 5)) }))} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "2px 7px" }}>≈ half spacing</button>}
                </div>
                <div style={row} title="How deep below the stations the model extends. Potential-field data lose resolution quickly with depth."><span style={lbl}>Model depth</span><input type="number" min={1} value={mesh.depth} onChange={(e) => setMesh((p) => ({ ...p, depth: e.target.value }))} style={inp} /> m</div>
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setAdv((p) => ({ ...p, open: !p.open }))} aria-expanded={adv.open} style={{ ...row, cursor: "pointer" }}>
                  {adv.open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Advanced
                </div>
                {adv.open && <>
                  <div style={row}><span style={lbl}>Max iterations</span><input type="number" min={1} max={40} value={adv.maxIter} onChange={(e) => setAdv((p) => ({ ...p, maxIter: e.target.value }))} style={inp} /></div>
                  <div style={row} title="Relative smoothness length along x (east), y (north), z (up). Larger along one axis = smoother (more elongated) that way."><span style={lbl}>Smoothness x/y/z</span>
                    {["lx", "ly", "lz"].map((k) => <input key={k} type="number" min={0.1} step={0.5} value={adv[k]} onChange={(e) => setAdv((p) => ({ ...p, [k]: e.target.value }))} style={{ ...inp, width: 44 }} aria-label={`Smoothness ${k.slice(1)}`} />)}
                  </div>
                  <div style={row}><span style={lbl}>Bounds (optional)</span><input type="number" placeholder="lower" value={adv.lower} onChange={(e) => setAdv((p) => ({ ...p, lower: e.target.value }))} style={{ ...inp, width: 60 }} aria-label="Lower bound" /><input type="number" placeholder="upper" value={adv.upper} onChange={(e) => setAdv((p) => ({ ...p, upper: e.target.value }))} style={{ ...inp, width: 60 }} aria-label="Upper bound" /></div>
                  <div style={row} title="Cells whose normalised sensitivity is below this are hidden in the 3D view: the data can barely see them, so their value says more about the regularisation than about the rock. Display only — it does not change the inversion."><span style={lbl}>Hide cells below support</span><input type="number" min={0} max={1} step={0.01} value={adv.supportCutoff} onChange={(e) => setAdv((p) => ({ ...p, supportCutoff: e.target.value }))} style={inp} /></div>
                </>}
              </>)}
              <button onClick={() => doPlan("inversion")} disabled={planBusy || running} style={{ ...pBtn, marginTop: 8, marginBottom: 4 }}><Gauge size={13} /> {planBusy ? "Estimating…" : "Estimate size and memory"}</button>
              {plan && (
                <div style={{ ...small, marginBottom: 6 }} aria-live="polite">
                  {plan.nData.toLocaleString()} stations × ~{plan.nActiveEst.toLocaleString()} underground cells ({plan.meshShape.join(" × ")} mesh).{" "}
                  {plan.kind === "inversion"
                    ? <>Sensitivity matrix {formatBytes(plan.sensitivityBytes)} of the {formatBytes(plan.ramCapBytes)} this machine can spare right now; peak memory ≈ {formatBytes(plan.peakRamEstimateBytes)}, ~{Math.max(1, Math.round(plan.buildSecondsEstimate))} s to build it, then a few seconds per iteration.</>
                    : <>Forward only — no matrix is stored.</>}{" "}
                  {plan.ok ? "OK to run." : ""}
                  {plan.notes?.map((n) => <div key={n} style={{ marginTop: 3 }}>⚠ {n}</div>)}
                </div>
              )}
              <button onClick={runInversion} disabled={running || planBusy} style={{ ...pBtn, marginBottom: 4, opacity: running ? 0.5 : 1 }}><Play size={13} /> Invert</button>

              <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setPlate((p) => ({ ...p, open: !p.open }))} aria-expanded={plate.open} style={{ ...row, cursor: "pointer", marginTop: 8, color: "var(--color-text)" }}>
                {plate.open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Test a body (forward model)
              </div>
              {plate.open && (
                <div style={{ paddingLeft: 4 }}>
                  <div style={small}>A rectangular plate with a {M ? M.property : "property"} contrast. Uses steps 1{method === "mag" ? "–2" : ""} and the mesh settings; no uncertainty or inversion.</div>
                  {[["cx", "Centre easting"], ["cy", "Centre northing"], ["cz", "Centre elevation"], ["dipDirection", "Dip direction (°)"], ["dip", "Dip (°)"], ["strikeLength", "Strike length (m)"], ["dipExtent", "Down-dip extent (m)"], ["thickness", "Thickness (m)"], ["contrast", M ? M.contrastLabel : "Contrast"]].map(([k, l]) => (
                    <div key={k} style={row}><span style={lbl}>{l}</span><input type="number" value={plate[k]} onChange={(e) => setPlate((p) => ({ ...p, [k]: e.target.value }))} style={inp} /></div>
                  ))}
                  {(surfaceStructures || []).length > 0 && <button onClick={nearestOrientation} style={{ ...pBtn, marginTop: 6, marginBottom: 0 }}>Use nearest outcrop measurements for dip</button>}
                  <label style={{ ...row, cursor: "pointer" }} title="Runs the same plate at dips 10°-90° and shows the misfit for each. A flat curve means these data cannot tell the dip."><input type="checkbox" checked={plate.sweep} onChange={(e) => setPlate((p) => ({ ...p, sweep: e.target.checked }))} /> Dip sweep (10°–90°)</label>
                  <button onClick={runForward} disabled={running || planBusy} style={{ ...pBtn, marginTop: 6, marginBottom: 0, opacity: running ? 0.5 : 1 }}><Activity size={13} /> Forward model</button>
                </div>
              )}

              {running && (
                <div style={{ marginTop: 8, padding: "7px 9px", border: "1px solid var(--color-border)", borderRadius: 6 }}>
                  <div style={{ color: "var(--color-text)" }}>{job.meta.label}: {prog.stage === "iterating" && prog.iter ? `iteration ${prog.iter} of ${prog.maxIter}` : prog.message || prog.stage || "starting"}</div>
                  {prog.phi_d != null && <div style={small}>Misfit {(prog.phi_d / prog.target).toFixed(2)}× the target</div>}
                  <button onClick={() => cancelInversionJob()} style={{ ...pBtn, marginTop: 6, marginBottom: 0 }}><Square size={12} /> Cancel</button>
                </div>
              )}
              {job && !running && job.error && <div role="alert" style={{ ...small, color: "var(--color-danger-text)", marginTop: 6 }}>{job.error}</div>}
              {job && !running && job.status?.state === "cancelled" && <div style={{ ...small, marginTop: 6 }}>Cancelled — the worker process was stopped and its memory released.</div>}
              {msg && <div role={msg.ok ? "status" : "alert"} style={{ ...small, marginTop: 6, color: msg.ok ? "var(--color-text-secondary)" : "var(--color-danger-text)" }}>{msg.text}</div>}
              {lastResult && !running && <FitView last={lastResult} method={method} />}
            </>
          )}
        </div>
      )}
    </>
  );
}

// ---------- "did it fit?" view ----------
function FitView({ last, method }) {
  const { result, prepared, verdict } = last;
  const unit = METHODS[result.method]?.unit || "";
  const st = prepared.stations, obs = prepared.observed;
  const small = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
  if (result.kind === "forward") {
    const runs = result.runs || [];
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ color: "var(--color-text)", fontSize: "var(--font-size-sm)" }}>Forward model result</div>
        {runs.length === 1 && <div style={small}>RMS of the data {result.rmsObserved?.toFixed(2)} {unit}; RMS left over after subtracting the plate's response {runs[0].rmsResidual?.toFixed(2)} {unit} ({runs[0].plateCells} cells). The closer the second is to zero, the more of the anomaly this body explains.</div>}
        {runs.length > 1 && <DipSweep runs={runs} unit={unit} />}
        {runs.length === 1 && <PointMaps stations={st} observed={obs} predicted={runs[0].predicted} unit={unit} />}
      </div>
    );
  }
  const std = result.standardDeviation;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ color: "var(--color-text)", fontSize: "var(--font-size-sm)" }}>Did it fit?</div>
      <div role="status" style={{ ...small, color: verdict.level === "ok" ? "var(--color-text-secondary)" : "var(--color-danger-text)" }}>{verdict.text}</div>
      <MisfitChart history={result.history} target={result.target} />
      <PointMaps stations={st} observed={obs} predicted={result.predicted} std={std} unit={unit} />
      <div style={{ ...small, marginTop: 6 }}>Added to Voxel / block models as "{resultToVoxelModel({ ...result, cells: { value: [], x: [], y: [], z: [], dx: [], dy: [], dz: [], support: [] } }, { surveyName: "" }).property}". It is one smooth model of many that fit these data — amplitudes are underestimated and bodies smeared with depth; cells the data barely see are hidden. No volume or tonnage is computed from it.</div>
    </div>
  );
}

function MisfitChart({ history, target }) {
  if (!history?.length) return null;
  const W = 250, H = 90, P = 26;
  const vals = history.map((h) => h.phi_d).concat(target);
  const lo = Math.log10(Math.min(...vals)) - 0.1, hi = Math.log10(Math.max(...vals)) + 0.1;
  const x = (i) => P + ((W - P - 6) * i) / Math.max(1, history.length - 1);
  const y = (v) => 6 + (H - 20) * (1 - (Math.log10(v) - lo) / (hi - lo || 1));
  const path = history.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(h.phi_d).toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} role="img" aria-label={`Data misfit by iteration, from ${history[0].phi_d.toFixed(0)} to ${history[history.length - 1].phi_d.toFixed(0)}; target ${target.toFixed(0)}`} style={{ display: "block", marginTop: 6 }}>
      <line x1={P} x2={W - 6} y1={y(target)} y2={y(target)} stroke="var(--color-text-muted)" strokeDasharray="4 3" />
      <text x={W - 8} y={y(target) - 3} textAnchor="end" style={{ fontSize: 9, fill: "var(--color-text-muted)" }}>target</text>
      <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} />
      {history.map((h, i) => <circle key={i} cx={x(i)} cy={y(h.phi_d)} r={2.2} fill="var(--color-accent)" />)}
      <text x={2} y={12} style={{ fontSize: 9, fill: "var(--color-text-muted)" }}>misfit (log)</text>
      <text x={W - 6} y={H - 2} textAnchor="end" style={{ fontSize: 9, fill: "var(--color-text-muted)" }}>iteration {history.length}</text>
    </svg>
  );
}

function DipSweep({ runs, unit }) {
  const W = 250, H = 90, P = 30;
  const r = runs.map((q) => q.rmsResidual);
  const lo = Math.min(...r), hi = Math.max(...r);
  const best = runs[r.indexOf(lo)];
  const spread = hi > 0 ? (hi - lo) / hi : 0;
  const x = (i) => P + ((W - P - 6) * i) / Math.max(1, runs.length - 1);
  const y = (v) => 6 + (H - 22) * (1 - (v - lo) / (hi - lo || 1));
  return (
    <>
      <svg width={W} height={H} role="img" aria-label={`Residual RMS by dip; lowest ${lo.toFixed(2)} ${unit} at ${best.dip} degrees`} style={{ display: "block", marginTop: 6 }}>
        <path d={runs.map((q, i) => `${i ? "L" : "M"}${x(i)},${y(q.rmsResidual)}`).join(" ")} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} />
        {runs.map((q, i) => <g key={i}><circle cx={x(i)} cy={y(q.rmsResidual)} r={2.2} fill="var(--color-accent)" /><text x={x(i)} y={H - 4} textAnchor="middle" style={{ fontSize: 8, fill: "var(--color-text-muted)" }}>{q.dip}°</text></g>)}
      </svg>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
        Best fit at {best.dip}° (residual RMS {lo.toFixed(2)} {unit}). {spread < 0.05 ? "The curve is almost flat — these data cannot tell the dip of this body." : `Residual varies ${(spread * 100).toFixed(0)}% across dips.`}
      </div>
    </>
  );
}

// Observed / predicted share one colour scale; residual is normalised by the uncertainty and diverging,
// fixed at +-3 (visual-design review). Stations are drawn as dots, never gridded, so gaps stay visible.
function PointMaps({ stations, observed, predicted, std, unit }) {
  const refs = [useRef(null), useRef(null), useRef(null)];
  const resid = observed.map((o, i) => (std ? (o - predicted[i]) / std[i] : o - predicted[i]));
  useEffect(() => {
    const xs = stations.map((p) => p[0]), ys = stations.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const S = 78, pad = 4;
    const sc = Math.min((S - 2 * pad) / (x1 - x0 || 1), (S - 2 * pad) / (y1 - y0 || 1));
    const lo = Math.min(...observed, ...predicted), hi = Math.max(...observed, ...predicted);
    const seq = sequentialStops(lo, hi, 9).map((s) => s.color);
    const div = divergingStops(3, 9).map((s) => s.color);
    const seqC = (v) => seq[Math.max(0, Math.min(8, Math.round(((v - lo) / (hi - lo || 1)) * 8)))];
    const divC = (v) => div[Math.max(0, Math.min(8, Math.round(((v + 3) / 6) * 8)))];
    [[observed, seqC], [predicted, seqC], [resid, divC]].forEach(([vals, col], k) => {
      const c = refs[k].current;
      if (!c) return;
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, S, S);
      const r = Math.max(1, Math.min(3, 200 / Math.sqrt(stations.length)));
      stations.forEach((p, i) => { ctx.fillStyle = col(vals[i]); ctx.beginPath(); ctx.arc(pad + (p[0] - x0) * sc, S - pad - (p[1] - y0) * sc, r, 0, Math.PI * 2); ctx.fill(); });
    });
  }, [stations, observed, predicted]); // eslint-disable-line react-hooks/exhaustive-deps
  const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  const small = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" };
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
      {[["Observed", `${Math.min(...observed).toFixed(1)}–${Math.max(...observed).toFixed(1)} ${unit}`], ["Predicted", `${Math.min(...predicted).toFixed(1)}–${Math.max(...predicted).toFixed(1)} ${unit}`], [std ? "Residual / σ" : "Residual", std ? `RMS ${rms(resid).toFixed(2)}, ±3 scale` : `RMS ${rms(resid).toFixed(2)} ${unit}`]].map(([t, cap], k) => (
        <figure key={t} style={{ margin: 0, textAlign: "center" }}>
          <canvas ref={refs[k]} width={78} height={78} role="img" aria-label={`${t} map: ${cap}`} style={{ border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)" }} />
          <figcaption style={small}>{t}<br />{cap}</figcaption>
        </figure>
      ))}
    </div>
  );
}
