import React, { useEffect, useMemo, useRef, useState } from "react";
import { X as XIcon, Download, Pencil, Check } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { strikeDipSymbol } from "../lib/levelPlan.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { colors } from "../lib/theme.js"; // TASKS.csv #1121 — colors.planned
import { exportSvgMarkup } from "../lib/svgExport.js"; // TASKS.csv #1048 — the legend drawn into the PNG

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
const niceStep = (span, n = 6) => { const raw = span / n, p = 10 ** Math.floor(Math.log10(raw || 1)), f = raw / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; };

// screen -> E / N for a frame (the SVG's own transform, so it holds when the plan is scaled to fit the window)
// The <svg> is passed in: a React event's currentTarget is cleared once the handler returns, so reading it later
// (e.g. inside a state updater) crashed the window.
function toWorldF(frame, e, root) {
  const pt = root.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const q = pt.matrixTransform(root.getScreenCTM().inverse());
  return [frame.x0 + (q.x - frame.X(frame.x0)) / frame.s, frame.y0 + (frame.Y(frame.y0) - q.y) / frame.s];
}

export default function LevelPlanWindow({ build, zRange, defaultRl, onClose, onSaveBoundary, onAddToLayout }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const [rl, setRl] = useState(() => Math.round(defaultRl));
  const [half, setHalf] = useState(12.5);
  const [colourBy, setColourBy] = useState("");
  const [labels, setLabels] = useState(true);
  const [fitSlab, setFitSlab] = useState(false); // frame on the holes in the slab instead of the whole project
  const [view, setView] = useState(null); // zoom / pan window { x0, x1, y0, y1 } in E / N; null = the fitted frame
  const dragRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [pts, setPts] = useState([]);
  const [note, setNote] = useState(null);
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  // recomputed when the RL / slab change (not on every render of the 3D view behind it); "Refresh" picks up layer edits
  const buildRef = useRef(build); buildRef.current = build;
  const [rev, setRev] = useState(0);
  const data = useMemo(() => buildRef.current(Number(rl), Math.max(0.1, Number(half) || 0)), [rl, half, rev]);
  const layerKeys = useMemo(() => [...new Set(data.intervals.map((iv) => iv.layer))], [data]);
  const activeLayer = layerKeys.includes(colourBy) ? colourBy : layerKeys.includes("litho") ? "litho" : layerKeys[0] || "";

  // a fixed frame for the whole project (from every hole's full trace), so moving the RL doesn't rescale the plan
  const frame = useMemo(() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; // loops, not Math.min(...) (#371)
    const add = ([x, y]) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    if (fitSlab) {
      data.holes.forEach((h) => { h.polylines.forEach((pl) => pl.forEach(add)); h.pierce.forEach((pc) => add([pc.x, pc.y])); });
      data.planned.forEach((p) => { p.lines.forEach((l) => l.forEach(add)); p.pierce.forEach((pc) => add([pc.x, pc.y])); });
    }
    if (!fitSlab || !Number.isFinite(x0)) { data.holes.forEach((h) => h.context.forEach(add)); data.planned.forEach((p) => p.context.forEach(add)); }
    if (!Number.isFinite(x0)) return null;
    if (view) { x0 = view.x0; x1 = view.x1; y0 = view.y0; y1 = view.y1; } // zoomed / panned
    const pad = view ? 0 : Math.max(x1 - x0, y1 - y0, 50) * 0.06;
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    const s = Math.min((W - 2 * PAD) / (x1 - x0), (H - 2 * PAD) / (y1 - y0));
    const ox = PAD + ((W - 2 * PAD) - (x1 - x0) * s) / 2, oy = PAD + ((H - 2 * PAD) - (y1 - y0) * s) / 2;
    return { x0, x1, y0, y1, s, X: (x) => ox + (x - x0) * s, Y: (y) => H - (oy + (y - y0) * s) };
  }, [fitSlab, fitSlab ? data : null, data.holes.length, data.planned.length, view]);

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

  useEffect(() => { setNote(null); }, [rl, half]);

  if (!frame) return null;
  const { X, Y, s } = frame;
  const path = (line) => line.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" ");

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
    const name = window.prompt(tr("Name for this outline (saved as a boundary at this RL):"), `Plan outline RL ${rl}`);
    if (name == null) return;
    onSaveBoundary(pts, Number(rl), name || `Plan outline RL ${rl}`);
    setNote(tr("\"{v}\" saved as a boundary at {rl} m (Geophysics > Boundaries; visible in 3D).", { v: name || tr("Plan outline RL {rl}", { rl }), rl }));
    setPts([]); setDrawing(false);
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
    const legend = data.legendItems || [];
    const { markup, width: fw, height: fh } = exportSvgMarkup(svgRef.current, { furniture: legend.length ? { keys: [{ title: "Legend", items: legend.slice(0, 60).map(([label, color]) => ({ label, color })).concat(legend.length > 60 ? [{ label: `+${legend.length - 60} more`, color: "#ffffff" }] : []) }] } : null });
    const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement("canvas"); c.width = Math.round(fw * 2); c.height = Math.round(fh * 2);
    const g = c.getContext("2d"); g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const dataUrl = c.toDataURL("image/png");
    if (toLayout) { onAddToLayout({ label: `Level plan RL ${rl} m ±${half} m`, src: dataUrl, naturalW: c.width, naturalH: c.height }); return; }
    const a = document.createElement("a"); a.href = dataUrl; a.download = `level_plan_RL${rl}.png`; a.click();
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
          <label style={ctrl} title={tr("Hole runs, logs, assays and structures within this distance above and below the RL are drawn")}>{tr("± slab (m)")}{" "}<input type="number" min={0.1} step="any" value={half} onChange={(e) => setHalf(e.target.value)} style={{ ...inp, width: 56 }} aria-label={tr("Slab half-width")} /></label>
          {layerKeys.length > 0 && (
            <label style={ctrl}>{tr("Colour holes by")}<select value={activeLayer} onChange={(e) => setColourBy(e.target.value)} style={{ ...inp, width: "auto" }} aria-label={tr("Colour holes by")}>
                {layerKeys.map((k) => <option key={k} value={k}>{(data.intervals.find((iv) => iv.layer === k)?.label || k).split(":")[0]}</option>)}
              </select>
            </label>
          )}
          <label style={ctrl}><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />{" "}{tr("Hole ids")}</label>
          <label style={ctrl} title={tr("Frame the holes that are in the slab (zoomed in) instead of the whole project (a fixed frame as the RL moves)")}><input type="checkbox" checked={fitSlab} onChange={(e) => setFitSlab(e.target.checked)} />{" "}{tr("Fit to slab")}</label>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} title={tr("Close")} aria-label={tr("Close")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><XIcon size={18} /></button>
        </div>
        <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} fontFamily="'Segoe UI', system-ui, Arial, sans-serif" role="img" aria-label={tr("Level plan at {rl} m", { rl })} onClick={onClick} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onDoubleClick={() => !drawing && setView(null)} style={{ display: "block", background: "#ffffff", border: "1px solid var(--color-border)", borderRadius: 6, cursor: drawing ? "crosshair" : "grab", maxWidth: "100%", height: "auto" }}>
          {/* grid */}
          {gx.map((x) => <g key={`gx${x}`}><line x1={X(x)} y1={PAD / 2} x2={X(x)} y2={H - PAD / 2} stroke="#eceef2" /><text x={X(x)} y={H - 6} fontSize="10" fill="#7a8494" textAnchor="middle">{Math.round(x)}E</text></g>)}
          {gy.map((y) => <g key={`gy${y}`}><line x1={PAD / 2} y1={Y(y)} x2={W - PAD / 2} y2={Y(y)} stroke="#eceef2" /><text x={4} y={Y(y) - 3} fontSize="10" fill="#7a8494">{Math.round(y)}N</text></g>)}
          {/* block-model cells at the RL */}
          {data.voxelSlices.map((v) => v.rects.map((r, i) => <rect key={`${v.id}_${i}`} x={X(r.x0)} y={Y(r.y1)} width={(r.x1 - r.x0) * s + 0.4} height={(r.y1 - r.y0) * s + 0.4} fill={r.color} opacity={0.55} />))}
          {/* model surfaces / solids cut by the plane */}
          {data.surfaceCuts.map((sc) => <g key={sc.id}>{sc.segs.map((g, i) => <line key={i} x1={X(g[0])} y1={Y(g[1])} x2={X(g[2])} y2={Y(g[3])} stroke={sc.color} strokeWidth={2} />)}</g>)}
          {/* hole context (whole trace, faint) and collars */}
          {data.holes.map((h) => <path key={`c${h.hole_id}`} d={path(h.context)} stroke="#c9ced6" strokeWidth={1} fill="none" />)}
          {data.holes.map((h) => <circle key={`k${h.hole_id}`} cx={X(h.collar[0])} cy={Y(h.collar[1])} r={1.8} fill="#9aa3b0" />)}
          {/* the in-slab parts: plain dark, then coloured by the chosen log */}
          {data.holes.map((h) => h.polylines.map((pl, i) => <path key={`r${h.hole_id}_${i}`} d={path(pl)} stroke="#2a323c" strokeWidth={2} fill="none" />))}
          {data.intervals.filter((iv) => iv.layer === activeLayer).map((iv, i) => iv.lines.map((pl, j) => <path key={`iv${i}_${j}`} d={path(pl)} stroke={iv.color} strokeWidth={5} fill="none" strokeLinecap="butt"><title>{`${iv.hole_id} ${iv.from}–${iv.to} m — ${iv.label}`}</title></path>))}
          {/* assays / mineralisation dots */}
          {data.points.map((p, i) => <circle key={`p${i}`} cx={X(p.x)} cy={Y(p.y)} r={2.6} fill={p.color} stroke="#ffffff" strokeWidth={0.6}><title>{`${p.hole_id} @ ${p.md.toFixed(1)} m — ${p.label}`}</title></circle>)}
          {/* structures: strike-dip symbols (oriented) or a small cross (unoriented) */}
          {data.structures.map((st, i) => {
            if (st.dip == null) return <path key={`s${i}`} d={`M${X(st.x) - 3},${Y(st.y)} h6 M${X(st.x)},${Y(st.y) - 3} v6`} stroke={st.color} strokeWidth={1.4}><title>{tr("{hole_id} @ {depth} m — {label} (not oriented)", { hole_id: st.hole_id, depth: st.depth, label: st.label })}</title></path>;
            const sym = strikeDipSymbol(st.x, st.y, st.dip, st.dipDir, 8 / s);
            return <g key={`s${i}`} stroke={st.color} strokeWidth={1.6}><line x1={X(sym.strike[0])} y1={Y(sym.strike[1])} x2={X(sym.strike[2])} y2={Y(sym.strike[3])} /><line x1={X(sym.tick[0])} y1={Y(sym.tick[1])} x2={X(sym.tick[2])} y2={Y(sym.tick[3])} /><title>{`${st.hole_id} @ ${st.depth} m — ${st.label}, ${Math.round(st.dip)}° → ${Math.round(st.dipDir)}°`}</title></g>;
          })}
          {/* planned holes */}
          {data.planned.map((p) => <g key={`pl${p.name}`}><path d={path(p.context)} stroke={colors.planned} strokeWidth={1} strokeDasharray="4 3" fill="none" opacity={0.6} />{p.lines.map((l, i) => <path key={i} d={path(l)} stroke={colors.planned} strokeWidth={2.4} strokeDasharray="5 3" fill="none" />)}{p.pierce.map((pc, i) => <g key={`pp${i}`}><rect x={X(pc.x) - 4} y={Y(pc.y) - 4} width={8} height={8} fill="#ffffff" stroke={colors.planned} strokeWidth={1.6} /><title>{tr("Planned {name}: pierces {rl} m at {md} m", { name: p.name, rl, md: pc.md.toFixed(1) })}</title></g>)}{labels && p.pierce[0] && <text x={X(p.pierce[0].x) + 6} y={Y(p.pierce[0].y) + 3} fontSize="10" fill={colors.planned}>{p.name}</text>}</g>)}
          {/* pierce points */}
          {data.holes.map((h) => h.pierce.map((pc, i) => (
            <g key={`pc${h.hole_id}_${i}`}>
              {/* filled with the chosen log's colour at the RL (white: not logged there) */}
              <circle cx={X(pc.x)} cy={Y(pc.y)} r={4.6} fill={(pc.logs || []).find((l) => l.layer === activeLayer)?.color || "#ffffff"} stroke="#1a2028" strokeWidth={1.6}>
                <title>{[tr("{hole_id} pierces {rl} m at {md} m", { hole_id: h.hole_id, rl, md: pc.md.toFixed(1) }), ...(pc.logs || []).map((l) => l.label), ...(pc.assays || [])].join("\n")}</title>
              </circle>
              {labels && <text x={X(pc.x) + 6} y={Y(pc.y) - 5} fontSize="10.5" fill="#1a2028" stroke="#ffffff" strokeWidth={2.5} paintOrder="stroke">{h.hole_id}</text>}
            </g>
          )))}
          {/* the outline being drawn */}
          {pts.length > 0 && <path d={path(hover && drawing ? [...pts, hover] : pts) + (pts.length > 2 && !drawing ? " Z" : "")} stroke="#d1495b" strokeWidth={1.8} fill="rgba(209,73,91,0.08)" />}
          {pts.map((p, i) => <circle key={`d${i}`} cx={X(p[0])} cy={Y(p[1])} r={2.6} fill="#d1495b" />)}
          {/* title, north arrow, scale bar */}
          <text x={PAD / 2} y={16} fontSize="13" fontWeight="600" fill="#1a2028">{tr("Level plan RL {rl} m (slab ±{half} m)", { rl, half })}</text>
          <g transform={`translate(${W - 26},${PAD + 6})`}><path d="M0,-14 L6,6 L0,2 L-6,6 Z" fill="#1a2028" /><text x={0} y={18} fontSize="11" fontWeight="700" textAnchor="middle" fill="#1a2028">N</text></g>
          <g transform={`translate(${W - PAD - barM * s},${H - 22})`}><rect width={barM * s} height={5} fill="#1a2028" /><rect width={(barM * s) / 2} height={5} fill="#ffffff" stroke="#1a2028" strokeWidth={0.8} /><text x={(barM * s) / 2} y={-3} fontSize="10" textAnchor="middle" fill="#1a2028">{`${barM} m`}</text></g>
        </svg>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", flex: 1, minWidth: 260 }}>
            {tr("{pierceCount} {v} at {rl} m · {inSlab} {v2} in the slab · {voxelSlices} {v3} and {surfaceCuts} {v4} cut · equal E / N scale · wheel to zoom, drag to pan, double-click to reset. Hover a pierce point for its logs and assays.", { pierceCount, v: tr(pierceCount === 1 ? "pierce point" : "pierce points"), rl, inSlab, v2: tr(inSlab === 1 ? "hole" : "holes"), voxelSlices: data.voxelSlices.length, v3: tr(data.voxelSlices.length === 1 ? "block model" : "block models"), surfaceCuts: data.surfaceCuts.length, v4: tr(data.surfaceCuts.length === 1 ? "surface" : "surfaces") })}</div>
          {!drawing
            ? <button style={btn} onClick={() => { setDrawing(true); setPts([]); setNote(tr("Click points on the plan; Save outline when done.")); }}><Pencil size={14} />{" "}{tr("Draw outline")}</button>
            : <><button style={btn} onClick={saveOutline}><Check size={14} />{" "}{tr("Save outline")}</button><button style={btn} onClick={() => { setDrawing(false); setPts([]); setNote(null); }}>{tr("Cancel")}</button></>}
          <button style={btn} onClick={() => setRev((r) => r + 1)} title={tr("Rebuild from the current layers, filters and models")}>{tr("Refresh")}</button>
          <button style={btn} onClick={() => exportPng(false)}><Download size={14} />{" "}{tr("PNG")}</button>
          <button style={btn} onClick={() => exportPng(true)}>{tr("Add to Layout")}</button>
        </div>
        {data.legendItems.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 12px", marginTop: 6, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", maxWidth: W }}>
            {data.legendItems.slice(0, 40).map(([label, color]) => <span key={label + color} style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, background: color, borderRadius: 2, border: "1px solid var(--color-border)" }} />{label}</span>)}
            {data.legendItems.length > 40 && <span>{tr("+ {v} more", { v: data.legendItems.length - 40 })}</span>}
          </div>
        )}
        {note && <div role="status" style={{ marginTop: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{note}</div>}
      </div>
    </div>
  );
}
