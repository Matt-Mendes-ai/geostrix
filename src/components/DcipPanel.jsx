// TASKS.csv #322 — 2D DC resistivity / IP inversion of one survey line (SimPEG, in the Python engine).
// Import a line CSV (electrode positions along the line + apparent resistivity [+ chargeability]), place the
// line by its start / end coordinates, state the data uncertainty (never assumed), invert. Results: a
// section view here, and block models (resistivity, chargeability) along the line in the 3D view.
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Upload, Play, Download, Trash2 } from "./icons.js";
import Papa from "papaparse";
import { useStore, useSetTaskProgress } from "../lib/store.jsx";
import { parseTableFile, decodeTableBytes } from "../lib/tabular.js";
import { guessDcipColumns, parseDcipRows, parseDcipWhitespaceText, lineGeometry, lineFromTwoPoints, terrainProfile, slopeToHorizontalFromProfile, slopeToHorizontalFromStations, readingsToHorizontal, pseudoPositions, dataFitRows, worstReadings, sectionCells, slimDcipResult, savedLineToFile, sectionTableRows, suggestModelDepth, deepestPseudoDepth, columnReach, smoothReachLine } from "../lib/dcip.js";
import { renderDcipSectionPng } from "../lib/dcipSectionImage.js";
import { stampLines, withStamp } from "../lib/provenance.js";
import { version as APP_VERSION } from "../../package.json";
import { logStops, sequentialStops, divergingStops, fitVerdict } from "../lib/inversion.js";
import { subscribeInversionJob, startInversionJob, cancelInversionJob } from "../lib/inversionJobs.js";
import { pythonHealth, ensureSidecarUp, saveFile } from "../lib/desktop.js";
import { colorForVoxelValue } from "../lib/layers.js";
import { arrMin, arrMax } from "../lib/arrayStats.js";
import { HATCH } from "../lib/supportHatch.js"; // TASKS.csv #535
import { supportEnvelope } from "../lib/supportEnvelope.js"; // TASKS.csv #641
import DcipMergePanel from "./DcipMergePanel.jsx"; // TASKS.csv #640
import { percentile } from "../lib/sectionMerge.js";
import { parseStationFile, matchStationLine, fitStationLine, stationGroundProfile } from "../lib/dcipStations.js";
import { reprojectXY, getProj4DefSync } from "../lib/reproject.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

const num = (v) => (v === "" || v == null ? NaN : Number(v));
// TASKS.csv #581 — the IP inversion's own verdict (fitVerdict on its phi_d; older saved sections have no reachedTarget,
// fitVerdict then judges by the ratio)
// TASKS.csv #682 — the IP inversion is linearised about the RECOVERED resistivity model, so when that model did not fit,
// a "reached the target" on chargeability says nothing (115N with scrambled pairing: DC 11.8x unreached, IP 0.99x
// "reached", chargeability peak 238.6 mV/V against 14.3 on the fitted model). Then the IP verdict is not "ok" either.
const ipFitOf = (result) => {
  const v = fitVerdict({ phi_d: result.ip.phi_d, target: result.target, reachedTarget: result.ip.reachedTarget, iterations: result.ip.iterations ?? result.ip.history?.length ?? 0, fitChoice: result.ip.fitChoice });
  const dc = fitVerdict(result);
  if (dc.level === "under" || dc.level === "close") { // not "over": an over-fitted resistivity model still explains the data
    return { level: "dc-unfitted", chi: +v.chi.toFixed(3), reachedTarget: false, dcUnfitted: true,
      verdict: `computed on a resistivity model that did not fit the data, so treat it as unfinished as well (its own misfit: ${v.chi.toFixed(2)}x the target).` };
  }
  return { level: v.level, chi: +v.chi.toFixed(3), reachedTarget: v.level === "ok", verdict: v.text };
};
const FIELDS = [["a", "A (current)"], ["b", "B (current; blank = pole)"], ["m", "M (potential)"], ["n", "N (potential; blank = pole)"], ["rho", "Apparent resistivity (ohm·m)"], ["ip", "Chargeability (mV/V, optional)"], ["err", "Reading error (optional)"]];

