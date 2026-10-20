import React, { useEffect, useMemo, useRef, useState } from "react";
import { addonStatus, addonCpuCheck, addonInstall, addonCancelInstall, addonUninstall, onAddonEvent, addonReady, runJob, cancelJob, addonHas } from "../lib/geomlAddon.js";
import { gradeStops, labStopsAt, sequentialStops } from "../lib/inversion.js";
import { trendToGeoml } from "../lib/trend.js"; // TASKS.csv #650
import { smallSel } from "../lib/sidebarStyles.js"; // TASKS.csv #704
import { rawSampleIntervals } from "../lib/geochem.js"; // TASKS.csv #658
import { excludeQAQC } from "../lib/qaqc.js"; // TASKS.csv #658
import { checkBlocks, blockPoints, blockCells } from "../lib/geomlClip.js"; // TASKS.csv #741
import { errorNotice } from "../lib/notices.js"; // TASKS.csv #739
import { percentileSorted } from "../lib/arrayStats.js"; // TASKS.csv #740

// TASKS.csv #638 — the Predictive tab (Matt: "a predictive modelling tab that will also do all modelling, but with its own
// geoML tools. That way I can compare both models in app"). It drives the optional geoML add-on (addons/geoml, GPL-3.0):
// install it on request, then model a rock unit (contact surface + probability blocks, each with uncertainty) or a
// grade (blocks with P10 / P90 and uncertainty). Results go into the 3D view beside the other models, named "geoML — …".
const QUALITY = {
  fast: { label: "Fast", domain: { iterations: 150, train_spacing: 10, inducing_spacing: 80, surface_block: 80, refine_levels: 1, block_size: 60 }, grade: { iterations: 150, composite: 5, inducing: 200, block_size: 50, simulations: 50 } },
  standard: { label: "Standard", domain: { iterations: 300, train_spacing: 5, inducing_spacing: 40, surface_block: 60, refine_levels: 2, block_size: 40 }, grade: { iterations: 300, composite: 5, inducing: 300, block_size: 30, simulations: 50 } },
  detailed: { label: "Detailed", domain: { iterations: 600, train_spacing: 2.5, inducing_spacing: 25, surface_block: 40, refine_levels: 2, block_size: 25 }, grade: { iterations: 600, composite: 2.5, inducing: 500, block_size: 20, simulations: 100 } },
};
const fmtMB = (b) => (b ? `${Math.round(b / 1e6).toLocaleString()} MB` : "—");
const PROB_STOPS = labStopsAt([{ value: 0, color: "#f4f1de" }, { value: 0.5, color: "#f2b134" }, { value: 0.8, color: "#d9601a" }, { value: 1, color: "#8f1f3d" }]); // #702 — Lab, like the other ramps

