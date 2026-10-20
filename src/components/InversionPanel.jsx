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
import { ChevronDown, ChevronRight, Activity, Square, Compass, Play, Gauge } from "./icons.js";
import { useStore, useSetTaskProgress } from "../lib/store.jsx";
import InfoButton from "./InfoButton.jsx";
import { activateOnKey } from "../lib/a11y.js";
import { pythonHealth, sidecarPlanPotential, ensureSidecarUp } from "../lib/desktop.js";
import { toLonLat } from "../lib/reproject.js";
import { igrfField, decimalYear } from "../lib/igrf.js";
import {
  gridDeclination, terrainElevationAt, terrainPoints, thinStationIndices, medianNearestSpacing, crsProblem, formatBytes,
  fitVerdict, resultToVoxelModel, trueDeclination, remanenceText, simpegMagFloorHint, sequentialStops, divergingStops, f32ToB64, suggestThinSpacing, MAX_STATIONS,
  forwardMapValues, residualScale, // TASKS.csv #537
} from "../lib/inversion.js";
import { subscribeInversionJob, startInversionJob, cancelInversionJob } from "../lib/inversionJobs.js";
import { orientationAt } from "../lib/mapLayers.js";
import { arrMin, arrMax } from "../lib/arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)
import { constraintSamples, SUSC_UNITS } from "../lib/drillholeConstraints.js"; // TASKS.csv #323
import { categoricalModels, modelUnits, unitMedians, modelBody } from "../lib/geologyForward.js"; // TASKS.csv #760
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

const METHODS = {
  mag: { label: "Magnetics (TMI)", unit: "nT", confirm: "These values are the total-field ANOMALY in nT — the IGRF/regional field has already been removed (not RTP, not a derivative, not the raw total field).", property: "susceptibility (SI)", contrastLabel: "Susceptibility (SI)" },
  grav: { label: "Gravity (gz)", unit: "mGal", confirm: "These values are Bouguer/residual gravity in mGal, positive over dense rock (terrain-corrected, regional removed).", property: "density contrast (g/cc)", contrastLabel: "Density contrast (g/cc)" },
};

const num = (v) => (v === "" || v == null ? NaN : Number(v));