export default function DcipPanel({ pBtn, numInput }) {
  const { terrain, project, addVoxelModelToTab, getProjectToken, dcipLines, saveDcipLine, removeDcipLine } = useStore();
  const setTaskProgress = useSetTaskProgress();
  const fileRef = useRef(null);
  const stationRef = useRef(null);
  const [stationFile, setStationFile] = useState(null); // #602 — { name, lines, epsg, crsNote, other } awaiting a line choice
  const [engine, setEngine] = useState(null);
  const [file, setFile] = useState(null); // { name, headers, rows }
  const [mapping, setMapping] = useState({});
  // #602 — scale: chaining scale ("" = 1); stations: { file, line, list: [{s, x, y, z}] } from a station / GPS file
  const [line, setLine] = useState({ x0: "", y0: "", x1: "", y1: "", ground: "", scale: "", stations: null });
  const [opts, setOpts] = useState({ cell: "", depth: "", pct: "", floor: "", ipPct: "", ipFloor: "", maxIter: 20, supportCutoff: 0.02, voxObserved: true, voxExtrapolated: false, doi: false }); // vox*: #683 follow-up; doi: #772
  const [msg, setMsg] = useState(null);
  const [job, setJob] = useState(null);
  const [last, setLast] = useState(null); // { result, geom, name, restored? }
  const [pick, setPick] = useState("");

  useEffect(() => subscribeInversionJob((j) => setJob(j ? { ...j } : null)), []);
  useEffect(() => {
    let alive = true;
    ensureSidecarUp().then(pythonHealth).then((h) => { if (alive) setEngine({ ok: h.ok, available: !!h.capabilities?.dcip2d?.available, simpeg: h.capabilities?.dcip2d?.simpeg }); });
    return () => { alive = false; };
  }, []);

  const parsed = useMemo(() => (file && mapping.a && mapping.m && mapping.rho ? parseDcipRows(file.rows, mapping) : null), [file, mapping]);
  const geom = useMemo(() => { const g = [line.x0, line.y0, line.x1, line.y1].map(num); return g.every(Number.isFinite) ? lineGeometry([g[0], g[1]], [g[2], g[3]], num(line.scale) || 1) : null; }, [line]);
  // TASKS.csv #634 — Matt: "We shouldn't have to try to figure out which coordinates to enter. The app should point to
  // the user which points are which". The stored start (x0/y0) is POSITION 0 on the line — usually a point nobody
  // surveyed (line 9000E starts at station 800). So the line is typed as two points the user can look up: by default
  // the first and last electrode positions in the data file, each with its x / y (e.g. waypoints "9000E 800N" and
  // "9000E 2100N"). Placed lines (station file, saved line) show the same two points, computed, so they can be checked.
  const span = parsed?.span || null;
  const shownPts = useMemo(() => {
    if (line.pts) return line.pts;
    const r = (v) => String(+v.toFixed(1));
    const s1 = span ? span[0] : "", s2 = span ? span[1] : "";
    if (geom && span) { const a = geom.at(s1), b = geom.at(s2); return { s1, x1: r(a[0]), y1: r(a[1]), s2, x2: r(b[0]), y2: r(b[1]) }; }
    return { s1, x1: "", y1: "", s2, x2: "", y2: "" };
  }, [line.pts, geom, span]);
  const setPt = (k, v) => {
    const pts = { ...shownPts, [k]: v };
    const L = lineFromTwoPoints(pts);
    const r = (x) => String(+x.toFixed(2));
    setLine((l) => ({ ...l, pts, ...(L ? { x0: r(L.x0), y0: r(L.y0), x1: r(L.x1), y1: r(L.y1), scale: Math.abs(L.scale - 1) > 0.002 ? String(+L.scale.toFixed(4)) : "" } : {}) }));
  };
  const ptScaleOff = line.pts && geom && Math.abs(geom.scale - 1) > 0.05 ? geom.scale : null;
  const running = job?.status?.state === "running";

  const onFile = async (f) => {
    if (!f) return;
    try {
      let t = await parseTableFile(f);
      // TASKS.csv #600 — contractor TDIP files (.dat / .ipg): metadata lines, then a whitespace-separated table
      if (!guessDcipColumns(t.headers).a || !guessDcipColumns(t.headers).m) {
        const w = parseDcipWhitespaceText(decodeTableBytes(await f.arrayBuffer()).text);
        if (w) t = { headers: w.headers, rows: w.rows, note: w.note };
      }
      const m = guessDcipColumns(t.headers);
      // TASKS.csv #634 — a different line's file starts unplaced: the previous line's position (and stations) used to
      // carry over, silently putting e.g. 8575E on 9000E's coordinates. Reloading the same file keeps it.
      if (f.name !== file?.name) setLine((l) => ({ x0: "", y0: "", x1: "", y1: "", ground: "", scale: "", stations: null, pts: null, positions: l.positions }));
      setFile({ name: f.name, headers: t.headers, rows: t.rows });
      setMapping(m);
      const p = m.a && m.m && m.rho ? parseDcipRows(t.rows, m) : null;
      if (p?.spacing) setOpts((o) => ({ ...o, cell: o.cell || String(+(p.spacing / 2).toFixed(2)), depth: o.depth || String(suggestModelDepth(p.readings, p.span, p.spacing / 2)) })); // #680
      setMsg(p ? { ok: true, text: `${f.name}: ${p.readings.length} readings (${p.array}), electrodes ${p.span[0]}–${p.span[1]} m, smallest spacing ${p.spacing} m${p.ip ? ", with chargeability" : ""}${p.skipped ? `; ${p.skipped} row(s) skipped (missing A/M, non-positive resistivity${m.ip ? " or no chargeability" : ""})` : ""}.${t.note ? " " + t.note : ""}` }
        : { ok: false, text: "Map the A, M and apparent-resistivity columns below." });
    } catch (e) { setMsg({ ok: false, text: tr("Could not read {name}: {message}", { name: f.name, message: e.message }) }); }
  };

  // TASKS.csv #322 — keep the line (normalised readings + placement + settings) in the project file
  const lineName = file ? file.name.replace(/\.(csv|txt|dat|ipg)$/i, "") : "";
  const keepLine = (extra = {}) => saveDcipLine({ name: lineName, readings: parsed.readings, rho: parsed.rho, ip: parsed.ip, ...(parsed.err ? { err: parsed.err } : {}), line: { ...line }, opts: { ...opts }, savedAt: new Date().toISOString(), ...extra });
  const loadSaved = (id) => {
    const e = dcipLines.find((l) => l.id === id);
    if (!e) return;
    const { file: f, mapping: m } = savedLineToFile(e);
    setFile(f); setMapping(m); setLine({ x0: "", y0: "", x1: "", y1: "", ground: "", scale: "", stations: null, ...e.line }); setOpts((o) => ({ ...o, ...e.opts }));
    const sl = e.section?.line;
    const sg = sl ? lineGeometry([sl.x0, sl.y0].map(Number), [sl.x1, sl.y1].map(Number), Number(sl.scale) || 1) : null;
    setLast(e.section && sg ? { result: e.section.result, geom: sg, name: e.name, restored: e.section.ranAt, thick: Number(e.section.opts?.cell) || Number(e.opts?.cell) || null, obs: { readings: e.readings, rho: e.rho, ip: e.ip } } : null); // obs: #683
    setMsg({ ok: true, text: tr("{name}: {readings} readings from the project{v}.", { name: e.name, readings: e.readings.length, v: e.section ? tr(", with its last inverted section") : "" }) });
  };

  // TASKS.csv #602 — a station / GPS file: pick this line's stations, reproject them into the project CRS when the file
  // names its own (GPS Utility: UTM zone + WGS 84), fit the line (start / end / chaining scale) and keep the
  // elevations as the ground profile.
  const applyStations = (sf, lineKey) => {
    setStationFile(null);
    let list = sf.lines[lineKey].map((p) => ({ s: p.s, x: p.x, y: p.y, z: p.z }));
    let crsText = sf.crsNote ? ` (${sf.crsNote})` : "";
    const dst = Number(project?.epsg);
    if (sf.epsg && dst && sf.epsg !== dst) {
      if (getProj4DefSync(sf.epsg) && getProj4DefSync(dst)) {
        list = list.map((p) => { const q = reprojectXY(p.x, p.y, sf.epsg, dst); return q ? { ...p, x: q.x, y: q.y } : p; });
        crsText = tr(" (reprojected EPSG:{epsg} → EPSG:{dst})", { epsg: sf.epsg, dst });
      } else crsText = tr(" (EPSG:{epsg} could not be reprojected — taken as EPSG:{dst})", { epsg: sf.epsg, dst });
    }
    const fit = fitStationLine(list);
    if (!fit) { setMsg({ ok: false, text: tr("{name}: line {lineKey} needs at least two stations at different distances to place it.", { name: sf.name, lineKey }) }); return; }
    const r1 = (v) => String(+v.toFixed(1));
    const scale = Math.abs(fit.scale - 1) > 0.002 ? String(+fit.scale.toFixed(4)) : "";
    setLine((l) => ({ ...l, x0: r1(fit.start[0]), y0: r1(fit.start[1]), x1: r1(fit.end[0]), y1: r1(fit.end[1]), scale, pts: null, stations: { file: sf.name, line: lineKey, list } })); // #634 pts null: the two points shown are re-derived from the fit
    const zs = list.filter((p) => Number.isFinite(p.z)).map((p) => p.z);
    const scaleText = scale ? tr(fit.scale < 1 ? " Chaining scale {scale}: the file's distances are {v}% longer than the ground between the stations (slope chaining?) — applied to the 3D placement only." : " Chaining scale {scale}: the file's distances are {v}% shorter than the ground between the stations (slope chaining?) — applied to the 3D placement only.", { scale, v: Math.abs((1 / fit.scale - 1) * 100).toFixed(1) }) : "";
    const sp = parsed?.span;
    const reach = sp && (sp[0] < list[0].s || sp[1] > list[list.length - 1].s) ? ` Electrodes ${sp[0]}–${sp[1]} m reach past the stations (${list[0].s}–${list[list.length - 1].s} m).` : "";
    setMsg({ ok: true, text: tr("{name}: line {lineKey}, {list} stations {s}–{s2} m{crsText}. Placed by a best fit, azimuth {azimuth}°; stations sit within {maxAcross} m of the line.{scaleText}{v}{reach}{v2}", { name: sf.name, lineKey, list: list.length, s: list[0].s, s2: list[list.length - 1].s, crsText, azimuth: fit.azimuth.toFixed(1), maxAcross: fit.maxAcross.toFixed(1), scaleText, v: zs.length >= 2 ? tr(" Ground profile from {zs} station elevations ({v}–{v2} m).", { zs: zs.length, v: arrMin(zs).toFixed(1), v2: arrMax(zs).toFixed(1) }) : tr(" The file has no elevations — terrain or the flat ground is used."), reach, v2: sf.other?.length ? tr(" Not stations: {v}.", { v: sf.other.map((o) => (/infin/i.test(o.name) ? tr("{name} (the remote \"infinite\" current electrode, for pole arrays)", { name: o.name }) : o.name)).join(", ") }) : "" }) });
  };
  const onStationFile = async (f) => {
    if (!f) return;
    try {
      const sf = { name: f.name, ...parseStationFile(decodeTableBytes(await f.arrayBuffer()).text, f.name) };
      const keys = Object.keys(sf.lines);
      const hints = [lineName, ...(file?.rows || []).slice(0, 3).flatMap((r) => Object.values(r))];
      const k = matchStationLine(keys, ...hints);
      if (k != null) applyStations(sf, k);
      else { setStationFile(sf); setMsg({ ok: true, text: tr("{name} has {keys} lines and none is named like \"{lineName}\" — choose this line's stations.", { name: f.name, keys: keys.length, lineName }) }); }
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  };

  const run = async () => {
    const problems = [];
    if (!parsed || !parsed.readings.length) problems.push(tr("Import a line with A, M and apparent-resistivity columns."));
    if (!geom) problems.push(tr("Place the line: load its GPS / station file, or type two points on it (position and x / y)."));
    if (!(num(opts.cell) > 0) || !(num(opts.depth) > num(opts.cell))) problems.push(tr("Enter the cell size and model depth."));
    if (!(num(opts.pct) > 0) && !(num(opts.floor) > 0)) problems.push(tr("Enter the resistivity data uncertainty (% and / or a floor) — how far you trust each reading."));
    if (parsed?.ip && !(num(opts.ipPct) > 0) && !(num(opts.ipFloor) > 0)) problems.push(tr("Enter the chargeability uncertainty (% and / or a floor in mV/V)."));
    // TASKS.csv #564 — a percent of 0 mV/V is 0: that reading would get zero uncertainty (infinite weight)
    else if (parsed?.ip && !(num(opts.ipFloor) > 0) && parsed.ip.some((v) => !(Math.abs(v) > 0))) problems.push(tr("{n} chargeability reading(s) are 0 mV/V: a percent alone gives them no uncertainty. Enter a floor in mV/V as well.", { n: parsed.ip.filter((v) => !(Math.abs(v) > 0)).length }));
    let topo = null, groundNote = "", readingsH = parsed?.readings, posNote = "", lineGeom = geom;
    if (parsed && geom) {
      const st = line.stations?.list || [];
      // TASKS.csv #539 — positions chained along the ground: convert them to horizontal distance first (from the
      // surveyed stations' true positions when there are any, else by integrating along the terrain profile); the
      // 3D placement then uses horizontal metres directly (scale 1 — the conversion replaces the chaining scale).
      let fSt = null;
      if (line.positions === "slope") {
        lineGeom = lineGeometry([num(line.x0), num(line.y0)], [num(line.x1), num(line.y1)], 1);
        let f = st.length >= 2 ? slopeToHorizontalFromStations(st, [num(line.x0), num(line.y0)], lineGeom.u) : null;
        if (f) { fSt = f; posNote = tr("slope distances converted to horizontal from the surveyed stations"); }
        else if (terrain) {
          const a = Math.min(0, parsed.span[0]) - 50, b = parsed.span[1] + 50;
          const prof = terrainProfile(terrain, lineGeom, a, b, 400);
          if (prof) { f = slopeToHorizontalFromProfile(prof); posNote = tr("slope distances converted to horizontal along the terrain"); }
        }
        if (!f) problems.push(tr("Positions chained along the ground need the ground's shape to convert them: load the line stations (with coordinates) or a terrain under the line."));
        else { const c = readingsToHorizontal(parsed.readings, f); readingsH = c.readings; posNote += tr(" (largest shift {maxShift} m)", { maxShift: c.maxShift.toFixed(1) }); }
      }
      const flatH = readingsH.flat().filter((v) => v != null);
      const spanH = [arrMin(flatH), arrMax(flatH)];
      const pad = (spanH[1] - spanH[0]) * 0.5 + 50;
      // #602 — the surveyed station elevations first (the ground the electrodes sat on), then terrain, then flat
      const stH = fSt ? st.map((p) => ({ ...p, s: fSt(p.s) })) : st;
      const stTopo = stationGroundProfile(stH, spanH[0] - pad, spanH[1] + pad);
      if (stTopo) {
        topo = stTopo;
        const zs = stH.filter((p) => Number.isFinite(p.z)), s0 = Math.round(zs[0].s), s1 = Math.round(zs[zs.length - 1].s);
        const beyond = spanH[0] < s0 || spanH[1] > s1 ? `; electrodes ${Math.round(spanH[0])}–${Math.round(spanH[1])} m reach past the stations (${s0}–${s1} m), held at the end elevations there` : "";
        groundNote = tr("ground from {zs} station elevations ({file}, line {line}){beyond}", { zs: zs.length, file: line.stations.file, line: line.stations.line, beyond });
      } else if (terrain && (topo = terrainProfile(terrain, lineGeom, spanH[0] - pad, spanH[1] + pad))) {
        groundNote = tr("ground from the terrain along the line");
      } else if (Number.isFinite(num(line.ground))) {
        topo = [[spanH[0] - pad, num(line.ground)], [spanH[1] + pad, num(line.ground)]];
        groundNote = tr("flat ground at {v} m (entered)", { v: num(line.ground) });
      } else problems.push(terrain ? tr("The line leaves the terrain surface — enter a flat ground elevation instead.") : tr("Load a terrain (Geophysics > Terrain), the line stations, or enter a flat ground elevation for the line."));
      if (posNote) groundNote += `; ${posNote}`;
    }
    if (problems.length) { setMsg({ ok: false, text: problems.join(" ") }); return; }
    const request = {
      readings: readingsH, rho: parsed.rho, ...(parsed.ip ? { chargeability: parsed.ip } : {}), topo, // #539 — horizontal positions
      mesh: { cell: num(opts.cell), depth: num(opts.depth) }, maxIter: Number(opts.maxIter) || 20,
      geometricFactor: opts.geomFactor || "flat", // TASKS.csv #580
      ...(opts.doi ? { doi: true } : {}), // TASKS.csv #772
      // #683 — the file's own error column as a per-reading floor, once the user has said what it measures
      uncertainty: { percent: num(opts.pct) || 0, floor: num(opts.floor) || 0, ...(parsed.err && opts.errKind === "rhoPct" ? { floorPerReadingPercent: parsed.err } : {}) },
      ...(parsed.ip ? { ipUncertainty: { percent: num(opts.ipPct) || 0, floor: num(opts.ipFloor) || 0, ...(parsed.err && opts.errKind === "ipMvV" ? { floorPerReadingMvV: parsed.err } : {}) } } : {}),
    };
    const name = lineName;
    keepLine();
    const lineAtRun = { ...line, ...(line.positions === "slope" ? { scale: "" } : {}) }, ranOpts = { ...opts }; // #539 — the section is in horizontal metres
    const meta = { label: `DC/IP inversion (${name})` };
    const params = {
      tool: "2D DC resistivity / IP inversion (SimPEG)", line: name, readings: parsed.readings.length, array: parsed.array,
      lineStart: [num(line.x0), num(line.y0)], lineEnd: [num(line.x1), num(line.y1)], lineAzimuth: +lineGeom.azimuth.toFixed(2), ground: groundNote,
      positions: line.positions === "slope" ? "chained along the ground (slope), converted to horizontal" : "horizontal distances", // #539
      ...(lineGeom.scale !== 1 ? { chainingScale: lineGeom.scale } : {}), ...(line.stations ? { stations: `${line.stations.list.length} from ${line.stations.file} (line ${line.stations.line})` } : {}),
      mesh: { cellM: num(opts.cell), depthM: num(opts.depth), verticalCellM: num(opts.cell) / 2 },
      geometricFactor: (opts.geomFactor || "flat") === "flat" ? "flat ground (the file's apparent resistivities use nominal electrode spacings)" : "electrodes on the topography (the file's apparent resistivities are already topography-corrected)", // #580
      uncertainty: { resistivityPercent: num(opts.pct) || 0, resistivityFloor: num(opts.floor) || 0, ...(parsed.ip ? { chargeabilityPercent: num(opts.ipPct) || 0, chargeabilityFloorMvV: num(opts.ipFloor) || 0 } : {}), source: parsed.err && (opts.errKind === "rhoPct" || (opts.errKind === "ipMvV" && parsed.ip)) ? `entered by user; per-reading floor from the file's column ${mapping.err} (${opts.errKind === "rhoPct" ? "resistivity error, %" : "chargeability error, mV/V"})` : "entered by user" },
      crs: `EPSG:${project?.epsg}`, interpretation: "One smooth model that fits the data to the stated uncertainty (2.5D: the ground is assumed not to change along strike, across the line). Deep and edge cells are poorly constrained — see the support.",
    };
    const token = getProjectToken();
    const res = await startInversionJob(request, meta, {
      kind: "dcip2d", setTaskProgress,
      onDone: (result) => {
        setLast({ result, geom: lineGeom, name, thick: num(opts.cell), obs: { readings: parsed.readings, rho: parsed.rho, ip: parsed.ip } }); // obs: #683 — for the data-fit view
        saveDcipLine({ name, section: { result: slimDcipResult(result), line: lineAtRun, opts: ranOpts, ranAt: new Date().toISOString() } });
        const runParams = { ...params, fit: { phiD: result.phi_d, target: result.target, reachedTarget: result.reachedTarget, iterations: result.history?.length }, versions: result.versions, generatedAt: new Date().toISOString(), runSeconds: Math.round(result.seconds) };
        // #683 follow-up — the observed and / or the extrapolated voxel, as chosen under "3D voxels"
        const kinds = [opts.voxObserved !== false && "observed", opts.voxExtrapolated && "extrapolated"].filter(Boolean);
        lineVoxelModels(result, lineGeom, { name, thick: num(opts.cell), cut: Number(opts.supportCutoff) || 0, params: runParams, kinds }).forEach((m) => addVoxelModelToTab(token, m));
      },
    });
    if (!res.ok) setMsg({ ok: false, text: res.error });
    else setMsg({ ok: true, text: tr("Inverting {readings} readings ({groundNote})…", { readings: parsed.readings.length, groundNote }) });
  };

  const small = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
  const row = { display: "flex", alignItems: "center", gap: 6, marginTop: 5 };
  const lbl = { width: 104, flexShrink: 0, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
  const inp = { ...numInput, width: 78, flex: "0 1 78px", minWidth: 0 }; // #602 — shrinks in a narrow sidebar (two of them overflowed it)

  return (
    <div style={{ fontSize: "var(--font-size-sm)" }}>
      {engine && !engine.available && <div style={{ ...small, color: "var(--color-danger-fg)", marginBottom: 8 }}>{tr("Needs GeoStrix's Python engine with SimPEG (status bar: Py).")}</div>}
      <div style={small}>{tr("One survey line: electrode positions A, B, M, N as distances along the line (m; B or N blank for a pole), apparent resistivity (ohm·m) and optionally chargeability (mV/V). 2.5D: the ground is assumed not to change across the line.")}</div>
      <button onClick={() => fileRef.current?.click()} style={{ ...pBtn, marginTop: 8 }} title={tr("A CSV, or a contractor TDIP line file (.dat / .ipg: T1X T2X R1X R2X ... RHO ... MX, '*' = electrode at infinity)")}><Upload size={14} />{" "}{tr("Import line (CSV / .dat)…")}</button>
      {dcipLines.length > 0 && (
        <div style={row}>
          <select value={pick} onChange={(e) => { setPick(e.target.value); if (e.target.value) loadSaved(e.target.value); }} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label={tr("Lines saved in the project")}>
            <option value="">{tr("Lines in this project ({dcipLines})…", { dcipLines: dcipLines.length })}</option>
            {dcipLines.map((l) => <option key={l.id} value={l.id}>{tr("{name} — {readings} readings{v}", { name: l.name, readings: l.readings.length, v: l.section ? tr(", inverted") : "" })}</option>)}
          </select>
          {pick && <button onClick={() => { removeDcipLine(pick); setPick(""); }} title={tr("Remove this line from the project")} aria-label={tr("Remove saved line")} style={{ ...pBtn, width: "auto", padding: "3px 6px" }}><Trash2 size={14} /></button>}
        </div>
      )}
      <input ref={fileRef} type="file" accept=".csv,.txt,.dat,.ipg" style={{ display: "none" }} onChange={(e) => { onFile(e.target.files[0]); e.target.value = ""; }} />
      {file && (
        <div style={{ marginTop: 8 }}>
          {FIELDS.map(([k, label]) => (
            <div key={k} style={row}>
              <span style={lbl}>{tr(label)}</span>
              <select value={mapping[k] || ""} onChange={(e) => setMapping((m) => ({ ...m, [k]: e.target.value || undefined }))} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label={tr(label)}>
                <option value="">{k === "b" || k === "n" ? tr("(none — pole)") : k === "ip" ? tr("(none)") : tr("(choose)")}</option>
                {file.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
          {parsed?.err && (
            // TASKS.csv #683 — what a receiver writes in its error column differs (IRIS-style SD: the deviation of the
            // chargeability or of the voltage between stacks), so GeoStrix does not guess: it is used only once chosen
            <div style={row} title={tr("Used as a per-reading floor: each reading's uncertainty is your percent plus the larger of your floor and the file's own error, so noisy readings weigh less. Check the receiver's manual for what this column holds.")}>
              <span style={lbl}>{tr("{err} column is", { err: mapping.err })}</span>
              <select value={opts.errKind || ""} onChange={(e) => setOpts((o) => ({ ...o, errKind: e.target.value || undefined }))} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label={tr("What the error column measures")}>
                <option value="">{tr("(choose — not used until you do)")}</option>
                <option value="rhoPct">{tr("the resistivity error, in % of the reading")}</option>
                {parsed.ip && <option value="ipMvV">{tr("the chargeability error, in mV/V")}</option>}
              </select>
            </div>
          )}
          {parsed?.readings.length > 0 && <Pseudosection parsed={parsed} />}
          {parsed?.readings.length > 0 && (
            <button onClick={() => { keepLine(); setMsg({ ok: true, text: tr("{lineName} kept in the project (saved with it; also kept automatically when you invert).", { lineName }) }); }} style={{ ...pBtn, marginTop: 6 }}
              title={tr("Store the readings, line position and settings in the project file, so the line can be reloaded and re-inverted without the CSV.")}>{tr("Keep line in project")}</button>
          )}
          <div className="ge-section-label" style={{ marginTop: 10 }}>{tr("Line position (project CRS)")}</div>
          <div style={{ ...small, marginBottom: 4 }}>{tr("Easiest: load the survey's GPS or station file — GeoStrix finds line {lineName}'s stations, places the line and takes the ground elevations from them.", { lineName })}</div>
          <button onClick={() => stationRef.current?.click()} style={{ ...pBtn, marginTop: 6 }} title={tr("GPS waypoints named '<line> <station>' (e.g. GPS Utility '8575E 750N'), or a table with station, X, Y and optionally elevation: places the line and gives the ground profile")}><Upload size={14} />{" "}{tr("Load the line stations (GPS / station file)…")}</button>
          <input ref={stationRef} type="file" accept=".txt,.csv,.dat,.gpx,.wpt,.xyz" style={{ display: "none" }} onChange={(e) => { onStationFile(e.target.files[0]); e.target.value = ""; }} />
          {stationFile && (
            <div style={row}>
              <span style={lbl}>{tr("Which line?")}</span>
              <select value="" onChange={(e) => e.target.value && applyStations(stationFile, e.target.value)} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label={tr("Station file line")}>
                <option value="">{tr("{n} lines in {name}…", { n: Object.keys(stationFile.lines).length, name: stationFile.name })}</option>
                {Object.entries(stationFile.lines).map(([k, v]) => <option key={k} value={k}>{tr("{v} — {v2} stations", { v: k || tr("(no line name)"), v2: v.length })}</option>)}
              </select>
            </div>
          )}
          {line.stations && (
            <div style={{ ...small, display: "flex", gap: 6, alignItems: "baseline" }}>
              <span style={{ flex: 1 }}>{tr("Stations: {list} from {file} (line {line}){v}.", { list: line.stations.list.length, file: line.stations.file, line: line.stations.line, v: line.stations.list.some((p) => Number.isFinite(p.z)) ? tr(" — used as the ground profile") : tr(" — no elevations") })}</span>
              <button onClick={() => setLine((l) => ({ ...l, stations: null }))} style={{ ...pBtn, width: "auto", padding: "2px 6px", marginBottom: 0 }} title={tr("Stop using the station elevations (the placement stays)")}>{tr("Clear")}</button>
            </div>
          )}
          <div style={{ ...small, margin: "6px 0 4px" }}>{tr("Or type two points on the line: the position in the data file and that point's x / y in the project's coordinate system{v} — from the GPS file, a map or the field notes.{v2}", { v: project?.epsg ? ` (EPSG:${project.epsg})` : "", v2: span ? tr(" Already filled with the first and last electrode ({v} and {v2} m) — look up those two stations.", { v: span[0], v2: span[1] }) : "" })}</div>
          {[["1", "s1", "x1", "y1", span && Number(shownPts.s1) === span[0] ? tr("first electrode") : ""], ["2", "s2", "x2", "y2", span && Number(shownPts.s2) === span[1] ? tr("last electrode") : ""]].map(([n, sk, xk, yk, tag]) => (
            <div key={n} style={row} title={tr("Point {n}: its position along the line in the data file's distances, and its coordinates in the project CRS.", { n })}>
              <span style={lbl}>{tr("Point {n}", { n })}{tag ? <span style={{ color: "var(--color-text-muted)" }}> ({tag})</span> : null}</span>
              <input type="number" value={shownPts[sk]} onChange={(e) => setPt(sk, e.target.value)} style={{ ...inp, width: 64, flex: "0 0 auto" }} aria-label={tr("Point {n} position along the line (m)", { n })} placeholder="m" />
              <input type="number" value={shownPts[xk]} onChange={(e) => setPt(xk, e.target.value)} style={inp} aria-label={tr("Point {n} x", { n })} placeholder="x" />
              <input type="number" value={shownPts[yk]} onChange={(e) => setPt(yk, e.target.value)} style={inp} aria-label={tr("Point {n} y", { n })} placeholder="y" />
            </div>
          ))}
          {geom && <div style={small}>{tr("Line placed: azimuth {azimuth}° (grid){v}.{v2}", { azimuth: geom.azimuth.toFixed(1), v: span ? tr("; electrodes {v}–{v2} m run from {v3} to {v4}", { v: span[0], v2: span[1], v3: geom.at(span[0]).map((v) => v.toFixed(0)).join(", "), v4: geom.at(span[1]).map((v) => v.toFixed(0)).join(", ") }) : "", v2: line.stations ? "" : tr(" Check these against your GPS file or map.") })}</div>}
          {/* TASKS.csv #712 — a chaining scale from the stations was applied silently (Woodjam 109N / 112N, 3 %): said whenever the line is shown */}
          {!line.pts && Number(line.scale) > 0 && Math.abs(Number(line.scale) - 1) > 0.01 && (
            <div style={{ ...small, color: "var(--color-warn-text)" }}>{tr(Number(line.scale) < 1 ? "Chaining scale {v}: the file's electrode distances are {v2}% longer than the ground between the stations{v4}. The 3D section is stretched to fit the stations; the inversion uses the file's distances{v5}." : "Chaining scale {v}: the file's electrode distances are {v2}% shorter than the ground between the stations{v4}. The 3D section is stretched to fit the stations; the inversion uses the file's distances{v5}.", { v: Number(line.scale).toFixed(3), v2: Math.abs((1 / Number(line.scale) - 1) * 100).toFixed(1), v4: line.fitRmsM != null ? tr(" (station scatter rms {fitRmsM} m)", { fitRmsM: line.fitRmsM }) : "", v5: (line.positions || "horizontal") === "horizontal" ? tr(" — if they were chained along the slope, set the electrode positions below to “chained along the ground (slope)”") : "" })}</div>
          )}
          {ptScaleOff && <div style={{ ...small, color: "var(--color-warn-text)" }}>{tr(ptScaleOff > 1 ? "The two points are {v}% further apart than their positions say — check the positions and coordinates (or the distances were chained along a slope)." : "The two points are {v}% closer together than their positions say — check the positions and coordinates (or the distances were chained along a slope).", { v: Math.abs((ptScaleOff - 1) * 100).toFixed(0) })}</div>}
          <div style={row} title={tr("How the electrode distances in the file were measured. Chained along the ground on a slope, they are longer than the horizontal distance (cos 30° = 0.87): converted using the line stations, or the terrain.")}><span style={lbl}>{tr("Positions are")}</span>
            <select value={line.positions || "horizontal"} onChange={(e) => setLine((l) => ({ ...l, positions: e.target.value }))} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label={tr("Electrode position convention")}>
              <option value="horizontal">{tr("horizontal distances")}</option>
              <option value="slope">{tr("chained along the ground (slope)")}</option>
            </select>
          </div>
          <div style={row} title={tr("Ground metres per metre of the file's distances (from a station fit; blank = 1). Moves the section in 3D only — the inversion uses the file's distances.")}><span style={lbl}>{tr("Chaining scale")}</span><input type="number" step={0.001} value={line.scale} placeholder="1" disabled={line.positions === "slope"} onChange={(e) => setLine((l) => ({ ...l, scale: e.target.value }))} style={inp} aria-label={tr("Chaining scale")} />{line.positions === "slope" && <span style={small}>{tr("not used — slope positions are converted")}</span>}</div>
          <div style={row} title={tr("Used when there are no station elevations and no terrain under the line.")}><span style={lbl}>{tr("Flat ground (m)")}</span><input type="number" value={line.ground} onChange={(e) => setLine((l) => ({ ...l, ground: e.target.value }))} style={inp} aria-label={tr("Flat ground elevation")} /><span style={small}>{line.stations?.list.some((p) => Number.isFinite(p.z)) ? tr("not used — station elevations") : terrain ? tr("only if the line leaves the terrain") : tr("no terrain loaded")}</span></div>
          <div className="ge-section-label" style={{ marginTop: 10 }}>{tr("Inversion")}</div>
          <div style={row} title={tr("Horizontal cell size; half the smallest electrode spacing is a good start (vertical cells are half this). Model depth starts at 0.3 x the largest current-to-potential separation (how deep the array can see), at most a quarter of the line: deeper cells only add run time.")}><span style={lbl}>{tr("Cell / depth (m)")}</span><input type="number" value={opts.cell} onChange={(e) => setOpts((o) => ({ ...o, cell: e.target.value }))} style={inp} aria-label={tr("Cell size")} /><input type="number" value={opts.depth} onChange={(e) => setOpts((o) => ({ ...o, depth: e.target.value }))} style={inp} aria-label={tr("Model depth")} /></div>
          <div style={row} title={tr("How far you trust each reading. No default: too small and the model invents detail, too large and it smooths real bodies away.")}><span style={lbl}>{tr("Resistivity ± %, floor")}</span><input type="number" value={opts.pct} onChange={(e) => setOpts((o) => ({ ...o, pct: e.target.value }))} style={inp} aria-label={tr("Resistivity uncertainty percent")} /><input type="number" value={opts.floor} onChange={(e) => setOpts((o) => ({ ...o, floor: e.target.value }))} style={inp} aria-label={tr("Resistivity uncertainty floor")} /></div>
          {/* TASKS.csv #775 — what SimPEG's own tutorials use, as hints only (nothing is filled in) */}
          <div style={{ ...small, marginTop: -2, marginBottom: 4 }}>{tr("For reference: SimPEG's DC tutorials use 2–10% plus a small floor{v}. The survey's repeat readings or reciprocal errors are the better guide.", { v: parsed?.ip ? tr("; for chargeability, a floor of about 5 mV/V (0.005 V/V)") : "" })}</div>
          {parsed?.ip && <div style={row}><span style={lbl}>{tr("Chargeability ± %, floor mV/V")}</span><input type="number" value={opts.ipPct} onChange={(e) => setOpts((o) => ({ ...o, ipPct: e.target.value }))} style={inp} aria-label={tr("Chargeability uncertainty percent")} /><input type="number" value={opts.ipFloor} onChange={(e) => setOpts((o) => ({ ...o, ipFloor: e.target.value }))} style={inp} aria-label={tr("Chargeability uncertainty floor")} /></div>}
          {/* TASKS.csv #580 — which geometric factor the file's apparent resistivities were computed with */}
          <div style={row} title={tr("Receivers and contractors compute apparent resistivity with the geometric factor of the nominal electrode spacings on flat ground; GeoStrix models the real ground (electrodes on the topography) and turns its predicted volts into apparent resistivity the SAME way as the file. On a rugged line the two factors differ by tens of percent per reading, which would otherwise be inverted as false near-surface structure. Choose the second only if the file was already corrected for topography.")}>
            <span style={lbl}>{tr("Apparent resistivity computed for")}</span>
            <select value={opts.geomFactor || "flat"} onChange={(e) => setOpts((o) => ({ ...o, geomFactor: e.target.value }))} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label={tr("Geometric factor the apparent resistivities were computed with")}>
              <option value="flat">{tr("flat ground, nominal spacings (usual)")}</option>
              <option value="draped">{tr("the electrodes on the topography")}</option>
            </select>
          </div>
          {parsed?.readings.length > 0 && (() => {
            // #683 follow-up — a deeper model on request: down to the deepest pseudo-depth of the data
            const deep = deepestPseudoDepth(parsed.readings);
            return deep > (num(opts.depth) || 0) + 1 ? (
              <div style={{ ...small, marginTop: -2, marginBottom: 4 }}>{tr("The data plot down to {deep} m (pseudo-depth: half the largest current-to-potential separation).", { deep })}{" "}
                <button type="button" onClick={() => setOpts((o) => ({ ...o, depth: String(deep), voxExtrapolated: true }))} style={{ fontSize: "var(--font-size-xs)", padding: "1px 6px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)", cursor: "pointer" }}>{tr("Model to {deep} m", { deep })}</button>
                {" "}{tr("Below the depth of investigation the cells are extrapolated by the inversion, not seen by the data, and a deeper mesh takes longer to run.")}</div>
            ) : null;
          })()}
          <div style={row} title={tr("Depth of investigation: in each column of the section, cells below the deepest cell whose normalized sensitivity reaches this value are greyed in the section and hidden in 3D — the data barely see them.")}><span style={lbl}>{tr("Hide cells below support")}</span><input type="number" step={0.005} min={0} max={1} value={opts.supportCutoff} onChange={(e) => setOpts((o) => ({ ...o, supportCutoff: e.target.value }))} style={inp} aria-label={tr("Support cutoff")} /></div>
          {/* TASKS.csv #772 — the standard depth-of-investigation check */}
          <label style={{ ...row, cursor: "pointer" }} title={tr("Oldenburg & Li (1999): the resistivity is inverted twice more, with the reference model 10x below and 10x above the median. Where the data control a cell, all runs agree; where they don't, each run returns its own reference. A dashed line on the section marks the DOI index 0.2 — below it the model reflects the reference, not the data. About 3x the run time.")}>
            <input type="checkbox" checked={!!opts.doi} onChange={(e) => setOpts((o) => ({ ...o, doi: e.target.checked }))} />{tr("Depth-of-investigation check (DOI index — about 3× the time)")}</label>
          {/* #683 follow-up — which 3D voxels a run adds */}
          <div style={{ ...row, alignItems: "flex-start" }}>
            <span style={lbl}>{tr("3D voxels")}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
              <label title={tr("Only the cells within the depth of investigation (the support cutoff above): what the data actually see.")}><input type="checkbox" checked={opts.voxObserved !== false} onChange={(e) => setOpts((o) => ({ ...o, voxObserved: e.target.checked }))} />{" "}{tr("Observed (the cells the data see)")}</label>
              <label title={tr("Every cell of the model, down to the model depth. Below the depth of investigation the values come from the inversion's smoothing, not from the data: a prediction to test, not a measurement.")}><input type="checkbox" checked={!!opts.voxExtrapolated} onChange={(e) => setOpts((o) => ({ ...o, voxExtrapolated: e.target.checked }))} />{" "}{tr("Extrapolated (the whole model, to its depth)")}</label>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={run} disabled={running} style={{ ...pBtn, flex: 1, opacity: running ? 0.5 : 1 }}><Play size={14} />{" "}{tr("Invert")}</button>
            {running && <button onClick={() => cancelInversionJob()} style={{ ...pBtn, width: "auto" }}>{tr("Cancel")}</button>}
          </div>
        </div>
      )}
      {msg && <div role="status" style={{ ...small, marginTop: 6, color: msg.ok ? "var(--color-text-secondary)" : "var(--color-danger-fg)" }}>{msg.text}</div>}
      {job?.error && <div style={{ ...small, marginTop: 6, color: "var(--color-danger-fg)" }}>{job.error}</div>}
      {last && <SectionResult last={last} cutoff={Number(opts.supportCutoff) || 0} epsg={project?.epsg} pBtn={pBtn} />}
      <DcipMergePanel pBtn={pBtn} numInput={numInput} />
    </div>
  );
}

// the data as a pseudosection: each reading at its mid-point / pseudo-depth, coloured by log resistivity
function Pseudosection({ parsed }) {
  const pts = pseudoPositions(parsed.readings);
  const W = 300, H = 110;
  const smin = arrMin(pts.map((p) => p.s)), smax = arrMax(pts.map((p) => p.s)), dmax = arrMax(pts.map((p) => p.depth)) || 1;
  const model = { stops: logStops(arrMin(parsed.rho), arrMax(parsed.rho)), colorMode: "continuous" };
  const x = (s) => 8 + ((s - smin) / (smax - smin || 1)) * (W - 16), y = (d) => 8 + (d / dmax) * (H - 16);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Data (pseudosection): apparent resistivity {v}–{v2} ohm·m", { v: arrMin(parsed.rho).toPrecision(3), v2: arrMax(parsed.rho).toPrecision(3) })}</div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr("Apparent resistivity pseudosection")} style={{ display: "block", width: "100%", maxWidth: W, height: "auto", background: "var(--color-bg-subtle)", borderRadius: 4 }}>
        {pts.map((p, i) => <circle key={i} cx={x(p.s)} cy={y(p.depth)} r={2.6} fill={colorForVoxelValue(model, parsed.rho[i])} />)}
      </svg>
    </div>
  );
}

// the inverted section: cells coloured by resistivity (log) and chargeability, poorly supported cells greyed
function SectionResult({ last, cutoff, epsg, pBtn }) {
  const { result } = last;
  const { addLayoutImage, goToModule, addVoxelModel } = useStore();
  const [note, setNote] = useState(null);
  const c = result.cells;
  const [field, setField] = useState("resistivity");
  const hatchId = `dcipHatch${useId().replace(/:/g, "")}`; // #535 — one pattern per section on the page
  const vals = c[field];
  const env = useMemo(() => supportEnvelope(c.s, c.z, c.support), [c]); // TASKS.csv #641
  // TASKS.csv #772 — the DOI index line and how deep each test says the data reach
  const doiT = result.doiMethod?.threshold ?? 0.2;
  const doiFits = result.doiMethod?.misfitOfEachRun || null;
  const doiFailed = !!doiFits?.some((v) => !(v <= 1.5)); // a reference run that did not fit makes the index meaningless
  const reach = useMemo(() => (c.doi && !doiFailed ? { doi: columnReach(c, (i) => c.doi[i] <= doiT), sup: columnReach(c, (i) => c.support[i] >= cutoff) } : null), [c, doiT, cutoff, doiFailed]);
  const verdict = fitVerdict(result);
  const W = 320, H = 150;
  const s0 = arrMin(c.s.map((s, i) => s - c.ds[i] / 2)), s1 = arrMax(c.s.map((s, i) => s + c.ds[i] / 2));
  const z0 = arrMin(c.z.map((z, i) => z - c.dz[i] / 2)), z1 = arrMax(c.z.map((z, i) => z + c.dz[i] / 2));
  const sx = (W - 10) / (s1 - s0), sz = (H - 10) / (z1 - z0);
  const model = field === "resistivity" ? { stops: logStops(arrMin(vals), arrMax(vals)), colorMode: "continuous" } : { stops: sequentialStops(0, arrMax(vals)), colorMode: "continuous" };
  return (
    <div style={{ marginTop: 10 }}>
      <div className="ge-section-label">{tr("Result — {name}", { name: last.name })}</div>
      <div role="status" style={{ fontSize: "var(--font-size-xs)", color: verdict.level === "ok" ? "var(--color-text-secondary)" : "var(--color-danger-fg)" }}>{tr("Resistivity: {text}", { text: verdict.text })}</div>
      {/* TASKS.csv #581 — chargeability judged on its own, in its own colour (a good DC fit used to paint a failed IP fit as fine) */}
      {result.ip && (() => { const iv = ipFitOf(result); return <div role="status" style={{ fontSize: "var(--font-size-xs)", color: iv.level === "ok" ? "var(--color-text-secondary)" : "var(--color-danger-fg)" }}>{tr("Chargeability: {verdict}", { verdict: iv.verdict })}</div>; })()}
      {c.chargeability && (
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          {["resistivity", "chargeability"].map((f) => <button key={f} onClick={() => setField(f)} style={{ fontSize: "var(--font-size-xs)", padding: "2px 8px", border: "1px solid var(--color-border)", borderRadius: 4, background: f === field ? "var(--color-selected-bg)" : "var(--color-bg)", cursor: "pointer" }}>{f === "resistivity" ? tr("Resistivity") : tr("Chargeability")}</button>)}
        </div>
      )}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr("Inverted {field} section", { field })} style={{ display: "block", marginTop: 4, width: "100%", maxWidth: W, height: "auto" }}>
        {/* TASKS.csv #535 — low-support cells hatched (a flat grey matched mid-range resistivity) */}
        <defs><pattern id={hatchId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill={HATCH.bg} /><line x1="0" y1="0" x2="0" y2="5" stroke={HATCH.line} strokeWidth="1.2" /></pattern></defs>
        {vals.map((v, i) => {
          const weak = env[i] < cutoff; // #641 — below the depth of investigation, not single cells
          return <rect key={i} x={5 + (c.s[i] - c.ds[i] / 2 - s0) * sx} y={5 + (z1 - c.z[i] - c.dz[i] / 2) * sz} width={c.ds[i] * sx + 0.5} height={c.dz[i] * sz + 0.5} fill={weak ? `url(#${hatchId})` : colorForVoxelValue(model, v)} />;
        })}
        {reach && <polyline points={smoothReachLine(reach.doi.cols).map((o) => `${(5 + (o.s - s0) * sx).toFixed(1)},${(5 + (z1 - o.z) * sz).toFixed(1)}`).join(" ")} fill="none" stroke="#1a2028" strokeWidth="1.3" strokeDasharray="4 3" />}
        {result.electrodes.map((e, i) => <circle key={i} cx={5 + (e[0] - s0) * sx} cy={5 + (z1 - e[1]) * sz} r={1.6} fill="#1a2028" />)}
      </svg>
      {reach && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>{tr("Dashed line = DOI index {doiT} (Oldenburg & Li; median over 5 columns): below it the resistivity follows the reference model, not the data. The data reach a median {median} m per column by the DOI index, {median2} m by the support cutoff ({cutoff}).{v}", { doiT, median: reach.doi.median.toFixed(0), median2: reach.sup.median.toFixed(0), cutoff, v: doiFits ? tr(" The two reference runs fit {v} the target{v2}.", { v: doiFits.map((v) => `${v.toFixed(2)}×`).join(" and "), v2: doiFits.some((v) => v < 0.5) ? tr(" — unequal fits inflate the index, so read the line as approximate") : "" }) : "" })}</div>}
      {doiFailed && <div role="alert" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger-fg)" }}>{tr("Depth-of-investigation check not shown: a reference run did not fit the data ({v} the target), so the index would measure that failure, not the depth the data reach.", { v: doiFits.map((v) => `${v.toFixed(2)}×`).join(" and ") })}</div>}
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
        {tr("{v} · {v2} m × {v3} m, vertical exaggeration {v4}× ·", { v: field === "resistivity" ? tr("{v}–{v2} ohm·m (log colours: dark red conductive → light blue resistive)", { v: arrMin(vals).toPrecision(3), v2: arrMax(vals).toPrecision(3) }) : `0–${arrMax(vals).toPrecision(3)} mV/V`, v2: (s1 - s0).toFixed(0), v3: (z1 - z0).toFixed(0), v4: (sz / sx).toFixed(1) })}{" "}<svg width="14" height="9" style={{ verticalAlign: "middle" }} aria-hidden="true"><rect width="14" height="9" fill={`url(#${hatchId})`} stroke={HATCH.line} strokeWidth="0.5" /></svg>{" "}{tr("hatched = barely seen by the data. {v}", { v: last.restored ? tr("Inverted {v} (kept in the project).", { v: last.restored.slice(0, 10) }) : tr("Added to Block models (3D, along the line).") })}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
        <button onClick={() => exportCsv(last, epsg, cutoff)} style={{ ...pBtn, width: "auto", flex: 1 }} title={tr("Every section cell: distance, x / y (project CRS), elevation, size, values, support")}><Download size={14} />{" "}{tr("CSV")}</button>
        <button onClick={async () => { const img = await sectionImage(last, field, cutoff); saveFile({ suggestedName: `dcip_${last.name}_${field}.png`, filters: [{ name: "PNG", extensions: ["png"] }], content: img.dataUrl.split(",")[1], encoding: "base64" }); }} style={{ ...pBtn, width: "auto", flex: 1 }}><Download size={14} />{" "}{tr("PNG")}</button>
        <button onClick={async () => { const img = await sectionImage(last, field, cutoff); addLayoutImage({ label: `DC/IP ${last.name} — ${field}`, src: img.dataUrl, naturalW: img.width, naturalH: img.height }); goToModule("layout"); setNote(tr("Section added to the Layout page.")); }} style={{ ...pBtn, width: "auto", flex: 1 }}>{tr("Add to Layout")}</button>
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
        {[["observed", tr("Add observed voxel")], ["extrapolated", tr("Add extrapolated voxel (to {v} m)", { v: (z1 - z0).toFixed(0) })]].map(([k, label]) => (
          <button key={k} onClick={() => {
            const ms = lineVoxelModels(result, last.geom, { name: last.name, thick: last.thick || c.ds[0] || 10, cut: cutoff, params: { tool: "2D DC resistivity / IP inversion (SimPEG)", line: last.name, versions: result.versions, inverted: last.restored || "this session" }, kinds: [k] });
            ms.forEach((m) => addVoxelModel(m));
            setNote(tr("Added {v} to Block models.", { v: ms.map((m) => `"${m.name}"`).join(" and ") }));
          }} style={{ ...pBtn, width: "auto", flex: 1, fontSize: "var(--font-size-xs)" }}
            title={k === "observed" ? tr("The cells within the depth of investigation only") : tr("Every cell of the model; below the depth of investigation the values are the inversion's extrapolation, not data")}>{label}</button>
        ))}
      </div>
      {note && <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: 4 }}>{note}</div>}
      {last.obs && <DataFit obs={last.obs} result={result} />}
    </div>
  );
}

// TASKS.csv #683 — how well the model reproduces each reading: observed, predicted and the normalised residual
// (obs - pred) / std as pseudosections, for resistivity and (when inverted) chargeability, plus the readings beyond 3 sigma.
// A residual that is structured (a whole stretch or depth level one colour) means the model or the survey geometry is
// wrong, not the noise; on the file-order Woodjam runs (#652) it would have shown the ordering bug at once.
function DataFit({ obs, result }) {
  const hasIp = !!(result.ip?.predicted && obs.ip);
  const [kind, setKind] = useState("dc");
  const k = hasIp ? kind : "dc";
  const rows = useMemo(() => (k === "dc"
    ? dataFitRows(obs.readings, obs.rho, result.predicted, result.standardDeviation)
    : dataFitRows(obs.readings, obs.ip, result.ip.predicted, result.ip.standardDeviation)), [k, obs, result]);
  if (!Array.isArray(result.predicted) || rows.length !== result.predicted.length) {
    return <div style={{ marginTop: 8, fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Data fit: not kept with this section (inverted with an earlier GeoStrix). Run the inversion again to see observed, predicted and residual data.")}</div>;
  }
  const worst = worstReadings(rows, 3);
  const vals = rows.flatMap((x) => [x.obs, x.pred]).filter(Number.isFinite);
  const lo = arrMin(vals), hi = arrMax(vals);
  const valModel = { stops: k === "dc" ? logStops(lo, hi) : sequentialStops(Math.min(0, lo), hi), colorMode: "continuous" };
  const resModel = { stops: divergingStops(3), colorMode: "continuous" };
  const W = 300, H = 80;
  const smin = arrMin(rows.map((x) => x.s)), smax = arrMax(rows.map((x) => x.s)), dmax = arrMax(rows.map((x) => x.depth)) || 1;
  const X = (s) => 6 + ((s - smin) / (smax - smin || 1)) * (W - 12), Y = (d) => 6 + (d / dmax) * (H - 12);
  const unit = k === "dc" ? "ohm·m" : "mV/V";
  const fmt = (v) => (Number.isFinite(v) ? Number(v.toPrecision(3)).toString() : "—");
  const plot = (label, colorOf) => (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{label}</div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ display: "block", width: "100%", maxWidth: W, height: "auto", background: "var(--color-bg-subtle)", borderRadius: 4 }}>
        {rows.map((x) => { const c = colorOf(x); return c ? <circle key={x.i} cx={X(x.s)} cy={Y(x.depth)} r={2.4} fill={c} /> : null; })}
      </svg>
    </div>
  );
  const inside = rows.filter((x) => x.r != null && Math.abs(x.r) <= 1).length, withR = rows.filter((x) => x.r != null).length;
  return (
    <div style={{ marginTop: 10 }}>
      <div className="ge-section-label">{tr("Data fit")}</div>
      {hasIp && (
        <div style={{ display: "flex", gap: 4, marginBottom: 2 }}>
          {[["dc", tr("Resistivity")], ["ip", tr("Chargeability")]].map(([v, l]) => <button key={v} onClick={() => setKind(v)} style={{ fontSize: "var(--font-size-xs)", padding: "2px 8px", border: "1px solid var(--color-border)", borderRadius: 4, background: v === k ? "var(--color-selected-bg)" : "var(--color-bg)", cursor: "pointer" }}>{l}</button>)}
        </div>
      )}
      {plot(tr("Observed ({v}–{v2} {unit})", { v: fmt(lo), v2: fmt(hi), unit }), (x) => (Number.isFinite(x.obs) ? colorForVoxelValue(valModel, x.obs) : null))}
      {plot(tr("Predicted by the model (same colours)"), (x) => (Number.isFinite(x.pred) ? colorForVoxelValue(valModel, x.pred) : null))}
      {plot(tr("Residual: (observed − predicted) / error"), (x) => (x.r != null ? colorForVoxelValue(resModel, Math.max(-3, Math.min(3, x.r))) : null))}
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("Residual colours run from −3 (blue: the model predicts more than was measured) to +3 (red: less), white = a perfect fit. {inside} of {withR} readings are within one error ({v}%; about 68% is expected for a fit at the target). Patches of one colour, rather than salt-and-pepper, point to a geometry or model problem.", { inside, withR, v: withR ? Math.round((100 * inside) / withR) : 0 })}</div>
      {worst.length > 0 ? (
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: 4 }}>
          {tr("{worst} {v} beyond 3 errors. Worst: {v2}.", { worst: worst.length, v: tr(worst.length > 1 ? "readings" : "reading"), v2: worst.slice(0, 5).map((x) => `#${x.i + 1} (A ${x.reading[0]}, M ${x.reading[2]}: ${fmt(x.obs)} vs ${fmt(x.pred)} ${unit}, ${x.r > 0 ? "+" : ""}${x.r.toFixed(1)})`).join("; ") })}</div>
      ) : <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: 4 }}>{tr("No reading is more than 3 errors from the model.")}</div>}
    </div>
  );
}

