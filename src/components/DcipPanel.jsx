// TASKS.csv #322 — 2D DC resistivity / IP inversion of one survey line (SimPEG, in the Python engine).
// Import a line CSV (electrode positions along the line + apparent resistivity [+ chargeability]), place the
// line by its start / end coordinates, state the data uncertainty (never assumed), invert. Results: a
// section view here, and block models (resistivity, chargeability) along the line in the 3D view.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Upload, Play } from "lucide-react";
import { useStore, useSetTaskProgress } from "../lib/store.jsx";
import { parseTableFile } from "../lib/tabular.js";
import { guessDcipColumns, parseDcipRows, lineGeometry, terrainProfile, pseudoPositions, sectionCells } from "../lib/dcip.js";
import { logStops, sequentialStops, fitVerdict } from "../lib/inversion.js";
import { subscribeInversionJob, startInversionJob, cancelInversionJob } from "../lib/inversionJobs.js";
import { pythonHealth, ensureSidecarUp } from "../lib/desktop.js";
import { colorForVoxelValue } from "../lib/layers.js";
import { arrMin, arrMax } from "../lib/arrayStats.js";

const num = (v) => (v === "" || v == null ? NaN : Number(v));
const FIELDS = [["a", "A (current)"], ["b", "B (current; blank = pole)"], ["m", "M (potential)"], ["n", "N (potential; blank = pole)"], ["rho", "Apparent resistivity (ohm·m)"], ["ip", "Chargeability (mV/V, optional)"]];