export default function InversionPanel({ pBtn, numInput, inPane = false }) { // inPane: TASKS.csv #458
  const { layers, terrain, project, surfaceStructures, getProjectToken, addVoxelModelToTab, collars, survey: drillSurvey, desurveyMethod, geophysSurveys, voxelModels } = useStore();
  const setTaskProgress = useSetTaskProgress();
  // TASKS.csv #364 — every imported point file lands in the one geophys_pts layer, so a mag survey and a
  // gravity or radiometric survey used to be inverted TOGETHER as "TMI in nT". The inversion now uses
  // exactly one imported survey (by source file); with more than one loaded, the user must pick.
  const allRows = useMemo(() => (layers.geophys_pts || []).filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.value)), [layers.geophys_pts]);
  const surveys = useMemo(() => Array.from(new Set(allRows.map((r) => r._src || "(unnamed import)"))), [allRows]);
  const [survey, setSurvey] = useState("");
  const activeSurvey = surveys.length === 1 ? surveys[0] : survey;
  const rows = useMemo(() => (activeSurvey ? allRows.filter((r) => (r._src || "(unnamed import)") === activeSurvey) : []), [allRows, activeSurvey]);

  const [open, setOpen] = useState(inPane);
  const [engine, setEngine] = useState(null); // null = checking, {ok, available, simpeg} otherwise
  const [method, setMethod] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [zMode, setZMode] = useState(""); // "sensor" | "drape"
  const [sensorHeight, setSensorHeight] = useState("");
  const [zDatum, setZDatum] = useState("same"); // TASKS.csv #369 — "same" (as the terrain) | "ellipsoidal" | "unknown"
  const [baseLevel, setBaseLevel] = useState("mean"); // TASKS.csv #368 — "none" | "mean" | "plane"
  const [regStyle, setRegStyle] = useState("smooth"); // TASKS.csv #769 — "smooth" | "compact"
  const [magModel, setMagModel] = useState("scalar"); // TASKS.csv #770 — "scalar" (induced) | "vector" (remanence possible)
  const [thin, setThin] = useState("");
  const [field, setField] = useState({ strength: "", inclination: "", declination: "", date: "", source: "" });
  const [unc, setUnc] = useState({ floor: "", percent: "" });
  const [mesh, setMesh] = useState({ coreCell: "", depth: "", type: "tensor", octree: { fine: "4", fine2: "4", maxFactor: "4" } }); // type, octree: TASKS.csv #324 (inversions)
  const octreeSettings = { fine: Math.round(Number(mesh.octree.fine)), fine2: Math.round(Number(mesh.octree.fine2)), maxFactor: Number(mesh.octree.maxFactor) }; // #324 follow-up
  // TASKS.csv #451 — a survey already labelled magnetics / gravity pre-selects the method (still confirmed below)
  useEffect(() => {
    const m = geophysSurveys?.[activeSurvey]?.method;
    if (!method && (m === "mag" || m === "grav")) setMethod(m);
  }, [activeSurvey, geophysSurveys]);
  // TASKS.csv #323 — drillhole logs as constraints: mag susceptibility (units stated) or SG (background stated)
  const [dh, setDh] = useState({ on: false, units: "", background: "", tolerance: "" });
  const [adv, setAdv] = useState({ open: false, maxIter: 15, lx: 1, ly: 1, lz: 1, lower: "", upper: "", supportCutoff: 0.005 });
  // supportCutoff default 0.005, MEASURED not guessed (TASKS.csv #321): normalised sensitivity falls off
  // steeply with depth (0.97 beside the stations, ~0.017 at 200 m, ~0.005 at 400 m on the synthetic plate
  // test). The first default, 0.02, hid 41% of the strongest recovered cells — the anomaly itself; 0.005
  // hides none of them and still drops the deep, far-edge cells the data genuinely cannot see.
  const [plate, setPlate] = useState({ open: false, cx: "", cy: "", cz: "", dipDirection: "", dip: "", strikeLength: "", dipExtent: "", thickness: "", contrast: "", sweep: false });
  // TASKS.csv #760 — test a geology model against the survey: a categorical block model, a property per unit, a background
  const [geo, setGeo] = useState({ open: false, modelId: "", props: {}, background: "" });
  const [plan, setPlan] = useState(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [job, setJob] = useState(null);
  const [lastResult, setLastResult] = useState(null); // { result, prepared, verdict }

  useEffect(() => subscribeInversionJob((j) => setJob(j ? { ...j } : null)), []);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    ensureSidecarUp().then(pythonHealth).then((h) => { if (alive) setEngine({ ok: h.ok, available: !!h.capabilities?.potentialFields?.available, simpeg: h.capabilities?.potentialFields?.simpeg, apiVersion: h.api_version }); });
    return () => { alive = false; };
  }, [open]);

  const M = METHODS[method];
  const running = job?.status?.state === "running";
  const xs = rows.map((r) => r.x), ys = rows.map((r) => r.y);
  const spacing = useMemo(() => (rows.length > 1 ? medianNearestSpacing(xs, ys) : null), [rows]);
  const crsIssue = crsProblem(project?.epsg);
  const thinSuggestion = useMemo(() => (rows.length > MAX_STATIONS ? suggestThinSpacing(xs, ys) : null), [rows]);

  // TASKS.csv #323 — the log layer that constrains this method, and its samples in model units
  const dhLayer = method === "grav" ? "sg" : "magsusc";
  const dhRows = layers[dhLayer] || [];
  const dhConstraintPoints = () => {
    if (!dhRows.length) return { problem: tr("Drillhole constraints need a {v} log layer — import one, or untick the constraints.", { v: method === "grav" ? tr("Specific gravity") : tr("Mag. susceptibility") }) };
    if (method === "mag" && !SUSC_UNITS[dh.units]) return { problem: tr("Say what units the susceptibility log is in.") };
    if (method === "grav" && !(num(dh.background) >= 1 && num(dh.background) <= 5)) return { problem: tr("Enter the background density (g/cc) the density contrast is measured from — usually the one used for the Bouguer correction.") };
    if (!(num(dh.tolerance) >= 0)) return { problem: tr("Enter how far the model may depart from the logs ({v}).", { v: method === "grav" ? "g/cc" : "SI" }) };
    const r = constraintSamples({ collars, survey: drillSurvey, rows: dhRows, method, units: dh.units, background: num(dh.background), desurveyMethod, step: Math.max(1, num(mesh.coreCell) / 2 || 5) });
    if (!r.points.length) return { problem: tr("None of the log rows could be placed on a drillhole trace (check collars and hole IDs).") };
    return { points: r.points, meta: { layer: dhLayer, units: method === "mag" ? SUSC_UNITS[dh.units].label : null, backgroundDensity: method === "grav" ? num(dh.background) : null, tolerance: num(dh.tolerance), samples: r.points.length, holes: r.holes, skipped: r.skipped } };
  };

  // ---------- data preparation (all in the renderer; the sidecar only ever sees clean numbers) ----------
  const prepare = (kind) => {
    const problems = [];
    if (!M) problems.push(tr("Choose magnetics or gravity."));
    if (!confirmed) problems.push(tr("Confirm what the data values are."));
    if (surveys.length > 1 && !activeSurvey) problems.push(tr("Choose which imported survey to model — several are loaded and they must not be mixed."));
    if (!zMode) problems.push(tr("Say what the station z values mean."));
    if (zMode === "drape" && !(num(sensorHeight) > 0)) problems.push(tr("Enter the sensor height above the terrain."));
    if (zMode === "drape" && !terrain) problems.push(tr("A terrain surface is needed to drape the stations on."));
    if (kind === "inversion" && !terrain) problems.push(tr("An inversion needs a terrain surface (Terrain section above) to know which cells are underground."));
    if (crsIssue) problems.push(crsIssue);
    if (method === "mag") {
      if (!(num(field.strength) > 20000 && num(field.strength) < 70000)) problems.push(tr("Enter the field strength (nT, e.g. from IGRF for the survey date)."));
      if (!(Math.abs(num(field.inclination)) <= 90)) problems.push(tr("Enter the field inclination."));
      if (!(Math.abs(num(field.declination)) <= 180)) problems.push(tr("Enter the field declination."));
    }
    if (kind === "inversion" && !(num(unc.floor) > 0)) problems.push(tr("Enter the data uncertainty floor ({v}).", { v: M?.unit || "units" }));
    if (!(num(mesh.coreCell) >= 1)) problems.push(tr("Enter the core cell size."));
    if (!(num(mesh.depth) >= num(mesh.coreCell))) problems.push(tr("Enter the model depth (at least one cell)."));
    if (problems.length) return { problems };

    let idx = rows.map((_, i) => i);
    if (num(thin) > 0) idx = thinStationIndices(xs, ys, num(thin));
    // TASKS.csv #375 — say it here, with a spacing that fits, instead of the engine's bare 400
    if (idx.length > MAX_STATIONS) {
      const sug = suggestThinSpacing(xs, ys);
      return { problems: [tr("{idx} stations is more than the {MAX_STATIONS} an inversion can take (each one is a row of the sensitivity matrix).{v}", { idx: idx.length.toLocaleString(), MAX_STATIONS: MAX_STATIONS.toLocaleString(), v: sug ? tr(" Thin to one per {spacing} m (→ {stations} stations) — use the button beside \"Thin to one per\".", { spacing: sug.spacing, stations: sug.stations.toLocaleString() }) : "" })] };
    }
    let dropped = 0;
    const stations = [], observed = [];
    idx.forEach((i) => {
      const r = rows[i];
      const z = zMode === "sensor" ? r.z : terrainElevationAt(terrain, r.x, r.y) + num(sensorHeight);
      if (!Number.isFinite(z)) { dropped++; return; }
      stations.push([r.x, r.y, z]); observed.push(r.value);
    });
    if (!stations.length) return { problems: [tr("No usable stations (none inside the terrain surface?).")] };
    const cx = stations.reduce((s, p) => s + p[0], 0) / stations.length;
    const cy = stations.reduce((s, p) => s + p[1], 0) / stations.length;
    let decl = null;
    if (method === "mag") { decl = gridDeclination(num(field.declination), cx, cy, project.epsg); if (!decl) return { problems: [tr("Could not compute grid convergence for this CRS.")] }; }
    const cell = num(mesh.coreCell);
    const padReach = cell * (1.3 + 1.69 + 2.197 + 2.856 + 3.713 + 4.827) + 3 * cell;
    const sx = stations.map((p) => p[0]), sy = stations.map((p) => p[1]);
    const box = [arrMin(sx) - padReach, arrMin(sy) - padReach, arrMax(sx) + padReach, arrMax(sy) + padReach];
    const topo = terrain ? terrainPoints(terrain, box, 40000) : null;
    let dhMeta = null; // #323
    const request = {
      method, kind, stations,
      ...(topo ? { topo: topo.points } : {}),
      ...(method === "mag" ? { field: { strength: num(field.strength), inclination: num(field.inclination), declination: decl.grid } } : {}),
      mesh: { coreCell: cell, depth: num(mesh.depth), padCells: 6, padFactor: 1.3, ...(kind === "inversion" ? { type: mesh.type, ...(mesh.type === "octree" ? { octree: octreeSettings } : {}) } : {}) }, // #324 — the forward tool stays tensor
    };
    if (kind === "inversion") {
      request.observed = observed;
      request.uncertainty = { floor: num(unc.floor), percent: Number.isFinite(num(unc.percent)) ? num(unc.percent) : 0 };
      request.reg = { maxIter: Number(adv.maxIter) || 15, lengthX: Number(adv.lx) || 1, lengthY: Number(adv.ly) || 1, lengthZ: Number(adv.lz) || 1, style: regStyle };
      if (method === "mag") request.magModel = magModel; // #770
      const lo = num(adv.lower), up = num(adv.upper);
      request.bounds = { ...(Number.isFinite(lo) ? { lower: lo } : {}), ...(Number.isFinite(up) ? { upper: up } : {}) };
      request.baseLevel = baseLevel; // #368
      if (dh.on && method === "mag" && magModel === "vector") return { problems: [tr("Drillhole susceptibility logs can't constrain a vector (remanence) inversion — turn the constraints off, or choose induced magnetisation.")] }; // #770
      if (dh.on) { // #323
        const cp = dhConstraintPoints();
        if (cp.problem) return { problems: [cp.problem] };
        request.constraints = { points: cp.points, tolerance: num(dh.tolerance) };
        dhMeta = cp.meta;
      }
    } else {
      request.observed = observed;
    }
    const notes = [];
    if (dhMeta && (dhMeta.skipped.noTrace || dhMeta.skipped.badValue || dhMeta.skipped.beyondTrace)) notes.push(tr("Drillhole constraints: {samples} samples from {holes} hole(s); left out {noTrace} log row(s) with no collar/trace, {badValue} with no value, {beyondTrace} sample(s) beyond the surveyed hole length.", { samples: dhMeta.samples, holes: dhMeta.holes, noTrace: dhMeta.skipped.noTrace, badValue: dhMeta.skipped.badValue, beyondTrace: dhMeta.skipped.beyondTrace }));
    if (dropped) notes.push(tr("{dropped} station(s) fell outside the terrain and were left out.", { dropped }));
    if (topo && !topo.covers) notes.push(tr("The terrain does not cover the whole model mesh (padding included); cells beyond it follow the nearest terrain edge — load a larger terrain for an honest result near the edges."));
    if (topo && topo.spacing > cell) notes.push(tr("The terrain grid ({v} m) is coarser than the core cell ({cell} m), so ground level between terrain samples is interpolated.", { v: Math.round(topo.spacing), cell }));
    return { request, meta: { drillholeConstraints: dhMeta, stationsUsed: stations.length, stationsTotal: rows.length, thinnedTo: num(thin) > 0 ? num(thin) : null, dropped, convergence: decl?.convergence ?? null, gridDeclination: decl?.grid ?? null, centre: [cx, cy], topoSpacing: topo?.spacing ?? null, terrainCovers: topo?.covers ?? null }, notes, stations, observed };
  };

  const computeIgrf = async () => {
    if (!rows.length) return;
    const d = decimalYear(field.date);
    if (!Number.isFinite(d)) { setMsg({ ok: false, text: tr("Enter the survey date first — the field changes by tens of nT per year.") }); return; }
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length, cy = ys.reduce((a, b) => a + b, 0) / ys.length;
    const ll = await toLonLat(cx, cy, project.epsg);
    if (!ll) { setMsg({ ok: false, text: tr("Can't convert EPSG:{epsg} to longitude/latitude for IGRF.", { epsg: project.epsg }) }); return; }
    const lon = ll.lon ?? ll[0], lat = ll.lat ?? ll[1];
    const zs = rows.map((r) => r.z).filter(Number.isFinite);
    const hKm = zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length / 1000 : 0;
    try {
      const f = igrfField(lon, lat, hKm, d);
      setField((p) => ({ ...p, strength: f.total.toFixed(0), inclination: f.inclination.toFixed(2), declination: f.declination.toFixed(2),
        source: `IGRF-14 for ${field.date} at ${lat.toFixed(3)}, ${lon.toFixed(3)}, ${Math.round(hKm * 1000)} m (survey centre)` }));
      setMsg({ ok: true, text: tr("Filled from IGRF-14 for {date}: {total} nT, inclination {inclination}°, declination {declination}° (true north). Check them against your survey report — the contractor's values win.", { date: field.date, total: f.total.toFixed(0), inclination: f.inclination.toFixed(2), declination: f.declination.toFixed(2) }) });
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
    return r.data.ok ? { ...p, clearance: r.data.clearance || null, octree: r.data.octree || null } : null; // clearance: #369; octree: #324
  };

  const runInversion = async () => {
    const p = await doPlan("inversion");
    if (!p) return;
    const vector = method === "mag" && magModel === "vector"; // #770
    const meta = { label: `${M.label} inversion${vector ? " (vector)" : regStyle === "compact" ? " (compact)" : ""}`, surveyName: `${activeSurvey}: ${rows.length} ${M.unit} stations`, ...p.meta }; // #364
    const params = {
      tool: `${method === "mag" ? "magnetic" : "gravity"} inversion (SimPEG)`,
      interpretation: vector
        ? "One vector (MVI) model that fits the data to the stated uncertainty — not the only one. Each cell has a magnetisation amplitude and direction, so a body magnetised away from today's field (remanence) is placed where it is rather than where a susceptibility inversion would push it. Depth is still weakly resolved and amplitudes are approximate. Not a geological boundary, not an orebody, not a volume."
        : regStyle === "compact"
        ? "One compact (sparse-norm) model that fits the data to the stated uncertainty — not the only one. It assumes the source is a few compact bodies with sharp edges, so it draws them tighter and nearer their true depth than the smooth model, but the peak value can overshoot. Compare it with the smooth model: what both agree on is better supported. Not a geological boundary, not an orebody, not a volume."
        : "One smooth (L2) model that fits the data to the stated uncertainty — not the only one. Amplitudes are underestimated and bodies are smeared with depth. Not a geological boundary, not an orebody, not a volume.",
      dataUnits: M.unit, dataStatement: M.confirm, stationZ: zMode === "sensor" ? "sensor elevation (z column)" : `terrain + ${num(sensorHeight)} m (draped — an assumption)`,
      stationZDatum: zMode === "sensor" ? { same: "same vertical datum as the terrain (stated by user)", ellipsoidal: "GPS ellipsoidal heights (stated by user) — the terrain is geoid-based, so clearance is off by the local geoid height", unknown: "not known" }[zDatum] : "draped on the terrain", // #369
      sensorClearanceM: p.clearance || null, // #369
      stationsUsed: p.meta.stationsUsed, stationsTotal: p.meta.stationsTotal, thinnedToM: p.meta.thinnedTo, droppedOutsideTerrain: p.meta.dropped,
      uncertainty: { floor: num(unc.floor), percent: Number.isFinite(num(unc.percent)) ? num(unc.percent) : 0, units: M.unit, source: "entered by user" },
      ...(method === "mag" ? { inducingField: { strengthNT: num(field.strength), inclination: num(field.inclination), declinationTrue: num(field.declination), declinationGrid: p.meta.gridDeclination, gridConvergence: p.meta.convergence, surveyDate: field.date || null, source: field.source || "entered by user" } } : { signConvention: "positive gz over dense rock (converted to/from SimPEG's up-positive gz)" }),
      mesh: { type: mesh.type, coreCellM: num(mesh.coreCell), depthM: num(mesh.depth), padCells: 6, padFactor: 1.3, terrainSpacingM: p.meta.topoSpacing, terrainCoversMesh: p.meta.terrainCovers,
        ...(mesh.type === "octree" ? { octree: { fineLayers: octreeSettings.fine, doubledLayers: octreeSettings.fine2, maxCellInModel: `${octreeSettings.maxFactor * num(mesh.coreCell)} m`, cellSizesM: p.octree?.cellSizes || null, how: `core cell in the first ${octreeSettings.fine} layers under the terrain over the survey, then ${octreeSettings.fine2} layers of 2x, never coarser than ${octreeSettings.maxFactor}x inside the model volume` } } : {}) }, // #324
      regularization: vector
        ? { type: "Magnetic vector inversion (SimPEG, Fournier, Heagy & Oldenburg 2020): Cartesian sparse (norms 0) then spherical sparse — amplitude norms 0/1/1/1, angles 1/1/1 — with IRLS", sensitivityWeighting: true, beta0Ratio: 10, stages: "10 + 20 iterations" }
        : regStyle === "compact"
        ? { type: "Sparse (compact): lp norms p = 0 on the model, 1 on its gradients, IRLS (Fournier & Oldenburg 2019)", lengthScales: [Number(adv.lx) || 1, Number(adv.ly) || 1, Number(adv.lz) || 1], sensitivityWeighting: true, beta0Ratio: 10, cooling: "x0.5 until the target, then IRLS re-weighting (up to 40 passes)", boundsRequested: p.request.bounds }
        : { type: "WeightedLeastSquares (smooth L2)", lengthScales: [Number(adv.lx) || 1, Number(adv.ly) || 1, Number(adv.lz) || 1], sensitivityWeighting: true, beta0Ratio: 10, cooling: "x0.5 per iteration", maxIter: Number(adv.maxIter) || 15, boundsRequested: p.request.bounds },
      crs: `EPSG:${project.epsg}`,
      drillholeConstraints: p.meta.drillholeConstraints ? { ...p.meta.drillholeConstraints, how: "each cell a hole passes through: reference = mean of the log samples in it, bounds = that mean ± tolerance" } : null, // #323
    };
    const projectToken = getProjectToken(); // #466 — the result belongs to the project that started the run
    const res = await startInversionJob(p.request, meta, {
      setTaskProgress,
      onDone: (result) => {
        const verdict = fitVerdict(result);
        const model = resultToVoxelModel(result, meta);
        const vals = model.cells.map((c) => c.value);
        const vmin = arrMin(vals), vmax = arrMax(vals);
        const absMax = Math.max(Math.abs(vmin), Math.abs(vmax));
        const where = addVoxelModelToTab(projectToken, {
          ...model,
          stops: method === "mag" ? sequentialStops(Math.max(0, vmin), vmax) : divergingStops(absMax),
          colorMode: "continuous",
          supportCutoff: Number(adv.supportCutoff) || 0,
          // TASKS.csv #368 — what was actually applied: the bounds (the susceptibility default lower = 0 was
          // recorded as {}) and the base level removed from the data before inverting.
          params: { ...params, ...(result.direction ? { magnetisationDirection: { ...result.direction, declinationTrue: trueDeclination(result.direction.declinationGrid, p.meta.convergence), gridConvergence: p.meta.convergence, cellDirections: "per cell: inc (positive down), dec (grid north)" } } : {}), constraintsApplied: result.constraintsApplied || null, boundsApplied: result.boundsApplied || null, baseLevelRemoved: result.baseLevelRemoved || null, versions: result.versions, fit: { phiD: result.phi_d, target: result.target, chiFactor: verdict.chi, reachedTarget: result.reachedTarget, iterations: result.iterations, verdict: verdict.text }, localOrigin: result.localOrigin, generatedAt: new Date().toISOString(), runSeconds: Math.round(result.seconds) },
          history: result.history,
          // TASKS.csv #328 — the stations and data this model was fitted to, so it can be exported as UBC
          // .obs later (float32, x/y as offsets from the first station: ~4 bytes per number in the project)
          stationData: (() => {
            const st = p.stations, b = [st[0][0], st[0][1]];
            return { base: b, x: f32ToB64(st.map((s) => s[0] - b[0])), y: f32ToB64(st.map((s) => s[1] - b[1])), z: f32ToB64(st.map((s) => s[2])),
              observed: f32ToB64(result.observedUsed || p.observed), predicted: f32ToB64(result.predicted), std: f32ToB64(result.standardDeviation) };
          })(),
        });
        // #466 — say where it went when that is not the open project
        if (where === "tab") setMsg({ ok: true, text: tr("The inversion finished and was added to the project tab it was started from (marked unsaved) — switch back to that tab to see it.") });
        else if (where === "gone") setMsg({ ok: false, text: tr("The inversion finished, but the project it was started from is no longer open (its tab was closed or another project was opened in it), so the result was not added anywhere. Run it again in that project.") });
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
    if (!plates) { setMsg({ ok: false, text: tr("Fill in every plate field (centre, dip, dip direction, sizes and the contrast).") }); return; }
    const p = await doPlan("forward", { plates });
    if (!p) return;
    const meta = { label: `${M.label} forward model`, surveyName: `${activeSurvey}: ${rows.length} stations`, ...p.meta }; // #364
    const res = await startInversionJob(p.request, meta, { setTaskProgress, onDone: (result) => setLastResult({ result, prepared: p, verdict: null }) });
    if (!res.ok) setMsg({ ok: false, text: res.error });
  };

  // TASKS.csv #760 — the geology model's units, and the downhole logs' median in each (a hint, applied only on request)
  const geoModels = useMemo(() => categoricalModels(voxelModels), [voxelModels]);
  const geoModel = geoModels.find((m) => m.id === geo.modelId) || (geoModels.length === 1 ? geoModels[0] : null);
  const geoUnits = useMemo(() => (geoModel ? modelUnits(geoModel) : []), [geoModel]);
  const geoMedians = useMemo(() => {
    if (!geo.open || !geoModel || !method || !dhRows.length) return null;
    if (method === "mag" && !SUSC_UNITS[dh.units]) return { needUnits: true };
    // gravity: the SG log as densities (background 0); magnetics: the susceptibility log converted to SI
    const r = constraintSamples({ collars, survey: drillSurvey, rows: dhRows, method, units: dh.units, background: 0, desurveyMethod, step: 5 });
    return { by: unitMedians(geoModel, r.points), samples: r.points.length };
  }, [geo.open, geoModel, method, dhRows, dh.units, collars, drillSurvey, desurveyMethod]);

  const runGeoForward = async () => {
    if (!geoModel) { setMsg({ ok: false, text: tr("Choose a block model whose cells are units (3D Modelling: Add as block model, on a finished model).") }); return; }
    const props = Object.fromEntries(Object.entries(geo.props).map(([k, v]) => [k, num(v)]));
    const body = modelBody(geoModel, props, num(geo.background));
    if (body.problem) { setMsg({ ok: false, text: body.problem }); return; }
    if (method === "grav" && [num(geo.background), ...Object.values(props)].some((v) => !(v >= 1 && v <= 6))) { setMsg({ ok: false, text: tr("Densities are in g/cm³ (between 1 and 6) — check the values entered.") }); return; }
    const p = await doPlan("forward", { model: { cells: body.cells } });
    if (!p) return;
    const meta = { label: `${M.label}: geology model "${geoModel.name}"`, surveyName: `${activeSurvey}: ${rows.length} stations`, ...p.meta };
    const geoInfo = { modelName: geoModel.name, units: body.units, background: num(geo.background), cellsSent: body.cells.length };
    const res = await startInversionJob(p.request, meta, { setTaskProgress, onDone: (result) => setLastResult({ result, prepared: p, verdict: null, geo: geoInfo }) });
    if (!res.ok) setMsg({ ok: false, text: res.error });
  };

  const nearestOrientation = () => {
    const meas = (surfaceStructures || []).flatMap((s) => s.rows || []);
    const cx = num(plate.cx), cy = num(plate.cy);
    if (!meas.length || !Number.isFinite(cx) || !Number.isFinite(cy)) return;
    const o = orientationAt(cx, cy, meas, 1000);
    if (!o) { setMsg({ ok: false, text: tr("No outcrop measurement within 1 km of the plate centre.") }); return; }
    setPlate((q) => ({ ...q, dip: o.dip.toFixed(0), dipDirection: o.dipDir.toFixed(0) }));
    setMsg({ ok: true, text: tr("Dip set from {count} outcrop measurement(s) within 1 km (nearest {v} m): {dip}° toward {dipDir}°.", { count: o.count, v: Math.round(o.nearestM), dip: o.dip.toFixed(0), dipDir: o.dipDir.toFixed(0) }) });
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
      {!inPane && (<>
      {/* TASKS.csv #457 — a real, visibly clickable header card (was a grey uppercase caption that did not
          read as a control, and the user did not find the feature). */}
      <div style={{ marginTop: 18, marginBottom: 6, display: "flex", alignItems: "flex-start", gap: 6, padding: "8px 10px", border: `1px solid ${open ? "var(--color-selected-border)" : "var(--color-border)"}`, borderRadius: 6, background: open ? "var(--color-selected-bg)" : "var(--color-bg-subtle)" }}>
        <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ display: "flex", alignItems: "flex-start", gap: 6, cursor: "pointer", flex: 1, minWidth: 0 }}>
          <span style={{ marginTop: 2, display: "flex" }}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: "var(--font-size-base)", fontWeight: 600, color: "var(--color-text)" }}>{tr("Mag / gravity inversion (SimPEG)")}</span>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Invert a survey to a 3D model, or test a body against it")}</span>
          </span>
        </span>
        <InfoButton title={tr("Magnetics / gravity modelling")} width={420} text={tr("Uses SimPEG (simpeg.xyz, MIT) in GeoStrix's Python engine, on the survey points loaded in Point cloud above. Test a body: forward-models a dipping plate you define and compares its response with your data — the most direct way to ask whether a mapped or drilled body explains the anomaly. A dip sweep shows whether the data can tell the dip at all. Invert: finds ONE smooth 3D susceptibility or density-contrast model that fits the data to the uncertainty you give it. Many other models fit equally well; the smooth one is simply the least complicated. Expect amplitudes to be underestimated and bodies to be blurred and deeper-looking than reality. Remanent magnetisation (common in pyrrhotite-bearing Golden Triangle rocks) breaks the assumption behind a susceptibility inversion. Nothing physical is assumed for you: data type, station heights, the inducing field and the data uncertainty must all be entered.")} />
      </div>
      </>)}
      {open && (
        <div style={{ fontSize: "var(--font-size-sm)" }}>
          {engine === null && <div style={small}>{tr("Starting the Python engine…")}</div>}
          {engine && !engine.ok && <div style={small}>{tr("Needs GeoStrix's Python engine, which could not be started (status bar: Py). The desktop app starts it when a feature needs it; if it never comes up, click \"Py\" in the status bar for what to check.")}</div>}
          {engine && engine.ok && !engine.available && <div style={small}>{tr("The running Python engine has no SimPEG — update GeoStrix to a version that includes it.")}</div>}
          {engine?.available && !allRows.length && <div style={small}>{tr("Import a magnetic or gravity survey in Point cloud (CSV) above first — x, y, z and the measured value per station.")}</div>}
          {/* TASKS.csv #364 — one survey per model; imported surveys are never mixed. */}
          {engine?.available && surveys.length > 1 && (
            <label style={{ ...small, display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>{tr("Survey to model ({surveys} imported — they are never mixed)", { surveys: surveys.length })}<select value={survey} onChange={(e) => { setSurvey(e.target.value); setPlan(null); }} style={{ ...numInput, width: "100%" }}>
                <option value="">{tr("— choose one —")}</option>
                {surveys.map((sv) => <option key={sv} value={sv}>{tr("{sv} ({n} stations)", { sv, n: allRows.filter((r) => (r._src || tr("(unnamed import)")) === sv).length.toLocaleString() })}</option>)}
              </select>
            </label>
          )}
          {engine?.available && rows.length > 0 && (
            <>
              <div style={small}>{tr("{rows} survey stations loaded{v}. SimPEG {simpeg}.", { rows: rows.length.toLocaleString(), v: spacing ? tr(", median spacing {spacing} m", { spacing: spacing.toFixed(spacing < 10 ? 1 : 0) }) : "", simpeg: engine.simpeg })}</div>
              {step(1, tr("Data"), <>
                <div role="radiogroup" aria-label={tr("Survey type")} style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  {Object.entries(METHODS).map(([k, m]) => (
                    <label key={k} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                      <input type="radio" name="inv-method" checked={method === k} onChange={() => { setMethod(k); setConfirmed(false); setPlan(null); }} /> {tr(m.label)}
                    </label>
                  ))}
                </div>
                {M && (
                  <label style={{ ...row, alignItems: "flex-start", cursor: "pointer" }}>
                    <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
                    <span style={small}>{tr(M.confirm)}</span>
                  </label>
                )}
                <div role="radiogroup" aria-label={tr("What the station z values are")} style={{ marginTop: 6 }}>
                  <div style={small}>{tr("Station heights:")}</div>
                  <label style={{ ...row, marginTop: 2, cursor: "pointer" }}><input type="radio" name="inv-z" checked={zMode === "sensor"} onChange={() => setZMode("sensor")} />{" "}{tr("z column is the sensor elevation")}</label>
                  <label style={{ ...row, marginTop: 2, cursor: "pointer" }}><input type="radio" name="inv-z" checked={zMode === "drape"} onChange={() => setZMode("drape")} />{" "}{tr("Sensor is a fixed height above terrain")}</label>
                  {zMode === "drape" && <div style={row}><span style={lbl}>{tr("Height above ground")}</span><input type="number" min={0} value={sensorHeight} onChange={(e) => setSensorHeight(e.target.value)} style={inp} /> m</div>}
                  {/* TASKS.csv #369 — GPS heights are usually ellipsoidal; SRTM/most DEMs are geoid (EGM96) based. */}
                  {zMode === "sensor" && (
                    <div style={row} title={tr("SRTM and most DEMs give heights above the geoid (EGM96). Raw GPS heights are above the ellipsoid, about 15-20 m different in northwest BC — 40-50% of a 30-40 m helicopter survey's clearance.")}>
                      <span style={lbl}>{tr("z datum")}</span>
                      <select value={zDatum} onChange={(e) => setZDatum(e.target.value)} style={{ ...inp, width: "auto" }} aria-label={tr("Vertical datum of the station z values")}>
                        <option value="same">{tr("Same as the terrain")}</option>
                        <option value="ellipsoidal">{tr("GPS ellipsoidal")}</option>
                        <option value="unknown">{tr("Not known")}</option>
                      </select>
                    </div>
                  )}
                  {zMode === "sensor" && zDatum !== "same" && <div style={{ ...small, color: "var(--color-danger-fg)" }}>{tr("Station heights on a different datum from the terrain shift every clearance by the geoid height (roughly 15-20 m here). Check the clearance figures from \"Estimate size\" against the contractor's nominal survey height before trusting depths.")}</div>}
                </div>
                <div style={row} title={tr("Keep one station per cell of this size. Every station costs a row of the sensitivity matrix, and neighbouring readings along a line add little. Leave empty to use every station.")}>
                  <span style={lbl}>{tr("Thin to one per")}</span><input type="number" min={0} value={thin} onChange={(e) => setThin(e.target.value)} style={inp} /> m
                  {num(thin) > 0 && <span style={small}>{tr("→ {n} stations", { n: thinStationIndices(xs, ys, num(thin)).length.toLocaleString() })}</span>}
                  {thinSuggestion && !(num(thin) >= thinSuggestion.spacing) && (
                    <button type="button" onClick={() => setThin(String(thinSuggestion.spacing))} style={{ ...small, marginLeft: 6, padding: "1px 6px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)", cursor: "pointer" }}
                      title={tr("{rows} stations is over the {MAX_STATIONS} an inversion takes", { rows: rows.length.toLocaleString(), MAX_STATIONS: MAX_STATIONS.toLocaleString() })}>{tr("Thin to {spacing} m", { spacing: thinSuggestion.spacing })}</button>
                  )}
                </div>
              </>)}
              {method === "mag" && step(2, tr("Inducing field"), <>
                <div style={row}><span style={lbl}>{tr("Survey date")}</span><input type="date" value={field.date} onChange={(e) => setField((p) => ({ ...p, date: e.target.value }))} style={{ ...numInput, flex: "none" }} /></div>
                {[["strength", tr("Strength (nT)")], ["inclination", tr("Inclination (°)")], ["declination", tr("Declination (° true)")]].map(([k, l]) => (
                  <div key={k} style={row}><span style={lbl}>{l}</span><input type="number" value={field[k]} onChange={(e) => setField((p) => ({ ...p, [k]: e.target.value, source: "entered by user" }))} style={inp} /></div>
                ))}
                <button onClick={computeIgrf} disabled={!field.date || !rows.length} style={{ ...pBtn, marginTop: 7, marginBottom: 0, opacity: field.date && rows.length ? 1 : 0.5 }} title={tr("Fill the three values from the IGRF-14 model for the survey date at the survey centre. Your survey report's values take precedence.")}>
                  <Compass size={14} />{" "}{tr("Compute from IGRF-14 for the survey date")}</button>
                {field.source && <div style={{ ...small, marginTop: 4 }}>{tr("Source: {source}", { source: field.source })}</div>}
              </>)}
              {step(method === "mag" ? 3 : 2, tr("Uncertainty & mesh"), <>
                <div style={row} title={tr("How far you trust each reading. Too small and the model invents detail to chase noise; too large and real bodies are smoothed away. There is no default.")}><span style={lbl}>{tr("Uncertainty floor")}</span><input type="number" min={0} value={unc.floor} onChange={(e) => setUnc((p) => ({ ...p, floor: e.target.value }))} style={inp} /> {M?.unit || ""}</div>
                {/* TASKS.csv #775 — what SimPEG's own tutorials use, as a hint only */}
                {method === "mag" && (() => { const h = simpegMagFloorHint(rows.map((r) => r.value)); return h ? <div style={{ ...small, marginTop: -2, marginBottom: 4 }}>{tr("For reference: SimPEG's magnetic tutorials use a constant floor of 2% of the largest anomaly and no percentage — about {v} {unit} for these data (anomaly measured about the mean). Your survey's noise and levelling errors are the better guide.", { v: h < 10 ? h.toFixed(1) : Math.round(h), unit: M.unit })}</div> : null; })()}
                <div style={row}><span style={lbl}>{tr("+ percent of value")}</span><input type="number" min={0} value={unc.percent} onChange={(e) => setUnc((p) => ({ ...p, percent: e.target.value }))} style={inp} /> %</div>
                <div style={row} title={tr("Cell size in the core of the model. Around half the station spacing is usual; smaller cells cost memory (data x cells).")}>
                  <span style={lbl}>{tr("Core cell")}</span><input type="number" min={1} value={mesh.coreCell} onChange={(e) => setMesh((p) => ({ ...p, coreCell: e.target.value }))} style={inp} /> m
                  {spacing && !mesh.coreCell && <button onClick={() => setMesh((p) => ({ ...p, coreCell: String(Math.max(5, Math.round(spacing / 2 / 5) * 5)) }))} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "2px 7px" }}>{tr("≈ half spacing")}</button>}
                </div>
                <div style={row} title={tr("How deep below the stations the model extends. Potential-field data lose resolution quickly with depth.")}><span style={lbl}>{tr("Model depth")}</span><input type="number" min={1} value={mesh.depth} onChange={(e) => setMesh((p) => ({ ...p, depth: e.target.value }))} style={inp} /> m</div>
                {/* TASKS.csv #324 — adaptive (octree) mesh */}
                <div style={row} title={tr("Uniform: every model cell is the core cell size (the same as before). Adaptive (octree): the core cell only in the top layers under the survey, then 2x, never coarser than 4x inside the model (adjustable below) — typically 4-6x fewer cells, so 4-6x less memory, for larger areas or finer cells on a modest computer. The cost is coarser cells at depth, where the data resolve little anyway. An adaptive model exports as a cell list and UBC-GIF OcTree files, not as a UBC tensor mesh, OMF or GeoTIFF slices (those need one regular grid).")}>
                  <span style={lbl}>{tr("Mesh")}</span>
                  <select value={mesh.type} onChange={(e) => setMesh((p) => ({ ...p, type: e.target.value }))} style={{ ...inp, width: "auto" }} aria-label={tr("Inversion mesh")}>
                    <option value="tensor">{tr("Uniform (tensor)")}</option>
                    <option value="octree">{tr("Adaptive (octree) — less memory")}</option>
                  </select>
                </div>
                {/* TASKS.csv #324 follow-up — the octree's shape; the plan shows the resulting cells and memory */}
                {mesh.type === "octree" && (
                  <div style={row} title={tr("Layers of the core cell right under the terrain over the survey, then layers of 2x the core cell, then nothing coarser than the chosen size inside the model. More fine layers = more resolution near the surface and more memory; press 'Estimate size and memory' to see the effect.")}>
                    <span style={lbl}>{tr("Octree layers")}</span>
                    <input type="number" min={1} max={16} value={mesh.octree.fine} onChange={(e) => setMesh((p) => ({ ...p, octree: { ...p.octree, fine: e.target.value } }))} style={{ ...inp, width: 40 }} aria-label={tr("Layers of the core cell")} /> ×1,
                    <input type="number" min={0} max={16} value={mesh.octree.fine2} onChange={(e) => setMesh((p) => ({ ...p, octree: { ...p.octree, fine2: e.target.value } }))} style={{ ...inp, width: 40 }} aria-label={tr("Then layers of 2x the core cell")} />{" "}{tr("×2, then ≤")}<select value={mesh.octree.maxFactor} onChange={(e) => setMesh((p) => ({ ...p, octree: { ...p.octree, maxFactor: e.target.value } }))} style={{ ...inp, width: "auto" }} aria-label={tr("Coarsest cell inside the model")}>
                      {["1", "2", "4", "8"].map((f) => <option key={f} value={f}>×{f}</option>)}
                    </select>
                  </div>
                )}
                <div style={row} title={tr("Levelled TMI and Bouguer gravity carry an arbitrary base level. With susceptibility bounded at zero, an uncorrected positive level can only be fitted by inventing material near the edges. The value removed is stored with the model.")}>
                  <span style={lbl}>{tr("Remove base level")}</span>
                  <select value={baseLevel} onChange={(e) => setBaseLevel(e.target.value)} style={{ ...inp, width: "auto" }} aria-label={tr("Base level removed before inverting")}>
                    <option value="mean">{tr("Mean of the data")}</option>
                    <option value="plane">{tr("Best-fit plane (regional tilt)")}</option>
                    <option value="none">{tr("None (data already levelled)")}</option>
                  </select>
                </div>
                {/* TASKS.csv #770 — induced only, or a vector inversion when remanence is possible */}
                {method === "mag" && (
                  <div style={row} title={tr("Induced: the rocks are magnetised along today's field, so the inversion solves for susceptibility (fast). Remanence possible: pyrrhotite- and magnetite-bearing rocks can carry their own magnetisation in another direction; a susceptibility inversion then puts the body in the wrong place. The vector inversion solves for the magnetisation's amplitude AND direction in each cell — about 3x the memory and 5-30x the time.")}>
                    <span style={lbl}>{tr("Magnetisation")}</span>
                    <select value={magModel} onChange={(e) => setMagModel(e.target.value)} style={{ ...inp, width: "auto" }} aria-label={tr("Magnetisation")}>
                      <option value="scalar">{tr("Induced (susceptibility)")}</option>
                      <option value="vector">{tr("Remanence possible (vector, slower)")}</option>
                    </select>
                  </div>
                )}
                {/* TASKS.csv #769 — smooth (L2) or compact (sparse norms) */}
                {!(method === "mag" && magModel === "vector") && <div style={row} title={tr("Smooth spreads the source out: bodies come out blurred, too deep and too weak. Compact assumes a few compact bodies with sharp edges: tighter and nearer the right depth, but the peak can overshoot, and it takes several times longer. Both fit the data equally well — run both and trust what they agree on.")}>
                  <span style={lbl}>{tr("Model style")}</span>
                  <select value={regStyle} onChange={(e) => setRegStyle(e.target.value)} style={{ ...inp, width: "auto" }} aria-label={tr("Model style")}>
                    <option value="smooth">{tr("Smooth (L2)")}</option>
                    <option value="compact">{tr("Compact (sparse norms, slower)")}</option>
                  </select>
                </div>}
                {/* TASKS.csv #323 — drillhole logs as constraints */}
                <label style={{ ...row, cursor: "pointer" }} title={tr("Where a drillhole passes through a model cell, hold that cell close to what the hole logged. Cells no hole touches are inverted exactly as before.")}>
                  <input type="checkbox" checked={dh.on} onChange={(e) => setDh((p) => ({ ...p, on: e.target.checked }))} />{tr("Constrain with drillhole {v} logs ({dhRows} rows)", { v: method === "grav" ? tr("specific gravity") : tr("susceptibility"), dhRows: dhRows.length.toLocaleString() })}</label>
                {dh.on && <>
                  {method === "mag" && (
                    <div style={row}><span style={lbl}>{tr("Log units")}</span>
                      <select value={dh.units} onChange={(e) => setDh((p) => ({ ...p, units: e.target.value }))} style={{ ...inp, width: "auto" }} aria-label={tr("Susceptibility log units")}>
                        <option value="">{tr("Choose…")}</option>
                        {Object.entries(SUSC_UNITS).map(([k, u]) => <option key={k} value={k}>{u.label}</option>)}
                      </select>
                    </div>
                  )}
                  {method === "grav" && (
                    <div style={row} title={tr("The logged SG minus this is the density contrast the inversion models.")}><span style={lbl}>{tr("Background density")}</span><input type="number" step={0.01} value={dh.background} onChange={(e) => setDh((p) => ({ ...p, background: e.target.value }))} style={inp} aria-label={tr("Background density")} />{" "}{tr("g/cc")}</div>
                  )}
                  <div style={row} title={tr("How far the model may depart from the logged value in cells a hole passes through. 0 = exactly the log; larger allows for the log sampling only part of a cell.")}><span style={lbl}>{tr("Allowed departure ±")}</span><input type="number" min={0} step={method === "grav" ? 0.01 : 0.001} value={dh.tolerance} onChange={(e) => setDh((p) => ({ ...p, tolerance: e.target.value }))} style={inp} aria-label={tr("Allowed departure from the logs")} /> {method === "grav" ? "g/cc" : "SI"}</div>
                </>}
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setAdv((p) => ({ ...p, open: !p.open }))} aria-expanded={adv.open} style={{ ...row, cursor: "pointer" }}>
                  {adv.open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{" "}{tr("Advanced")}</div>
                {adv.open && <>
                  <div style={row}><span style={lbl}>{tr("Max iterations")}</span><input type="number" min={1} max={40} value={adv.maxIter} onChange={(e) => setAdv((p) => ({ ...p, maxIter: e.target.value }))} style={inp} /></div>
                  <div style={row} title={tr("Relative smoothness length along x (east), y (north), z (up). Larger along one axis = smoother (more elongated) that way.")}><span style={lbl}>{tr("Smoothness x/y/z")}</span>
                    {["lx", "ly", "lz"].map((k) => <input key={k} type="number" min={0.1} step={0.5} value={adv[k]} onChange={(e) => setAdv((p) => ({ ...p, [k]: e.target.value }))} style={{ ...inp, width: 44 }} aria-label={tr("Smoothness {v}", { v: k.slice(1) })} />)}
                  </div>
                  <div style={row}><span style={lbl}>{tr("Bounds (optional)")}</span><input type="number" placeholder={tr("lower")} value={adv.lower} onChange={(e) => setAdv((p) => ({ ...p, lower: e.target.value }))} style={{ ...inp, width: 60 }} aria-label={tr("Lower bound")} /><input type="number" placeholder={tr("upper")} value={adv.upper} onChange={(e) => setAdv((p) => ({ ...p, upper: e.target.value }))} style={{ ...inp, width: 60 }} aria-label={tr("Upper bound")} /></div>
                  <div style={row} title={tr("Cells whose normalised sensitivity is below this are hidden in the 3D view: the data can barely see them, so their value says more about the regularisation than about the rock. Display only — it does not change the inversion.")}><span style={lbl}>{tr("Hide cells below support")}</span><input type="number" min={0} max={1} step={0.01} value={adv.supportCutoff} onChange={(e) => setAdv((p) => ({ ...p, supportCutoff: e.target.value }))} style={inp} /></div>
                </>}
              </>)}
              <button onClick={() => doPlan("inversion")} disabled={planBusy || running} style={{ ...pBtn, marginTop: 8, marginBottom: 4 }}><Gauge size={14} /> {planBusy ? tr("Estimating…") : tr("Estimate size and memory")}</button>
              {plan && (
                <div style={{ ...small, marginBottom: 6 }} aria-live="polite">
                  {tr("{nData} stations × {v}{nActiveEst} underground cells", { nData: plan.nData.toLocaleString(), v: plan.octree ? "" : "~", nActiveEst: plan.nActiveEst.toLocaleString() })}{" "}
                  {plan.octree
                    ? <>{tr("(adaptive mesh, cells {v} m; a uniform mesh would need ~{tensorActiveEst} — {v2}× more memory).", { v: plan.octree.cellSizes.map((h) => `${h}`).join(" / "), tensorActiveEst: plan.octree.tensorActiveEst.toLocaleString(), v2: (plan.octree.tensorActiveEst / Math.max(1, plan.nActiveEst)).toFixed(1) })}{" "}</>
                    : <>{tr("({meshShape} mesh).", { meshShape: plan.meshShape.join(" × ") })}{" "}</>}
                  {plan.kind === "inversion"
                    ? <>{tr("Sensitivity matrix {v} of the {v2} this machine can spare right now; peak memory ≈ {v3}, ~{v4} s to build it, then a few seconds per iteration.", { v: formatBytes(plan.sensitivityBytes), v2: formatBytes(plan.ramCapBytes), v3: formatBytes(plan.peakRamEstimateBytes), v4: Math.max(1, Math.round(plan.buildSecondsEstimate)) })}</>
                    : <>{tr("Forward only — no matrix is stored.")}</>}{" "}
                  {plan.ok ? tr("OK to run.") : ""}
                  {plan.clearance && <div style={{ marginTop: 3 }}>{tr("Sensor clearance above the terrain: median {median} m, 5th percentile {p5} m, lowest {min} m ({n} stations). Compare with the survey's nominal height — a consistent offset usually means the station heights and the terrain are on different vertical datums.", { median: plan.clearance.median.toFixed(1), p5: plan.clearance.p5.toFixed(1), min: plan.clearance.min.toFixed(1), n: plan.clearance.n.toLocaleString() })}</div>}
                  {plan.notes?.map((n) => <div key={n} style={{ marginTop: 3 }}>⚠ {n}</div>)}
                </div>
              )}
              <button onClick={runInversion} disabled={running || planBusy} style={{ ...pBtn, marginBottom: 4, opacity: running ? 0.5 : 1 }}><Play size={14} />{" "}{tr("Invert")}</button>

              <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setPlate((p) => ({ ...p, open: !p.open }))} aria-expanded={plate.open} style={{ ...row, cursor: "pointer", marginTop: 8, color: "var(--color-text)" }}>
                {plate.open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{" "}{tr("Test a body (forward model)")}</div>
              {plate.open && (
                <div style={{ paddingLeft: 4 }}>
                  <div style={small}>{tr("A rectangular plate with a {v} contrast. Uses steps 1{v2} and the mesh settings; no uncertainty or inversion.", { v: M ? M.property : tr("property"), v2: method === "mag" ? "–2" : "" })}</div>
                  {[["cx", tr("Centre easting")], ["cy", tr("Centre northing")], ["cz", tr("Centre elevation")], ["dipDirection", tr("Dip direction (°)")], ["dip", tr("Dip (°)")], ["strikeLength", tr("Strike length (m)")], ["dipExtent", tr("Down-dip extent (m)")], ["thickness", tr("Thickness (m)")], ["contrast", M ? M.contrastLabel : tr("Contrast")]].map(([k, l]) => (
                    <div key={k} style={row}><span style={lbl}>{l}</span><input type="number" value={plate[k]} onChange={(e) => setPlate((p) => ({ ...p, [k]: e.target.value }))} style={inp} /></div>
                  ))}
                  {(surfaceStructures || []).length > 0 && <button onClick={nearestOrientation} style={{ ...pBtn, marginTop: 6, marginBottom: 0 }}>{tr("Use nearest outcrop measurements for dip")}</button>}
                  <label style={{ ...row, cursor: "pointer" }} title={tr("Runs the same plate at dips 10°-90° and shows the misfit for each. A flat curve means these data cannot tell the dip.")}><input type="checkbox" checked={plate.sweep} onChange={(e) => setPlate((p) => ({ ...p, sweep: e.target.checked }))} />{" "}{tr("Dip sweep (10°–90°)")}</label>
                  <button onClick={runForward} disabled={running || planBusy} style={{ ...pBtn, marginTop: 6, marginBottom: 0, opacity: running ? 0.5 : 1 }}><Activity size={14} />{" "}{tr("Forward model")}</button>
                </div>
              )}

              {/* TASKS.csv #760 — test a geology model against the survey */}
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setGeo((g) => ({ ...g, open: !g.open }))} aria-expanded={geo.open} style={{ ...row, cursor: "pointer", marginTop: 8, color: "var(--color-text)" }}>
                {geo.open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{" "}{tr("Test a geology model (forward model)")}</div>
              {geo.open && (
                <div style={{ paddingLeft: 4 }}>
                  <div style={small}>{tr("Gives each unit of a block model a {v} and computes the {v2} response it would produce at these stations, to compare with the data. Does a modelled intrusion or basin explain the anomaly before anyone drills it? Uses steps 1{v3} and the mesh settings; no inversion.", { v: method === "grav" ? tr("density") : tr("susceptibility"), v2: M ? M.unit : "", v3: method === "mag" ? "–2" : "" })}</div>
                  {!M ? <div style={small}>{tr("Choose magnetics or gravity first.")}</div> : !geoModels.length ? (
                    <div style={small}>{tr("No block model has unit cells yet. In 3D Modelling, run a geology model and use Add as block model.")}</div>
                  ) : (<>
                    <div style={row}><span style={lbl}>{tr("Model")}</span>
                      <select value={geoModel?.id || ""} onChange={(e) => setGeo((g) => ({ ...g, modelId: e.target.value, props: {} }))} style={{ ...inp, width: "auto", maxWidth: 220 }} aria-label={tr("Geology block model")}>
                        {geoModels.length > 1 && <option value="">{tr("Choose…")}</option>}
                        {geoModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    {geoModel && (<>
                      {geoUnits.map((u) => {
                        const h = geoMedians?.by?.[u.value];
                        return (
                          <div key={u.value} style={row} title={tr("{cells} cells", { cells: u.cells.toLocaleString() })}>
                            <span style={lbl}>{u.label}</span>
                            <input type="number" step="any" value={geo.props[u.value] ?? ""} onChange={(e) => setGeo((g) => ({ ...g, props: { ...g.props, [u.value]: e.target.value } }))} style={inp} aria-label={`${u.label} ${method === "grav" ? tr("density (g/cm³)") : tr("susceptibility (SI)")}`} />
                            <span style={small}>{h ? tr("logs: {v} ({n})", { v: +h.median.toPrecision(3), n: h.n }) : ""}</span>
                          </div>
                        );
                      })}
                      <div style={row}><span style={lbl}>{tr("Background")}</span><input type="number" step="any" value={geo.background} onChange={(e) => setGeo((g) => ({ ...g, background: e.target.value }))} style={inp} aria-label={tr("Background value")} /><span style={small}>{method === "grav" ? "g/cm³" : "SI"}</span></div>
                      <div style={small}>{method === "grav"
                        ? tr("Densities in g/cm³. The background is the rock around the model and in the space it leaves out (above its tops, outside its box) — usually the density used for the Bouguer correction. Typical: sediments 1.9–2.4, felsic rocks 2.5–2.7, mafic rocks 2.8–3.0, massive sulphide 3.5–4.5.")
                        : tr("Susceptibilities in SI. The background is the rock around the model and in the space it leaves out. Typical: sediments under 0.001, felsic rocks 0.001–0.01, mafic rocks 0.01–0.1; magnetite-rich rock higher. Remanent magnetisation is not modelled.")}</div>
                      {geoMedians?.needUnits && <div style={small}>{tr("A susceptibility log is loaded: choose its units under the drillhole constraints in the inversion settings to see each unit's median here.")}</div>}
                      {geoMedians?.by && Object.keys(geoMedians.by).length > 0 && (
                        <button onClick={() => setGeo((g) => ({ ...g, props: { ...g.props, ...Object.fromEntries(Object.entries(geoMedians.by).map(([k, v]) => [k, String(+v.median.toPrecision(3))])) } }))} style={{ ...pBtn, marginTop: 6, marginBottom: 0 }} title={tr("Fills each unit that has log samples with their median. A median of a few samples is a weak estimate; units without samples stay as entered.")}>{tr("Use the log medians")}</button>
                      )}
                      <button onClick={runGeoForward} disabled={running || planBusy} style={{ ...pBtn, marginTop: 6, marginBottom: 0, opacity: running ? 0.5 : 1 }}><Activity size={14} />{" "}{tr("Forward model the geology")}</button>
                    </>)}
                  </>)}
                </div>
              )}

              {running && (
                <div style={{ marginTop: 8, padding: "7px 9px", border: "1px solid var(--color-border)", borderRadius: 6 }}>
                  <div style={{ color: "var(--color-text)" }}>{job.meta.label}: {prog.stage === "iterating" && prog.iter ? tr("iteration {iter} of {maxIter}", { iter: prog.iter, maxIter: prog.maxIter }) : prog.message || prog.stage || "starting"}</div>
                  {prog.phi_d != null && <div style={small}>{tr("Misfit {v}× the target", { v: (prog.phi_d / prog.target).toFixed(2) })}</div>}
                  <button onClick={() => cancelInversionJob()} style={{ ...pBtn, marginTop: 6, marginBottom: 0 }}><Square size={12} />{" "}{tr("Cancel")}</button>
                </div>
              )}
              {job && !running && job.error && <div role="alert" style={{ ...small, color: "var(--color-danger-fg)", marginTop: 6 }}>{job.error}</div>}
              {job && !running && job.status?.state === "cancelled" && <div style={{ ...small, marginTop: 6 }}>{tr("Cancelled — the worker process was stopped and its memory released.")}</div>}
              {msg && <div role={msg.ok ? "status" : "alert"} style={{ ...small, marginTop: 6, color: msg.ok ? "var(--color-text-secondary)" : "var(--color-danger-fg)" }}>{msg.text}</div>}
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
  const { result, prepared, verdict, geo } = last;
  const unit = METHODS[result.method]?.unit || "";
  const st = prepared.stations, obs = result.observedUsed || prepared.observed; // #368 — after base-level removal
  const small = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
  if (result.kind === "forward") {
    const runs = result.runs || [];
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ color: "var(--color-text)", fontSize: "var(--font-size-sm)" }}>{result.body === "model" ? tr("Geology model against the data") : tr("Forward model result")}</div>
        {result.body === "model" && runs[0] && <GeoModelFit run={runs[0]} rmsObserved={result.rmsObserved} geo={geo} unit={unit} />}
        {runs.length === 1 && result.body !== "model" && <div style={small}>{tr("RMS of the data about its mean {v} {unit}; RMS left over after subtracting the plate's response and a best-fit base level of {v2} {unit}: {v3} {unit} ({plateCells} cells). The closer the second is to zero, the more of the anomaly this body explains.", { v: result.rmsObserved?.toFixed(2), unit, v2: runs[0].baseLevel?.toFixed(2), v3: runs[0].rmsResidual?.toFixed(2), plateCells: runs[0].plateCells })}</div>}
        {runs.length > 1 && <DipSweep runs={runs} unit={unit} />}
        {/* TASKS.csv #367 — say how faithfully the mesh holds the plate (fractional cells keep its volume). */}
        {runs[0]?.thinnerThanCell && <div style={small}>{tr("The plate is thinner than a mesh cell, so it is represented by partly filled cells (modelled volume {v}% of the plate's true volume{v2}).", { v: Math.round((runs[0].volumeRatio || 0) * 100), v2: runs.length > 1 ? ` at ${runs[0].dip}°` : "" })}</div>}
        {result.body !== "model" && runs.some((r) => r.volumeRatio != null && r.volumeRatio < 0.9) && <div role="alert" style={{ ...small, color: "var(--color-danger-fg)" }}>{tr("Part of the plate lies above the ground surface or outside the mesh at some dips (modelled volume as low as {v}%) — those responses are for a smaller body than the one entered.", { v: Math.round(arrMin(runs.map((r) => r.volumeRatio ?? 1)) * 100) })}</div>}
        {runs.length === 1 && <PointMaps stations={st} observed={obs} predicted={forwardMapValues(obs, runs[0]).predicted} unit={unit} />}
        {runs.length === 1 && Number.isFinite(runs[0].baseLevel) && <div style={small}>{tr("Predicted map shown with the base level ({baseLevel} {unit}) added, so it is on the data's level and the residual map is what the RMS above measures.", { baseLevel: runs[0].baseLevel.toFixed(2), unit })}</div>}
      </div>
    );
  }
  const std = result.standardDeviation;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ color: "var(--color-text)", fontSize: "var(--font-size-sm)" }}>{tr("Did it fit?")}</div>
      <div role="status" style={{ ...small, color: verdict.level === "ok" ? "var(--color-text-secondary)" : "var(--color-danger-fg)" }}>{verdict.text}</div>
      <MisfitChart history={result.history} target={result.target} />
      {result.baseLevelRemoved && result.baseLevelRemoved.mode !== "none" && (
        <div style={small}>{tr("Removed before inverting: {v}. The maps below show the data after that removal. Bounds applied: {v2}.", { v: result.baseLevelRemoved.mode === "mean" ? tr("the data mean, {constant} {unit}", { constant: result.baseLevelRemoved.constant.toFixed(2), unit }) : tr("a best-fit plane ({constant} {unit} at the survey centre, {v} / {v2} {unit} per km east / north)", { constant: result.baseLevelRemoved.constant.toFixed(2), unit, v: (result.baseLevelRemoved.perMetreX * 1000).toFixed(2), v2: (result.baseLevelRemoved.perMetreY * 1000).toFixed(2) }), v2: result.boundsApplied ? `${result.boundsApplied.lower ?? tr("none")} to ${result.boundsApplied.upper ?? tr("none")}` : "—" })}</div>
      )}
      <PointMaps stations={st} observed={obs} predicted={result.predicted} std={std} unit={unit} />
      {result.constraintsApplied && (
        <div style={small}>{tr("Drillhole constraints: {cells} cell(s) held within ±{tolerance} of the logs ({pointsUsed} of {points} samples used{v}{v2}{v3}).", { cells: result.constraintsApplied.cells, tolerance: result.constraintsApplied.tolerance, pointsUsed: result.constraintsApplied.pointsUsed, points: result.constraintsApplied.points, v: result.constraintsApplied.inAirOrInactive ? tr(", {inAirOrInactive} above the terrain", { inAirOrInactive: result.constraintsApplied.inAirOrInactive }) : "", v2: result.constraintsApplied.outsideMesh ? tr(", {outsideMesh} outside the model", { outsideMesh: result.constraintsApplied.outsideMesh }) : "", v3: result.constraintsApplied.clippedToBounds ? tr(", {clippedToBounds} cell(s) with a logged value outside the bounds held at the bound", { clippedToBounds: result.constraintsApplied.clippedToBounds }) : "" })}</div>
      )}
      {result.direction && <div role="status" style={{ ...small, color: "var(--color-text-secondary)", marginTop: 6 }}>{remanenceText(result.direction, prepared.meta?.convergence)}</div>}
      <div style={{ ...small, marginTop: 6 }}>{tr("Added to Voxel / block models as \"{property}\". {v}; cells the data barely see are hidden. No volume or tonnage is computed from it.", { property: resultToVoxelModel({ ...result, cells: { value: [], x: [], y: [], z: [], dx: [], dy: [], dz: [], support: [] } }, { surveyName: "" }).property, v: result.magModel === "vector" ? tr("It is one vector model of many that fit these data — amplitude in each cell, with its own direction; depth is weakly resolved") : result.style === "compact" ? tr("It is one compact model of many that fit these data — it assumes a few sharp-edged bodies, so they come out tighter than in the smooth model and peak values can overshoot; compare the two") : tr("It is one smooth model of many that fit these data — amplitudes are underestimated and bodies smeared with depth") })}</div>
    </div>
  );
}

