// TASKS.csv #322 — 2D DC resistivity / IP inversion of one survey line (SimPEG, in the Python engine).
// Import a line CSV (electrode positions along the line + apparent resistivity [+ chargeability]), place the
// line by its start / end coordinates, state the data uncertainty (never assumed), invert. Results: a
// section view here, and block models (resistivity, chargeability) along the line in the 3D view.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Upload, Play, Download, Trash2 } from "./icons.js";
import Papa from "papaparse";
import { useStore, useSetTaskProgress } from "../lib/store.jsx";
import { parseTableFile, decodeTableBytes } from "../lib/tabular.js";
import { guessDcipColumns, parseDcipRows, parseDcipWhitespaceText, lineGeometry, terrainProfile, slopeToHorizontalFromProfile, slopeToHorizontalFromStations, readingsToHorizontal, pseudoPositions, sectionCells, slimDcipResult, savedLineToFile, sectionTableRows } from "../lib/dcip.js";
import { renderDcipSectionPng } from "../lib/dcipSectionImage.js";
import { stampLines, withStamp } from "../lib/provenance.js";
import { version as APP_VERSION } from "../../package.json";
import { logStops, sequentialStops, fitVerdict } from "../lib/inversion.js";
import { subscribeInversionJob, startInversionJob, cancelInversionJob } from "../lib/inversionJobs.js";
import { pythonHealth, ensureSidecarUp, saveFile } from "../lib/desktop.js";
import { colorForVoxelValue } from "../lib/layers.js";
import { arrMin, arrMax } from "../lib/arrayStats.js";
import { parseStationFile, matchStationLine, fitStationLine, stationGroundProfile } from "../lib/dcipStations.js";
import { reprojectXY, getProj4DefSync } from "../lib/reproject.js";

