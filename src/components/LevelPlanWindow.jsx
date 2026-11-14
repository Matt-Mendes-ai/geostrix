import React, { useEffect, useMemo, useRef, useState } from "react";
import { X as XIcon, Download, Pencil, Check } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { strikeDipSymbol, pathCache, busiestRl } from "../lib/levelPlan.js"; // pathCache: TASKS.csv #2210
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { colors } from "../lib/theme.js"; // TASKS.csv #1121 — colors.planned
import { exportSvgMarkup } from "../lib/svgExport.js"; // TASKS.csv #1048 — the legend drawn into the PNG
import { levelPlanFurniture } from "../lib/figureFurniture.js"; // TASKS.csv #1017
import { saveFile } from "../lib/desktop.js"; // TASKS.csv #1114 — the native save dialog, as every other export (#444)
import { planLegend } from "../lib/levelPlanLegend.js"; // TASKS.csv #1404
import { resolveLabels, clusterLabelPoints, groupLabelText, labelWidth } from "../lib/sectionLabels.js"; // TASKS.csv #1404 — the sections' label declutter (#1144); clusters: #2212
import { LAYER_META } from "../lib/layers.js";
import { usePrompt } from "./usePrompt.jsx"; // TASKS.csv #1779
import { mergedPath, pathsByColour, dotsPath, segmentFinder, f1, dotsByColour, pointFinder } from "../lib/levelPlanDraw.js"; // dots: #3191 // f1: #3137 // TASKS.csv #2982
import { planBuild, runSliced } from "../modules/viewer/levelPlanBuild.js"; // TASKS.csv #3137 — the build, a slice at a time (loads with this window)
import { hoverTitle } from "../lib/svgLazyTitle.js"; // TASKS.csv #2982 — titles made on hover, as the section window (#2210)

// TASKS.csv #525 — the LEVEL PLAN window: a horizontal section at an RL, at true scale with E / N axes, a scale bar
// and a north arrow. What the plane z = RL cuts — and what lies in the slab RL ± half-width — comes from
// ViewerModule's buildPlanPayload (same layer colours, filters and legend as the vertical section window):
//   * each hole's whole trace faint (context), its part inside the slab coloured by the chosen log
//   * PIERCE POINTS where a hole crosses the RL: circles filled with the chosen log at that depth (white = not
//     logged), labelled with the hole id; hover lists the logs and
//     assays at that depth
//   * assay / mineralisation dots and strike-dip symbols inside the slab
//   * block-model cells at the RL, and model surfaces / solids cut by the plane (as on a section, #357)
//   * planned holes dashed, with their pierce point
// Draw outline: click points on the plan; Save keeps it as a boundary at this RL (a pit shell, an ore outline, a
// level development string), visible in 3D and reusable like any boundary. Export PNG / Add to Layout keep the scale.

const W = 760, H = 560, PAD = 34;
// TASKS.csv #2372 (review #2325, WA uranium) — on a drilling grid (414 pierce points) the ids became a ring of labels with leaders up to a third
// of the plan long, some over the easting axis. Above LABELS_AUTO_MAX pierce points the ids start off (hover names a point; the tick turns
// them on), a label moves at most LABEL_RINGS rows from its point, and the axis labels are obstacles.
const LABELS_AUTO_MAX = 100, LABEL_RINGS = 3;
const niceStep = (span, n = 6) => { const raw = span / n, p = 10 ** Math.floor(Math.log10(raw || 1)), f = raw / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; };

// screen -> E / N for a frame (the SVG's own transform, so it holds when the plan is scaled to fit the window)
// The <svg> is passed in: a React event's currentTarget is cleared once the handler returns, so reading it later
// (e.g. inside a state updater) crashed the window.
function toWorldF(frame, e, root) {
  const pt = root.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const q = pt.matrixTransform(root.getScreenCTM().inverse());
  return [frame.x0 + (q.x - frame.X(frame.x0)) / frame.s, frame.y0 + (frame.Y(frame.y0) - q.y) / frame.s];
}

// leftOut (#3029): holes whose collar elevation is suspect (#3004), left out of the RL range; said beside the slider
// TASKS.csv #3064 — the plan before the first build: nothing in it
const emptyPlan = ({ rl, half }) => ({ rl: Number(rl), half: Number(half), holes: [], intervals: [], assayLegends: {}, points: [], structures: [], voxelSlices: [], surfaceCuts: [], planned: [], legendItems: [] });