// TASKS.csv #760 — how far a geology model explains the data: share of the anomaly left over, correlation, what was entered
function GeoModelFit({ run, rmsObserved, geo, unit }) {
  const small = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
  const left = rmsObserved > 0 && Number.isFinite(run.rmsResidual) ? run.rmsResidual / rmsObserved : null;
  return (
    <>
      <div role="status" style={{ ...small, color: "var(--color-text-secondary)" }}>{tr("RMS of the data about its mean {v} {unit}; left over after subtracting the model's response and a best-fit base level of {v2} {unit}: {v3} {unit}{v4}{v5}.{v6} A good fit does not prove the model (other geometries and properties can fit as well); a poor one says the geometry, the properties or both are wrong.", { v: rmsObserved?.toFixed(2), unit, v2: run.baseLevel?.toFixed(2), v3: run.rmsResidual?.toFixed(2), v4: left != null ? tr(" ({v}% of it)", { v: Math.round(100 * left) }) : "", v5: Number.isFinite(run.correlation) ? tr("; correlation between the data and the model's response {correlation}", { correlation: run.correlation.toFixed(2) }) : "", v6: left != null && (left < 0.5 ? tr(" The model explains most of the anomaly with these properties.") : left < 0.9 ? tr(" The model explains part of the anomaly.") : left <= 1.02 ? tr(" The model explains almost none of the anomaly.") : tr(" The model's response makes the fit WORSE than no model at all: its anomaly is in the wrong place or far too strong.")) })}</div>
      {geo && <div style={small}>{tr("{modelName}: {v}; background {background}. {cells} mesh cells carry the model.", { modelName: geo.modelName, v: geo.units.map((u) => tr("{unit} {value} (contrast {contrast})", { unit: u.label, value: u.value, contrast: (u.contrast >= 0 ? "+" : "") + +u.contrast.toPrecision(3) })).join(", "), background: geo.background, cells: run.modelCells.toLocaleString() })}</div>}
      {run.volumeRatio != null && run.volumeRatio < 0.9 && <div role="alert" style={{ ...small, color: "var(--color-danger-fg)" }}>{tr("Only {v}% of the model's contrast (by volume) is on the mesh below the ground — the rest is above the terrain or outside the mesh (widen the model depth or check the terrain).", { v: Math.round(100 * run.volumeRatio) })}</div>}
    </>
  );
}

