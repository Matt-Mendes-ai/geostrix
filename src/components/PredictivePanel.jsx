import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { subscribeRun, getRun, getRunHistory, beginRun, updateRun, endRun, cancelRun, quietFor, formatElapsed } from "../lib/geomlRun.js"; // TASKS.csv #1142
import { planDomain, planGrade, roughTime, INDUCING_CAP, INDUCING_LIMIT_NO_CAP, FOCUS_SPACING, FOCUS_OTHER } from "../lib/geomlPlan.js"; // TASKS.csv #1146; #1312
import { useSetTaskProgress } from "../lib/store.jsx";
import { addonStatus, addonCpuCheck, addonInstall, addonCancelInstall, addonUninstall, onAddonEvent, addonReady, runJob, cancelJob, addonHas } from "../lib/geomlAddon.js";
import { gradeStops, labStopsAt, sequentialStops } from "../lib/inversion.js";
import { trendToGeoml } from "../lib/trend.js"; // TASKS.csv #650
import { smallSel } from "../lib/sidebarStyles.js"; // TASKS.csv #704
import { rawSampleIntervals } from "../lib/geochem.js"; // TASKS.csv #658
import { excludeQAQC } from "../lib/qaqc.js"; // TASKS.csv #658
import { checkBlocks, blockPoints, blockCells } from "../lib/geomlClip.js"; // TASKS.csv #741
import { errorNotice, notice } from "../lib/notices.js"; // TASKS.csv #739
import { percentileSorted } from "../lib/arrayStats.js"; // TASKS.csv #740
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

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
  const [denseNear, setDenseNear] = useState(null); // TASKS.csv #1312 — null: by the rule (thin runs)
  const [heldOut, setHeldOut] = useState(false); // #1312 — also test on holes left out of training
  const [confirmInstall, setConfirmInstall] = useState(false); // #688 — one confirm step before a 553 MB download // TASKS.csv #691 — an orphaned job's id (from a 409)
  const [inst, setInst] = useState(null); // install progress { phase, got, total } | { error }
  // TASKS.csv #1142 — the run and its history live in lib/geomlRun.js: they outlive this panel when another pane is opened
  const job = useSyncExternalStore(subscribeRun, getRun);
  const runs = useSyncExternalStore(subscribeRun, getRunHistory);
  const setTaskProgress = useSetTaskProgress();
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
  useEffect(() => setDenseNear(null), [unit]); // a tick is for one unit: another goes back to the rule
  const [leaveOut, setLeaveOut] = useState(new Set(["OB", "OVB", "CAS", "CASING"]));
  const [unitName, setUnitName] = useState("");
  const [deep, setDeep] = useState(false);
  const [quality, setQuality] = useState("standard");
  // ---- grade ----
  const elements = (assayElements || []).map((e) => e.symbol);
  const [element, setElement] = useState("");
  useEffect(() => { if (!element && elements.length) setElement(elements.includes("Cu") ? "Cu" : elements.includes("Au") ? "Au" : elements[0]); }, [elements.join(",")]);

  // TASKS.csv #1146 — what a run would be, before it is sent
  const unitPlan = useMemo(() => {
    if (!unit.size) return null;
    const q = QUALITY[quality].domain;
    const iv = (litho || []).filter((r) => r.value != null && r.value !== "" && Number.isFinite(r.from) && Number.isFinite(r.to)).map((r) => ({ hole_id: String(r.hole_id), from: r.from, to: r.to, value: r.value }));
    return planDomain({ collars, intervals: iv, targets: new Set([...unit].map(String)), exclude: new Set([...leaveOut].filter((v) => !unit.has(v)).map(String)), trainSpacing: q.train_spacing, inducingSpacing: q.inducing_spacing, iterations: q.iterations, dense: denseNear, deep });
  }, [collars, litho, unit, leaveOut, quality, denseNear, deep]);
  const gradePlan = useMemo(() => {
    if (!element) return null;
    const units = Object.fromEntries((assayElements || []).map((e) => [e.symbol, e.unit]));
    const { intervals } = rawSampleIntervals(excludeQAQC(assays || []), element, units[element] || "ppm", units);
    const samples = intervals.filter((iv) => Number.isFinite(iv.avgGrade));
    const q = QUALITY[quality].grade;
    return samples.length ? planGrade({ samples, composite: q.composite, inducing: q.inducing, iterations: q.iterations }) : null;
  }, [assays, assayElements, element, quality]);

  // TASKS.csv #644 — GeoStrix stores dips as degrees BELOW horizontal (positive down: importHelpers turns a
  // "-70" into 70); the add-on's API takes them negative-down (dip_positive_down=False). Sent as stored, every
  // hole was traced upward and the models came out mirrored above the collars (Woodjam MT23-118: toe at
  // 1,395 m instead of 536 m).
  const downDip = (d) => (Number.isFinite(d) ? -d : -90);
  const holes = (only = null) => ({ // only: a Set of hole ids (#1146), or every hole
    collars: collars.filter((c) => !only || only.has(String(c.hole_id))).map((c) => ({ hole_id: String(c.hole_id), x: c.x, y: c.y, z: c.z, azimuth: c.azimuth ?? 0, dip: downDip(c.dip), length: c.length ?? null })),
    survey: (survey || []).filter((s) => Number.isFinite(s.depth) && Number.isFinite(s.dip) && (!only || only.has(String(s.hole_id)))).map((s) => ({ hole_id: String(s.hole_id), depth: s.depth, azimuth: s.azimuth, dip: -s.dip })),
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
    const ctrl = new AbortController();
    beginRun(label, ctrl, tr("Starting the add-on"));
    // #1142 — in the status bar with its Cancel, so a long run stays visible and stoppable from any pane
    const statusLabel = tr("geoML: {label}", { label }), toBar = (progress) => setTaskProgress({ label: statusLabel, pct: (progress || 0) * 100, onCancel: () => cancelRun(tr("Cancelling…")) });
    toBar(0);
    let record = null;
    const t0 = Date.now();
    try {
      const health = await addonReady((s) => updateRun({ message: tr("Starting the add-on ({s} s — the first start is slower)", { s }) }));
      // TASKS.csv #650 — the structural trend chosen for geoML (Model settings → Structural trends); add-on 0.1.0 ignores it
      const oldAddon = !addonHas(health, "trend"); // #692 — asked, not guessed from the version string
      // TASKS.csv #1158 — an add-on that cannot cap the inducing points would fill the memory and sit at 8 %: say so instead of starting
      if (kind === "domain" && (unitPlan?.inducingBuilt || 0) > INDUCING_LIMIT_NO_CAP && !addonHas(health, "max_inducing")) {
        throw new Error(tr("This unit has {c} contacts, which needs {n} inducing points: more than this version of the add-on ({v}) can hold in memory. Merge thin codes into the unit, or choose fewer holes, or update the add-on when a newer version is available.", { c: unitPlan.contacts.toLocaleString(), n: unitPlan.inducingBuilt.toLocaleString(), v: health?.version || "?" }));
      }
      if (trend) params = { ...params, trend: trendToGeoml(trend) };
      const res = await runJob(kind, params, (s) => { if (!getRun()?.cancelling) updateRun({ progress: s.progress, message: s.message, elapsed: s.elapsed }); toBar(s.progress); }, ctrl.signal);
      const note = `${await onResult(res)}${trend ? (oldAddon ? tr(" — the trend \"{name}\" was NOT applied: this add-on version ({v}) predates trends; update it (Remove the add-on, then install again)", { name: trend.name, v: health?.version || "?" }) : tr("; following the trend \"{name}\"", { name: trend.name })) : ""}`;
      const secs = Math.round((Date.now() - t0) / 1000);
      record = { label, note, secs, at: new Date().toLocaleTimeString() };
      setNotices((p) => [...p, notice("geoML — {label}: {note} ({secs} s).", { label, note, secs })]);
    } catch (e) {
      if (e.busyJobId) setBusyJob(e.busyJobId); // #691 — a model left running earlier: offer to cancel it
      setNotices((p) => [...p, errorNotice(tr("geoML — {label}: {message}", { label, message: e.message }))]); // #739
    } finally { endRun(record); setTaskProgress(null); refresh(); }
  };

  const runUnit = () => {
    const name = unitName.trim() || [...unit].join(" + ");
    const intervals = (litho || []).filter((r) => r.value != null && r.value !== "" && Number.isFinite(r.from) && Number.isFinite(r.to)).map((r) => ({ hole_id: String(r.hole_id), from: r.from, to: r.to, value: String(r.value) }));
    // #1146 — sized before it is sent: holes near the unit only, then a coarser spacing, when the whole project will not fit
    const plan = unitPlan;
    const sent = plan?.holeIds ? intervals.filter((r) => plan.holeIds.has(r.hole_id)) : intervals;
    const params = { ...holes(plan?.holeIds), intervals: sent, target_values: [...unit], exclude_values: [...leaveOut].filter((v) => !unit.has(v)), model: deep ? "deep" : "stationary", ...QUALITY[quality].domain, ...(plan ? { train_spacing: plan.trainSpacing, inducing_spacing: plan.inducingSpacing } : {}), max_inducing: INDUCING_CAP, ...(plan?.denseOn ? { focus_spacing: FOCUS_SPACING, focus_other: FOCUS_OTHER } : {}), ...(heldOut ? { held_out: true } : {}) }; // #1312: an older add-on ignores these
    const sizing = plan && (plan.focused || plan.factor > 1) ? { holesSent: plan.nHoles, holesInProject: plan.totalHoles, focusM: plan.focused ? plan.focusM : null, trainSpacingM: plan.trainSpacing, inducingSpacingM: plan.inducingSpacing, pointsWithoutSizing: plan.wanted.points } : null;
    run(`${name} (${deep ? "fold-following" : "stationary"}, ${QUALITY[quality].label.toLowerCase()})`, "domain", params, async (res) => {
      const parts = [];
      // #673 — clip to the range the model LEARNT when the add-on reports it (0.1.2+); 400 m is only training's start
      const range = Math.round(res.range?.trained || 400);
      const clip = await clipper(sent, range);
      if (res.surface?.triangles?.length) {
        // #646 — triangles above the ground or beyond the range are left out (vertices kept; unused ones are harmless)
        const v = res.surface.vertices;
        const tri = res.surface.triangles.filter((t) => { const c = [0, 1, 2].map((k) => (v[t[0]][k] + v[t[1]][k] + v[t[2]][k]) / 3); return clip([{ x: c[0], y: c[1], z: c[2] }]).keep[0]; });
        const pos = new Float32Array(v.flat()), idx = new Uint32Array(tri.flat());
        addSurface({ name: `geoML — ${name} contact`, positions: pos, indices: idx, values: res.surface.uncertainty, params: { unit: [...unit], model: res.model, quality, seconds: res.seconds, contacts: res.contacts, area_m2: Math.round(res.surface.area) } });
        parts.push(tr("contact surface {tri} triangles (darker = less certain)", { tri: tri.length.toLocaleString() }));
      }
      const b = res.blocks;
      checkBlocks(b, ["probability", "uncertainty"]); // #741
      const r = clip(blockPoints(b));
      const cells = blockCells(b, r.keep, (i) => b.probability[i]), ucells = blockCells(b, r.keep, (i) => b.uncertainty[i]);
      // TASKS.csv #677 — what produced the model travels with it (panel, exports)
      const dparams = { tool: "geoML domain model", ...(sizing ? { sizing } : {}) /* #1146 */, ...(plan?.denseOn ? { denseNearUnit: { spacingM: FOCUS_SPACING, otherPoints: FOCUS_OTHER } } : {}), ...(res.held_out ? { heldOutCheck: res.held_out } : {}) /* #1312 */, unitCodes: [...unit], leftOut: [...leaveOut].filter((v) => !unit.has(v)), model: deep ? "deep (fold-following)" : "stationary", quality: QUALITY[quality].label, ...QUALITY[quality].domain, startingRangeM: res.range?.start ?? range, trainedRangeM: res.range?.trained ?? null, trend: trend?.name || null, addonVersion: st?.version || null, trainingPoints: res.training_points, contacts: res.contacts, generatedAt: new Date().toISOString() };
      addVoxelModel({ name: `geoML — P(${name})`, source: "geoml", cells, min: 0, max: 1, colorMode: "continuous", stops: PROB_STOPS, threshold: 0.5, opacity: 0.6, params: { ...dparams, value: "probability of the unit (0-1)" } });
      const um = ucells.reduce((m, c) => Math.max(m, c.value), 0);
      addVoxelModel({ name: `geoML — uncertainty (${name})`, source: "geoml", cells: ucells, min: 0, max: um, colorMode: "continuous", stops: sequentialStops(0, um), visible: false, params: { ...dparams, value: "uncertainty of the indicator" } });
      parts.push(tr("{cells} blocks of {cell} m with the probability of {name} (showing ≥ 50%) and its uncertainty (hidden){v}", { cells: cells.length.toLocaleString(), cell: b.cell, name, v: clipNote(r, range, !!res.range?.trained) }));
      if (sizing) parts.push(sizing.focusM ? tr("only the {n} of {total} holes within {d} m of the unit were modelled", { n: sizing.holesSent, total: sizing.holesInProject, d: sizing.focusM.toLocaleString() }) : tr("spacing widened to {s} m to fit in memory", { s: sizing.trainSpacingM }));
      // #1158 — a finished run is not a good model: the fit to the logs, plainly (add-on 0.1.3+)
      // #1312 — that is on the points it trained on, which flatters it (PS_POR 66% there, 24% on unseen holes): said, and tested if asked
      const unseen = res.held_out ? ` ${tr("On {k} of {n} holes left out of training: {a}% of the points in the unit come out inside it, {b}% of the others outside. This is the better guide to holes not yet drilled.", { k: res.held_out.holes_left_out, n: res.held_out.holes, a: Math.round(res.held_out.in_unit * 100), b: Math.round(res.held_out.other * 100) })}` : heldOut ? ` ${tr("The test on unseen holes did not run: it needs at least 4 holes with the unit and an up-to-date add-on.")}` : ` ${tr("Unseen holes usually score lower: tick the test on unseen holes to measure it.")}`;
      const fit = res.fit ? ` ${tr("On the points it trained on: {a}% of those in the unit come out inside it, {b}% of the others outside.", { a: Math.round(res.fit.in_unit * 100), b: Math.round(res.fit.other * 100) })}${res.fit.in_unit < 0.3 ? ` ${tr("That is weak: the surface and blocks do not reproduce this unit where it was logged. A higher quality, a narrower set of holes or a merged code may do better.")}` : ""}` : "";
      return `${parts.join("; ")} — ${res.training_points.toLocaleString()} points, ${res.contacts} contacts.${fit}${unseen}`;
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
    if (!samples.length) { setNotices((q) => [...q, notice("geoML grade model: no {element} samples to model after QA/QC rows were left out.", { element })]); return; }
    const unitTxt = el?.unit ? ` ${el.unit}` : "";
    const gq = planGrade({ samples, composite: QUALITY[quality].grade.composite, inducing: QUALITY[quality].grade.inducing, iterations: QUALITY[quality].grade.iterations }); // #1146
    run(`${element} grade (${QUALITY[quality].label.toLowerCase()})`, "grade", { ...holes(), samples, element, ...QUALITY[quality].grade, composite: gq.composite }, async (res) => {
      const b = res.blocks;
      checkBlocks(b, ["prediction"]); // #741 (p10 / p90 are optional)
      const range = Math.round(res.range?.trained || 150); // #673 — the learnt range (0.1.2+), else training's start
      const r = (await clipper(samples, range))(blockPoints(b));
      const keep = r.keep.map((k, i) => k && Number.isFinite(b.prediction[i])); // a spread only where there is a grade
      const cells = blockCells(b, keep, (i) => b.prediction[i]);
      const spread = b.p10 && b.p90 ? blockCells(b, keep, (i) => b.p90[i] - b.p10[i]) : [];
      if (!cells.length) throw new Error(tr("no block is both below the ground and within {range} m of a sample.", { range }));
      const vals = cells.map((c) => c.value).sort((p, q) => p - q); // the top quarter of the blocks kept
      const min = vals[0], max = vals[vals.length - 1], p75 = percentileSorted(vals, 0.75); // #740
      // TASKS.csv #677 — a geoML grade model is a grade estimate by another engine: its parameters, unit and the
      // "not a resource" statement go with it (exporters treat source "geoml" like estimate-*). #678 — the number of
      // simulations behind P10 / P90 is stated (20 draws gave P10 a 47 % relative error at a grade CV of 131 %).
      const nsim = QUALITY[quality].grade.simulations;
      const gparams = { tool: "geoML grade model", element, unit: el?.unit || null, quality: QUALITY[quality].label, compositeLengthM: gq.composite, iterations: QUALITY[quality].grade.iterations, inducingPoints: QUALITY[quality].grade.inducing, blockSizeM: b.cell, simulations: nsim, startingRangeM: res.range?.start ?? range, trainedRangeM: res.range?.trained ?? null, trend: trend?.name || null, sampleIntervals: samples.length, composites: res.composites, qaqcExcluded: all.length - regular.length, addonVersion: st?.version || null, generatedAt: new Date().toISOString() };
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
      <div className="ge-section-label">{tr("Predictive modelling (geoML)")}</div>
      <div style={box}>{tr("Models with")}{" "}<strong>{tr("uncertainty")}</strong>{" "}{tr("from Gaussian processes (")}<a href="https://github.com/italo-goncalves/geoML" target="_blank" rel="noreferrer">{tr("geoML")}</a>{tr(", Ítalo Gonçalves). Results appear in the 3D view beside your other models, named \"geoML — …\", so you can compare them. Everything runs on this computer.")}</div>

      {!st ? <div style={box}>{tr("Checking the add-on…")}</div> : !st.installed ? (
        <div style={box}>
          <div style={h}>{tr("Install the add-on")}</div>
          {/* TASKS.csv #688 — what you get, what it costs and what the licence means, then ONE confirm step: the button
              used to start a 553 MB download on the click (wrong on a metered camp connection) */}
          <div><strong>{tr("What you get:")}</strong>{" "}{tr("rock-unit and grade models with their uncertainty.")}</div>
          <div style={{ marginTop: 4 }}><strong>{tr("What it costs:")}</strong>{" "}{tr("a download{v} from GitHub, {v2} (it carries TensorFlow), about 2 GB of free memory while a model runs, and a processor with AVX (most made since 2012; some budget Celeron / Pentium chips lack it).", { v: st.downloadBytes ? tr(" of about {v}", { v: fmtMB(st.downloadBytes) }) : "", v2: st.installedBytes ? tr("{v} on disk", { v: fmtMB(st.installedBytes) }) : tr("a few GB on disk") })}</div>
          <div style={{ marginTop: 4 }}><strong>{tr("Licence:")}</strong>{" "}{tr("free to use; it is GPL-3.0, which only matters if you redistribute it (")}<a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noreferrer">{tr("licence text")}</a>{tr("). GeoStrix itself stays MIT. You can remove it here (3D Modelling › geoML models) at any time.")}</div>
          {cpu?.avx === false && (
            <div role="alert" style={{ marginTop: 8, padding: 8, borderRadius: 6, background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", color: "var(--color-warn-text)" }}>{tr("Windows reports that this computer's processor has no AVX instructions. TensorFlow, which the add-on runs on, needs them, so the add-on would download and then fail to start. GeoStrix's own modelling tools (implicit surfaces, halos, grade shells, estimation) don't need it.")}</div>
          )}
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
            {confirmInstall && !inst?.phase ? (
              <>
                <span style={{ flex: 1 }}>{cpu?.avx === false ? tr("Download anyway?") : tr("Download{v} now?", { v: st.downloadBytes ? ` ${fmtMB(st.downloadBytes)}` : "" })}</span>
                <button type="button" style={btn(true)} onClick={async () => { setConfirmInstall(false); setInst({ phase: "download", got: 0, total: st.downloadBytes || 0 }); const r = await addonInstall(); if (!r.ok) setInst({ error: r.error }); refresh(); }}>{tr("Download{v}", { v: st.downloadBytes ? ` ${fmtMB(st.downloadBytes)}` : "" })}</button>
                <button type="button" style={btn(false)} onClick={() => setConfirmInstall(false)}>{tr("Not now")}</button>
              </>
            ) : inst?.phase ? (
              <>
                <span style={{ flex: 1 }}>{inst.phase === "unpack" ? tr("Unpacking…") : tr("Downloading {v} of {v2}", { v: fmtMB(inst.got), v2: fmtMB(inst.total) })}</span>
                {inst.phase === "download" && <button type="button" style={btn(false)} onClick={() => addonCancelInstall()}>{tr("Cancel")}</button>}
              </>
            ) : (
              <button type="button" style={btn(true, !st.url && !st.browser)} disabled={!st.url} onClick={() => setConfirmInstall(true)}>{tr("Install predictive modelling…")}</button>
            )}
          </div>
          {!st.url && !st.browser && <div style={{ marginTop: 6 }}>{tr("The add-on download isn't published for this version yet.")}</div>}
          {st.browser && <div style={{ marginTop: 6 }}>{tr("In the browser preview: run the add-on by hand on port 8766 (addons/geoml/README.md).")}</div>}
          {inst?.error && <div style={{ marginTop: 6, color: "var(--color-danger-fg)" }}>{inst.error}</div>}
        </div>
      ) : (
        <>
          <div style={box}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span style={{ flex: 1 }}>{tr("Quality")}</span>
              <select value={quality} onChange={(e) => setQuality(e.target.value)} aria-label={tr("Model quality")} style={{ ...smallSel, flex: 2 }}>
                {Object.entries(QUALITY).map(([k, q]) => <option key={k} value={k}>{q.label}</option>)}
              </select>
            </div>{tr("On a project of 20 to 40 holes, Fast and Standard take a few minutes. Time grows with the holes and the quality: start with Fast. {v}", { v: st.dev ? tr("(Using a development copy of the add-on.)") : "" })}
          </div>

          <div style={box}>
            {busyJob && (
              <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 5, padding: "5px 7px", marginBottom: 6 }}>{tr("A model started earlier is still running in the add-on.")}{" "}
                <button type="button" onClick={() => cancelJob(busyJob).then(() => { setBusyJob(null); setNotices((p) => [...p, notice("geoML: the earlier model was cancelled.")]); }, (e) => setNotices((p) => [...p, errorNotice(tr("geoML: could not cancel it ({message}).", { message: e.message }))]))} style={{ ...btn(false, false), padding: "1px 7px" }}>{tr("Cancel it")}</button>
              </div>
            )}
            <div style={h}>{tr("Model a rock unit")}</div>
            {!collars.length || !lithoMetres.length ? tr("Load drillholes with a lithology log first.") : (
              <>
                <div style={{ marginBottom: 4 }}>{tr("Codes that make up the unit:")}</div>
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
                      <button type="button" aria-pressed={leaveOut.has(code)} aria-label={`${leaveOut.has(code) ? tr("Use") : tr("Leave out")} ${code}`} title={tr("Leave this code out of the model (e.g. overburden)")}
                        onClick={() => {
                          const leaving = !leaveOut.has(code);
                          setLeaveOut((s) => { const n = new Set(s); leaving ? n.add(code) : n.delete(code); return n; });
                          if (leaving) setUnit((u) => { if (!u.has(code)) return u; const n = new Set(u); n.delete(code); return n; });
                        }}
                        style={{ fontSize: "var(--font-size-xs)", color: leaveOut.has(code) ? "var(--color-warn-text)" : "var(--color-text-muted)", cursor: "pointer", background: "none", border: "none", padding: "0 2px", fontFamily: "inherit" }}>{leaveOut.has(code) ? tr("left out") : "use"}</button>
                    </div>
                  ))}
                </div>
                <input value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder={tr("Name (optional)")} aria-label={tr("Unit name")} style={{ ...smallSel, width: "100%", boxSizing: "border-box", marginTop: 6 }} />
                <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }} title={tr("geoML's deep model (GPWalk): a vector field bends the space so the contact can follow folds. Slower.")}>
                  <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />{" "}{tr("Follow folds (deep model, slower)")}</label>
                {unitPlan?.focus?.available && (
                  <label style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 6 }} title={tr("Trains on a point every {s} m in the unit and at its contacts, and a thinned sample of the other rock. It helped thin units on the projects tested, but one thick unit got worse: compare with the test on unseen holes.", { s: FOCUS_SPACING })}>
                    <input type="checkbox" checked={!!unitPlan.denseOn} onChange={(e) => setDenseNear(e.target.checked)} />{" "}<span>{tr("Sample densely near the unit")}{unitPlan.focus.thin ? ` ${tr("(on by default: its runs are thin, median {m} m)", { m: unitPlan.focus.medianRunM })}` : ""}</span></label>
                )}
                <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }} title={tr("Trains again without every 4th hole and scores the model on those holes. About twice the time.")}>
                  <input type="checkbox" checked={heldOut} onChange={(e) => setHeldOut(e.target.checked)} />{" "}{tr("Also test on unseen holes (about twice the time)")}</label>
                {unitPlan && (
                  <div style={{ marginTop: 6, fontSize: "var(--font-size-xs)", lineHeight: 1.4 }}>
                    {(unitPlan.focused || unitPlan.factor > 1) && <div style={{ color: "var(--color-warn-text)" }}>
                      {tr("The whole project would be {p} points, {t} of training, more than a computer can hold.", { p: unitPlan.wanted.points.toLocaleString(), t: roughTime(unitPlan.wanted.seconds) })}
                      {unitPlan.focused && <>{" "}{tr("So only the {n} of {total} holes within {d} m of this unit go in, and the model covers that area.", { n: unitPlan.nHoles, total: unitPlan.totalHoles, d: unitPlan.focusM.toLocaleString() })}</>}
                      {unitPlan.factor > 1 && <>{" "}{tr("The spacing is widened to {s} m to fit.", { s: unitPlan.trainSpacing })}</>}
                    </div>}
                    <div style={{ color: "var(--color-text-muted)" }}>{tr("This run: {p} points, {t} of training on a recent laptop{v}. A rough guide; predicting the blocks comes after.", { p: unitPlan.points.toLocaleString(), t: roughTime(unitPlan.seconds), v: deep ? tr(", longer with folds") : "" })}</div>
                    {unitPlan.capped && <div style={{ color: "var(--color-text-muted)" }}>{tr("{c} contacts would need {n} inducing points. An up-to-date add-on keeps {cap} of them along the holes, and every contact stays in the training, so the model will be coarse; check its fit to the logs when it finishes.", { c: unitPlan.contacts.toLocaleString(), n: unitPlan.inducingBuilt.toLocaleString(), cap: INDUCING_CAP })}</div>}
                  </div>
                )}
                <button type="button" style={{ ...btn(true, !ready || !unit.size), marginTop: 8, width: "100%" }} disabled={!ready || !unit.size} onClick={runUnit}>{tr("Model {v}", { v: unit.size ? (unitName.trim() || [...unit].join(" + ")) : tr("the unit") })}</button>
              </>
            )}
          </div>

          <div style={box}>
            <div style={h}>{tr("Model a grade")}</div>
            {/* TASKS.csv #677 — the one grade-estimation tool that said nothing about what its output is not */}
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 5, padding: "5px 7px", marginBottom: 6, lineHeight: 1.4 }}>
              <strong>{tr("Not a resource estimate.")}</strong>{" "}{tr("A targeting aid with uncertainty: no classification, dilution or recovery. Nothing it produces is a Mineral Resource under NI 43-101 or JORC.")}</div>
            {!collars.length || !elements.length ? tr("Load assays (Geochem tab) first.") : (
              <>
                <select value={element} onChange={(e) => setElement(e.target.value)} aria-label={tr("Element")} style={{ ...smallSel, width: "100%" }}>
                  {elements.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {gradePlan && (
                  <div style={{ marginTop: 6, fontSize: "var(--font-size-xs)", lineHeight: 1.4 }}>
                    {gradePlan.factor > 1 && <div style={{ color: "var(--color-warn-text)" }}>{tr("{n} composites would be {t} of training, more than a computer can hold, so composites are {c} m here instead of {base} m.", { n: gradePlan.wanted.composites.toLocaleString(), t: roughTime(gradePlan.wanted.seconds), c: gradePlan.composite, base: QUALITY[quality].grade.composite })}</div>}
                    <div style={{ color: "var(--color-text-muted)" }}>{tr("This run: {n} composites, {t} of training on a recent laptop. A rough guide; predicting the blocks comes after.", { n: gradePlan.composites.toLocaleString(), t: roughTime(gradePlan.seconds) })}</div>
                  </div>
                )}
                <button type="button" style={{ ...btn(true, !ready || !element), marginTop: 8, width: "100%" }} disabled={!ready || !element} onClick={runGrade}>{tr("Model {v}", { v: element || tr("a grade") })}</button>
              </>
            )}
          </div>

          {job && (
            <div style={{ ...box, borderColor: "var(--color-accent)" }}>
              <div style={h}>{job.label}</div>
              <div style={{ height: 6, background: "var(--color-border)", borderRadius: 3, overflow: "hidden", margin: "4px 0 6px" }}>
                <div style={{ width: `${Math.round((job.progress || 0) * 100)}%`, height: "100%", background: "var(--color-accent)" }} />
              </div>
              <div>{job.message}{job.elapsed ? ` · ${formatElapsed(job.elapsed)}` : ""}</div>
              {/* #1142 — the add-on's block prediction says nothing until it ends: a still bar is not a frozen app */}
              {!job.cancelling && quietFor(job) >= 60 && <div style={{ marginTop: 4, color: "var(--color-text-muted)" }}>{tr("No progress reported for {t}. This step can run a long time on a large project. Cancel stops it safely and gives the memory back.", { t: formatElapsed(quietFor(job)) })}</div>}
              <button type="button" disabled={!!job.cancelling} style={{ ...btn(false), marginTop: 6 }} onClick={() => cancelRun(tr("Cancelling…"))}>{tr("Cancel")}</button>
            </div>
          )}

          {runs.length > 0 && (
            <div style={box}>
              <div style={h}>{tr("This session")}</div>
              {runs.map((r, i) => <div key={i} style={{ marginBottom: 4 }}><strong>{r.label}</strong> · {r.secs} s · {r.at}<br />{r.note}</div>)}
            </div>
          )}

          {!st.dev && <button type="button" style={{ ...btn(false, !!job), fontSize: "var(--font-size-sm)" }} disabled={!!job} onClick={async () => { if (window.confirm(tr("Remove the predictive-modelling add-on from this computer? Models already in your project stay."))) { await addonUninstall(); refresh(); } }}>{tr("Remove the add-on")}</button>}
        </>
      )}
    </div>
  );
}