const num = (v) => (v === "" || v == null ? NaN : Number(v));
const FIELDS = [["a", "A (current)"], ["b", "B (current; blank = pole)"], ["m", "M (potential)"], ["n", "N (potential; blank = pole)"], ["rho", "Apparent resistivity (ohm·m)"], ["ip", "Chargeability (mV/V, optional)"]];

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
  const [opts, setOpts] = useState({ cell: "", depth: "", pct: "", floor: "", ipPct: "", ipFloor: "", maxIter: 20, supportCutoff: 0.02 });
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
      setFile({ name: f.name, headers: t.headers, rows: t.rows });
      setMapping(m);
      const p = m.a && m.m && m.rho ? parseDcipRows(t.rows, m) : null;
      if (p?.spacing) setOpts((o) => ({ ...o, cell: o.cell || String(+(p.spacing / 2).toFixed(2)), depth: o.depth || String(Math.round((p.span[1] - p.span[0]) / 4)) }));
      setMsg(p ? { ok: true, text: `${f.name}: ${p.readings.length} readings (${p.array}), electrodes ${p.span[0]}–${p.span[1]} m, smallest spacing ${p.spacing} m${p.ip ? ", with chargeability" : ""}${p.skipped ? `; ${p.skipped} row(s) skipped (missing A/M, non-positive resistivity${m.ip ? " or no chargeability" : ""})` : ""}.${t.note ? " " + t.note : ""}` }
        : { ok: false, text: "Map the A, M and apparent-resistivity columns below." });
    } catch (e) { setMsg({ ok: false, text: `Could not read ${f.name}: ${e.message}` }); }
  };

  // TASKS.csv #322 — keep the line (normalised readings + placement + settings) in the project file
  const lineName = file ? file.name.replace(/\.(csv|txt|dat|ipg)$/i, "") : "";
  const keepLine = (extra = {}) => saveDcipLine({ name: lineName, readings: parsed.readings, rho: parsed.rho, ip: parsed.ip, line: { ...line }, opts: { ...opts }, savedAt: new Date().toISOString(), ...extra });
  const loadSaved = (id) => {
    const e = dcipLines.find((l) => l.id === id);
    if (!e) return;
    const { file: f, mapping: m } = savedLineToFile(e);
    setFile(f); setMapping(m); setLine({ x0: "", y0: "", x1: "", y1: "", ground: "", scale: "", stations: null, ...e.line }); setOpts((o) => ({ ...o, ...e.opts }));
    const sl = e.section?.line;
    const sg = sl ? lineGeometry([sl.x0, sl.y0].map(Number), [sl.x1, sl.y1].map(Number), Number(sl.scale) || 1) : null;
    setLast(e.section && sg ? { result: e.section.result, geom: sg, name: e.name, restored: e.section.ranAt } : null);
    setMsg({ ok: true, text: `${e.name}: ${e.readings.length} readings from the project${e.section ? ", with its last inverted section" : ""}.` });
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
        crsText = ` (reprojected EPSG:${sf.epsg} → EPSG:${dst})`;
      } else crsText = ` (EPSG:${sf.epsg} could not be reprojected — taken as EPSG:${dst})`;
    }
    const fit = fitStationLine(list);
    if (!fit) { setMsg({ ok: false, text: `${sf.name}: line ${lineKey} needs at least two stations at different distances to place it.` }); return; }
    const r1 = (v) => String(+v.toFixed(1));
    const scale = Math.abs(fit.scale - 1) > 0.002 ? String(+fit.scale.toFixed(4)) : "";
    setLine((l) => ({ ...l, x0: r1(fit.start[0]), y0: r1(fit.start[1]), x1: r1(fit.end[0]), y1: r1(fit.end[1]), scale, stations: { file: sf.name, line: lineKey, list } }));
    const zs = list.filter((p) => Number.isFinite(p.z)).map((p) => p.z);
    const scaleText = scale ? ` Chaining scale ${scale}: the file's distances are ${Math.abs((1 / fit.scale - 1) * 100).toFixed(1)}% ${fit.scale < 1 ? "longer" : "shorter"} than the ground between the stations (slope chaining?) — applied to the 3D placement only.` : "";
    const sp = parsed?.span;
    const reach = sp && (sp[0] < list[0].s || sp[1] > list[list.length - 1].s) ? ` Electrodes ${sp[0]}–${sp[1]} m reach past the stations (${list[0].s}–${list[list.length - 1].s} m).` : "";
    setMsg({ ok: true, text: `${sf.name}: line ${lineKey}, ${list.length} stations ${list[0].s}–${list[list.length - 1].s} m${crsText}. Placed by a best fit, azimuth ${fit.azimuth.toFixed(1)}°; stations sit within ${fit.maxAcross.toFixed(1)} m of the line.${scaleText}${zs.length >= 2 ? ` Ground profile from ${zs.length} station elevations (${arrMin(zs).toFixed(1)}–${arrMax(zs).toFixed(1)} m).` : " The file has no elevations — terrain or the flat ground is used."}${reach}${sf.other?.length ? ` Not stations: ${sf.other.map((o) => o.name).join(", ")}.` : ""}` });
  };
  const onStationFile = async (f) => {
    if (!f) return;
    try {
      const sf = { name: f.name, ...parseStationFile(decodeTableBytes(await f.arrayBuffer()).text, f.name) };
      const keys = Object.keys(sf.lines);
      const hints = [lineName, ...(file?.rows || []).slice(0, 3).flatMap((r) => Object.values(r))];
      const k = matchStationLine(keys, ...hints);
      if (k != null) applyStations(sf, k);
      else { setStationFile(sf); setMsg({ ok: true, text: `${f.name} has ${keys.length} lines and none is named like "${lineName}" — choose this line's stations.` }); }
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  };

  const run = async () => {
    const problems = [];
    if (!parsed || !parsed.readings.length) problems.push("Import a line with A, M and apparent-resistivity columns.");
    if (!geom) problems.push("Enter the line's start and end coordinates (distance 0 = start).");
    if (!(num(opts.cell) > 0) || !(num(opts.depth) > num(opts.cell))) problems.push("Enter the cell size and model depth.");
    if (!(num(opts.pct) > 0) && !(num(opts.floor) > 0)) problems.push("Enter the resistivity data uncertainty (% and / or a floor) — how far you trust each reading.");
    if (parsed?.ip && !(num(opts.ipPct) > 0) && !(num(opts.ipFloor) > 0)) problems.push("Enter the chargeability uncertainty (% and / or a floor in mV/V).");
    // TASKS.csv #564 — a percent of 0 mV/V is 0: that reading would get zero uncertainty (infinite weight)
    else if (parsed?.ip && !(num(opts.ipFloor) > 0) && parsed.ip.some((v) => !(Math.abs(v) > 0))) problems.push(`${parsed.ip.filter((v) => !(Math.abs(v) > 0)).length} chargeability reading(s) are 0 mV/V: a percent alone gives them no uncertainty. Enter a floor in mV/V as well.`);
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
        if (f) { fSt = f; posNote = "slope distances converted to horizontal from the surveyed stations"; }
        else if (terrain) {
          const a = Math.min(0, parsed.span[0]) - 50, b = parsed.span[1] + 50;
          const prof = terrainProfile(terrain, lineGeom, a, b, 400);
          if (prof) { f = slopeToHorizontalFromProfile(prof); posNote = "slope distances converted to horizontal along the terrain"; }
        }
        if (!f) problems.push("Positions chained along the ground need the ground's shape to convert them: load the line stations (with coordinates) or a terrain under the line.");
        else { const c = readingsToHorizontal(parsed.readings, f); readingsH = c.readings; posNote += ` (largest shift ${c.maxShift.toFixed(1)} m)`; }
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
        groundNote = `ground from ${zs.length} station elevations (${line.stations.file}, line ${line.stations.line})${beyond}`;
      } else if (terrain && (topo = terrainProfile(terrain, lineGeom, spanH[0] - pad, spanH[1] + pad))) {
        groundNote = "ground from the terrain along the line";
      } else if (Number.isFinite(num(line.ground))) {
        topo = [[spanH[0] - pad, num(line.ground)], [spanH[1] + pad, num(line.ground)]];
        groundNote = `flat ground at ${num(line.ground)} m (entered)`;
      } else problems.push(terrain ? "The line leaves the terrain surface — enter a flat ground elevation instead." : "Load a terrain (Geophysics > Terrain), the line stations, or enter a flat ground elevation for the line.");
      if (posNote) groundNote += `; ${posNote}`;
    }
    if (problems.length) { setMsg({ ok: false, text: problems.join(" ") }); return; }
    const request = {
      readings: readingsH, rho: parsed.rho, ...(parsed.ip ? { chargeability: parsed.ip } : {}), topo, // #539 — horizontal positions
      mesh: { cell: num(opts.cell), depth: num(opts.depth) }, maxIter: Number(opts.maxIter) || 20,
      uncertainty: { percent: num(opts.pct) || 0, floor: num(opts.floor) || 0 },
      ...(parsed.ip ? { ipUncertainty: { percent: num(opts.ipPct) || 0, floor: num(opts.ipFloor) || 0 } } : {}),
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
      uncertainty: { resistivityPercent: num(opts.pct) || 0, resistivityFloor: num(opts.floor) || 0, ...(parsed.ip ? { chargeabilityPercent: num(opts.ipPct) || 0, chargeabilityFloorMvV: num(opts.ipFloor) || 0 } : {}), source: "entered by user" },
      crs: `EPSG:${project?.epsg}`, interpretation: "One smooth model that fits the data to the stated uncertainty (2.5D: the ground is assumed not to change along strike, across the line). Deep and edge cells are poorly constrained — see the support.",
    };
    const token = getProjectToken();
    const res = await startInversionJob(request, meta, {
      kind: "dcip2d", setTaskProgress,
      onDone: (result) => {
        setLast({ result, geom: lineGeom, name });
        saveDcipLine({ name, section: { result: slimDcipResult(result), line: lineAtRun, opts: ranOpts, ranAt: new Date().toISOString() } });
        const thick = num(opts.cell);
        const rc = sectionCells(result, lineGeom, "resistivity", thick);
        const rv = rc.map((c) => c.value);
        const common = { source: "simpeg", colorMode: "continuous", supportCutoff: Number(opts.supportCutoff) || 0,
          params: { ...params, fit: { phiD: result.phi_d, target: result.target, reachedTarget: result.reachedTarget, iterations: result.history?.length }, versions: result.versions, generatedAt: new Date().toISOString(), runSeconds: Math.round(result.seconds) } };
        addVoxelModelToTab(token, { ...common, name: `Resistivity (ohm·m) — DC line ${name}`, property: "Resistivity (ohm·m)", method: "dc", cells: rc, stops: logStops(arrMin(rv), arrMax(rv)) });
        if (result.cells.chargeability) {
          const cc = sectionCells(result, lineGeom, "chargeability", thick);
          const cv = cc.map((c) => c.value);
          addVoxelModelToTab(token, { ...common, name: `Chargeability (mV/V) — IP line ${name}`, property: "Chargeability (mV/V)", method: "ip", cells: cc, stops: sequentialStops(0, arrMax(cv)),
            params: { ...common.params, fit: { ...common.params.fit, ip: { phiD: result.ip.phi_d, target: result.target } } } });
        }
      },
    });
    if (!res.ok) setMsg({ ok: false, text: res.error });
    else setMsg({ ok: true, text: `Inverting ${parsed.readings.length} readings (${groundNote})…` });
  };

  const small = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
  const row = { display: "flex", alignItems: "center", gap: 6, marginTop: 5 };
  const lbl = { width: 104, flexShrink: 0, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
  const inp = { ...numInput, width: 78, flex: "0 1 78px", minWidth: 0 }; // #602 — shrinks in a narrow sidebar (two of them overflowed it)

  return (
    <div style={{ fontSize: "var(--font-size-sm)" }}>
      {engine && !engine.available && <div style={{ ...small, color: "var(--color-danger-fg)", marginBottom: 8 }}>Needs GeoStrix's Python engine with SimPEG (status bar: Py).</div>}
      <div style={small}>One survey line: electrode positions A, B, M, N as distances along the line (m; B or N blank for a pole), apparent resistivity (ohm·m) and optionally chargeability (mV/V). 2.5D: the ground is assumed not to change across the line.</div>
      <button onClick={() => fileRef.current?.click()} style={{ ...pBtn, marginTop: 8 }} title="A CSV, or a contractor TDIP line file (.dat / .ipg: T1X T2X R1X R2X ... RHO ... MX, '*' = electrode at infinity)"><Upload size={14} /> Import line (CSV / .dat)…</button>
      {dcipLines.length > 0 && (
        <div style={row}>
          <select value={pick} onChange={(e) => { setPick(e.target.value); if (e.target.value) loadSaved(e.target.value); }} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label="Lines saved in the project">
            <option value="">Lines in this project ({dcipLines.length})…</option>
            {dcipLines.map((l) => <option key={l.id} value={l.id}>{l.name} — {l.readings.length} readings{l.section ? ", inverted" : ""}</option>)}
          </select>
          {pick && <button onClick={() => { removeDcipLine(pick); setPick(""); }} title="Remove this line from the project" aria-label="Remove saved line" style={{ ...pBtn, width: "auto", padding: "3px 6px" }}><Trash2 size={13} /></button>}
        </div>
      )}
      <input ref={fileRef} type="file" accept=".csv,.txt,.dat,.ipg" style={{ display: "none" }} onChange={(e) => { onFile(e.target.files[0]); e.target.value = ""; }} />
      {file && (
        <div style={{ marginTop: 8 }}>
          {FIELDS.map(([k, label]) => (
            <div key={k} style={row}>
              <span style={lbl}>{label}</span>
              <select value={mapping[k] || ""} onChange={(e) => setMapping((m) => ({ ...m, [k]: e.target.value || undefined }))} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label={label}>
                <option value="">{k === "b" || k === "n" ? "(none — pole)" : k === "ip" ? "(none)" : "(choose)"}</option>
                {file.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
          {parsed?.readings.length > 0 && <Pseudosection parsed={parsed} />}
          {parsed?.readings.length > 0 && (
            <button onClick={() => { keepLine(); setMsg({ ok: true, text: `${lineName} kept in the project (saved with it; also kept automatically when you invert).` }); }} style={{ ...pBtn, marginTop: 6 }}
              title="Store the readings, line position and settings in the project file, so the line can be reloaded and re-inverted without the CSV.">Keep line in project</button>
          )}
          <div className="ge-section-label" style={{ marginTop: 10 }}>Line position (project CRS)</div>
          <div style={row}><span style={lbl}>Start x / y</span><input type="number" value={line.x0} onChange={(e) => setLine((l) => ({ ...l, x0: e.target.value }))} style={inp} aria-label="Line start x" /><input type="number" value={line.y0} onChange={(e) => setLine((l) => ({ ...l, y0: e.target.value }))} style={inp} aria-label="Line start y" /></div>
          <div style={row}><span style={lbl}>End x / y</span><input type="number" value={line.x1} onChange={(e) => setLine((l) => ({ ...l, x1: e.target.value }))} style={inp} aria-label="Line end x" /><input type="number" value={line.y1} onChange={(e) => setLine((l) => ({ ...l, y1: e.target.value }))} style={inp} aria-label="Line end y" /></div>
          {geom && <div style={small}>Line {Math.round(geom.length)} m long, azimuth {geom.azimuth.toFixed(1)}° (grid). Distances in the file are measured from the start.</div>}
          <div style={row} title="How the electrode distances in the file were measured. Chained along the ground on a slope, they are longer than the horizontal distance (cos 30° = 0.87): converted using the line stations, or the terrain."><span style={lbl}>Positions are</span>
            <select value={line.positions || "horizontal"} onChange={(e) => setLine((l) => ({ ...l, positions: e.target.value }))} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label="Electrode position convention">
              <option value="horizontal">horizontal distances</option>
              <option value="slope">chained along the ground (slope)</option>
            </select>
          </div>
          <div style={row} title="Ground metres per metre of the file's distances (from a station fit; blank = 1). Moves the section in 3D only — the inversion uses the file's distances."><span style={lbl}>Chaining scale</span><input type="number" step={0.001} value={line.scale} placeholder="1" disabled={line.positions === "slope"} onChange={(e) => setLine((l) => ({ ...l, scale: e.target.value }))} style={inp} aria-label="Chaining scale" />{line.positions === "slope" && <span style={small}>not used — slope positions are converted</span>}</div>
          <button onClick={() => stationRef.current?.click()} style={{ ...pBtn, marginTop: 6 }} title="GPS waypoints named '<line> <station>' (e.g. GPS Utility '8575E 750N'), or a table with station, X, Y and optionally elevation: places the line and gives the ground profile"><Upload size={14} /> Line stations (GPS / station file)…</button>
          <input ref={stationRef} type="file" accept=".txt,.csv,.dat,.gpx,.wpt,.xyz" style={{ display: "none" }} onChange={(e) => { onStationFile(e.target.files[0]); e.target.value = ""; }} />
          {stationFile && (
            <div style={row}>
              <span style={lbl}>Which line?</span>
              <select value="" onChange={(e) => e.target.value && applyStations(stationFile, e.target.value)} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label="Station file line">
                <option value="">{Object.keys(stationFile.lines).length} lines in {stationFile.name}…</option>
                {Object.entries(stationFile.lines).map(([k, v]) => <option key={k} value={k}>{k || "(no line name)"} — {v.length} stations</option>)}
              </select>
            </div>
          )}
          {line.stations && (
            <div style={{ ...small, display: "flex", gap: 6, alignItems: "baseline" }}>
              <span style={{ flex: 1 }}>Stations: {line.stations.list.length} from {line.stations.file} (line {line.stations.line}){line.stations.list.some((p) => Number.isFinite(p.z)) ? " — used as the ground profile" : " — no elevations"}.</span>
              <button onClick={() => setLine((l) => ({ ...l, stations: null }))} style={{ ...pBtn, width: "auto", padding: "2px 6px", marginBottom: 0 }} title="Stop using the station elevations (the placement stays)">Clear</button>
            </div>
          )}
          <div style={row} title="Used when there are no station elevations and no terrain under the line."><span style={lbl}>Flat ground (m)</span><input type="number" value={line.ground} onChange={(e) => setLine((l) => ({ ...l, ground: e.target.value }))} style={inp} aria-label="Flat ground elevation" /><span style={small}>{line.stations?.list.some((p) => Number.isFinite(p.z)) ? "not used — station elevations" : terrain ? "only if the line leaves the terrain" : "no terrain loaded"}</span></div>
          <div className="ge-section-label" style={{ marginTop: 10 }}>Inversion</div>
          <div style={row} title="Horizontal cell size; half the smallest electrode spacing is a good start (vertical cells are half this)."><span style={lbl}>Cell / depth (m)</span><input type="number" value={opts.cell} onChange={(e) => setOpts((o) => ({ ...o, cell: e.target.value }))} style={inp} aria-label="Cell size" /><input type="number" value={opts.depth} onChange={(e) => setOpts((o) => ({ ...o, depth: e.target.value }))} style={inp} aria-label="Model depth" /></div>
          <div style={row} title="How far you trust each reading. No default: too small and the model invents detail, too large and it smooths real bodies away."><span style={lbl}>Resistivity ± %, floor</span><input type="number" value={opts.pct} onChange={(e) => setOpts((o) => ({ ...o, pct: e.target.value }))} style={inp} aria-label="Resistivity uncertainty percent" /><input type="number" value={opts.floor} onChange={(e) => setOpts((o) => ({ ...o, floor: e.target.value }))} style={inp} aria-label="Resistivity uncertainty floor" /></div>
          {parsed?.ip && <div style={row}><span style={lbl}>Chargeability ± %, floor mV/V</span><input type="number" value={opts.ipPct} onChange={(e) => setOpts((o) => ({ ...o, ipPct: e.target.value }))} style={inp} aria-label="Chargeability uncertainty percent" /><input type="number" value={opts.ipFloor} onChange={(e) => setOpts((o) => ({ ...o, ipFloor: e.target.value }))} style={inp} aria-label="Chargeability uncertainty floor" /></div>}
          <div style={row} title="Cells whose normalised sensitivity is below this are greyed in the section and hidden in 3D: the data barely see them."><span style={lbl}>Hide cells below support</span><input type="number" step={0.005} min={0} max={1} value={opts.supportCutoff} onChange={(e) => setOpts((o) => ({ ...o, supportCutoff: e.target.value }))} style={inp} aria-label="Support cutoff" /></div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={run} disabled={running} style={{ ...pBtn, flex: 1, opacity: running ? 0.5 : 1 }}><Play size={13} /> Invert</button>
            {running && <button onClick={() => cancelInversionJob()} style={{ ...pBtn, width: "auto" }}>Cancel</button>}
          </div>
        </div>
      )}
      {msg && <div role="status" style={{ ...small, marginTop: 6, color: msg.ok ? "var(--color-text-secondary)" : "var(--color-danger-fg)" }}>{msg.text}</div>}
      {job?.error && <div style={{ ...small, marginTop: 6, color: "var(--color-danger-fg)" }}>{job.error}</div>}
      {last && <SectionResult last={last} cutoff={Number(opts.supportCutoff) || 0} epsg={project?.epsg} pBtn={pBtn} />}
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
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>Data (pseudosection): apparent resistivity {arrMin(parsed.rho).toPrecision(3)}–{arrMax(parsed.rho).toPrecision(3)} ohm·m</div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Apparent resistivity pseudosection" style={{ display: "block", width: "100%", maxWidth: W, height: "auto", background: "var(--color-bg-subtle)", borderRadius: 4 }}>
        {pts.map((p, i) => <circle key={i} cx={x(p.s)} cy={y(p.depth)} r={2.6} fill={colorForVoxelValue(model, parsed.rho[i])} />)}
      </svg>
    </div>
  );
}

// the inverted section: cells coloured by resistivity (log) and chargeability, poorly supported cells greyed
function SectionResult({ last, cutoff, epsg, pBtn }) {
  const { result } = last;
  const { addLayoutImage, goToModule } = useStore();
  const [note, setNote] = useState(null);
  const c = result.cells;
  const [field, setField] = useState("resistivity");
  const vals = c[field];
  const verdict = fitVerdict(result);
  const W = 320, H = 150;
  const s0 = arrMin(c.s.map((s, i) => s - c.ds[i] / 2)), s1 = arrMax(c.s.map((s, i) => s + c.ds[i] / 2));
  const z0 = arrMin(c.z.map((z, i) => z - c.dz[i] / 2)), z1 = arrMax(c.z.map((z, i) => z + c.dz[i] / 2));
  const sx = (W - 10) / (s1 - s0), sz = (H - 10) / (z1 - z0);
  const model = field === "resistivity" ? { stops: logStops(arrMin(vals), arrMax(vals)), colorMode: "continuous" } : { stops: sequentialStops(0, arrMax(vals)), colorMode: "continuous" };
  return (
    <div style={{ marginTop: 10 }}>
      <div className="ge-section-label">Result — {last.name}</div>
      <div role="status" style={{ fontSize: "var(--font-size-xs)", color: verdict.level === "ok" ? "var(--color-text-secondary)" : "var(--color-danger-fg)" }}>Resistivity: {verdict.text}{result.ip ? ` Chargeability misfit ${(result.ip.phi_d / result.target).toFixed(2)}× the target.` : ""}</div>
      {c.chargeability && (
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          {["resistivity", "chargeability"].map((f) => <button key={f} onClick={() => setField(f)} style={{ fontSize: "var(--font-size-xs)", padding: "2px 8px", border: "1px solid var(--color-border)", borderRadius: 4, background: f === field ? "var(--color-selected-bg)" : "var(--color-bg)", cursor: "pointer" }}>{f === "resistivity" ? "Resistivity" : "Chargeability"}</button>)}
        </div>
      )}
      <svg width={W} height={H} role="img" aria-label={`Inverted ${field} section`} style={{ display: "block", marginTop: 4 }}>
        {vals.map((v, i) => {
          const weak = c.support[i] < cutoff;
          return <rect key={i} x={5 + (c.s[i] - c.ds[i] / 2 - s0) * sx} y={5 + (z1 - c.z[i] - c.dz[i] / 2) * sz} width={c.ds[i] * sx + 0.5} height={c.dz[i] * sz + 0.5} fill={weak ? "#d6d9de" : colorForVoxelValue(model, v)} />;
        })}
        {result.electrodes.map((e, i) => <circle key={i} cx={5 + (e[0] - s0) * sx} cy={5 + (z1 - e[1]) * sz} r={1.6} fill="#1a2028" />)}
      </svg>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
        {field === "resistivity" ? `${arrMin(vals).toPrecision(3)}–${arrMax(vals).toPrecision(3)} ohm·m (log colours: red conductive, blue resistive)` : `0–${arrMax(vals).toPrecision(3)} mV/V`} · {(s1 - s0).toFixed(0)} m × {(z1 - z0).toFixed(0)} m, vertical exaggeration {(sz / sx).toFixed(1)}× · grey = barely seen by the data. {last.restored ? `Inverted ${last.restored.slice(0, 10)} (kept in the project).` : "Added to Block models (3D, along the line)."}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
        <button onClick={() => exportCsv(last, epsg)} style={{ ...pBtn, width: "auto", flex: 1 }} title="Every section cell: distance, x / y (project CRS), elevation, size, values, support"><Download size={13} /> CSV</button>
        <button onClick={async () => { const img = await sectionImage(last, field, cutoff); saveFile({ suggestedName: `dcip_${last.name}_${field}.png`, filters: [{ name: "PNG", extensions: ["png"] }], content: img.dataUrl.split(",")[1], encoding: "base64" }); }} style={{ ...pBtn, width: "auto", flex: 1 }}><Download size={13} /> PNG</button>
        <button onClick={async () => { const img = await sectionImage(last, field, cutoff); addLayoutImage({ label: `DC/IP ${last.name} — ${field}`, src: img.dataUrl, naturalW: img.width, naturalH: img.height }); goToModule("layout"); setNote("Section added to the Layout page."); }} style={{ ...pBtn, width: "auto", flex: 1 }}>Add to Layout</button>
      </div>
      {note && <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: 4 }}>{note}</div>}
    </div>
  );
}

async function sectionImage(last, field, cutoff) {
  try { await document.fonts?.load("15px 'Exo 2'"); } catch { /* the fallback font is fine */ }
  return renderDcipSectionPng({ result: last.result, name: last.name, field, cutoff });
}

function exportCsv(last, epsg) {
  const r = last.result;
  const stamp = stampLines({ tool: "2D DC resistivity / IP inversion (SimPEG) — section cells", version: APP_VERSION, epsg, params: [
    `Line: ${last.name}; azimuth ${last.geom.azimuth.toFixed(2)} deg (grid); distance 0 at the line start`,
    `Fit: resistivity misfit ${(r.phi_d / r.target).toFixed(2)}x the target${r.ip ? `, chargeability ${(r.ip.phi_d / r.target).toFixed(2)}x` : ""}`,
    "support = normalised sensitivity (how much the data see the cell); low-support cells are poorly constrained",
  ] });
  saveFile({ suggestedName: `dcip_${last.name}_section.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: withStamp(Papa.unparse(sectionTableRows(r, last.geom)), stamp) });
}