function MisfitChart({ history, target }) {
  if (!history?.length) return null;
  const W = 250, H = 90, P = 26;
  const vals = history.map((h) => h.phi_d).concat(target);
  const lo = Math.log10(arrMin(vals)) - 0.1, hi = Math.log10(arrMax(vals)) + 0.1;
  const x = (i) => P + ((W - P - 6) * i) / Math.max(1, history.length - 1);
  const y = (v) => 6 + (H - 20) * (1 - (Math.log10(v) - lo) / (hi - lo || 1));
  const path = history.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(h.phi_d).toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} role="img" aria-label={tr("Data misfit by iteration, from {phi_d} to {phi_d2}; target {target}", { phi_d: history[0].phi_d.toFixed(0), phi_d2: history[history.length - 1].phi_d.toFixed(0), target: target.toFixed(0) })} style={{ display: "block", marginTop: 6 }}>
      <line x1={P} x2={W - 6} y1={y(target)} y2={y(target)} stroke="var(--color-text-muted)" strokeDasharray="4 3" />
      <text x={W - 8} y={y(target) - 3} textAnchor="end" style={{ fontSize: "var(--font-size-xs)", fill: "var(--color-text-muted)" }}>{tr("target")}</text>
      <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} />
      {history.map((h, i) => <circle key={i} cx={x(i)} cy={y(h.phi_d)} r={2.2} fill="var(--color-accent)" />)}
      <text x={2} y={12} style={{ fontSize: "var(--font-size-xs)", fill: "var(--color-text-muted)" }}>{tr("misfit (log)")}</text>
      <text x={W - 6} y={H - 2} textAnchor="end" style={{ fontSize: "var(--font-size-xs)", fill: "var(--color-text-muted)" }}>{tr("iteration {n}", { n: history.length })}</text>
    </svg>
  );
}