export default function PredictivePanel({ collars, survey, litho, assays, assayElements, terrain, desurveyMethod, trend, addVoxelModel, addSurface, setNotices }) {
  const [st, setSt] = useState(null);
  const [busyJob, setBusyJob] = useState(null);
  const [confirmInstall, setConfirmInstall] = useState(false); // #688 — one confirm step before a 553 MB download // TASKS.csv #691 — an orphaned job's id (from a 409)
  const [inst, setInst] = useState(null); // install progress { phase, got, total } | { error }
  const [job, setJob] = useState(null); // running job { label, progress, message, elapsed }
  const [runs, setRuns] = useState([]);
  const abortRef = useRef(null);
  const [cpu, setCpu] = useState(null); // TASKS.csv #689 — { avx: true | false | null }, asked once the add-on is known to be missing
  useEffect(() => { if (st && st.available !== false && !st.installed && !cpu) addonCpuCheck().then(setCpu); }, [st, cpu]);
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
  // #673 — says whether the range is the one the model learnt or only training's starting value (add-on < 0.1.2)
  const clipNote = (r, range, learnt) => (r.air || r.far ? `; left out ${[r.air ? `${r.air.toLocaleString()} above the ground${terrain ? "" : " (a surface through the collars — load a terrain for the real one)"}` : "", r.far ? `${r.far.toLocaleString()} more than ${range} m (${learnt ? "the range the model learnt" : "the model's starting range"}) from any sample` : ""].filter(Boolean).join(" and ")}` : "");

  const run = async (label, kind, params, onResult) => {
    const ctrl = new AbortController(); abortRef.current = ctrl;
    setJob({ label, progress: 0, message: "Starting the add-on" });
    const t0 = Date.now();
    try {
      const health = await addonReady((s) => setJob((j) => j && { ...j, message: `Starting the add-on (${s} s — the first start is slower)` }));
      // TASKS.csv #650 — the structural trend chosen for geoML (Model settings → Structural trends); add-on 0.1.0 ignores it
      const oldAddon = !addonHas(health, "trend"); // #692 — asked, not guessed from the version string
      if (trend) params = { ...params, trend: trendToGeoml(trend) };
      const res = await runJob(kind, params, (s) => setJob((j) => j && { ...j, progress: s.progress, message: s.message, elapsed: s.elapsed }), ctrl.signal);
      const note = `${await onResult(res)}${trend ? (oldAddon ? ` — the trend "${trend.name}" was NOT applied: this add-on version (${health?.version || "?"}) predates trends; update it (Remove the add-on, then install again)` : `; following the trend "${trend.name}"`) : ""}`;
      const secs = Math.round((Date.now() - t0) / 1000);
      setRuns((r) => [{ label, note, secs, at: new Date().toLocaleTimeString() }, ...r]);
      setNotices((p) => [...p, `geoML — ${label}: ${note} (${secs} s).`]);
    } catch (e) {
      if (e.busyJobId) setBusyJob(e.busyJobId); // #691 — a model left running earlier: offer to cancel it
      setNotices((p) => [...p, errorNotice(`geoML — ${label}: ${e.message}`)]); // #739
    } finally { setJob(null); abortRef.current = null; refresh(); }
  };

  const runUnit = () => {
    const name = unitName.trim() || [...unit].join(" + ");
    const intervals = (litho || []).filter((r) => r.value != null && r.value !== "" && Number.isFinite(r.from) && Number.isFinite(r.to)).map((r) => ({ hole_id: String(r.hole_id), from: r.from, to: r.to, value: String(r.value) }));
    const params = { ...holes(), intervals, target_values: [...unit], exclude_values: [...leaveOut].filter((v) => !unit.has(v)), model: deep ? "deep" : "stationary", ...QUALITY[quality].domain };
    run(`${name} (${deep ? "fold-following" : "stationary"}, ${QUALITY[quality].label.toLowerCase()})`, "domain", params, async (res) => {
      const parts = [];
      // #673 — clip to the range the model LEARNT when the add-on reports it (0.1.2+); 400 m is only training's start
      const range = Math.round(res.range?.trained || 400);
      const clip = await clipper(intervals, range);
      if (res.surface?.triangles?.length) {
        // #646 — triangles above the ground or beyond the range are left out (vertices kept; unused ones are harmless)
        const v = res.surface.vertices;
        const tri = res.surface.triangles.filter((t) => { const c = [0, 1, 2].map((k) => (v[t[0]][k] + v[t[1]][k] + v[t[2]][k]) / 3); return clip([{ x: c[0], y: c[1], z: c[2] }]).keep[0]; });
        const pos = new Float32Array(v.flat()), idx = new Uint32Array(tri.flat());
        addSurface({ name: `geoML — ${name} contact`, positions: pos, indices: idx, values: res.surface.uncertainty, params: { unit: [...unit], model: res.model, quality, seconds: res.seconds, contacts: res.contacts, area_m2: Math.round(res.surface.area) } });
        parts.push(`contact surface ${tri.length.toLocaleString()} triangles (darker = less certain)`);
      }
      const b = res.blocks;
      checkBlocks(b, ["probability", "uncertainty"]); // #741
      const r = clip(blockPoints(b));
      const cells = blockCells(b, r.keep, (i) => b.probability[i]), ucells = blockCells(b, r.keep, (i) => b.uncertainty[i]);
      // TASKS.csv #677 — what produced the model travels with it (panel, exports)
      const dparams = { tool: "geoML domain model", unitCodes: [...unit], leftOut: [...leaveOut].filter((v) => !unit.has(v)), model: deep ? "deep (fold-following)" : "stationary", quality: QUALITY[quality].label, ...QUALITY[quality].domain, startingRangeM: res.range?.start ?? range, trainedRangeM: res.range?.trained ?? null, trend: trend?.name || null, addonVersion: st?.version || null, trainingPoints: res.training_points, contacts: res.contacts, generatedAt: new Date().toISOString() };
      addVoxelModel({ name: `geoML — P(${name})`, source: "geoml", cells, min: 0, max: 1, colorMode: "continuous", stops: PROB_STOPS, threshold: 0.5, opacity: 0.6, params: { ...dparams, value: "probability of the unit (0-1)" } });
      const um = ucells.reduce((m, c) => Math.max(m, c.value), 0);
      addVoxelModel({ name: `geoML — uncertainty (${name})`, source: "geoml", cells: ucells, min: 0, max: um, colorMode: "continuous", stops: sequentialStops(0, um), visible: false, params: { ...dparams, value: "uncertainty of the indicator" } });
      parts.push(`${cells.length.toLocaleString()} blocks of ${b.cell} m with the probability of ${name} (showing ≥ 50%) and its uncertainty (hidden)${clipNote(r, range, !!res.range?.trained)}`);
      return `${parts.join("; ")} — ${res.training_points.toLocaleString()} points, ${res.contacts} contacts`;
    });
  };

  const runGrade = () => {
    const el = assayElements.find((e) => e.symbol === element);
    // TASKS.csv #658 — the same samples the block model and grade shell use: QA/QC rows (standards, blanks, field
    // duplicates) left out (#266), exact duplicate rows dropped and overlapping rows resolved into one interval
    // carrying their mean (#286 / #532 / #571), values read with the element's unit and detection-limit rules. Raw
    // rows were sent before: on Harry Au geoML warned of 92 overlapping intervals and composited them anyway
    // (120 of 1,760 five-metre composites off, by up to 41 %), and that warning never reached GeoStrix.
    const all = assays || [];
    const regular = excludeQAQC(all);
    const elementUnits = Object.fromEntries((assayElements || []).map((e) => [e.symbol, e.unit]));
    const { intervals, stats } = rawSampleIntervals(regular, element, el?.unit || "ppm", elementUnits);
    const samples = intervals.filter((iv) => Number.isFinite(iv.avgGrade)).map((iv) => ({ hole_id: String(iv.hole_id), from: iv.from, to: iv.to, value: iv.avgGrade }));
    const conflicts = intervals.filter((iv) => iv.conflict).length;
    const cleaned = [
      all.length > regular.length ? `${(all.length - regular.length).toLocaleString()} QA/QC rows left out` : "",
      stats.duplicatesSkipped ? `${stats.duplicatesSkipped.toLocaleString()} duplicate rows dropped` : "",
      conflicts ? `${conflicts.toLocaleString()} overlapping intervals averaged` : "",
      stats.negativeValues ? `${stats.negativeValues.toLocaleString()} negative lab codes treated as not assayed` : "",
    ].filter(Boolean).join(", ");
    if (!samples.length) { setNotices((q) => [...q, `geoML grade model: no ${element} samples to model after QA/QC rows were left out.`]); return; }
    const unitTxt = el?.unit ? ` ${el.unit}` : "";
    run(`${element} grade (${QUALITY[quality].label.toLowerCase()})`, "grade", { ...holes(), samples, element, ...QUALITY[quality].grade }, async (res) => {
      const b = res.blocks;
      checkBlocks(b, ["prediction"]); // #741 (p10 / p90 are optional)
      const range = Math.round(res.range?.trained || 150); // #673 — the learnt range (0.1.2+), else training's start
      const r = (await clipper(samples, range))(blockPoints(b));
      const keep = r.keep.map((k, i) => k && Number.isFinite(b.prediction[i])); // a spread only where there is a grade
      const cells = blockCells(b, keep, (i) => b.prediction[i]);
      const spread = b.p10 && b.p90 ? blockCells(b, keep, (i) => b.p90[i] - b.p10[i]) : [];
      if (!cells.length) throw new Error(`no block is both below the ground and within ${range} m of a sample.`);
      const vals = cells.map((c) => c.value).sort((p, q) => p - q); // the top quarter of the blocks kept
      const min = vals[0], max = vals[vals.length - 1], p75 = percentileSorted(vals, 0.75); // #740
      // TASKS.csv #677 — a geoML grade model is a grade estimate by another engine: its parameters, unit and the
      // "not a resource" statement go with it (exporters treat source "geoml" like estimate-*). #678 — the number of
      // simulations behind P10 / P90 is stated (20 draws gave P10 a 47 % relative error at a grade CV of 131 %).
      const nsim = QUALITY[quality].grade.simulations;
      const gparams = { tool: "geoML grade model", element, unit: el?.unit || null, quality: QUALITY[quality].label, compositeLengthM: QUALITY[quality].grade.composite, iterations: QUALITY[quality].grade.iterations, inducingPoints: QUALITY[quality].grade.inducing, blockSizeM: b.cell, simulations: nsim, startingRangeM: res.range?.start ?? range, trainedRangeM: res.range?.trained ?? null, trend: trend?.name || null, sampleIntervals: samples.length, composites: res.composites, qaqcExcluded: all.length - regular.length, addonVersion: st?.version || null, generatedAt: new Date().toISOString() };
      addVoxelModel({ name: `geoML — ${element}${unitTxt}`, source: "geoml", cells, min, max, colorMode: "continuous", stops: gradeStops(min, max) /* #702 — the same ramp an IDW estimate gets */, threshold: p75, opacity: 0.6, params: { ...gparams, value: "predicted grade (back-transformed mean)" } });
      if (spread.length) {
        const sv = spread.map((c) => c.value), smax = Math.max(...sv);
        addVoxelModel({ name: `geoML — ${element} P90 − P10 from ${nsim} simulations`, source: "geoml", cells: spread, min: 0, max: smax, colorMode: "continuous", stops: sequentialStops(0, smax), visible: false, params: { ...gparams, value: `P90 - P10 of ${nsim} simulations` } });
      }
      return `${cells.length.toLocaleString()} blocks of ${b.cell} m from ${res.composites.toLocaleString()} composites of ${samples.length.toLocaleString()} sample intervals${cleaned ? ` (${cleaned})` : ""}${clipNote(r, range, !!res.range?.trained)}, ${element} ${min.toPrecision(3)}–${max.toPrecision(3)}${unitTxt} (showing the top quarter, ≥ ${p75.toPrecision(3)}); P90 − P10 from ${nsim} simulations added (hidden).${res.data_warnings?.length ? ` geoML reported: ${res.data_warnings.join("; ")}.` : ""} Not a Mineral Resource estimate.`;
    });
  };

  const box = { background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, padding: 10, marginBottom: 10, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 };
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
          {/* TASKS.csv #688 — what you get, what it costs and what the licence means, then ONE confirm step: the button
              used to start a 553 MB download on the click (wrong on a metered camp connection) */}
          <div><strong>What you get:</strong> rock-unit and grade models with their uncertainty (a Fast model takes about a minute).</div>
          <div style={{ marginTop: 4 }}><strong>What it costs:</strong> a download{st.downloadBytes ? ` of about ${fmtMB(st.downloadBytes)}` : ""} from GitHub, {st.installedBytes ? `${fmtMB(st.installedBytes)} on disk` : "a few GB on disk"} (it carries TensorFlow), about 2 GB of free memory while a model runs, and a processor with AVX (most made since 2012; some budget Celeron / Pentium chips lack it).</div>
          <div style={{ marginTop: 4 }}><strong>Licence:</strong> free to use; it is GPL-3.0, which only matters if you redistribute it (<a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noreferrer">licence text</a>). GeoStrix itself stays MIT. You can remove it here (3D Modelling › geoML models) at any time.</div>
          {cpu?.avx === false && (
            <div role="alert" style={{ marginTop: 8, padding: 8, borderRadius: 6, background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", color: "var(--color-warn-text)" }}>
              Windows reports that this computer's processor has no AVX instructions. TensorFlow, which the add-on runs on, needs them, so the add-on would download and then fail to start. GeoStrix's own modelling tools (implicit surfaces, halos, grade shells, estimation) don't need it.
            </div>
          )}
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
            {confirmInstall && !inst?.phase ? (
              <>
                <span style={{ flex: 1 }}>{cpu?.avx === false ? "Download anyway?" : `Download${st.downloadBytes ? ` ${fmtMB(st.downloadBytes)}` : ""} now?`}</span>
                <button type="button" style={btn(true)} onClick={async () => { setConfirmInstall(false); setInst({ phase: "download", got: 0, total: st.downloadBytes || 0 }); const r = await addonInstall(); if (!r.ok) setInst({ error: r.error }); refresh(); }}>Download{st.downloadBytes ? ` ${fmtMB(st.downloadBytes)}` : ""}</button>
                <button type="button" style={btn(false)} onClick={() => setConfirmInstall(false)}>Not now</button>
              </>
            ) : inst?.phase ? (
              <>
                <span style={{ flex: 1 }}>{inst.phase === "unpack" ? "Unpacking…" : `Downloading ${fmtMB(inst.got)} of ${fmtMB(inst.total)}`}</span>
                {inst.phase === "download" && <button type="button" style={btn(false)} onClick={() => addonCancelInstall()}>Cancel</button>}
              </>
            ) : (
              <button type="button" style={btn(true, !st.url && !st.browser)} disabled={!st.url} onClick={() => setConfirmInstall(true)}>
                Install predictive modelling…
              </button>
            )}
          </div>
          {!st.url && !st.browser && <div style={{ marginTop: 6 }}>The add-on download isn't published for this version yet.</div>}
          {st.browser && <div style={{ marginTop: 6 }}>In the browser preview: run the add-on by hand on port 8766 (addons/geoml/README.md).</div>}
          {inst?.error && <div style={{ marginTop: 6, color: "var(--color-danger-fg)" }}>{inst.error}</div>}
        </div>
      ) : (
        <>
          <div style={box}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span style={{ flex: 1 }}>Quality</span>
              <select value={quality} onChange={(e) => setQuality(e.target.value)} aria-label="Model quality" style={{ ...smallSel, flex: 2 }}>
                {Object.entries(QUALITY).map(([k, q]) => <option key={k} value={k}>{q.label}</option>)}
              </select>
            </div>
            Fast takes about a minute, Detailed several. {st.dev ? "(Using a development copy of the add-on.)" : ""}
          </div>

          <div style={box}>
            {busyJob && (
              <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 5, padding: "5px 7px", marginBottom: 6 }}>
                A model started earlier is still running in the add-on.{" "}
                <button type="button" onClick={() => cancelJob(busyJob).then(() => { setBusyJob(null); setNotices((p) => [...p, "geoML: the earlier model was cancelled."]); }, (e) => setNotices((p) => [...p, errorNotice(`geoML: could not cancel it (${e.message}).`)]))} style={{ ...btn(false, false), padding: "1px 7px" }}>Cancel it</button>
              </div>
            )}
            <div style={h}>Model a rock unit</div>
            {!collars.length || !lithoMetres.length ? "Load drillholes with a lithology log first." : (
              <>
                <div style={{ marginBottom: 4 }}>Codes that make up the unit:</div>
                <div style={{ maxHeight: 150, overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 5, padding: 4, background: "var(--color-bg)" }}>
                  {lithoMetres.map(([code, m]) => (
                    // TASKS.csv #687 — the "use / left out" toggle was a span INSIDE the checkbox's <label>, so one click flipped
                    // both (the code ended up in the unit AND left out, and the exclusion was then dropped). Now a real button
                    // outside the label, and the two states exclude each other: leaving a code out takes it out of the unit,
                    // ticking it into the unit brings it back in.
                    <div key={code} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "var(--font-size-sm)" }}>
                      <label style={{ display: "flex", gap: 6, alignItems: "center", flex: 1, minWidth: 0 }}>
                        <input type="checkbox" checked={unit.has(code)} onChange={() => {
                          const adding = !unit.has(code);
                          setUnit((u) => { const n = new Set(u); adding ? n.add(code) : n.delete(code); return n; });
                          if (adding) setLeaveOut((s) => { if (!s.has(code)) return s; const n = new Set(s); n.delete(code); return n; });
                        }} />
                        <span style={{ flex: 1 }}>{code}</span><span style={{ color: "var(--color-text-muted)" }}>{Math.round(m).toLocaleString()} m</span>
                      </label>
                      <button type="button" aria-pressed={leaveOut.has(code)} aria-label={`${leaveOut.has(code) ? "Use" : "Leave out"} ${code}`} title="Leave this code out of the model (e.g. overburden)"
                        onClick={() => {
                          const leaving = !leaveOut.has(code);
                          setLeaveOut((s) => { const n = new Set(s); leaving ? n.add(code) : n.delete(code); return n; });
                          if (leaving) setUnit((u) => { if (!u.has(code)) return u; const n = new Set(u); n.delete(code); return n; });
                        }}
                        style={{ fontSize: "var(--font-size-xs)", color: leaveOut.has(code) ? "var(--color-warn-text)" : "var(--color-text-muted)", cursor: "pointer", background: "none", border: "none", padding: "0 2px", fontFamily: "inherit" }}>{leaveOut.has(code) ? "left out" : "use"}</button>
                    </div>
                  ))}
                </div>
                <input value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="Name (optional)" aria-label="Unit name" style={{ ...smallSel, width: "100%", boxSizing: "border-box", marginTop: 6 }} />
                <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }} title="geoML's deep model (GPWalk): a vector field bends the space so the contact can follow folds. Slower.">
                  <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} /> Follow folds (deep model, slower)
                </label>
                <button type="button" style={{ ...btn(true, !ready || !unit.size), marginTop: 8, width: "100%" }} disabled={!ready || !unit.size} onClick={runUnit}>Model {unit.size ? (unitName.trim() || [...unit].join(" + ")) : "the unit"}</button>
              </>
            )}
          </div>

          <div style={box}>
            <div style={h}>Model a grade</div>
            {/* TASKS.csv #677 — the one grade-estimation tool that said nothing about what its output is not */}
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 5, padding: "5px 7px", marginBottom: 6, lineHeight: 1.4 }}>
              <strong>Not a resource estimate.</strong> A targeting aid with uncertainty: no classification, dilution or recovery. Nothing it produces is a Mineral Resource under NI 43-101 or JORC.
            </div>
            {!collars.length || !elements.length ? "Load assays (Geochem tab) first." : (
              <>
                <select value={element} onChange={(e) => setElement(e.target.value)} aria-label="Element" style={{ ...smallSel, width: "100%" }}>
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
