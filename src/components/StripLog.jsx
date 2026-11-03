import { fillLanes } from "../lib/stripLanes.js"; // TASKS.csv #1254
import React, { useMemo, useRef, useState } from "react";
import { X, Download } from "./icons.js";
import { LAYER_META, UNIT_NAMES, colorForAlteration, colorForVein, colorForBreccia, colorForStructZone, colorForStructure } from "../lib/layers.js";
import { logFrac, valueRange, recoveryMax, alphaTick, holeStructures } from "../lib/stripTracks.js"; // TASKS.csv #1400
import { valueIn } from "../lib/geochem.js";
import { saveFile } from "../lib/desktop.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements

// TASKS.csv #133 — "Downhole strip logs (single-hole 1D graphic log: litho/alt/vein/assay columns
// side by side)". A classic drill-logging display: one hole, depth running down the page, several
// parallel tracks reading the same depth axis — lithology and alteration as colored fill blocks,
// veins as tick marks (they're usually thin/discrete, a fill block would misrepresent their width),
// geotech RQD% as a bar reading left-to-right, and a user-picked assay element as a bar track with its
// own grade axis. Pure SVG, one long scrollable page — pxPerMeter controls how tall it renders (a deep
// hole logged at high resolution needs to scroll, not squeeze onto one screen).
const TRACK_W = 90;
import { arrMin, arrMax } from "../lib/arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { exportSvgMarkup } from "../lib/svgExport.js"; // TASKS.csv #1089 — font, size, no UI chrome
import { stripLogFurniture, pngScaleFor } from "../lib/figureFurniture.js"; // TASKS.csv #1048
import { stripLogTextPt } from "../lib/atlas.js"; // TASKS.csv #1480 — the size its labels print at
const DEPTH_COL_W = 50;
const PAD_TOP = 40;