export default function DcipPanel({ pBtn, numInput }) {
  const { terrain, project, addVoxelModelToTab, getProjectToken } = useStore();
  const setTaskProgress = useSetTaskProgress();
  const fileRef = useRef(null);
  const [engine, setEngine] = useState(null);
  const [file, setFile] = useState(null); // { name, headers, rows }
  const [mapping, setMapping] = useState({});
  const [line, setLine] = useState({ x0: "", y0: "", x1: "", y1: "", ground: "" });
  const [opts, setOpts] = useState({ cell: "", depth: "", pct: "", floor: "", ipPct: "", ipFloor: "", maxIter: 20, supportCutoff: 0.02 });
  const [msg, setMsg] = useState(null);
  const [job, setJob] = useState(null);
  const [last, setLast] = useState(null); // { result, geom, name }

  useEffect(() => subscribeInversionJob((j) => setJob(j ? { ...j } : null)), []);
  useEffect(() => {
    let alive = true;
    ensureSidecarUp().then(pythonHealth).then((h) => { if (alive) setEngine({ ok: h.ok, available: !!h.capabilities?.dcip2d?.available, simpeg: h.capabilities?.dcip2d?.simpeg }); });
    return () => { alive = false; };
  }, []);

  const parsed = useMemo(() => (file && mapping.a && mapping.m && mapping.rho ? parseDcipRows(file.rows, mapping) : null), [file, mapping]);
  const geom = useMemo(() => { const g = [line.x0, line.y0, line.x1, line.y1].map(num); return g.every(Number.isFinite) ? lineGeometry([g[0], g[1]], [g[2], g[3]]) : null; }, [line]);
  const running = job?.status?.state === "running";

  const onFile = async (f) => {
    if (!f) return;
    try {
      const t = await parseTableFile(f);
      const m = guessDcipColumns(t.headers);
      setFile({ name: f.name, headers: t.headers, rows: t.rows });
      setMapping(m);
      const p = m.a && m.m && m.rho ? parseDcipRows(t.rows, m) : null;
      if (p?.spacing) setOpts((o) => ({ ...o, cell: o.cell || String(+(p.spacing / 2).toFixed(2)), depth: o.depth || String(Math.round((p.span[1] - p.span[0]) / 4)) }));
      setMsg(p ? { ok: true, text: `${f.name}: ${p.readings.length} readings (${p.array}), electrodes ${p.span[0]}–${p.span[1]} m, smallest spacing ${p.spacing} m${p.ip ? ", with chargeability" : ""}${p.skipped ? `; ${p.skipped} row(s) skipped (missing A/M, non-positive resistivity${m.ip ? " or no chargeability" : ""})` : ""}.${t.note ? " " + t.note : ""}` }
        : { ok: false, text: "Map the A, M and apparent-resistivity columns below." });
    } catch (e) { setMsg({ ok: false, text: `Could not read ${f.name}: ${e.message}` }); }
  };

  const run = async () => {
    const problems = [];
    if (!parsed || !parsed.readings.length) problems.push("Import a line with A, M and apparent-resistivity columns.");
    if (!geom) problems.push("Enter the line's start and end coordinates (distance 0 = start).");
    if (!(num(opts.cell) > 0) || !(num(opts.depth) > num(opts.cell))) problems.push("Enter the cell size and model depth.");
    if (!(num(opts.pct) > 0) && !(num(opts.floor) > 0)) problems.push("Enter the resistivity data uncertainty (% and / or a floor) — how far you trust each reading.");
    if (parsed?.ip && !(num(opts.ipPct) > 0) && !(num(opts.ipFloor) > 0)) problems.push("Enter the chargeability uncertainty (% and / or a floor in mV/V).");
    let topo = null, groundNote = "";
    if (parsed && geom) {
      const pad = (parsed.span[1] - parsed.span[0]) * 0.5 + 50;
      topo = terrain ? terrainProfile(terrain, geom, parsed.span[0] - pad, parsed.span[1] + pad) : null;
      if (topo) groundNote = "ground from the terrain along the line";
      else if (Number.isFinite(num(line.ground))) { topo = [[parsed.span[0] - pad, num(line.ground)], [parsed.span[1] + pad, num(line.ground)]]; groundNote = `flat ground at ${num(line.ground)} m (entered)`; }
      else problems.push(terrain ? "The line leaves the terrain surface — enter a flat ground elevation instead." : "Load a terrain (Geophysics > Terrain) or enter a flat ground elevation for the line.");
    }
    if (problems.length) { setMsg({ ok: false, text: problems.join(" ") }); return; }
    const request = {
      readings: parsed.readings, rho: parsed.rho, ...(parsed.ip ? { chargeability: parsed.ip } : {}), topo,
      mesh: { cell: num(opts.cell), depth: num(opts.depth) }, maxIter: Number(opts.maxIter) || 20,
      uncertainty: { percent: num(opts.pct) || 0, floor: num(opts.floor) || 0 },
      ...(parsed.ip ? { ipUncertainty: { percent: num(opts.ipPct) || 0, floor: num(opts.ipFloor) || 0 } } : {}),
    };
    const name = file.name.replace(/\.(csv|txt)$/i, "");
    const meta = { label: `DC/IP inversion (${name})` };
    const lineGeom = geom;
    const params = {
      tool: "2D DC resistivity / IP inversion (SimPEG)", line: name, readings: parsed.readings.length, array: parsed.array,
      lineStart: [num(line.x0), num(line.y0)], lineEnd: [num(line.x1), num(line.y1)], lineAzimuth: +lineGeom.azimuth.toFixed(2), ground: groundNote,
      mesh: { cellM: num(opts.cell), depthM: num(opts.depth), verticalCellM: num(opts.cell) / 2 },
      uncertainty: { resistivityPercent: num(opts.pct) || 0, resistivityFloor: num(opts.floor) || 0, ...(parsed.ip ? { chargeabilityPercent: num(opts.ipPct) || 0, chargeabilityFloorMvV: num(opts.ipFloor) || 0 } : {}), source: "entered by user" },
      crs: `EPSG:${project?.epsg}`, interpretation: "One smooth model that fits the data to the stated uncertainty (2.5D: the ground is assumed not to change along strike, across the line). Deep and edge cells are poorly constrained — see the support.",
    };
    const token = getProjectToken();
    const res = await startInversionJob(request, meta, {
      kind: "dcip2d", setTaskProgress,
      onDone: (result) => {
        setLast({ result, geom: lineGeom, name });
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
  const lbl = { width: 112, flexShrink: 0, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
  const inp = { ...numInput, width: 78, flex: "none" };

  return (
    <div style={{ fontSize: "var(--font-size-sm)" }}>
      {engine && !engine.available && <div style={{ ...small, color: "var(--color-danger-fg)", marginBottom: 8 }}>Needs GeoStrix's Python engine with SimPEG (status bar: Py).</div>}
      <div style={small}>One survey line: electrode positions A, B, M, N as distances along the line (m; B or N blank for a pole), apparent resistivity (ohm·m) and optionally chargeability (mV/V). 2.5D: the ground is assumed not to change across the line.</div>
      <button onClick={() => fileRef.current?.click()} style={{ ...pBtn, marginTop: 8 }}><Upload size={14} /> Import line CSV…</button>
      <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={(e) => { onFile(e.target.files[0]); e.target.value = ""; }} />
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
          <div className="ge-section-label" style={{ marginTop: 10 }}>Line position (project CRS)</div>
          <div style={row}><span style={lbl}>Start x / y</span><input type="number" value={line.x0} onChange={(e) => setLine((l) => ({ ...l, x0: e.target.value }))} style={inp} aria-label="Line start x" /><input type="number" value={line.y0} onChange={(e) => setLine((l) => ({ ...l, y0: e.target.value }))} style={inp} aria-label="Line start y" /></div>
          <div style={row}><span style={lbl}>End x / y</span><input type="number" value={line.x1} onChange={(e) => setLine((l) => ({ ...l, x1: e.target.value }))} style={inp} aria-label="Line end x" /><input type="number" value={line.y1} onChange={(e) => setLine((l) => ({ ...l, y1: e.target.value }))} style={inp} aria-label="Line end y" /></div>
          {geom && <div style={small}>Line {Math.round(geom.length)} m long, azimuth {geom.azimuth.toFixed(1)}° (grid). Distances in the file are measured from the start.</div>}
          <div style={row} title="Used when there is no terrain under the line."><span style={lbl}>Flat ground (m)</span><input type="number" value={line.ground} onChange={(e) => setLine((l) => ({ ...l, ground: e.target.value }))} style={inp} aria-label="Flat ground elevation" /><span style={small}>{terrain ? "only if the line leaves the terrain" : "no terrain loaded"}</span></div>
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
      {last && <SectionResult last={last} cutoff={Number(opts.supportCutoff) || 0} />}
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
      <svg width={W} height={H} role="img" aria-label="Apparent resistivity pseudosection" style={{ display: "block", background: "var(--color-bg-subtle)", borderRadius: 4 }}>
        {pts.map((p, i) => <circle key={i} cx={x(p.s)} cy={y(p.depth)} r={2.6} fill={colorForVoxelValue(model, parsed.rho[i])} />)}
      </svg>
    </div>
  );
}

// the inverted section: cells coloured by resistivity (log) and chargeability, poorly supported cells greyed
function SectionResult({ last, cutoff }) {
  const { result } = last;
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
        {field === "resistivity" ? `${arrMin(vals).toPrecision(3)}–${arrMax(vals).toPrecision(3)} ohm·m (log colours: red conductive, blue resistive)` : `0–${arrMax(vals).toPrecision(3)} mV/V`} · {(s1 - s0).toFixed(0)} m × {(z1 - z0).toFixed(0)} m, vertical exaggeration {(sz / sx).toFixed(1)}× · grey = barely seen by the data. Added to Block models (3D, along the line).
      </div>
    </div>
  );
}