function DipSweep({ runs, unit }) {
  const W = 250, H = 90, P = 30;
  const r = runs.map((q) => q.rmsResidual);
  const lo = arrMin(r), hi = arrMax(r);
  const best = runs[r.indexOf(lo)];
  const spread = hi > 0 ? (hi - lo) / hi : 0;
  const x = (i) => P + ((W - P - 6) * i) / Math.max(1, runs.length - 1);
  const y = (v) => 6 + (H - 22) * (1 - (v - lo) / (hi - lo || 1));
  return (
    <>
      <svg width={W} height={H} role="img" aria-label={tr("Residual RMS by dip; lowest {lo} {unit} at {dip} degrees", { lo: lo.toFixed(2), unit, dip: best.dip })} style={{ display: "block", marginTop: 6 }}>
        <path d={runs.map((q, i) => `${i ? "L" : "M"}${x(i)},${y(q.rmsResidual)}`).join(" ")} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} />
        {runs.map((q, i) => <g key={i}><circle cx={x(i)} cy={y(q.rmsResidual)} r={2.2} fill="var(--color-accent)" /><text x={x(i)} y={H - 4} textAnchor="middle" style={{ fontSize: 8, fill: "var(--color-text-muted)" }}>{q.dip}°</text></g>)}
      </svg>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Best fit at {dip}° (residual RMS {lo} {unit}, after removing a best-fit base level of {v} {unit}). {v2}", { dip: best.dip, lo: lo.toFixed(2), unit, v: best.baseLevel?.toFixed(1), v2: spread < 0.05 ? tr("The curve is almost flat — these data cannot tell the dip of this body.") : tr("Residual varies {v}% across dips.", { v: (spread * 100).toFixed(0) }) })}
      </div>
    </>
  );
}

