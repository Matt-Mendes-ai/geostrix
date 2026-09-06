import React, { useMemo, useState } from "react";
import { X, Download } from "lucide-react";
import { colorForLithology } from "../lib/layers.js";
import { buildFencePanel, panelPointAtDepth, correlationBands } from "../lib/fence.js";
import { saveFile } from "../lib/desktop.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";

// TASKS.csv #139 — FENCE / PANEL DIAGRAM (hole-to-hole lithology correlation along a drill line).
//
// Micromine-specialist audit finding. Beyond arbitrary cross-sections, this is the view geologists
// build to correlate specific lithology units hole-to-hole along a drill line — and it is deliberately
// LIGHTER than implicit modelling, not a poor substitute for it. It is the tool for the stage of a
// project BEFORE there is enough data for GemPy to produce anything trustworthy: three holes on a line
// cannot support an implicit surface, but they can absolutely support "the basalt top drops 40 m to the
// east between 17HR-282 and 17HR-278", and that observation is what the next hole gets sited on.
//
// Follows DownholeStructurePlot.jsx (#277) throughout rather than inventing a second convention:
// same modal shell, same useEscapeKey/useFocusTrap (#238), same inline-SVG rendering with a controls
// column on the right, same Export SVG via saveFile. The projection math is in src/lib/fence.js so it
// could be verified in Node against hand-worked geometry first — see the #139 notes.
//
// ================= HOW OFF-LINE HOLES ARE HANDLED (the honest bit) =================
// Holes are essentially never collinear, and a fence diagram is a flattening of 3D onto one vertical
// plane. Every hole's perpendicular distance from that plane is error that the picture silently
// absorbs: a hole 80 m off the line is DRAWN as though it sat on the line, so a contact correlated
// through it carries 80 m of horizontal fiction. The decision here is to make that visible rather than
// smooth it away, in four places:
//   1. The section line is the TOTAL-LEAST-SQUARES principal axis of the selected collars (rotation-
//      invariant, defined for a north-south drill line where an ordinary y-on-x regression is not), or
//      an azimuth the user types when they have a specific section in mind.
//   2. Every hole's signed perpendicular offset is printed under its label, on the diagram itself —
//      not buried in a tooltip. Holes beyond the (adjustable) offset limit are highlighted amber and
//      can be excluded from the panel in one click.
//   3. An OFFSET RIBBON runs along the top of the panel: each hole's offset drawn to the same
//      horizontal scale as the section itself, so "40 m off a 300 m line" looks like what it is.
//   4. The whole TRACE is projected, not just the collar. An inclined hole wanders in plan as it goes
//      down, so its toe is usually further off-section than its collar; drawing a vertical bar under
//      the collar would misplace every deep contact. Each trace vertex is projected independently, so
//      a hole leans across the panel exactly as it does in the ground, and the reported offset is the
//      MAXIMUM along the hole, not the collar's.
// What this tool will NOT do is quietly redraw geometry to make the section look tidier.
//
// CORRELATION BANDS are drawn only between ADJACENT holes, for the SAME lithology code, using each
// hole's SHALLOWEST occurrence of that code. A correlation is an interpretation, not a measurement;
// matching up repeated units (fault repetition, interbedding) is a judgement this tool has no business
// making silently, so it draws the one defensible band and leaves the rest to the geologist. They are
// off by default for that reason.
export default function FenceDiagramModal({ traces = [], litho = [], onClose }) {
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238

  const allIds = useMemo(
    () => (traces || []).filter((t) => t?.wx?.length).map((t) => t.hole_id).sort(),
    [traces]
  );
  const [selected, setSelected] = useState(() => new Set(allIds));
  const [azMode, setAzMode] = useState("fit"); // "fit" | "manual"
  const [manualAz, setManualAz] = useState("90");
  const [ve, setVe] = useState(1); // vertical exaggeration
  const [showBands, setShowBands] = useState(false);
  const [offsetLimit, setOffsetLimit] = useState(100); // metres; beyond this a hole is flagged
  const [colWidth, setColWidth] = useState(9); // px half-width of each lithology column

  const chosen = useMemo(
    () => (traces || []).filter((t) => t?.wx?.length > 1 && selected.has(t.hole_id)),
    [traces, selected]
  );

  const panel = useMemo(() => {
    const az = azMode === "manual" ? Number(manualAz) : null;
    return buildFencePanel(chosen, Number.isFinite(az) ? { azimuth: az } : {});
  }, [chosen, azMode, manualAz]);

  const lithoByHole = useMemo(() => {
    const m = {};
    (litho || []).forEach((r) => {
      if (r.from == null || r.to == null || isNaN(r.from) || isNaN(r.to)) return;
      (m[r.hole_id] = m[r.hole_id] || []).push({ value: r.value, from: Number(r.from), to: Number(r.to) });
    });
    Object.values(m).forEach((rows) => rows.sort((a, b) => a.from - b.from));
    return m;
  }, [litho]);

  const codes = useMemo(() => {
    const set = new Set();
    (panel?.holes || []).forEach((h) => (lithoByHole[h.hole_id] || []).forEach((r) => {
      const v = String(r.value ?? "").trim(); if (v) set.add(v);
    }));
    return Array.from(set).sort();
  }, [panel, lithoByHole]);

  // ---- layout ----
  const PLOT_W = 760, PLOT_H = 430, RIBBON_H = 34;
  const PAD_L = 56, PAD_T = 22 + RIBBON_H, PAD_R = 16, PAD_B = 40;
  const W = PAD_L + PLOT_W + PAD_R, H = PAD_T + PLOT_H + PAD_B;

  const view = useMemo(() => {
    if (!panel) return null;
    // Pad the section-length range so the outermost holes' columns aren't clipped at the frame edge.
    const sPad = Math.max(10, (panel.sRange.max - panel.sRange.min) * 0.06);
    const s0 = panel.sRange.min - sPad, s1 = panel.sRange.max + sPad;
    const zPad = Math.max(5, (panel.zRange.max - panel.zRange.min) * 0.05);
    const z0 = panel.zRange.min - zPad, z1 = panel.zRange.max + zPad;
    const sSpan = Math.max(1e-6, s1 - s0), zSpan = Math.max(1e-6, z1 - z0);
    // TRUE SCALE by default: one metre along section is one metre of elevation, so a 60° hole is drawn
    // at 60° and a geologist can measure a dip off the page. Vertical exaggeration is opt-in and
    // labelled on the diagram, because an unlabelled VE is how people misread dips off a section.
    const sPerPx = Math.max(sSpan / PLOT_W, (zSpan * ve) / PLOT_H);
    const xFor = (s) => PAD_L + PLOT_W / 2 + (s - (s0 + s1) / 2) / sPerPx;
    const yFor = (z) => PAD_T + PLOT_H / 2 - ((z - (z0 + z1) / 2) * ve) / sPerPx;
    return { xFor, yFor, sPerPx, s0, s1, z0, z1 };
  }, [panel, ve]);

  const bands = useMemo(() => {
    if (!showBands || !panel) return [];
    const out = [];
    for (let i = 0; i < panel.holes.length - 1; i++) {
      correlationBands(panel.holes[i], panel.holes[i + 1], lithoByHole).forEach((b) => out.push(b));
    }
    return out;
  }, [showBands, panel, lithoByHole]);

  const svgRef = React.useRef(null);
  const exportSvg = () => {
    if (!svgRef.current) return;
    saveFile({
      suggestedName: "fence_diagram.svg",
      filters: [{ name: "SVG", extensions: ["svg"] }],
      content: new XMLSerializer().serializeToString(svgRef.current), encoding: "text",
    });
  };

  const toggle = (id) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const dropOffLine = () => {
    if (!panel) return;
    setSelected(new Set(panel.holes.filter((h) => h.maxAbsOffset <= offsetLimit).map((h) => h.hole_id)));
  };

  const offHoles = (panel?.holes || []).filter((h) => h.maxAbsOffset > offsetLimit);
  const zTicks = useMemo(() => {
    if (!view) return [];
    const span = view.z1 - view.z0;
    const pow = Math.pow(10, Math.floor(Math.log10(span / 6 || 1)));
    const stepZ = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => span / s <= 9) || pow * 10;
    const out = [];
    for (let z = Math.ceil(view.z0 / stepZ) * stepZ; z <= view.z1; z += stepZ) out.push(Math.round(z * 100) / 100);
    return out;
  }, [view]);

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modalPanel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1a2028" }}>
            Fence / panel diagram
            {panel && <span style={{ fontWeight: 400, fontSize: 11, color: "#94a1b0" }}>
              {" "}— {panel.holes.length} hole{panel.holes.length === 1 ? "" : "s"}, section {panel.line.azimuth.toFixed(1)}°
              {ve !== 1 ? ` · ${ve}× vertical exaggeration` : " · true scale"}
            </span>}
          </div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onClose} />
        </div>

        {!allIds.length ? (
          <div style={{ padding: "28px 8px", fontSize: 12, color: "#55606e", lineHeight: 1.6, maxWidth: 520 }}>
            No desurveyed holes yet. Import collars and survey data (and a lithology layer) and this
            panel will fill in.
          </div>
        ) : (
        <div style={{ display: "flex", gap: 16 }}>
          <div>
            <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ background: "#fbfbfc", border: "1px solid #d9dce1", borderRadius: 8 }}>
              <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="#ffffff" stroke="#d9dce1" strokeWidth={1} />
              {view && zTicks.map((z) => (
                <g key={`z${z}`}>
                  <line x1={PAD_L} y1={view.yFor(z)} x2={PAD_L + PLOT_W} y2={view.yFor(z)} stroke="#f0f2f4" strokeWidth={1} />
                  <text x={PAD_L - 5} y={view.yFor(z) + 3} textAnchor="end" fontSize={9} fill="#55606e">{z}</text>
                </g>
              ))}
              <text x={10} y={PAD_T - 6} fontSize={9} fill="#55606e">RL (m)</text>
              <text x={PAD_L + PLOT_W / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="#55606e">
                Distance along section (m) — bearing {panel ? panel.line.azimuth.toFixed(1) : "—"}°
              </text>

              {/* ---- OFFSET RIBBON: how far each hole really is off the section plane, drawn to the
                      SAME horizontal scale as the section, so the distortion is visible as distance
                      rather than hidden in a number. Centre line = the section plane itself. ---- */}
              {view && panel && (
                <g>
                  <rect x={PAD_L} y={22} width={PLOT_W} height={RIBBON_H - 6} fill="#f7f8fa" stroke="#e6e8ec" strokeWidth={1} />
                  <line x1={PAD_L} y1={22 + (RIBBON_H - 6) / 2} x2={PAD_L + PLOT_W} y2={22 + (RIBBON_H - 6) / 2} stroke="#c7ccd3" strokeWidth={1} strokeDasharray="4 3" />
                  <text x={PAD_L + 4} y={22 - 3} fontSize={8.5} fill="#94a1b0">Offset from section plane (same scale as the section)</text>
                  {panel.holes.map((h) => {
                    const cy = 22 + (RIBBON_H - 6) / 2;
                    const dy = Math.max(-(RIBBON_H - 8) / 2, Math.min((RIBBON_H - 8) / 2, h.offset / view.sPerPx));
                    const over = h.maxAbsOffset > offsetLimit;
                    return (
                      <g key={`ro_${h.hole_id}`}>
                        <line x1={view.xFor(h.s)} y1={cy} x2={view.xFor(h.s)} y2={cy - dy} stroke={over ? "#c98a1f" : "#7d8a9a"} strokeWidth={1.2} />
                        <circle cx={view.xFor(h.s)} cy={cy - dy} r={2.4} fill={over ? "#c98a1f" : "#55606e"}>
                          <title>{`${h.hole_id}: collar ${h.offset.toFixed(1)} m off section, max ${h.maxAbsOffset.toFixed(1)} m along the hole`}</title>
                        </circle>
                      </g>
                    );
                  })}
                </g>
              )}

              {/* ---- correlation bands, behind the holes ---- */}
              {view && bands.map((b, i) => (
                <path
                  key={`band_${i}`}
                  d={`M ${view.xFor(b.aTop.s)} ${view.yFor(b.aTop.z)} L ${view.xFor(b.bTop.s)} ${view.yFor(b.bTop.z)} L ${view.xFor(b.bBot.s)} ${view.yFor(b.bBot.z)} L ${view.xFor(b.aBot.s)} ${view.yFor(b.aBot.z)} Z`}
                  fill={colorForLithology(b.code)} opacity={0.16} stroke={colorForLithology(b.code)} strokeWidth={0.6} strokeOpacity={0.5}
                ><title>{`${b.code} correlated between adjacent holes (shallowest occurrence in each) — an interpretation, not a measurement`}</title></path>
              ))}

              {/* ---- each hole: its projected trace, then its lithology intervals as a column ---- */}
              {view && panel && panel.holes.map((h) => {
                const rows = lithoByHole[h.hole_id] || [];
                const over = h.maxAbsOffset > offsetLimit;
                const traceD = h.pts.map((p, i) => `${i ? "L" : "M"} ${view.xFor(p.s)} ${view.yFor(p.z)}`).join(" ");
                return (
                  <g key={`h_${h.hole_id}`}>
                    <path d={traceD} fill="none" stroke="#98a3b2" strokeWidth={0.9} />
                    {rows.map((r, i) => {
                      const a = panelPointAtDepth(h, r.from), b = panelPointAtDepth(h, r.to);
                      if (!a || !b) return null;
                      const x1 = view.xFor(a.s), y1 = view.yFor(a.z), x2 = view.xFor(b.s), y2 = view.yFor(b.z);
                      // Draw the interval as a quad perpendicular to the local trace direction, so the
                      // column follows the hole instead of standing vertically beside it.
                      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
                      const nx = (-dy / L) * colWidth, ny = (dx / L) * colWidth;
                      return (
                        <path key={`i_${i}`}
                          d={`M ${x1 + nx} ${y1 + ny} L ${x2 + nx} ${y2 + ny} L ${x2 - nx} ${y2 - ny} L ${x1 - nx} ${y1 - ny} Z`}
                          fill={colorForLithology(r.value)} opacity={0.92} stroke="#ffffff" strokeWidth={0.3}
                        ><title>{`${h.hole_id} — ${r.value}  ${r.from}–${r.to} m`}</title></path>
                      );
                    })}
                    <circle cx={view.xFor(h.pts[0].s)} cy={view.yFor(h.pts[0].z)} r={2.6} fill="#1a2028" />
                    <text x={view.xFor(h.pts[0].s)} y={view.yFor(h.pts[0].z) - 12} textAnchor="middle" fontSize={8.6} fill="#1a2028">{h.hole_id}</text>
                    {/* Offset printed ON the diagram, per hole — the projection's error bar, not a footnote. */}
                    <text x={view.xFor(h.pts[0].s)} y={view.yFor(h.pts[0].z) - 4} textAnchor="middle" fontSize={7.6} fill={over ? "#a8741a" : "#94a1b0"}>
                      {h.maxAbsOffset < 0.05 ? "on section" : `${h.maxAbsOffset.toFixed(0)} m off`}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div style={{ width: 210, display: "flex", flexDirection: "column", gap: 9, maxHeight: "72vh", overflow: "auto" }}>
            <label style={rowLabel} title="Best fit is the principal (total-least-squares) axis of the selected collars — the line that minimises perpendicular distance, and unlike a y-on-x regression it works for a north-south drill line and does not depend on how the map is rotated.">
              Section line
              <select value={azMode} onChange={(e) => setAzMode(e.target.value)} style={sel}>
                <option value="fit">Best fit through collars</option>
                <option value="manual">Fixed azimuth…</option>
              </select>
            </label>
            {azMode === "manual" && (
              <label style={rowLabel}>
                Azimuth (°)
                <input value={manualAz} onChange={(e) => setManualAz(e.target.value)} style={sel} />
              </label>
            )}
            <label style={rowLabel} title="1x is true scale — a 60° hole is drawn at 60° and you can measure a dip off the page. Any other value is labelled on the diagram itself.">
              Vertical scale
              <select value={ve} onChange={(e) => setVe(Number(e.target.value))} style={sel}>
                {[1, 1.5, 2, 3, 5].map((v) => <option key={v} value={v}>{v === 1 ? "1× (true scale)" : `${v}× exaggerated`}</option>)}
              </select>
            </label>
            <label style={rowLabel}>
              Column width
              <select value={colWidth} onChange={(e) => setColWidth(Number(e.target.value))} style={sel}>
                {[5, 7, 9, 13, 18].map((v) => <option key={v} value={v}>{v} px</option>)}
              </select>
            </label>
            <label style={{ ...rowLabel, flexDirection: "row", alignItems: "center", gap: 6 }} title="Joins the shallowest occurrence of each shared lithology code between ADJACENT holes only. This is an interpretation, not a measurement — off by default.">
              <input type="checkbox" checked={showBands} onChange={(e) => setShowBands(e.target.checked)} /> Correlation bands
            </label>
            <label style={rowLabel} title="Holes whose maximum perpendicular distance from the section plane exceeds this are flagged amber on the diagram and in the list below.">
              Flag holes over
              <select value={offsetLimit} onChange={(e) => setOffsetLimit(Number(e.target.value))} style={sel}>
                {[25, 50, 100, 200, 500].map((v) => <option key={v} value={v}>{v} m off section</option>)}
              </select>
            </label>

            {offHoles.length > 0 && (
              <div style={warnNote}>
                {offHoles.length} hole{offHoles.length === 1 ? " is" : "s are"} more than {offsetLimit} m off the
                section plane and {offHoles.length === 1 ? "is" : "are"} drawn as if on it. Any contact
                correlated through {offHoles.length === 1 ? "it" : "them"} carries that much horizontal error.
                <button onClick={dropOffLine} style={{ ...miniBtn, marginTop: 5 }}>Drop them from the panel</button>
              </div>
            )}

            <div style={{ fontSize: 10, color: "#55606e", fontWeight: 600, marginTop: 2 }}>
              Holes ({selected.size}/{allIds.length})
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setSelected(new Set(allIds))} style={miniBtn}>All</button>
              <button onClick={() => setSelected(new Set())} style={miniBtn}>None</button>
            </div>
            <div style={{ maxHeight: 170, overflow: "auto", border: "1px solid #e0e3e8", borderRadius: 5, padding: "4px 6px" }}>
              {allIds.map((id) => {
                const h = panel?.holes.find((x) => x.hole_id === id);
                const over = h && h.maxAbsOffset > offsetLimit;
                return (
                  <label key={id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.2, color: over ? "#a8741a" : "#1a2028", padding: "1px 0" }}>
                    <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{id}</span>
                    {h && <span style={{ color: over ? "#a8741a" : "#94a1b0", fontSize: 9 }}>{h.maxAbsOffset.toFixed(0)}m</span>}
                  </label>
                );
              })}
            </div>

            {codes.length > 0 && (
              <>
                <div style={{ fontSize: 10, color: "#55606e", fontWeight: 600, marginTop: 2 }}>Lithology</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {codes.map((c) => (
                    <div key={c} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9.6, color: "#55606e" }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: colorForLithology(c) }} />{c}
                    </div>
                  ))}
                </div>
              </>
            )}
            {!codes.length && (
              <div style={warnNote}>No lithology intervals for the selected holes — the panel shows the projected traces only.</div>
            )}

            <div style={{ background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, padding: "7px 8px", fontSize: 10, color: "#55606e", lineHeight: 1.5 }}>
              <div style={{ fontWeight: 600, color: "#1a2028", marginBottom: 3 }}>Reading this panel</div>
              Horizontal is distance along the section line; vertical is elevation. Each hole's whole
              trace is projected, so an inclined hole leans exactly as it does in the ground. The number
              under each collar is that hole's largest perpendicular distance from the section plane —
              the error this flattening introduces.
            </div>

            <button onClick={exportSvg} style={{ ...exportBtn, marginTop: "auto" }}><Download size={12} /> Export SVG</button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(20,24,30,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" };
const modalPanel = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, padding: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.3)", maxWidth: "96vw", maxHeight: "95vh", overflow: "auto" };
const rowLabel = { fontSize: 10.5, color: "#55606e", display: "flex", flexDirection: "column", gap: 3 };
const sel = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "5px 6px", color: "#1a2028", fontSize: 11 };
const miniBtn = { padding: "3px 8px", borderRadius: 5, border: "1px solid #c7ccd3", background: "transparent", color: "#55606e", fontSize: 10, cursor: "pointer" };
const exportBtn = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 10px", borderRadius: 6, border: "1px solid #c7ccd3", background: "transparent", color: "#55606e", fontSize: 11.5, cursor: "pointer" };
const warnNote = { background: "#fdf6ec", border: "1px solid #e6d3b3", borderRadius: 6, padding: "6px 8px", fontSize: 9.8, color: "#6b4e20", lineHeight: 1.45 };