// TASKS.csv #683 follow-up — the 3D voxels of one inverted line. "observed": the cells within the depth of investigation
// (the support envelope, #641), as before; "extrapolated": every cell to the model depth, shown in full, its colour range
// from the 2nd-98th percentile so the deep cells pinned at the inversion's bounds do not wash the line out (#641).
function lineVoxelModels(result, geom, { name, thick, cut, params, kinds }) {
  const out = [];
  const seen = cut > 0 ? supportEnvelope(result.cells.s, result.cells.z, result.cells.support).map((v) => v >= cut) : null;
  const props = [["resistivity", "dc", "Resistivity (ohm·m)", `DC line ${name}`]];
  if (result.cells.chargeability) props.push(["chargeability", "ip", "Chargeability (mV/V)", `IP line ${name}`]);
  for (const [field, method, property, lineLabel] of props) {
    const cells = sectionCells(result, geom, field, thick);
    for (const kind of kinds) {
      const all = cells.map((x) => x.value);
      let vals = kind === "observed" && seen ? cells.filter((_, i) => seen[i]).map((x) => x.value) : all;
      if (!vals.length) vals = all;
      let lo = arrMin(vals), hi = arrMax(vals);
      if (kind === "extrapolated") { lo = percentile(vals, 0.02); hi = percentile(vals, 0.98); }
      const stops = method === "dc" ? logStops(lo, hi) : sequentialStops(0, kind === "observed" ? percentile(vals, 0.98) : hi); // p98: a few spikes do not wash the line out
      const ipFit = method === "ip" && result.ip ? { ip: { phiD: result.ip.phi_d, target: result.target, ...ipFitOf(result) } } : {};
      out.push({
        source: "simpeg", colorMode: "continuous", method, property, cells, min: lo, max: hi, stops,
        supportCutoff: kind === "observed" ? cut : 0,
        ...(kind === "extrapolated" ? { opacity: 0.6 } : {}), // see-through: less reliable, and the observed voxel stays readable inside it
        name: kind === "observed" ? `${property} — ${lineLabel}` : `${property} — ${lineLabel}, extrapolated to the model depth`,
        params: { ...params, voxel: kind === "observed" ? `cells within the depth of investigation (support cutoff ${cut})` : "every cell of the model: below the depth of investigation the values are the inversion's extrapolation, not data", ...(params.fit ? { fit: { ...params.fit, ...ipFit } } : {}) },
      });
    }
  }
  return out;
}

