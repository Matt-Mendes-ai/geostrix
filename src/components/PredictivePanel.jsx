import React, { useEffect, useMemo, useRef, useState } from "react";
import { addonStatus, addonInstall, addonCancelInstall, addonUninstall, onAddonEvent, addonReady, runJob } from "../lib/geomlAddon.js";
import { logStops, sequentialStops } from "../lib/inversion.js";

// TASKS.csv #638 — the Predictive tab (Matt: "a predictive modelling tab that will also do all modelling, but with its own
// geoML tools. That way I can compare both models in app"). It drives the optional geoML add-on (addons/geoml, GPL-3.0):
// install it on request, then model a rock unit (contact surface + probability blocks, each with uncertainty) or a
// grade (blocks with P10 / P90 and uncertainty). Results go into the 3D view beside the other models, named "geoML — …".
const QUALITY = {
  fast: { label: "Fast", domain: { iterations: 150, train_spacing: 10, inducing_spacing: 80, surface_block: 80, refine_levels: 1, block_size: 60 }, grade: { iterations: 150, composite: 5, inducing: 200, block_size: 50 } },
  standard: { label: "Standard", domain: { iterations: 300, train_spacing: 5, inducing_spacing: 40, surface_block: 60, refine_levels: 2, block_size: 40 }, grade: { iterations: 300, composite: 5, inducing: 300, block_size: 30 } },
  detailed: { label: "Detailed", domain: { iterations: 600, train_spacing: 2.5, inducing_spacing: 25, surface_block: 40, refine_levels: 2, block_size: 25 }, grade: { iterations: 600, composite: 2.5, inducing: 500, block_size: 20 } },
};
const fmtMB = (b) => (b ? `${Math.round(b / 1e6).toLocaleString()} MB` : "—");
const PROB_STOPS = [{ value: 0, color: "#f4f1de" }, { value: 0.5, color: "#f2b134" }, { value: 0.8, color: "#d9601a" }, { value: 1, color: "#8f1f3d" }];