export default function StripLog({ holeId, collars, layers, assays, assayElements, colorFor, labelFor, assayColor, onClose, modelledLayers = [], onAddToLayout = null }) {
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const svgRef = useRef(null);
  const [pxPerMeter, setPxPerMeter] = useState(6);
  const symbols = assayElements.map((e) => e.symbol);
  const [assaySymbol, setAssaySymbol] = useState(symbols[0] || "");
  // TASKS.csv #402 — up to two more element tracks, and a log scale (default): one 30 g/t sample on a
  // linear bar scaled to the hole maximum used to flatten every other sample to nothing.
  const [extraSymbols, setExtraSymbols] = useState([]);
  const [logScale, setLogScale] = useState(true);
  const shownSymbols = [assaySymbol, ...extraSymbols].filter(Boolean).filter((s, i, a) => a.indexOf(s) === i).slice(0, 3);
  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);

  const litho = useMemo(() => (layers.litho || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from), [layers.litho, holeId]);
  const alt = useMemo(() => (layers.alt || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from), [layers.alt, holeId]);
  const vein = useMemo(() => (layers.vein || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from), [layers.vein, holeId]);
  const breccia = useMemo(() => (layers.breccia || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from), [layers.breccia, holeId]); // #608
  const structzone = useMemo(() => (layers.structzone || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from), [layers.structzone, holeId]); // #604
  const mnlgy = useMemo(() => (layers.mnlgy || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from), [layers.mnlgy, holeId]); // #684
  const geotech = useMemo(() => (layers.geotech || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from), [layers.geotech, holeId]);
  const recovery = useMemo(() => (layers.recovery || []).filter((r) => r.hole_id === holeId && Number.isFinite(Number(r.value))).sort((a, b) => a.from - b.from), [layers.recovery, holeId]); // #1400
  const structs = useMemo(() => holeStructures(layers.structure, holeId), [layers.structure, holeId]); // #1400
  const holeAssays = useMemo(() => assays.filter((a) => a.hole_id === holeId).sort((a, b) => a.from - b.from), [assays, holeId]);

  const collar = collars.find((c) => c.hole_id === holeId);
  const maxDepth = Math.max(
    collar?.length || 0,
    arrMax(litho.map((r) => r.to)), arrMax(alt.map((r) => r.to)), arrMax(vein.map((r) => r.to)), arrMax(geotech.map((r) => r.to)), arrMax(recovery.map((r) => r.to)), arrMax(structs.map((s) => s.depth)), arrMax(breccia.map((r) => r.to)), arrMax(structzone.map((r) => r.to)), arrMax(mnlgy.map((r) => r.to)),
    arrMax(holeAssays.map((a) => a.to)),
    1);

  // Per element: min positive value and max, for the linear or log axis of its track.
  const assayRange = useMemo(() => Object.fromEntries(shownSymbols.map((sym) => {
    const vals = holeAssays.map((a) => valueIn(a, sym, elementUnits[sym] || "ppm", elementUnits)).filter((v) => v != null && Number.isFinite(v));
    const pos = vals.filter((v) => v > 0);
    return [sym, { max: vals.length ? arrMax(vals) : 0, minPos: pos.length ? arrMin(pos) : 0 }];
  })), [holeAssays, shownSymbols.join("|"), elementUnits]);
  const barFrac = (sym, v) => {
    const r = assayRange[sym];
    if (!r || !(r.max > 0) || v == null) return 0;
    if (!logScale) return Math.max(0, Math.min(1, v / r.max));
    if (!(v > 0)) return 0;
    const lo = Math.log10(r.minPos), hi = Math.log10(r.max);
    return hi > lo ? Math.max(0.03, Math.min(1, (Math.log10(v) - lo) / (hi - lo))) : 1; // 3% floor so the lowest value is still visible
  };
  const fill = (key, fallbackFn, v) => (colorFor ? colorFor(key, v) : fallbackFn(v)); // #402 — legend overrides
  const nameOf = (key) => (labelFor ? (v) => labelFor(key, v) : null);

  const sy = (d) => PAD_TOP + d * pxPerMeter;
  const H = sy(maxDepth) + 30;

  const tracks = [
    { key: "litho", label: "Litho", rows: litho, kind: "fill", colorFn: (v) => fill("litho", LAYER_META.litho.colorFn, v), nameFn: (v) => (labelFor ? labelFor("litho", v) : UNIT_NAMES[v] || v) },
    // TASKS.csv #356 — the implicit model's unit at each logged interval, right beside the logged litho.
    ...modelledLayers.filter((ml) => !ml.rows?.[0]?.numeric).map((ml, i, arr) => { const rows = (ml.rows || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from); const col = Object.fromEntries(rows.map((r) => [r.value, r.modelColor])); return { key: `modelled_${ml.id}`, label: arr.length > 1 ? `Model ${i + 1}` : "Modelled", title: ml.name, rows, kind: "fill", colorFn: (v) => col[v] || "#d9dce1", nameFn: (v) => v }; }).filter((t) => t.rows.length),
    // TASKS.csv #323 — logged susceptibility / SG and a numeric model evaluated onto the hole, side by side
    ...[["magsusc", "Mag. susc."], ["sg", "SG"]].map(([k, label]) => { const rows = (layers[k] || []).filter((r) => r.hole_id === holeId && Number.isFinite(Number(r.value))).map((r) => (Number.isFinite(r.depth) && !Number.isFinite(r.to) ? { ...r, from: r.depth - 0.25, to: r.depth + 0.25 } : r)).sort((a, b) => a.from - b.from); return { key: `log_${k}`, label, title: `${label} as logged`, rows, kind: "bar", max: rows.reduce((m, r) => Math.max(m, Number(r.value)), 0), scaleLabel: true, ...(k === "magsusc" ? { logOk: true, minPos: valueRange(rows).minPos } : {}) }; }).filter((t) => t.rows.length), // logOk: #1400 — mag susc follows the Log scale box
    ...modelledLayers.filter((ml) => ml.rows?.[0]?.numeric).map((ml) => { const rows = (ml.rows || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from); return { key: `modelledN_${ml.id}`, label: "Model", title: `${ml.name}${ml.unit ? ` (${ml.unit})` : ""}`, rows, kind: "bar", max: rows.reduce((m, r) => Math.max(m, r.value), 0), scaleLabel: true, colorOf: (r) => r.modelColor }; }).filter((t) => t.rows.length),
    { key: "alt", label: "Alt.", rows: alt, kind: "fill", colorFn: (v) => fill("alt", colorForAlteration, v), nameFn: labelFor ? (v) => labelFor("alt", v) : null },
    { key: "vein", label: "Vein", rows: vein, kind: "tick", colorFn: (v) => fill("vein", colorForVein, v), nameFn: nameOf("vein") }, // #1289 — renamed categories on every track
    ...((layers.breccia || []).length ? [{ key: "breccia", label: "Bx", title: "Breccia", rows: breccia, kind: "fill", colorFn: (v) => fill("breccia", colorForBreccia, v), nameFn: nameOf("breccia") }] : []), // #608 — only in projects with breccia logs
    ...((layers.structzone || []).length ? [{ key: "structzone", label: "SZ", title: "Structural zones", rows: structzone, kind: "fill", colorFn: (v) => fill("structzone", colorForStructZone, v), nameFn: nameOf("structzone") }] : []), // #604
    // TASKS.csv #684 — the mineralisation log: an interval row is a block over its depths (Woodjam: up to 69 m), a
    // point-style row (from = to) a thin line at its depth
    ...(mnlgy.length ? [{ key: "mnlgy", label: "Min.", title: "Mineralization", rows: mnlgy, kind: "fill", colorFn: (v) => fill("mnlgy", LAYER_META.mnlgy.colorFn, v), nameFn: nameOf("mnlgy") }] : []),
    ...((layers.structure || []).length ? [{ key: "structure", label: "Struct.", title: "Structure picks: each a tick at its alpha to the core axis (horizontal = 90°), a short mark at the edge without one", rows: structs, kind: "struct", colorFn: (v) => fill("structure", colorForStructure, v), nameFn: nameOf("structure") }] : []), // #1400
    { key: "geotech", label: "RQD%", rows: geotech, kind: "bar", max: 100 },
    ...((layers.recovery || []).length ? [{ key: "recovery", label: "Rec.%", title: "Recovery %", rows: recovery, kind: "bar", max: recoveryMax(recovery), scaleLabel: true, colorOf: () => "#5aa469" }] : []), // #1400 — beside RQD, over 100 % kept
    ...(shownSymbols.length ? shownSymbols : [""]).map((sym) => ({ key: `assay_${sym}`, sym, label: sym ? `${sym} (${elementUnits[sym] || "ppm"})` : "Assay", rows: holeAssays, kind: "assaybar" })),
  ];

  const baseName = `striplog_${holeId}`.replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
  const svgDims = () => {
    const svg = svgRef.current;
    if (!svg) return null;
    const vb = svg.viewBox?.baseVal;
    return vb && vb.width ? { w: vb.width, h: vb.height } : { w: DEPTH_COL_W + tracks.length * TRACK_W + 40, h: H };
  };
  // TASKS.csv #1048 — hole, collar, attitude, depth, scale and a key of the codes in each colour track, drawn into the file
  const [pngNote, setPngNote] = useState("");
  const furniture = () => stripLogFurniture({ holeId, collar, maxDepth, pxPerMeter, date: new Date().toISOString().slice(0, 10),
    tracks: tracks.filter((t) => t.kind === "fill" || t.kind === "struct").map((t) => { // struct: #1400
      const seen = [...new Set(t.rows.map((r) => r.value).filter((v) => v != null && v !== ""))];
      return { title: t.title || t.label, items: seen.map((v) => ({ label: t.nameFn ? `${v} ${t.nameFn(v) !== v ? `(${t.nameFn(v)})` : ""}`.trim() : String(v), color: t.colorFn(v) })) };
    }) });
  // TASKS.csv #1480 (review #1352) — the strip log to Layout, as the section window, level plan and Best intercepts do: the same
  // figure as the SVG export (the chosen assay tracks, the depth axis and its metres, the collar caption and the colour-track
  // key), and its colour tracks as the bound Layout legend. Layout fits it to the sheet; when that would print its 9.5 px labels
  // under 6 pt the window says so (a lower vertical scale gives a shorter, readable log).
  const addToLayout = () => {
    const svg = svgRef.current;
    if (!svg || !onAddToLayout) return;
    const { markup, width: fw, height: fh } = exportSvgMarkup(svg, { furniture: furniture() });
    const legendItems = tracks.filter((t) => t.kind === "fill" || t.kind === "struct").flatMap((t) => {
      const seen = [...new Set(t.rows.map((r) => r.value).filter((v) => v != null && v !== ""))];
      const group = String(t.title || t.label).split(": ")[0]; // the legend splits a heading at its first ": " (the structure track's title has one)
      return seen.map((v) => [`${group}: ${t.nameFn ? t.nameFn(v) : v}`, t.colorFn(v)]);
    });
    onAddToLayout({ label: `Strip log — ${holeId}` /* project data stays English */, src: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(markup)))}`, naturalW: fw, naturalH: fh, legendItems });
    const ptAt = (h) => stripLogTextPt(h, Math.min(700 * (h / fw), 794 - 160)); // Layout: 700 px wide, at most the sheet height less margins (A4 landscape)
    const pt = ptAt(fh), pt1 = ptAt(fh - maxDepth * (pxPerMeter - 1)); // the same log drawn at 1 px/m
    setPngNote(pt == null || pt >= 6 ? "" : pt1 >= 6
      ? tr("Sent to Layout. Its labels print at about {pt} pt there: lower the vertical scale (px/m) and send it again for a readable log.", { pt: pt.toFixed(1) })
      : tr("Sent to Layout. A {m} m hole is too long to print readably on one page (labels about {pt} pt, {pt1} pt even at 1 px/m): use the SVG or PNG for a full-size log.", { m: Math.round(maxDepth), pt: pt.toFixed(1), pt1: pt1.toFixed(1) }));
  };
  const exportSVG = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = exportSvgMarkup(svg, { furniture: furniture() }).markup;
    saveFile({ suggestedName: `${baseName}.svg`, filters: [{ name: "SVG", extensions: ["svg"] }], content: xml });
  };
  const exportPNG = () => {
    const svg = svgRef.current;
    const dims = svgDims();
    if (!svg || !dims) return;
    const { markup: xml, width: fw, height: fh } = exportSvgMarkup(svg, { furniture: furniture() });
    const { scale, reduced } = pngScaleFor(fw, fh); // #1048 — under the canvas size limit
    setPngNote(reduced ? tr("This log is too tall for a full-resolution PNG: it was saved at {s}× instead of 2× (use SVG for full detail, or lower the vertical scale).", { s: scale.toFixed(2) }) : "");
    const img = new Image();
    const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(fw * scale); canvas.height = Math.round(fh * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const b64 = canvas.toDataURL("image/png").split(",")[1];
      saveFile({ suggestedName: `${baseName}.png`, filters: [{ name: "PNG", extensions: ["png"] }], content: b64, encoding: "base64" });
    };
    img.src = url;
  };

  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 15, color: "#8a6a1f", fontWeight: 600 }}>{tr("Strip log — {holeId}", { holeId })}</div>
            <div style={{ fontSize: 11, color: "#65717e", marginTop: 2 }}>{tr("{maxDepth} m total depth", { maxDepth: +maxDepth.toFixed(1) })}</div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onClose} />
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 16px", borderBottom: "1px solid #d9dce1", flexWrap: "wrap" }}>
          <label style={{ fontSize: 11, color: "#55606e", display: "flex", alignItems: "center", gap: 6 }}>{tr("Assay element")}<select value={assaySymbol} onChange={(e) => setAssaySymbol(e.target.value)} style={selStyle}>
              <option value="">{tr("— none —")}</option>
              {symbols.map((s) => <option key={s} value={s}>{s} ({elementUnits[s] || "ppm"})</option>)}
            </select>
          </label>
          {[0, 1].map((k) => (
            <select key={k} value={extraSymbols[k] || ""} onChange={(e) => setExtraSymbols((p) => { const n = [...p]; n[k] = e.target.value; return n.filter(Boolean); })} style={selStyle} aria-label={tr("Additional assay track {v}", { v: k + 1 })}>
              <option value="">{tr("+ element")}</option>
              {symbols.filter((s) => s !== assaySymbol).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ))}
          <label style={{ fontSize: 11, color: "#55606e", display: "flex", alignItems: "center", gap: 5 }} title={tr("Log scale spreads trace-element grades and mag susc (a few high values no longer flatten the rest). Linear is proportional to the value.")}>
            <input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} />{" "}{tr("Log scale")}</label>
          <label style={{ fontSize: 11, color: "#55606e", display: "flex", alignItems: "center", gap: 6 }}>{tr("Vertical scale (px/m)")}<input type="number" min="1" max="40" value={pxPerMeter} onChange={(e) => setPxPerMeter(Math.max(1, Math.min(40, Number(e.target.value) || 6)))} style={{ ...selStyle, width: 60 }} />
          </label>
          <div style={{ flex: 1 }} />
          <button onClick={exportSVG} style={{ ...btn(false), padding: "6px 10px", display: "flex", alignItems: "center", gap: 5 }}><Download size={12} />{" "}{tr("SVG")}</button>
          <button onClick={exportPNG} style={{ ...btn(false), padding: "6px 10px", display: "flex", alignItems: "center", gap: 5 }}><Download size={12} />{" "}{tr("PNG")}</button>
          {onAddToLayout && <button onClick={addToLayout} style={{ ...btn(false), padding: "6px 10px" }} title={tr("The log as drawn here (its tracks, depth axis and key) on the Layout page, with its colour tracks as a legend")}>{tr("Add to Layout")}</button>}
        </div>
        {pngNote && <div role="status" style={{ padding: "6px 16px", fontSize: 11, color: "#7a4a1f", background: "#fdf4e6", borderBottom: "1px solid #edd9b7" }}>{pngNote}</div>}

        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          <svg ref={svgRef} viewBox={`0 0 ${DEPTH_COL_W + tracks.length * TRACK_W + 40} ${H}`} width={DEPTH_COL_W + tracks.length * TRACK_W + 40} height={H} style={{ background: "#ffffff" }}>
            {/* depth ticks */}
            {depthTicks(maxDepth, pxPerMeter).map((d, i) => (
              <g key={i}>
                <line x1={DEPTH_COL_W - 4} y1={sy(d)} x2={DEPTH_COL_W} y2={sy(d)} stroke="#94a1b0" strokeWidth="1" />
                <text x={DEPTH_COL_W - 7} y={sy(d) + 3} fontSize="9" textAnchor="end" fill="#55606e">{d}</text>
              </g>
            ))}
            <line x1={DEPTH_COL_W} y1={sy(0)} x2={DEPTH_COL_W} y2={sy(maxDepth)} stroke="#94a1b0" strokeWidth="1" />

            {tracks.map((t, ti) => {
              const x0 = DEPTH_COL_W + ti * TRACK_W;
              return (
                <g key={t.key}>
                  <text x={x0 + TRACK_W / 2} y={PAD_TOP - 14} fontSize="10.5" fontWeight="600" textAnchor="middle" fill="#1a2028">{t.label}{t.title ? <title>{t.title}</title> : null}</text>
                  <rect x={x0} y={sy(0)} width={TRACK_W - 6} height={sy(maxDepth) - sy(0)} fill="none" stroke="#dde1e6" />
                  {t.kind === "fill" && (() => { // #1254 — rows on the same depths side by side, with their percent where the log gives one
                    const { rows, lanes } = t.key === "mnlgy" ? fillLanes(t.rows) : { rows: t.rows, lanes: 1 };
                    const w = (TRACK_W - 6) / lanes;
                    return rows.map((r, i) => (
                      <g key={i}>
                        <rect x={x0 + (r.lane || 0) * w} y={sy(r.from)} width={w} height={Math.max(0.5, sy(r.to) - sy(r.from))} fill={t.colorFn(r.value)} stroke={lanes > 1 ? "#fff" : undefined} strokeWidth={lanes > 1 ? 0.5 : undefined}>
                          {lanes > 1 && <title>{`${r.value}${Number.isFinite(r.extra) ? ` ${r.extra} %` : ""}, ${r.from}–${r.to} m`}</title>}
                        </rect>
                        {(sy(r.to) - sy(r.from)) > 12 && (
                          <text x={x0 + (r.lane || 0) * w + w / 2} y={(sy(r.from) + sy(r.to)) / 2 + 3.5} fontSize="10" textAnchor="middle" fill="#1a2028" stroke="#ffffff" strokeWidth="2.5" paintOrder="stroke" strokeLinejoin="round" style={{ pointerEvents: "none" }}>{/* #1298 — 8 px on saturated fills */}
                            {String(t.nameFn ? t.nameFn(r.value) : r.value).slice(0, lanes > 1 ? 3 : 10)}
                          </text>
                        )}
                      </g>
                    ));
                  })()}
                  {t.kind === "tick" && t.rows.map((r, i) => (
                    <rect key={i} x={x0} y={sy(r.from)} width={TRACK_W - 6} height={Math.max(1.5, sy(r.to) - sy(r.from))} fill={t.colorFn(r.value)} opacity="0.85" />
                  ))}
                  {t.kind === "bar" && t.rows.map((r, i) => {
                    const lg = t.logOk && logScale; // #1400
                    const w = (lg ? logFrac(Number(r.value), t.minPos, t.max) : t.max > 0 ? Math.max(0, Math.min(1, (Number(r.value) || 0) / t.max)) : 0) * (TRACK_W - 8);
                    return <rect key={i} x={x0 + 2} y={sy(r.from)} width={w} height={Math.max(0.5, sy(r.to) - sy(r.from))} fill={(t.colorOf && t.colorOf(r)) || "#4a9be0"} opacity="0.75"><title>{`${r.from}-${r.to} m: ${Number(r.value).toPrecision(3)}`}</title></rect>;
                  })}
                  {t.kind === "bar" && t.scaleLabel && t.max > 0 && ( // #323 — each bar track's own full-scale value
                    <text x={x0 + TRACK_W / 2} y={sy(maxDepth) + 14} fontSize="8" textAnchor="middle" fill="#65717e">{t.logOk && logScale && t.minPos > 0 ? tr("log {minPos}–{max}", { minPos: t.minPos.toPrecision(2), max: t.max.toPrecision(3) }) : `0–${t.max.toPrecision(3)}`}</text>
                  )}
                  {t.kind === "struct" && t.rows.map((s, i) => { // #1400
                    const cx = x0 + (TRACK_W - 6) / 2, y = sy(s.depth), tk = alphaTick(s.alpha, (TRACK_W - 6) / 2 - 4), c = t.colorFn(s.value);
                    const oriented = Number.isFinite(Number(s.dip)) && Number.isFinite(Number(s.azimuth)) && s.dip !== null && s.azimuth !== null;
                    const tip = `${t.nameFn ? t.nameFn(s.value) : s.value} at ${s.depth} m${tk ? `, alpha ${s.alpha}°` : ""}${oriented ? `, dip ${Math.round(s.dip)}° to ${Math.round(s.azimuth)}°` : ""}`;
                    return tk
                      ? <line key={i} x1={cx - tk.dx} y1={y - tk.dy} x2={cx + tk.dx} y2={y + tk.dy} stroke={c} strokeWidth="1.6" strokeLinecap="round"><title>{tip}</title></line>
                      : <line key={i} x1={x0} y1={y} x2={x0 + 10} y2={y} stroke={c} strokeWidth="2"><title>{tip}</title></line>;
                  })}
                  {t.kind === "assaybar" && t.sym && t.rows.map((r, i) => {
                    const v = valueIn(r, t.sym, elementUnits[t.sym] || "ppm", elementUnits);
                    if (v == null) return null;
                    const w = barFrac(t.sym, v) * (TRACK_W - 8);
                    if (!(w > 0)) return null;
                    return <rect key={i} x={x0 + 2} y={sy(r.from)} width={w} height={Math.max(0.5, sy(r.to) - sy(r.from))} fill={assayColor ? assayColor(t.sym, v) : "#c9863d"} opacity="0.85"><title>{`${r.from}-${r.to} m: ${v} ${elementUnits[t.sym] || "ppm"}`}</title></rect>;
                  })}
                  {t.kind === "assaybar" && t.sym && assayRange[t.sym]?.max > 0 && (
                    <text x={x0 + TRACK_W / 2} y={sy(maxDepth) + 14} fontSize="8" textAnchor="middle" fill="#65717e">{logScale ? tr("log {minPos}–{max}", { minPos: assayRange[t.sym].minPos.toPrecision(2), max: assayRange[t.sym].max.toPrecision(3) }) : `0–${assayRange[t.sym].max.toPrecision(3)}`}</text>
                  )}
                </g>
              );
            })}
          </svg>
          {tracks.every((t) => t.rows.length === 0) && (
            <div style={{ fontSize: 12, color: "#65717e", marginTop: 12 }}>{tr("No interval data logged for this hole yet — import litho/alt/vein/geotech/assay data with matching hole_id \"{holeId}\".", { holeId })}</div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #d9dce1" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>{tr("Close")}</button>
        </div>
      </div>
    </div>
  );
}

function depthTicks(maxDepth, pxPerMeter) {
  // aim for roughly one label every ~24px so ticks don't crowd at high pxPerMeter or thin out at low
  const targetPx = 24;
  const rawStep = targetPx / pxPerMeter;
  const niceSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500];
  const step = niceSteps.find((s) => s >= rawStep) || niceSteps[niceSteps.length - 1];
  const ticks = [];
  for (let d = 0; d <= maxDepth; d += step) ticks.push(d);
  return ticks;
}

const panel = { width: "min(760px, 95vw)", height: "min(820px, 92vh)", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #d9dce1" };
const selStyle = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "5px 7px", color: "#1a2028", fontSize: 11.5, fontFamily: "inherit" };
const btn = (primary) => ({ borderRadius: 6, fontSize: 12, cursor: "pointer", border: primary ? "1px solid #3d6b52" : "1px solid #c7ccd3", background: primary ? "#1e3629" : "transparent", color: primary ? "#8fd9ab" : "#55606e" });