export default function LevelPlanWindow({ planCtx, zRange, defaultRl, onClose, onSaveBoundary, onAddToLayout, leftOut = 0 }) {
  const [askPrompt, promptEl] = usePrompt(); // TASKS.csv #1779 — window.prompt throws in Electron
  useEscapeKey(onClose);
  useFocusTrap();
  // TASKS.csv #2929 (WA iron review) — opened on the RL most holes cross, worked out before the first render: #2518 mounted the plan at
  // defaultRl and moved it in an effect, so a 6,036-point plan was committed twice (81-114 s frozen there)
  // TASKS.csv #3064 — and that pick (a full build) now runs after the window is painted, which says 'Building the plan…' meanwhile: the open
  // blocked 2.4-2.8 s with nothing on screen. The first render is an empty plan, never a full one at defaultRl, so #2929 still holds.
  // TASKS.csv #3137 — the pick reads the holes only (busiestRl needs each trace's z: 0.9 s as a full build on WA iron), a slice at a time
  const [ready, setReady] = useState(false);
  const [rl, setRl] = useState(() => Math.round(defaultRl));
  const ctxRef = useRef(planCtx); ctxRef.current = planCtx;
  const statusRef = useRef(null); // #3137 — the build's progress, written into this element (not a re-render of the plan per slice)
  const say = (f) => { if (statusRef.current) statusRef.current.textContent = tr("Building the plan… {pct}%", { pct: Math.round(100 * f) }); };
  useEffect(() => {
    let alive = true;
    const f = requestAnimationFrame(() => {
      const r0 = Math.round(defaultRl);
      runSliced(planBuild(ctxRef.current(), r0, 12.5, { holesOnly: true }), { cancelled: () => !alive })
        .then((pl) => { if (!alive) return; const b = (pl && busiestRl(pl.holes)) ?? r0; setRl(b); setApplied({ rl: b, half: 12.5 }); setReady(true); }, () => { if (alive) setReady(true); });
    });
    return () => { alive = false; cancelAnimationFrame(f); };
  }, []);
  const [half, setHalf] = useState(12.5);
  const [colourBy, setColourBy] = useState("");
  const [labelsPick, setLabels] = useState(null); // #2372 — null: the default for this plan's pierce points
  const [fitSlab, setFitSlab] = useState(false); // frame on the holes in the slab instead of the whole project
  const [view, setView] = useState(null); // zoom / pan window { x0, x1, y0, y1 } in E / N; null = the fitted frame
  const dragRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [pts, setPts] = useState([]);
  const [note, setNote] = useState(null);
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  // recomputed when the RL / slab change (not on every render of the 3D view behind it); "Refresh" picks up layer edits
  const [rev, setRev] = useState(0);
  // TASKS.csv #2518 — the RL and slab apply 150 ms after the last change: a slider drag through 10 levels built and decluttered 10 plans
  // (3.5 s of stalls on 2,248 holes); now the plan follows when the slider stops
  const [applied, setApplied] = useState(() => ({ rl, half }));
  useEffect(() => { const t = setTimeout(() => setApplied((p) => (p.rl === rl && p.half === half ? p : { rl, half })), 150); return () => clearTimeout(t); }, [rl, half]); // #3064 — the same RL is not built again (each open built it twice)
  // TASKS.csv #3137 — built a slice at a time (the window paints and takes input meanwhile); a newer RL, slab or Refresh cancels the build under
  // way, and the plan on screen stays until the new one is ready
  const [plan, setPlan] = useState(null), [building, setBuilding] = useState(false);
  const buildGen = useRef(0);
  useEffect(() => {
    if (!ready) return;
    const gen = ++buildGen.current;
    setBuilding(true); say(0);
    runSliced(planBuild(ctxRef.current(), Number(applied.rl), Math.max(0.1, Number(applied.half) || 0)), { onProgress: (f) => { if (buildGen.current === gen) say(f); }, cancelled: () => buildGen.current !== gen })
      .then((d) => { if (d && buildGen.current === gen) { setPlan(d); setBuilding(false); } }, (e) => { if (buildGen.current === gen) { setBuilding(false); console.error(e); } });
  }, [applied, rev, ready]); // say writes a ref
  useEffect(() => () => { buildGen.current++; }, []); // closed: the build under way stops
  const empty = useMemo(() => emptyPlan(applied), [applied]);
  const data = plan || empty;
  // #2518 — open on the RL most holes cross (not the middle of the range): now the initial RL above (#2929)
  // TASKS.csv #2929 — each build's layers in one group keyed by the build: an RL change replaces the group in one placement, where thousands of
  // newly keyed siblings among kept ones were each placed one by one (React walks past the other new siblings for every placement)
  const buildSeq = useRef(0);
  const dataKey = useMemo(() => (buildSeq.current += 1), [data]);
  const nPierce = useMemo(() => data.holes.reduce((n, h) => n + h.pierce.length, 0), [data]);
  const labels = labelsPick ?? nPierce <= LABELS_AUTO_MAX; // #2372
  const pointLogs = data.pointLogs || []; // #1706 — the readings at a depth that fill pierce points (Mag. susc., SWIR points ...)
  const layerKeys = useMemo(() => [...new Set([...data.intervals.map((iv) => iv.layer), ...pointLogs.map((r) => r.layer)])], [data]);
  const activeLayer = layerKeys.includes(colourBy) ? colourBy : layerKeys.includes("litho") ? "litho" : layerKeys[0] || "";
  // #1404 — the legend is the "Colour holes by" layer (categories, or a numeric layer's colours at their values) plus the
  // structure symbols drawn on the plan; it used to list every layer whichever one filled the pierce points
  const legend = useMemo(() => {
    const L = data.assayLegends?.[activeLayer] || planLegend(data.intervals.some((iv) => iv.layer === activeLayer) ? data.intervals : pointLogs, activeLayer, { numeric: activeLayer.startsWith("custom:") ? "auto" : !!LAYER_META[activeLayer]?.numeric }); // #1537 — an assay element: its classes or ramp
    const structs = (data.legendItems || []).filter(([label]) => /^Structure/.test(label));
    let none = 0; for (const h of data.holes) for (const pc of h.pierce) if (!(pc.logs || []).some((l) => l.layer === activeLayer)) none++; // #3261
    return [...L.items.map(([n, c]) => [L.title ? `${L.title}: ${n}` : n, c]), ...(none && L.items.length ? [[tr(none === 1 ? "No value here: {n} pierce point (hollow ring)" : "No value here: {n} pierce points (hollow ring)", { n: none }), "#ffffff", { ring: true }]] : []), ...structs];
  }, [data, activeLayer]);

  // a fixed frame for the whole project (from every hole's full trace), so moving the RL doesn't rescale the plan
  const frame = useMemo(() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; // loops, not Math.min(...) (#371)
    const add = ([x, y]) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    if (fitSlab) {
      data.holes.forEach((h) => { h.polylines.forEach((pl) => pl.forEach(add)); h.pierce.forEach((pc) => add([pc.x, pc.y])); });
      data.planned.forEach((p) => { p.lines.forEach((l) => l.forEach(add)); p.pierce.forEach((pc) => add([pc.x, pc.y])); });
    }
    if (!fitSlab || !Number.isFinite(x0)) { data.holes.forEach((h) => h.context.forEach(add)); data.planned.forEach((p) => p.context.forEach(add)); }
    // TASKS.csv #1782 — no holes: frame the block-model slices and surface cuts (a project with no collars)
    if (!Number.isFinite(x0)) { data.voxelSlices.forEach((v) => v.rects.forEach((r) => { add([r.x0, r.y0]); add([r.x1, r.y1]); })); data.surfaceCuts.forEach((sc) => sc.segs.forEach((g) => { add([g[0], g[1]]); add([g[2], g[3]]); })); }
    if (!Number.isFinite(x0)) return null;
    if (view) { x0 = view.x0; x1 = view.x1; y0 = view.y0; y1 = view.y1; } // zoomed / panned
    const pad = view ? 0 : Math.max(x1 - x0, y1 - y0, 50) * 0.06;
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    const s = Math.min((W - 2 * PAD) / (x1 - x0), (H - 2 * PAD) / (y1 - y0));
    const ox = PAD + ((W - 2 * PAD) - (x1 - x0) * s) / 2, oy = PAD + ((H - 2 * PAD) - (y1 - y0) * s) / 2;
    return { x0, x1, y0, y1, s, X: (x) => ox + (x - x0) * s, Y: (y) => H - (oy + (y - y0) * s) };
  }, [fitSlab, fitSlab || !data.holes.length ? data : null, data.holes.length, data.planned.length, view]); // no holes: the slices frame it (#1782)

  // wheel = zoom about the cursor (a native listener: React's onWheel is passive and can't stop the page scrolling)
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !frame) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const [wx, wy] = toWorldF(frame, e, el);
      const k = e.deltaY > 0 ? 1.25 : 0.8;
      setView({ x0: wx - (wx - frame.x0) * k, x1: wx + (frame.x1 - wx) * k, y0: wy - (wy - frame.y0) * k, y1: wy + (frame.y1 - wy) * k });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

        {promptEl}
  useEffect(() => { setNote(null); }, [rl, half]);

  const ctxCache = useMemo(() => pathCache(), [frame]); // TASKS.csv #2210 — the whole-hole traces' path strings, per frame
  const labelMemo = useRef({ data: null, frame: null, on: null, v: null }); // #2518 — the declutter ran on every render (each hover)
  const drawMemo = useRef({}); // #2982 — the merged paths, per plan, frame and chosen log
  // #3064 — the empty plan has no frame, so this shell is what paints while the first plan is built (it showed nothing)
  if (!ready || !plan) return (
    <div role="dialog" aria-modal="true" aria-label={tr("Level plan")} style={{ position: "fixed", inset: 0, background: "rgba(20,24,30,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 14, minWidth: 320, color: "var(--color-text)" }}>
        <div style={{ fontWeight: 600, fontSize: "var(--font-size-lg)", marginBottom: 8 }}>{tr("Level plan")}</div>
        <div role="status" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("Building the plan at the RL most holes cross…")} <span ref={statusRef} /></div>
      </div>
    </div>
  );
  if (!frame) return null;
  const { X, Y, s } = frame;
  const path = (line) => line.map(([x, y], i) => `${i ? "L" : "M"}${f1(X(x))},${f1(Y(y))}`).join(" "); // f1: #3137 — not toFixed (the context lines of 6,390 holes)
  // TASKS.csv #2982 (WA iron review) — 189,332 SVG elements at 6,390 holes (a path and a <title> per interval, a <g>, circle and <title> per
  // pierce point, a path and a circle per hole): the open blocked 5-6 s, an RL step 4.2-4.5 s. The traces, collars and in-slab parts are one
  // path each, the intervals one path per colour (lib/levelPlanDraw.js), and every tooltip is made when it is hovered.
  if (drawMemo.current.data !== data || drawMemo.current.frame !== frame || drawMemo.current.layer !== activeLayer) {
    const ivs = data.intervals.filter((iv) => iv.layer === activeLayer);
    drawMemo.current = { data, frame, layer: activeLayer, ivs, ivPaths: pathsByColour(ivs, X, Y), findIv: segmentFinder(ivs, X, Y),
      ctx: data.holes.map((h) => ctxCache(h.hole_id, h.context, path)).join(" "), collars: dotsPath(data.holes.map((h) => h.collar), X, Y),
      slab: mergedPath(data.holes.flatMap((h) => h.polylines), X, Y), pierce: data.holes.flatMap((h) => h.pierce.map((pc) => ({ h, pc }))) };
    // TASKS.csv #3191 — pierce points and slab dots as one stroked path per colour (an outline under each), found on hover by position
    // TASKS.csv #3261 (Galore review) — a pierce point with no value of the chosen layer at the RL (a hole with no assay or log there) was filled
    // white beside a near-white lowest class: it is a smaller hollow grey ring now (pcNone), and the key counts it
    const dm = drawMemo.current, pcs = dm.pierce.map(({ pc }) => ({ x: pc.x, y: pc.y, color: (pc.logs || []).find((l) => l.layer === activeLayer)?.color || null }));
    const valued = pcs.filter((q) => q.color), none = pcs.filter((q) => !q.color).map((q) => [q.x, q.y]);
    Object.assign(dm, { pcAll: dotsPath(valued.map((q) => [q.x, q.y]), X, Y), pcFill: dotsByColour(valued, X, Y), pcNone: dotsPath(none, X, Y), findPc: pointFinder(pcs, X, Y),
      ptAll: dotsPath(data.points.map((q) => [q.x, q.y]), X, Y), ptFill: dotsByColour(data.points, X, Y), findPt: pointFinder(data.points, X, Y) });
  }
  const dw = drawMemo.current;
  const svgXY = (e) => { const el = svgRef.current, p = el.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(el.getScreenCTM().inverse()); };
  // TASKS.csv #2212 (review #2174) — the hole ids: pierce points within a symbol's reach share one label ('ID +n', the ids in its tooltip),
  // and a label with no free spot near its point is left out, not printed over another (the section window's #1536 rule)
  const idLabels = !labels ? null : labelMemo.current.data === data && labelMemo.current.frame === frame && labelMemo.current.v ? labelMemo.current.v : (labelMemo.current = { data, frame, on: labels, v: (() => {
    const groups = clusterLabelPoints(data.holes.flatMap((h) => h.pierce.map((pc, i) => ({ key: `${h.hole_id}_${i}`, id: h.hole_id, x: X(pc.x), y: Y(pc.y) }))), 8);
    const placed = resolveLabels(
      groups.map((g) => ({ key: g.key, text: groupLabelText(g.ids), ids: g.ids, size: 10.5, prio: 2, optional: true, cands: [{ x: g.x + 6, y: g.y - 5, anchor: "start" }, { x: g.x + 6, y: g.y + 13, anchor: "start" }, { x: g.x - 6, y: g.y - 5, anchor: "end" }, { x: g.x - 6, y: g.y + 13, anchor: "end" }] })),
      [...data.holes.flatMap((h) => h.pierce.map((pc) => ({ x: X(pc.x), y: Y(pc.y) + 5, w: 11, h: 11 }))), ...axisBoxes()], // axis labels: #2372
      { bounds: [2, W - 2], yBounds: [20, H - 2], rings: LABEL_RINGS },
    );
    return { placed, hidden: groups.length - placed.length, grouped: groups.reduce((n, g) => n + (g.ids.length > 1 ? g.ids.length - 1 : 0), 0) };
  })() }).v;

  // #2372 — the grid's E / N labels as obstacles (the same ticks as drawn below)
  function axisBoxes() {
    const st = niceStep(Math.max(frame.x1 - frame.x0, frame.y1 - frame.y0)), out = [];
    for (let x = Math.ceil(frame.x0 / st) * st; x <= frame.x1; x += st) { const w = labelWidth(`${Math.round(x)}E`, 10); out.push({ x: X(x), y: H - 6, w, h: 10 }); }
    for (let y = Math.ceil(frame.y0 / st) * st; y <= frame.y1; y += st) { const w = labelWidth(`${Math.round(y)}N`, 10); out.push({ x: 4 + w / 2, y: Y(y) - 3, w, h: 10 }); }
    return out;
  }
  const toWorld = (e) => toWorldF(frame, e, svgRef.current);
  const onClick = (e) => { if (drawing && !dragRef.current?.moved) { const q = toWorld(e); setPts((p) => [...p, q]); } };
  // drag = pan (also while drawing: a click without movement adds a point)
  const onDown = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    dragRef.current = { cx: e.clientX, cy: e.clientY, f: { x0: frame.x0, x1: frame.x1, y0: frame.y0, y1: frame.y1 }, k: W / r.width / s, moved: false };
  };
  const onMove = (e) => {
    if (drawing) setHover(toWorld(e));
    const d = dragRef.current;
    if (!d || !(e.buttons & 1)) return;
    const px = e.clientX - d.cx, py = e.clientY - d.cy;
    if (!d.moved && Math.abs(px) + Math.abs(py) < 4) return;
    d.moved = true;
    const dx = px * d.k, dy = py * d.k; // screen px -> metres (N is up, screen y is down)
    setView({ x0: d.f.x0 - dx, x1: d.f.x1 - dx, y0: d.f.y0 + dy, y1: d.f.y1 + dy });
  };
  const onUp = () => { setTimeout(() => { dragRef.current = null; }, 0); };
  const saveOutline = () => {
    if (pts.length < 3) { setNote(tr("An outline needs at least three points.")); return; }
    askPrompt(tr("Name for this outline (saved as a boundary at this RL):"), `Plan outline RL ${rl}`, (name) => { // #1779
      onSaveBoundary(pts, Number(rl), name || `Plan outline RL ${rl}`);
      setNote(tr("\"{v}\" saved as a boundary at {rl} m (Geophysics > Boundaries; visible in 3D).", { v: name || tr("Plan outline RL {rl}", { rl }), rl }));
      setPts([]); setDrawing(false);
    });
  };

  // scale bar and grid
  const gridStep = niceStep(Math.max(frame.x1 - frame.x0, frame.y1 - frame.y0));
  const barM = niceStep((W - 2 * PAD) / s / 4, 1);
  const gx = [], gy = [];
  for (let x = Math.ceil(frame.x0 / gridStep) * gridStep; x <= frame.x1; x += gridStep) gx.push(x);
  for (let y = Math.ceil(frame.y0 / gridStep) * gridStep; y <= frame.y1; y += gridStep) gy.push(y);
  const pierceCount = data.holes.reduce((n, h) => n + h.pierce.length, 0);
  const inSlab = data.holes.filter((h) => h.runs.length).length;

  const exportPng = async (toLayout) => {
    // TASKS.csv #1048 — the legend (HTML under the plan) drawn into the PNG; exportSvgMarkup as every other figure (#1089)
    const { markup, width: fw, height: fh } = exportSvgMarkup(svgRef.current, { furniture: levelPlanFurniture(legend) }); // #1017 — in lib, tested
    const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement("canvas"); c.width = Math.round(fw * 2); c.height = Math.round(fh * 2);
    const g = c.getContext("2d"); g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const dataUrl = c.toDataURL("image/png");
    if (toLayout) { onAddToLayout({ label: `Level plan RL ${rl} m ±${half} m`, src: dataUrl, naturalW: c.width, naturalH: c.height }); return; }
    saveFile({ suggestedName: `level_plan_RL${rl}.png`, filters: [{ name: "PNG", extensions: ["png"] }], content: dataUrl.split(",")[1], encoding: "base64" });
  };

  const ctrl = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 5 };
  const inp = { width: 70, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 5px", fontSize: "var(--font-size-sm)", color: "var(--color-text)" };
  const btn = { display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 5, border: "1px solid var(--color-border-light)", background: "var(--color-bg-subtle)", color: "var(--color-text)", fontSize: "var(--font-size-sm)", cursor: "pointer" };

  return (
    <div role="dialog" aria-modal="true" aria-label={tr("Level plan")} style={{ position: "fixed", inset: 0, background: "rgba(20,24,30,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 14, boxShadow: "0 12px 32px rgba(0,0,0,0.3)", maxWidth: "96vw", maxHeight: "94vh", overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 600, fontSize: "var(--font-size-lg)", color: "var(--color-text)" }}>{tr("Level plan")}</div>
          <label style={ctrl}>{tr("RL (m)")}{" "}<input type="number" value={rl} onChange={(e) => setRl(e.target.value)} style={inp} aria-label={tr("Plan elevation (RL)")} /></label>
          <input type="range" min={Math.floor(zRange[0])} max={Math.ceil(zRange[1])} step={1} value={rl} onChange={(e) => setRl(e.target.value)} style={{ width: 160 }} aria-label={tr("Plan elevation slider")} />
          {leftOut > 0 && <span style={{ ...ctrl, color: "var(--color-warn-text)" }}>{tr("{n} hole(s) with a suspect collar elevation are outside this range (Data QC lists them)", { n: leftOut })}</span>}{/* #3029 */}
          <label style={ctrl} title={tr("Hole runs, logs, assays and structures within this distance above and below the RL are drawn")}>{tr("± slab (m)")}{" "}<input type="number" min={0.1} step="any" value={half} onChange={(e) => setHalf(e.target.value)} style={{ ...inp, width: 56 }} aria-label={tr("Slab half-width")} /></label>
          {layerKeys.length > 0 && (
            <label style={ctrl} title={tr("The logs and assay elements shown in the 3D View are offered here: turn one on there (Recovery %, Mag. susc., or an element under Assays) to colour the plan by it. A log read at a depth colours a pierce point by its reading nearest the RL in the slab.")}>{tr("Colour holes by")}<select value={activeLayer} onChange={(e) => setColourBy(e.target.value)} style={{ ...inp, width: "auto" }} aria-label={tr("Colour holes by")}>
                {layerKeys.map((k) => <option key={k} value={k}>{((data.intervals.find((iv) => iv.layer === k) || pointLogs.find((r) => r.layer === k))?.label || k).split(":")[0]}</option>)}
              </select>
            </label>
          )}
          <label style={ctrl} title={tr("Off to start with above {n} pierce points: hover a pierce point for its hole id", { n: LABELS_AUTO_MAX })}><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />{" "}{tr("Hole ids")}</label>
          <label style={ctrl} title={tr("Frame the holes that are in the slab (zoomed in) instead of the whole project (a fixed frame as the RL moves)")}><input type="checkbox" checked={fitSlab} onChange={(e) => setFitSlab(e.target.checked)} />{" "}{tr("Fit to slab")}</label>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} title={tr("Close")} aria-label={tr("Close")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><XIcon size={18} /></button>
        </div>
        <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} fontFamily="'Segoe UI', system-ui, Arial, sans-serif" role="img" aria-label={tr("Level plan at {rl} m", { rl })} onClick={onClick} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onDoubleClick={() => !drawing && setView(null)} style={{ display: "block", background: "#ffffff", border: "1px solid var(--color-border)", borderRadius: 6, cursor: drawing ? "crosshair" : "grab", maxWidth: "100%", height: "auto", width: `min(calc(96vw - 30px), calc((94vh - 170px) * ${W / H}))` /* #2372 — the plan fills the window */ }}>
          {/* grid */}
          {gx.map((x) => <g key={`gx${x}`}><line x1={X(x)} y1={PAD / 2} x2={X(x)} y2={H - PAD / 2} stroke="#eceef2" /><text x={X(x)} y={H - 6} fontSize="10" fill="#7a8494" textAnchor="middle">{Math.round(x)}E</text></g>)}
          {gy.map((y) => <g key={`gy${y}`}><line x1={PAD / 2} y1={Y(y)} x2={W - PAD / 2} y2={Y(y)} stroke="#eceef2" /><text x={4} y={Y(y) - 3} fontSize="10" fill="#7a8494">{Math.round(y)}N</text></g>)}
          <g key={`plan${dataKey}`}>{/* #2929 — one build's layers, replaced whole on an RL change */}
          {/* block-model cells at the RL */}
          {data.voxelSlices.map((v) => v.rects.map((r, i) => <rect key={`${v.id}_${i}`} x={X(r.x0)} y={Y(r.y1)} width={(r.x1 - r.x0) * s + 0.4} height={(r.y1 - r.y0) * s + 0.4} fill={r.color} opacity={0.55} />))}
          {/* model surfaces / solids cut by the plane */}
          {data.surfaceCuts.map((sc) => <g key={sc.id}>{sc.segs.map((g, i) => <line key={i} x1={X(g[0])} y1={Y(g[1])} x2={X(g[2])} y2={Y(g[3])} stroke={sc.color} strokeWidth={2} />)}</g>)}
          {/* hole context (whole trace, faint) and collars */}
          {dw.ctx && <path d={dw.ctx} stroke="#c9ced6" strokeWidth={1} fill="none" />}
          {dw.collars && <path d={dw.collars} stroke="#9aa3b0" strokeWidth={3.6} strokeLinecap="round" fill="none" />}{/* r 1.8 dots */}
          {/* the in-slab parts: plain dark, then coloured by the chosen log (the interval under the cursor names itself) */}
          {dw.slab && <path d={dw.slab} stroke="#2a323c" strokeWidth={2} fill="none" />}
          <g onMouseMove={(e) => { const q = svgXY(e), k = dw.findIv(q.x, q.y); const iv = dw.ivs[k]; if (iv) hoverTitle(e.target, `${iv.hole_id} ${iv.from}–${iv.to} m — ${iv.label}`); }}>
            {dw.ivPaths.map(([c, d]) => <path key={c} d={d} stroke={c} strokeWidth={5} fill="none" strokeLinecap="butt" />)}
          </g>
          {/* assays / mineralisation dots */}
          <g onMouseMove={(e) => { const q = svgXY(e), p = data.points[dw.findPt(q.x, q.y, 4)]; if (p) hoverTitle(e.target, `${p.hole_id} @ ${p.md.toFixed(1)} m — ${p.label}`); }}>{/* #3191: r 2.6 dots, a white 0.6 edge */}
            {dw.ptAll && <path d={dw.ptAll} stroke="#ffffff" strokeWidth={5.8} strokeLinecap="round" fill="none" />}
            {dw.ptFill.map(([c, d]) => <path key={c} d={d} stroke={c} strokeWidth={4.6} strokeLinecap="round" fill="none" />)}
          </g>
          {/* structures: strike-dip symbols (oriented) or a small cross (unoriented) */}
          {data.structures.map((st, i) => {
            if (st.dip == null) return <path key={`s${i}`} d={`M${X(st.x) - 3},${Y(st.y)} h6 M${X(st.x)},${Y(st.y) - 3} v6`} stroke={st.color} strokeWidth={1.4}><title>{tr("{hole_id} @ {depth} m — {label} (not oriented)", { hole_id: st.hole_id, depth: st.depth, label: st.label })}</title></path>;
            const sym = strikeDipSymbol(st.x, st.y, st.dip, st.dipDir, 8 / s);
            return <g key={`s${i}`} stroke={st.color} strokeWidth={1.6}><line x1={X(sym.strike[0])} y1={Y(sym.strike[1])} x2={X(sym.strike[2])} y2={Y(sym.strike[3])} /><line x1={X(sym.tick[0])} y1={Y(sym.tick[1])} x2={X(sym.tick[2])} y2={Y(sym.tick[3])} /><title>{`${st.hole_id} @ ${st.depth} m — ${st.label}, ${Math.round(st.dip)}° → ${Math.round(st.dipDir)}°`}</title></g>;
          })}
          {/* planned holes */}
          {data.planned.map((p) => <g key={`pl${p.name}`}><path d={path(p.context)} stroke={colors.planned} strokeWidth={1} strokeDasharray="4 3" fill="none" opacity={0.6} />{p.lines.map((l, i) => <path key={i} d={path(l)} stroke={colors.planned} strokeWidth={2.4} strokeDasharray="5 3" fill="none" />)}{p.pierce.map((pc, i) => <g key={`pp${i}`}><rect x={X(pc.x) - 4} y={Y(pc.y) - 4} width={8} height={8} fill="#ffffff" stroke={colors.planned} strokeWidth={1.6} /><title>{tr("Planned {name}: pierces {rl} m at {md} m", { name: p.name, rl, md: pc.md.toFixed(1) })}</title></g>)}{labels && p.pierce[0] && <text x={X(p.pierce[0].x) + 6} y={Y(p.pierce[0].y) + 3} fontSize="10" fill={colors.planned}>{p.name}</text>}</g>)}
          {/* pierce points */}
          <g onMouseMove={(e) => { const q = svgXY(e), it = dw.pierce[dw.findPc(q.x, q.y, 6)]; if (!it) return; const { h, pc } = it; hoverTitle(e.target, [tr("{hole_id} pierces {rl} m at {md} m", { hole_id: h.hole_id, rl, md: pc.md.toFixed(1) }), ...(pc.logs || []).filter((l) => !l.layer?.startsWith("assay:")).map((l) => l.label), ...(pc.assays || [])].join("\n")); }}>
            {/* filled with the chosen log's colour at the RL (white: not logged there) */}
            {/* #3191 — r 4.6 with a 1.6 dark edge, as the circles were: an outline path 10.8 wide, then each colour 7.6 wide */}
            {dw.pcNone && <><path d={dw.pcNone} stroke="#8a94a3" strokeWidth={9} strokeLinecap="round" fill="none" /><path d={dw.pcNone} stroke="#ffffff" strokeWidth={6.2} strokeLinecap="round" fill="none" /></>}{/* #3261 — no value here */}
            {dw.pcAll && <path d={dw.pcAll} stroke="#1a2028" strokeWidth={10.8} strokeLinecap="round" fill="none" />}
            {dw.pcFill.map(([c, d]) => <path key={c} d={d} stroke={c} strokeWidth={7.6} strokeLinecap="round" fill="none" />)}
          </g>
          {/* #1404 — hole ids through the sections' declutter (#1144): a fan's collars no longer print over each other */}
          {idLabels && idLabels.placed.map((l) => <g key={`hl${l.key}`}>{l.leaderFrom && <line x1={l.leaderFrom.x} y1={l.leaderFrom.y} x2={l.x} y2={l.y - 4} stroke="#7a8494" strokeWidth={0.6} />}<text x={l.x} y={l.y} fontSize="10.5" textAnchor={l.anchor} fill="#1a2028" stroke="#ffffff" strokeWidth={2.5} paintOrder="stroke">{l.text}{l.ids.length > 1 && <title>{l.ids.join(", ")}</title>}</text></g>)}{/* #2212 */}
          </g>
          {/* the outline being drawn */}
          {pts.length > 0 && <path d={path(hover && drawing ? [...pts, hover] : pts) + (pts.length > 2 && !drawing ? " Z" : "")} stroke="#d1495b" strokeWidth={1.8} fill="rgba(209,73,91,0.08)" />}
          {pts.map((p, i) => <circle key={`d${i}`} cx={X(p[0])} cy={Y(p[1])} r={2.6} fill="#d1495b" />)}
          {/* title, north arrow, scale bar */}
          <text x={PAD / 2} y={16} fontSize="13" fontWeight="600" fill="#1a2028">{tr("Level plan RL {rl} m (slab ±{half} m)", { rl: data.rl, half: data.half }) /* #2518: the plan drawn, not the box being typed */}</text>
          <g transform={`translate(${W - 26},${PAD + 6})`}><path d="M0,-14 L6,6 L0,2 L-6,6 Z" fill="#1a2028" /><text x={0} y={18} fontSize="11" fontWeight="700" textAnchor="middle" fill="#1a2028">N</text></g>
          <g transform={`translate(${W - PAD - barM * s},${H - 22})`}><rect width={barM * s} height={5} fill="#1a2028" /><rect width={(barM * s) / 2} height={5} fill="#ffffff" stroke="#1a2028" strokeWidth={0.8} /><text x={(barM * s) / 2} y={-3} fontSize="10" textAnchor="middle" fill="#1a2028">{`${barM} m`}</text></g>
        </svg>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", flex: 1, minWidth: 260 }}>
            {tr("{pierceCount} {v} at {rl} m · {inSlab} {v2} in the slab · {voxelSlices} {v3} and {surfaceCuts} {v4} cut · equal E / N scale · wheel to zoom, drag to pan, double-click to reset. Hover a pierce point for its logs and assays.", { pierceCount, v: tr(pierceCount === 1 ? "pierce point" : "pierce points"), rl, inSlab, v2: tr(inSlab === 1 ? "hole" : "holes"), voxelSlices: data.voxelSlices.length, v3: tr(data.voxelSlices.length === 1 ? "block model" : "block models"), surfaceCuts: data.surfaceCuts.length, v4: tr(data.surfaceCuts.length === 1 ? "surface" : "surfaces") })}</div>
          {idLabels && (idLabels.hidden > 0 || idLabels.grouped > 0) && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", flexBasis: "100%" }}>{tr("Hole ids: a label 'ID +n' stands for n more hole(s) piercing within a few pixels (hover it for the list); {hidden} label(s) had no free spot and are left out. Zoom in to separate them, or hover a pierce point.", { hidden: idLabels.hidden })}</div>}{/* #2212 */}
          {!drawing
            ? <button style={btn} onClick={() => { setDrawing(true); setPts([]); setNote(tr("Click points on the plan; Save outline when done.")); }}><Pencil size={14} />{" "}{tr("Draw outline")}</button>
            : <><button style={btn} onClick={saveOutline}><Check size={14} />{" "}{tr("Save outline")}</button><button style={btn} onClick={() => { setDrawing(false); setPts([]); setNote(null); }}>{tr("Cancel")}</button></>}
          <button style={btn} onClick={() => setRev((r) => r + 1)} title={tr("Rebuild from the current layers, filters and models")}>{tr("Refresh")}</button>
          {building && <span role="status" ref={statusRef} style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("Building the plan…")}</span>}{/* #3137 */}
          <button style={btn} onClick={() => exportPng(false)}><Download size={14} />{" "}{tr("PNG")}</button>
          <button style={btn} onClick={() => exportPng(true)}>{tr("Add to Layout")}</button>
        </div>
        {legend.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 12px", marginTop: 6, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", maxWidth: W }}>
            {legend.slice(0, 40).map(([label, color, o]) => <span key={label + color} style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, background: color, borderRadius: o?.ring ? 5 : 2, border: o?.ring ? "1.5px solid #8a94a3" : "1px solid var(--color-border)", boxSizing: "border-box" }} />{label}</span>)}{/* ring: #3261 */}
            {legend.length > 40 && <span>{tr("+ {v} more", { v: legend.length - 40 })}</span>}
          </div>
        )}
        {note && <div role="status" style={{ marginTop: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{note}</div>}
      </div>
    </div>
  );
}