// Observed / predicted share one colour scale; residual is normalised by the uncertainty and diverging,
// fixed at +-3 (visual-design review). Stations are drawn as dots, never gridded, so gaps stay visible.
function PointMaps({ stations, observed, predicted, std, unit }) {
  const refs = [useRef(null), useRef(null), useRef(null)];
  const resid = useMemo(() => observed.map((o, i) => (std ? (o - predicted[i]) / std[i] : o - predicted[i])), [observed, predicted, std]);
  const rScale = useMemo(() => residualScale(resid, !!std), [resid, std]); // #537 — ±3σ, or ±P98 |residual| in data units
  useEffect(() => {
    const xs = stations.map((p) => p[0]), ys = stations.map((p) => p[1]);
    const x0 = arrMin(xs), x1 = arrMax(xs), y0 = arrMin(ys), y1 = arrMax(ys);
    const S = 78, pad = 4;
    const sc = Math.min((S - 2 * pad) / (x1 - x0 || 1), (S - 2 * pad) / (y1 - y0 || 1));
    const lo = Math.min(arrMin(observed), arrMin(predicted)), hi = Math.max(arrMax(observed), arrMax(predicted));
    const seq = sequentialStops(lo, hi, 9).map((s) => s.color);
    const div = divergingStops(3, 9).map((s) => s.color);
    const seqC = (v) => seq[Math.max(0, Math.min(8, Math.round(((v - lo) / (hi - lo || 1)) * 8)))];
    const divC = (v) => div[Math.max(0, Math.min(8, Math.round(((v + rScale) / (2 * rScale)) * 8)))];
    [[observed, seqC], [predicted, seqC], [resid, divC]].forEach(([vals, col], k) => {
      const c = refs[k].current;
      if (!c) return;
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, S, S);
      const r = Math.max(1, Math.min(3, 200 / Math.sqrt(stations.length)));
      stations.forEach((p, i) => { ctx.fillStyle = col(vals[i]); ctx.beginPath(); ctx.arc(pad + (p[0] - x0) * sc, S - pad - (p[1] - y0) * sc, r, 0, Math.PI * 2); ctx.fill(); });
    });
  }, [stations, observed, predicted, resid, rScale]); // #537 — std (via resid) was missing
  const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  const small = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" };
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
      {[[tr("Observed"), `${arrMin(observed).toFixed(1)}–${arrMax(observed).toFixed(1)} ${unit}`], [tr("Predicted"), `${arrMin(predicted).toFixed(1)}–${arrMax(predicted).toFixed(1)} ${unit}`], [std ? tr("Residual / σ") : tr("Residual"), std ? tr("RMS {v}, ±3 scale", { v: rms(resid).toFixed(2) }) : tr("RMS {v} {unit}, ±{rScale} scale", { v: rms(resid).toFixed(2), unit, rScale: rScale.toPrecision(2) })]].map(([t, cap], k) => (
        <figure key={t} style={{ margin: 0, textAlign: "center" }}>
          <canvas ref={refs[k]} width={78} height={78} role="img" aria-label={tr("{t} map: {cap}", { t, cap })} style={{ border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)" }} />
          <figcaption style={small}>{t}<br />{cap}</figcaption>
        </figure>
      ))}
    </div>
  );
}