export default function PredictivePanel({ collars, survey, litho, assays, assayElements, terrain, desurveyMethod, addVoxelModel, addSurface, setNotices }) {
  const [st, setSt] = useState(null);
  const [inst, setInst] = useState(null); // install progress { phase, got, total } | { error }
  const [job, setJob] = useState(null); // running job { label, progress, message, elapsed }
  const [runs, setRuns] = useState([]);
  const abortRef = useRef(null);
  const refresh = () => addonStatus().then(setSt).catch(() => setSt({ available: false }));
  useEffect(() => { refresh(); return onAddonEvent((ev) => { if (ev.phase === "download" || ev.phase === "unpack") setInst(ev); if (ev.phase === "done") { setInst(null); refresh(); } if (ev.phase === "stopped") refresh(); }); }, []);

  // ---- rock unit ----
  const lithoMetres = useMemo(() => {
    const m = new Map();
    for (const r of litho || []) { if (r.value == null || r.value === "") continue; const k = String(r.value); m.set(k, (m.get(k) || 0) + Math.max(0, (r.to ?? 0) - (r.from ?? 0))); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [litho]);
  const [unit, setUnit] = useState(new Set());
  const [leaveOut, setLeaveOut] = useState(new Set(["OB", "OVB", "CAS", "CASING"]));
  const [unitName, setUnitName] = useState("");
  const [deep, setDeep] = useState(false);
  const [quality, setQuality] = useState("standard");
  // ---- grade ----
  const elements = (assayElements || []).map((e) => e.symbol);
  const [element, setElement] = useState("");
  useEffect(() => { if (!element && elements.length) setElement(elements.includes("Cu") ? "Cu" : elements.includes("Au") ? "Au" : elements[0]); }, [elements.join(",")]);

  // TASKS.csv #644 — GeoStrix stores dips as degrees BELOW horizontal (positive down: importHelpers turns a
  // "-70" into 70); the add-on's API takes them negative-down (dip_positive_down=False). Sent as stored, every
  // hole was traced upward and the models came out mirrored above the collars (Woodjam MT23-118: toe at
  // 1,395 m instead of 536 m).
  const downDip = (d) => (Number.isFinite(d) ? -d : -90);
  const holes = () => ({
    collars: collars.map((c) => ({ hole_id: String(c.hole_id), x: c.x, y: c.y, z: c.z, azimuth: c.azimuth ?? 0, dip: downDip(c.dip), length: c.length ?? null })),
    survey: (survey || []).filter((s) => Number.isFinite(s.depth) && Number.isFinite(s.dip)).map((s) => ({ hole_id: String(s.hole_id), depth: s.depth, azimuth: s.azimuth, dip: -s.dip })),
  });

  // TASKS.csv #646 — which returned blocks to keep: below the ground (terrain, else a surface through the collars)
  // and within the model's range of a sample (lib/geomlClip.js). `intervals`: [{hole_id, from, to}] the model saw.
  const clipper = async (intervals, range) => {
    const [{ samplePointsFromIntervals }, { desurveyHole }, { makeGround, makeNearData, clipBlocks }] = await Promise.all([
      import("../lib/estimation.js"), import("../lib/desurvey.js"), import("../lib/geomlClip.js")]);
    const { points } = samplePointsFromIntervals(intervals.map((r) => ({ ...r, avgGrade: 1 })), collars, survey || [], desurveyHole, desurveyMethod);
    const ground = makeGround({ terrain, collars }), near = points.length ? makeNearData(points.map((q) => [q.x, q.y, q.z]), range) : null;
    return (blocks) => clipBlocks(blocks, { ground, near });
  };
  const clipNote = (r, range) => (r.air || r.far ? `; left out ${[r.air ? `${r.air.toLocaleString()} above the ground${terrain ? "" : " (a surface through the collars — load a terrain for the real one)"}` : "", r.far ? `${r.far.toLocaleString()} more than ${range} m from any sample` : ""].filter(Boolean).join(" and ")}` : "");

  const run = async (label, kind, params, onResult) => {
    const ctrl = new AbortController(); abortRef.current = ctrl;
    setJob({ label, progress: 0, message: "Starting the add-on" });
    const t0 = Date.now();
    try {
      await addonReady((s) => setJob((j) => j && { ...j, message: `Starting the add-on (${s} s — the first start is slower)` }));
      const res = await runJob(kind, params, (s) => setJob((j) => j && { ...j, progress: s.progress, message: s.message, elapsed: s.elapsed }), ctrl.signal);
      const note = await onResult(res);
      const secs = Math.round((Date.now() - t0) / 1000);
      setRuns((r) => [{ label, note, secs, at: new Date().toLocaleTimeString() }, ...r]);
      setNotices((p) => [...p, `geoML — ${label}: ${note} (${secs} s).`]);
    } catch (e) {
      setNotices((p) => [...p, `geoML — ${label}: ${e.message}`]);
    } finally { setJob(null); abortRef.current = null; refresh(); }
  };

  const runUnit = () => {
    const name = unitName.trim() || [...unit].join(" + ");
    const intervals = (litho || []).filter((r) => r.value != null && r.value !== "" && Number.isFinite(r.from) && Number.isFinite(r.to)).map((r) => ({ hole_id: String(r.hole_id), from: r.from, to: r.to, value: String(r.value) }));
    const params = { ...holes(), intervals, target_values: [...unit], exclude_values: [...leaveOut].filter((v) => !unit.has(v)), model: deep ? "deep" : "stationary", ...QUALITY[quality].domain };
    run(`${name} (${deep ? "fold-following" : "stationary"}, ${QUALITY[quality].label.toLowerCase()})`, "domain", params, async (res) => {
      const parts = [];
      const range = 400; // the add-on's default domain range
      const clip = await clipper(intervals, range);
      if (res.surface?.triangles?.length) {
        // #646 — triangles above the ground or beyond the range are left out (vertices kept; unused ones are harmless)
        const v = res.surface.vertices;
        const tri = res.surface.triangles.filter((t) => { const c = [0, 1, 2].map((k) => (v[t[0]][k] + v[t[1]][k] + v[t[2]][k]) / 3); return clip([{ x: c[0], y: c[1], z: c[2] }]).keep[0]; });
        const pos = new Float32Array(v.flat()), idx = new Uint32Array(tri.flat());
        addSurface({ name: `geoML — ${name} contact`, positions: pos, indices: idx, values: res.surface.uncertainty, params: { unit: [...unit], model: res.model, quality, seconds: res.seconds, contacts: res.contacts, area_m2: Math.round(res.surface.area) } });
        parts.push(`contact surface ${tri.length.toLocaleString()} triangles (darker = less certain)`);
      }
      const b = res.blocks, cells = [], ucells = [];
      const all = b.x.map((x, i) => ({ x, y: b.y[i], z: b.z[i] })), r = clip(all);
      for (let i = 0; i < b.x.length; i++) {
        if (!r.keep[i]) continue;
        const c = { x: b.x[i], y: b.y[i], z: b.z[i], dx: b.cell, dy: b.cell, dz: b.cell };
        cells.push({ ...c, value: b.probability[i] }); ucells.push({ ...c, value: b.uncertainty[i] });
      }
      addVoxelModel({ name: `geoML — P(${name})`, source: "geoml", cells, min: 0, max: 1, colorMode: "continuous", stops: PROB_STOPS, threshold: 0.5, opacity: 0.6 });
      const um = ucells.reduce((m, c) => Math.max(m, c.value), 0);
      addVoxelModel({ name: `geoML — uncertainty (${name})`, source: "geoml", cells: ucells, min: 0, max: um, colorMode: "continuous", stops: sequentialStops(0, um), visible: false });
      parts.push(`${cells.length.toLocaleString()} blocks of ${b.cell} m with the probability of ${name} (showing ≥ 50%) and its uncertainty (hidden)${clipNote(r, range)}`);
      return `${parts.join("; ")} — ${res.training_points.toLocaleString()} points, ${res.contacts} contacts`;
    });
  };

  const runGrade = () => {
    const el = assayElements.find((e) => e.symbol === element);
    const samples = (assays || []).filter((a) => Number.isFinite(a.values?.[element]) && Number.isFinite(a.from) && Number.isFinite(a.to)).map((a) => ({ hole_id: String(a.hole_id), from: a.from, to: a.to, value: a.values[element] }));
    const unitTxt = el?.unit ? ` ${el.unit}` : "";
    run(`${element} grade (${QUALITY[quality].label.toLowerCase()})`, "grade", { ...holes(), samples, element, ...QUALITY[quality].grade }, async (res) => {
      const b = res.blocks, cells = [], spread = [];
      const range = 150; // the add-on's default grade range
      const r = (await clipper(samples, range))(b.x.map((x, i) => ({ x, y: b.y[i], z: b.z[i] })));
      for (let i = 0; i < b.x.length; i++) {
        if (!r.keep[i] || !Number.isFinite(b.prediction[i])) continue;
        const c = { x: b.x[i], y: b.y[i], z: b.z[i], dx: b.cell, dy: b.cell, dz: b.cell };
        cells.push({ ...c, value: b.prediction[i] });
        if (b.p10 && b.p90) spread.push({ ...c, value: b.p90[i] - b.p10[i] });
      }
      if (!cells.length) throw new Error(`no block is both below the ground and within ${range} m of a sample.`);
      const vals = cells.map((c) => c.value).sort((p, q) => p - q); // the top quarter of the blocks kept
      const min = vals[0], max = vals[vals.length - 1], p75 = vals[Math.floor(vals.length * 0.75)];
      addVoxelModel({ name: `geoML — ${element}${unitTxt}`, source: "geoml", cells, min, max, colorMode: "continuous", stops: min > 0 && max / min >= 100 ? logStops(min, max) : sequentialStops(min, max), threshold: p75, opacity: 0.6 });
      if (spread.length) {
        const sv = spread.map((c) => c.value), smax = Math.max(...sv);
        addVoxelModel({ name: `geoML — ${element} P90 − P10 (spread)`, source: "geoml", cells: spread, min: 0, max: smax, colorMode: "continuous", stops: sequentialStops(0, smax), visible: false });
      }
      return `${cells.length.toLocaleString()} blocks of ${b.cell} m from ${res.composites.toLocaleString()} composites${clipNote(r, range)}, ${element} ${min.toPrecision(3)}–${max.toPrecision(3)}${unitTxt} (showing the top quarter, ≥ ${p75.toPrecision(3)}); P90 − P10 spread added (hidden)`;
    });
  };

  const box = { background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, marginBottom: 10, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 };
  const btn = (primary, disabled) => ({ padding: "6px 12px", borderRadius: 6, border: primary ? "1px solid var(--color-success-border)" : "1px solid var(--color-border)", background: primary ? "var(--color-success-bg)" : "var(--color-bg)", color: primary ? "var(--color-success-text)" : "var(--color-text)", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, fontSize: "var(--font-size-base)" });
  const h = { fontWeight: 600, color: "var(--color-text)", fontSize: "var(--font-size-base)", marginBottom: 6 };
  const ready = st?.installed && !job;

  return (
    <div>
      <div className="ge-section-label">Predictive modelling (geoML)</div>
      <div style={box}>
        Models with <strong>uncertainty</strong> from Gaussian processes (<a href="https://github.com/italo-goncalves/geoML" target="_blank" rel="noreferrer">geoML</a>, Ítalo Gonçalves). Results appear in the 3D view beside your other models, named "geoML — …", so you can compare them. Everything runs on this computer.
      </div>

      {!st ? <div style={box}>Checking the add-on…</div> : !st.installed ? (
        <div style={box}>
          <div style={h}>Install the add-on</div>
          It is a separate download{st.downloadBytes ? ` of about ${fmtMB(st.downloadBytes)}` : ""} ({st.installedBytes ? `${fmtMB(st.installedBytes)} on disk` : "a few GB on disk"}), because it carries TensorFlow. It needs a recent laptop: about 2 GB of free memory while a model runs. Licence: GPL-3.0 (free software); GeoStrix itself stays MIT.
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
            {inst?.phase ? (
              <>
                <span style={{ flex: 1 }}>{inst.phase === "unpack" ? "Unpacking…" : `Downloading ${fmtMB(inst.got)} of ${fmtMB(inst.total)}`}</span>
                {inst.phase === "download" && <button type="button" style={btn(false)} onClick={() => addonCancelInstall()}>Cancel</button>}
              </>
            ) : (
              <button type="button" style={btn(true, !st.url && !st.browser)} disabled={!st.url} onClick={async () => { setInst({ phase: "download", got: 0, total: st.downloadBytes || 0 }); const r = await addonInstall(); if (!r.ok) setInst({ error: r.error }); refresh(); }}>
                Install predictive modelling…
              </button>
            )}
          </div>
          {!st.url && !st.browser && <div style={{ marginTop: 6 }}>The add-on download isn't published for this version yet.</div>}
          {st.browser && <div style={{ marginTop: 6 }}>In the browser preview: run the add-on by hand on port 8766 (addons/geoml/README.md).</div>}
          {inst?.error && <div style={{ marginTop: 6, color: "var(--color-danger-text)" }}>{inst.error}</div>}
        </div>
      ) : (
        <>
          <div style={box}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span style={{ flex: 1 }}>Quality</span>
              <select value={quality} onChange={(e) => setQuality(e.target.value)} aria-label="Model quality" style={{ flex: 2 }}>
                {Object.entries(QUALITY).map(([k, q]) => <option key={k} value={k}>{q.label}</option>)}
              </select>
            </div>
            Fast takes about a minute, Detailed several. {st.dev ? "(Using a development copy of the add-on.)" : ""}
          </div>

          <div style={box}>
            <div style={h}>Model a rock unit</div>
            {!collars.length || !lithoMetres.length ? "Load drillholes with a lithology log first." : (
              <>
                <div style={{ marginBottom: 4 }}>Codes that make up the unit:</div>
                <div style={{ maxHeight: 150, overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 5, padding: 4, background: "var(--color-bg)" }}>
                  {lithoMetres.map(([code, m]) => (
                    <label key={code} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "var(--font-size-sm)" }}>
                      <input type="checkbox" checked={unit.has(code)} onChange={() => setUnit((u) => { const n = new Set(u); n.has(code) ? n.delete(code) : n.add(code); return n; })} />
                      <span style={{ flex: 1 }}>{code}</span><span style={{ color: "var(--color-text-muted)" }}>{Math.round(m).toLocaleString()} m</span>
                      <span role="button" tabIndex={0} title="Leave this code out of the model (e.g. overburden)" onClick={() => setLeaveOut((s) => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; })} onKeyDown={() => {}}
                        style={{ fontSize: "var(--font-size-xs)", color: leaveOut.has(code) ? "var(--color-warn-text)" : "var(--color-text-muted)", cursor: "pointer" }}>{leaveOut.has(code) ? "left out" : "use"}</span>
                    </label>
                  ))}
                </div>
                <input value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="Name (optional)" aria-label="Unit name" style={{ width: "100%", boxSizing: "border-box", marginTop: 6 }} />
                <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }} title="geoML's deep model (GPWalk): a vector field bends the space so the contact can follow folds. Slower.">
                  <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} /> Follow folds (deep model, slower)
                </label>
                <button type="button" style={{ ...btn(true, !ready || !unit.size), marginTop: 8, width: "100%" }} disabled={!ready || !unit.size} onClick={runUnit}>Model {unit.size ? (unitName.trim() || [...unit].join(" + ")) : "the unit"}</button>
              </>
            )}
          </div>

          <div style={box}>
            <div style={h}>Model a grade</div>
            {!collars.length || !elements.length ? "Load assays (Geochem tab) first." : (
              <>
                <select value={element} onChange={(e) => setElement(e.target.value)} aria-label="Element" style={{ width: "100%" }}>
                  {elements.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button type="button" style={{ ...btn(true, !ready || !element), marginTop: 8, width: "100%" }} disabled={!ready || !element} onClick={runGrade}>Model {element || "a grade"}</button>
              </>
            )}
          </div>

          {job && (
            <div style={{ ...box, borderColor: "var(--color-accent)" }}>
              <div style={h}>{job.label}</div>
              <div style={{ height: 6, background: "var(--color-border)", borderRadius: 3, overflow: "hidden", margin: "4px 0 6px" }}>
                <div style={{ width: `${Math.round((job.progress || 0) * 100)}%`, height: "100%", background: "var(--color-accent)" }} />
              </div>
              <div>{job.message}{job.elapsed ? ` · ${Math.round(job.elapsed)} s` : ""}</div>
              <button type="button" style={{ ...btn(false), marginTop: 6 }} onClick={() => abortRef.current?.abort()}>Cancel</button>
            </div>
          )}

          {runs.length > 0 && (
            <div style={box}>
              <div style={h}>This session</div>
              {runs.map((r, i) => <div key={i} style={{ marginBottom: 4 }}><strong>{r.label}</strong> · {r.secs} s · {r.at}<br />{r.note}</div>)}
            </div>
          )}

          {!st.dev && <button type="button" style={{ ...btn(false, !!job), fontSize: "var(--font-size-sm)" }} disabled={!!job} onClick={async () => { if (window.confirm("Remove the predictive-modelling add-on from this computer? Models already in your project stay.")) { await addonUninstall(); refresh(); } }}>Remove the add-on</button>}
        </>
      )}
    </div>
  );
}