async function sectionImage(last, field, cutoff) {
  try { await document.fonts?.load("15px 'Exo 2'"); } catch { /* the fallback font is fine */ }
  return renderDcipSectionPng({ result: last.result, name: last.name, field, cutoff });
}

function exportCsv(last, epsg, cutoff) {
  const r = last.result;
  const stamp = stampLines({ tool: "2D DC resistivity / IP inversion (SimPEG) — section cells", version: APP_VERSION, epsg, params: [
    `Line: ${last.name}; azimuth ${last.geom.azimuth.toFixed(2)} deg (grid); distance 0 at the line start`,
    `Fit: resistivity misfit ${(r.phi_d / r.target).toFixed(2)}x the target${r.ip ? `, chargeability ${(r.ip.phi_d / r.target).toFixed(2)}x` : ""}`,
    "support = normalized sensitivity (how much the data see the cell); low-support cells are poorly constrained",
    `envelope_support = the largest support at or below the cell in its column; shown = envelope_support >= the cutoff (${cutoff}): cells below the deepest well-seen cell of their column are hidden`,
    ...(r.cells.doi ? [`doi_index = Oldenburg & Li (1999) depth-of-investigation index from resistivity inversions with reference models ${(r.doiMethod?.referenceFactors || [0.1, 10]).join(" and ")}x the median: ~0 = data-controlled, ~1 = reference-controlled (threshold ${r.doiMethod?.threshold ?? 0.2}); single-cell values depend on how closely the two runs fit (${(r.doiMethod?.misfitOfEachRun || []).map((v) => `${v}x`).join(" / ")}) - read the depth per column, not one cell`] : []), // #772
  ] });
  saveFile({ suggestedName: `dcip_${last.name}_section.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: withStamp(Papa.unparse(sectionTableRows(r, last.geom, cutoff)), stamp) });
}
