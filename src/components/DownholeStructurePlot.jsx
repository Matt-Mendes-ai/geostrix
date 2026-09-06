import React, { useMemo, useState } from "react";
import { X, Download } from "lucide-react";
import { alphaAngle } from "../lib/stereonet.js";
import { colorForStructure, colorForLithology } from "../lib/layers.js";
import { saveFile } from "../lib/desktop.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";

// TASKS.csv #277 — DOWNHOLE STRUCTURAL (TADPOLE) PLOT.
//
// Structural-geology specialist review, ranked the highest-frequency missing capability of that whole
// review: this is the view a geologist actually opens FIRST when working structural core data, and it
// was entirely absent. GeoStrix could show structure picks in the 3D scene (where reading a dip angle
// precisely by eye is hopeless) and on the stereonet (which has no depth axis at all, so it cannot
// answer "where in the hole is this?"), and nothing in between. The tadpole plot is what answers the
// questions those two can't:
//   * WHERE down the hole is the structure concentrated — i.e. where are the fault/fracture zones?
//   * Does structural style CHANGE at a lithology contact (the classic "is this contact structural or
//     depositional" question)?
//   * Are the picks internally sane before they ever reach the stereonet — a run of identical
//     azimuths, or alpha values that jump around impossibly between adjacent picks, is a logging or
//     core-orientation error, and it is invisible on a stereonet where it just adds to the scatter.
//
// THE PLOT, following the standard used in Leapfrog / Datamine / Target / LogChief so it reads the way
// a geologist already expects:
//   * Depth increases DOWNWARD on the Y axis (this is a downhole log, not a chart — depth-down is not
//     negotiable).
//   * X is the angle, 0-90°, left to right.
//   * Each pick is a dot ("the tadpole's head") at (angle, depth), with a short TAIL pointing in the
//     structure's dip-direction compass bearing, drawn with north UP the page — so tail direction is
//     read off the plot exactly as it would be off a map. That tail is the whole reason this is a
//     "tadpole" and not a scatter plot: it carries the third number (azimuth) without a third axis.
//
// X-AXIS MODE, and why both are offered:
//   * ALPHA (default) is the angle between the structure and the CORE AXIS — what is physically
//     measured on core, and the number that makes downhole sense: a run of low-alpha picks means
//     structures running along the hole. Computed here from the pick's true dip/dipdir against the
//     hole's own attitude at that depth (stereonet.js's alphaAngle, whose convention is verified
//     against coreOrientation.js's independently-derived alphaBetaFromPole).
//   * TRUE DIP is the geological angle from horizontal. In a vertical hole the two are the same thing
//     reflected (alpha = 90 − dip); in an inclined hole they are genuinely different, and confusing
//     them is a real and common error — hence both, explicitly labelled, never silently one or other.
//
// The lithology track down the left and the structure-frequency histogram down the right exist for the
// correlation questions above: a fracture-frequency spike that lines up with a contact is the single
// most common thing a geologist is looking for here, and requiring them to hold two windows side by
// side to see it would defeat the purpose of the view.
export default function DownholeStructurePlot({ picks, holes, litho = [], onClose }) {
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238

  // Only holes that actually have structure picks are offered — a hole selector listing 37 holes of
  // which 4 have any structural logging is a menu of dead ends.
  const holeIds = useMemo(() => {
    const withPicks = new Set((picks || []).filter((p) => p.dip != null && p.azimuth != null && !isNaN(p.dip) && !isNaN(p.azimuth)).map((p) => p.hole_id));
    return (holes || []).map((h) => h.hole_id).filter((id) => withPicks.has(id)).sort();
  }, [picks, holes]);

  const [holeId, setHoleId] = useState(() => holeIds[0] || "");
  const [xMode, setXMode] = useState("alpha"); // "alpha" | "dip"
  const [typeFilter, setTypeFilter] = useState("all");
  const [showFreq, setShowFreq] = useState(true);
  const [binSize, setBinSize] = useState(10); // metres, for the frequency histogram

  const activeHole = holeId || holeIds[0] || "";

  const types = useMemo(() => {
    const set = new Set();
    (picks || []).filter((p) => p.hole_id === activeHole).forEach((p) => set.add(String(p.value || "").trim() || "(unlabeled)"));
    return Array.from(set).sort();
  }, [picks, activeHole]);

  // Picks for this hole, with alpha resolved where the hole attitude is known. A pick whose hole has no
  // usable survey gets alpha = null rather than a guessed value: the alpha view then says so instead of
  // plotting a number that isn't real.
  const holePicks = useMemo(() => {
    const rows = (picks || [])
      .filter((p) => p.hole_id === activeHole && p.dip != null && p.azimuth != null && !isNaN(p.dip) && !isNaN(p.azimuth) && p.depth != null && !isNaN(p.depth))
      .filter((p) => typeFilter === "all" || (String(p.value || "").trim() || "(unlabeled)") === typeFilter)
      .map((p) => ({
        ...p,
        depth: Number(p.depth),
        dip: Number(p.dip),
        azimuth: Number(p.azimuth),
        alpha: (p.holeAz != null && p.holeDip != null && !isNaN(p.holeAz) && !isNaN(p.holeDip))
          ? alphaAngle(Number(p.azimuth), Number(p.dip), Number(p.holeAz), Number(p.holeDip))
          : null,
      }));
    rows.sort((a, b) => a.depth - b.depth);
    return rows;
  }, [picks, activeHole, typeFilter]);

  const hasAlpha = holePicks.some((p) => p.alpha != null);
  const effectiveMode = xMode === "alpha" && !hasAlpha ? "dip" : xMode;

  const holeLitho = useMemo(
    () => (litho || []).filter((r) => r.hole_id === activeHole && r.from != null && r.to != null && !isNaN(r.from) && !isNaN(r.to)).sort((a, b) => a.from - b.from),
    [litho, activeHole]
  );

  // Depth range: the hole's own logged length where known, else whatever the data spans. Padded to a
  // round number so the axis labels land on sensible values rather than 187.4 m.
  const maxDepth = useMemo(() => {
    const hole = (holes || []).find((h) => h.hole_id === activeHole);
    const candidates = [
      hole && hole.maxDepth != null && !isNaN(hole.maxDepth) ? Number(hole.maxDepth) : 0,
      ...holePicks.map((p) => p.depth),
      ...holeLitho.map((r) => Number(r.to)),
    ];
    const m = Math.max(0, ...candidates);
    return m > 0 ? Math.ceil(m / 10) * 10 : 100;
  }, [holes, activeHole, holePicks, holeLitho]);

  // TASKS.csv #277 — structure frequency per depth bin: the actual "where are the fault zones" signal.
  const freq = useMemo(() => {
    if (!showFreq) return null;
    const nBins = Math.max(1, Math.ceil(maxDepth / binSize));
    const counts = new Array(nBins).fill(0);
    holePicks.forEach((p) => {
      const i = Math.min(nBins - 1, Math.max(0, Math.floor(p.depth / binSize)));
      counts[i]++;
    });
    return { counts, nBins, max: counts.reduce((m, c) => Math.max(m, c), 0) };
  }, [holePicks, maxDepth, binSize, showFreq]);

  // Layout. One tall column: lithology track | tadpole panel | frequency track.
  const H = 520, PLOT_H = H - 54;
  const LITHO_W = 22, GAP = 8, PLOT_W = 300, FREQ_W = showFreq ? 62 : 0;
  const W = 44 + LITHO_W + GAP + PLOT_W + (showFreq ? GAP + FREQ_W : 0) + 14;
  const X0 = 44 + LITHO_W + GAP;         // left edge of the tadpole panel
  const Y0 = 34;                          // top edge of every track
  const yFor = (d) => Y0 + (Math.min(maxDepth, Math.max(0, d)) / maxDepth) * PLOT_H;
  const xFor = (ang) => X0 + (Math.min(90, Math.max(0, ang)) / 90) * PLOT_W;
  const TAIL = 13;

  const svgRef = React.useRef(null);
  const exportSvg = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const content = new XMLSerializer().serializeToString(svgEl);
    saveFile({ suggestedName: `tadpole_${activeHole || "hole"}.svg`, filters: [{ name: "SVG", extensions: ["svg"] }], content, encoding: "text" });
  };

  const depthTicks = useMemo(() => {
    // Aim for ~8-12 labelled depths, on a round step.
    const raw = maxDepth / 10;
    const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => maxDepth / s <= 12) || pow * 10;
    const out = [];
    for (let d = 0; d <= maxDepth + 1e-9; d += step) out.push(Math.round(d * 100) / 100);
    return out;
  }, [maxDepth]);

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1a2028" }}>
            Downhole structure (tadpole) — {activeHole || "no hole"} <span style={{ fontWeight: 400, fontSize: 11, color: "#94a1b0" }}>({holePicks.length} pick{holePicks.length === 1 ? "" : "s"})</span>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onClose} />
        </div>

        {!holeIds.length ? (
          <div style={{ padding: "28px 8px", fontSize: 12, color: "#55606e", lineHeight: 1.6 }}>
            No hole has any structure picks with a dip and dip direction yet. Import a structure layer (or
            save picks from the Core Orientation calculator) and this plot will fill in.
          </div>
        ) : (
        <div style={{ display: "flex", gap: 16 }}>
          <div>
            <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ background: "#fbfbfc", border: "1px solid #d9dce1", borderRadius: 8 }}>
              {/* Lithology track — the correlation half of this view's purpose. */}
              {holeLitho.map((r, i) => {
                const y1 = yFor(Number(r.from)), y2 = yFor(Number(r.to));
                if (!(y2 > y1)) return null;
                return (
                  <rect key={`lt_${i}`} x={44} y={y1} width={LITHO_W} height={Math.max(0.5, y2 - y1)} fill={colorForLithology(r.value)} opacity={0.85}>
                    <title>{`${r.value} — ${r.from}–${r.to} m`}</title>
                  </rect>
                );
              })}
              <rect x={44} y={Y0} width={LITHO_W} height={PLOT_H} fill="none" stroke="#d9dce1" strokeWidth={1} />
              <text x={44 + LITHO_W / 2} y={Y0 - 6} textAnchor="middle" fontSize={9} fill="#55606e">Litho</text>

              {/* Tadpole panel */}
              <rect x={X0} y={Y0} width={PLOT_W} height={PLOT_H} fill="#ffffff" stroke="#d9dce1" strokeWidth={1} />
              {[0, 15, 30, 45, 60, 75, 90].map((a) => (
                <g key={`vx_${a}`}>
                  <line x1={xFor(a)} y1={Y0} x2={xFor(a)} y2={Y0 + PLOT_H} stroke={a % 45 === 0 ? "#e0e3e8" : "#f0f2f4"} strokeWidth={1} />
                  <text x={xFor(a)} y={Y0 - 6} textAnchor="middle" fontSize={9} fill="#55606e">{a}</text>
                </g>
              ))}
              <text x={X0 + PLOT_W / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="#55606e">
                {effectiveMode === "alpha" ? "Alpha — angle to core axis (°)" : "True dip (°)"}
              </text>

              {/* Depth grid + labels (shared by every track, so a spike lines up across all three). */}
              {depthTicks.map((d) => (
                <g key={`dt_${d}`}>
                  <line x1={44} y1={yFor(d)} x2={X0 + PLOT_W + (showFreq ? GAP + FREQ_W : 0)} y2={yFor(d)} stroke="#f0f2f4" strokeWidth={1} />
                  <text x={40} y={yFor(d) + 3} textAnchor="end" fontSize={9} fill="#55606e">{d}</text>
                </g>
              ))}
              <text x={10} y={Y0 - 6} fontSize={9} fill="#55606e">Depth (m)</text>

              {/* Lithology CONTACTS extended across the tadpole panel as faint lines — this is what makes
                  "does structural style change at the contact" answerable at a glance instead of by
                  eye-tracking between two tracks. */}
              {holeLitho.map((r, i) => (
                <line key={`lc_${i}`} x1={X0} y1={yFor(Number(r.from))} x2={X0 + PLOT_W} y2={yFor(Number(r.from))} stroke="#b9a06a" strokeWidth={0.8} strokeDasharray="3 3" opacity={0.7} />
              ))}

              {/* The tadpoles themselves. Tail bearing = the structure's dip direction, north UP. */}
              {holePicks.map((p, i) => {
                const ang = effectiveMode === "alpha" ? p.alpha : p.dip;
                if (ang == null || isNaN(ang)) return null;
                const cx = xFor(ang), cy = yFor(p.depth);
                const a = (Number(p.azimuth) * Math.PI) / 180;
                const tx = cx + TAIL * Math.sin(a), ty = cy - TAIL * Math.cos(a);
                const color = colorForStructure(p.value);
                return (
                  <g key={`tp_${i}`}>
                    <line x1={cx} y1={cy} x2={tx} y2={ty} stroke={color} strokeWidth={1.4} opacity={0.95} />
                    <circle cx={cx} cy={cy} r={3.1} fill={color} stroke="#1a2028" strokeWidth={0.5}>
                      <title>{`${p.value || "(unlabeled)"} @ ${p.depth} m — dip ${p.dip}° / dipdir ${p.azimuth}°${p.alpha != null ? ` · alpha ${p.alpha.toFixed(1)}°` : ""}`}</title>
                    </circle>
                  </g>
                );
              })}

              {/* Frequency track: picks per depth bin. */}
              {freq && (
                <>
                  <rect x={X0 + PLOT_W + GAP} y={Y0} width={FREQ_W} height={PLOT_H} fill="#ffffff" stroke="#d9dce1" strokeWidth={1} />
                  <text x={X0 + PLOT_W + GAP + FREQ_W / 2} y={Y0 - 6} textAnchor="middle" fontSize={9} fill="#55606e">n/{binSize}m</text>
                  {freq.counts.map((c, i) => {
                    if (!c) return null;
                    const y1 = yFor(i * binSize), y2 = yFor(Math.min(maxDepth, (i + 1) * binSize));
                    const w = freq.max > 0 ? (c / freq.max) * (FREQ_W - 2) : 0;
                    return (
                      <rect key={`fq_${i}`} x={X0 + PLOT_W + GAP + 1} y={y1} width={w} height={Math.max(0.8, y2 - y1 - 0.5)} fill="#2f6fe0" opacity={0.55}>
                        <title>{`${c} pick(s) between ${i * binSize} and ${Math.min(maxDepth, (i + 1) * binSize)} m`}</title>
                      </rect>
                    );
                  })}
                  <text x={X0 + PLOT_W + GAP + FREQ_W - 2} y={H - 8} textAnchor="end" fontSize={9} fill="#94a1b0">max {freq.max}</text>
                </>
              )}
            </svg>
          </div>

          <div style={{ width: 190, display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={rowLabel}>
              Hole
              <select value={activeHole} onChange={(e) => setHoleId(e.target.value)} style={sel}>
                {holeIds.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
            <label style={rowLabel} title="Alpha is the angle between the structure and the core axis — what is measured on core, and what makes a run of hole-parallel structures obvious. True dip is the geological angle from horizontal. In an inclined hole these are genuinely different numbers.">
              X axis
              <select value={xMode} onChange={(e) => setXMode(e.target.value)} style={sel}>
                <option value="alpha">Alpha (to core axis)</option>
                <option value="dip">True dip</option>
              </select>
            </label>
            <label style={rowLabel}>
              Structure type
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={sel}>
                <option value="all">All types</option>
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label style={{ ...rowLabel, flexDirection: "row", alignItems: "center", gap: 6 }} title="Structure picks per depth bin — a spike is a fracture/fault zone.">
              <input type="checkbox" checked={showFreq} onChange={(e) => setShowFreq(e.target.checked)} /> Frequency track
            </label>
            {showFreq && (
              <label style={rowLabel}>
                Frequency bin
                <select value={binSize} onChange={(e) => setBinSize(Number(e.target.value))} style={sel}>
                  {[1, 2, 5, 10, 20, 25].map((b) => <option key={b} value={b}>{b} m</option>)}
                </select>
              </label>
            )}

            {xMode === "alpha" && !hasAlpha && (
              <div style={{ background: "#fdf6ec", border: "1px solid #e6d3b3", borderRadius: 6, padding: "6px 8px", fontSize: 9.8, color: "#6b4e20", lineHeight: 1.45 }}>
                Showing TRUE DIP: alpha needs this hole's attitude at each pick's depth, which requires
                collar and survey data for {activeHole}.
              </div>
            )}

            <div style={{ background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, padding: "7px 8px", fontSize: 10.5, color: "#1a2028", lineHeight: 1.55 }}>
              <div style={{ fontWeight: 600, marginBottom: 3 }}>Reading this plot</div>
              <div style={{ color: "#55606e" }}>
                Each dot sits at its {effectiveMode === "alpha" ? "alpha" : "dip"} angle and its depth. The
                tail points in the structure's dip direction, <b>north up the page</b> — so a tail pointing
                right is dipping east.
              </div>
              <div style={{ color: "#55606e", marginTop: 4 }}>
                Clustered tails = a consistent set. Tails fanning through 360° over a short interval, or
                alpha jumping wildly between adjacent picks, usually means a core-orientation problem
                rather than real geology.
              </div>
            </div>

            {types.length > 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {types.map((t) => (
                  <div key={t} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#55606e" }}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: colorForStructure(t) }} />
                    {t}
                  </div>
                ))}
              </div>
            )}

            <button onClick={exportSvg} style={{ ...exportBtn, marginTop: "auto" }}><Download size={12} /> Export SVG</button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(20,24,30,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" };
const panel = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, padding: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.3)", maxWidth: "94vw", maxHeight: "94vh", overflow: "auto" };
const rowLabel = { fontSize: 10.5, color: "#55606e", display: "flex", flexDirection: "column", gap: 3 };
const sel = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "5px 6px", color: "#1a2028", fontSize: 11 };
const exportBtn = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 10px", borderRadius: 6, border: "1px solid #c7ccd3", background: "transparent", color: "#55606e", fontSize: 11.5, cursor: "pointer" };
