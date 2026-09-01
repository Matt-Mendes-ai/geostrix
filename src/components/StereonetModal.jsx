import React, { useMemo, useState } from "react";
import { X, Download } from "lucide-react";
import { projectPole, greatCirclePoints, fisherStats } from "../lib/stereonet.js";
import { colorForStructure } from "../lib/layers.js";
import { saveFile } from "../lib/desktop.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";

// TASKS.csv #141 — stereonet QC for structure picks (Leapfrog-specialist audit finding: dip/azimuth
// picks feed the anisotropy and structural-surface tools with no way to actually LOOK at the population
// of orientations first — a pole-plot/great-circle net is how a structural geologist normally checks
// "is this trend I'm about to feed the interpolator actually representative, or am I about to fit a
// surface to a couple of outliers." Lower-hemisphere, lets a geologist toggle equal-area (Schmidt, the
// standard for density-honest pole plots) vs equal-angle (Wulff), poles vs great circles vs both, and
// filter/color by structure type (fault, shear, contact, etc. — whatever's actually in the Structure
// layer) using the SAME colorForStructure the rest of the app already uses for that layer, so a color
// here means the same thing it does everywhere else in GeoStrix.
//
// Deliberately NOT contoured (Kamb/density contouring) — a real, useful follow-up (flagged in this
// task's own TASKS.csv note) but a materially bigger piece of math than a first-pass pole/great-circle
// plot, and the audit finding's core complaint ("no way to interpret orientations before committing to
// a trend") is already addressed by seeing the raw pole population and its scatter/clustering by eye.
export default function StereonetModal({ picks, onClose, onUseAsTrend }) {
  useEscapeKey(onClose); // TASKS.csv #238
  const [projection, setProjection] = useState("equalArea");
  const [showPoles, setShowPoles] = useState(true);
  const [showCircles, setShowCircles] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [showMean, setShowMean] = useState(true); // TASKS.csv #236

  const types = useMemo(() => {
    const set = new Set();
    picks.forEach((p) => set.add(String(p.value || "").trim() || "(unlabeled)"));
    return Array.from(set).sort();
  }, [picks]);

  const filtered = useMemo(() => {
    if (typeFilter === "all") return picks;
    return picks.filter((p) => (String(p.value || "").trim() || "(unlabeled)") === typeFilter);
  }, [picks, typeFilter]);

  // TASKS.csv #236 — mean vector / Fisher statistics over whatever subset is currently filtered in,
  // so switching Structure type recomputes for just that population (which is the useful thing: the
  // mean of "all faults + all bedding together" is meaningless, the mean of one set is not).
  const stats = useMemo(() => fisherStats(filtered), [filtered]);

  const SIZE = 420, PAD = 24, R = SIZE / 2 - PAD, CX = SIZE / 2, CY = SIZE / 2;
  const toSvg = (p) => ({ x: CX + p.x * R, y: CY - p.y * R }); // net y+ = north = up on screen, so flip for SVG's y-down

  const svgRef = React.useRef(null);
  const exportSvg = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const content = new XMLSerializer().serializeToString(svgEl);
    saveFile({ suggestedName: "stereonet.svg", filters: [{ name: "SVG", extensions: ["svg"] }], content, encoding: "text" });
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1a2028" }}>Stereonet — structure picks ({filtered.length}/{picks.length})</div>
          <X size={16} style={{ cursor: "pointer", color: "#55606e" }} onClick={onClose} />
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          <div>
            <svg ref={svgRef} width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ background: "#fbfbfc", border: "1px solid #d9dce1", borderRadius: 8 }}>
              {/* primitive circle (net boundary) */}
              <circle cx={CX} cy={CY} r={R} fill="none" stroke="#8a5555" strokeWidth={1.5} />
              {/* N/S/E/W cross-hairs + labels */}
              <line x1={CX} y1={CY - R} x2={CX} y2={CY + R} stroke="#d9dce1" strokeWidth={1} />
              <line x1={CX - R} y1={CY} x2={CX + R} y2={CY} stroke="#d9dce1" strokeWidth={1} />
              {/* 10/20 deg equal-area grid rings for eyeballing plunge, decorative only (not a full net) */}
              {[30, 60].map((plungeRing) => {
                const rr = (projection === "equalAngle" ? Math.tan((Math.PI / 4) - (plungeRing * Math.PI / 180) / 2) : Math.SQRT2 * Math.sin((Math.PI / 4) - (plungeRing * Math.PI / 180) / 2)) * R;
                return <circle key={plungeRing} cx={CX} cy={CY} r={rr} fill="none" stroke="#e7e9ec" strokeWidth={1} />;
              })}
              <text x={CX} y={CY - R - 6} textAnchor="middle" fontSize={11} fill="#55606e">N</text>
              <text x={CX} y={CY + R + 14} textAnchor="middle" fontSize={11} fill="#55606e">S</text>
              <text x={CX + R + 10} y={CY + 4} textAnchor="middle" fontSize={11} fill="#55606e">E</text>
              <text x={CX - R - 10} y={CY + 4} textAnchor="middle" fontSize={11} fill="#55606e">W</text>

              {showCircles && filtered.map((p, i) => {
                if (p.dip == null || p.azimuth == null || isNaN(p.dip) || isNaN(p.azimuth)) return null;
                const pts = greatCirclePoints(p.azimuth, p.dip, projection, 48).map(toSvg);
                const d = pts.map((pt, j) => `${j === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(" ");
                const color = colorForStructure(p.value);
                return <path key={`gc_${i}`} d={d} fill="none" stroke={color} strokeWidth={1} opacity={0.6} />;
              })}

              {showPoles && filtered.map((p, i) => {
                if (p.dip == null || p.azimuth == null || isNaN(p.dip) || isNaN(p.azimuth)) return null;
                const pt = toSvg(projectPole(p.azimuth, p.dip, projection));
                const color = colorForStructure(p.value);
                return <circle key={`pole_${i}`} cx={pt.x} cy={pt.y} r={3.2} fill={color} stroke="#1a2028" strokeWidth={0.5} opacity={0.9}>
                  <title>{`${p.value || "(unlabeled)"} — dip ${p.dip}° / dipdir ${p.azimuth}°${p.hole_id ? ` (${p.hole_id} @ ${p.depth}m)` : ""}`}</title>
                </circle>;
              })}

              {/* TASKS.csv #236 — mean orientation overlay. Drawn LAST so it sits on top of the pole
                  population it summarizes. The mean plane's own great circle is drawn alongside the
                  mean pole because a geologist reads the plane, not the pole, when deciding whether a
                  trend is right — showing only the pole would make them do that conversion by eye. */}
              {showMean && stats && (() => {
                const mp = toSvg(projectPole(stats.meanDipDir, stats.meanDip, projection));
                const gc = greatCirclePoints(stats.meanDipDir, stats.meanDip, projection, 64).map(toSvg);
                const gcd = gc.map((pt, j) => `${j === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(" ");
                return (
                  <g>
                    <path d={gcd} fill="none" stroke="#c0392b" strokeWidth={2} strokeDasharray="5 3" opacity={0.95}>
                      <title>{`Mean plane — dip ${stats.meanDip.toFixed(1)}° / dipdir ${stats.meanDipDir.toFixed(1)}°`}</title>
                    </path>
                    <circle cx={mp.x} cy={mp.y} r={5.5} fill="#c0392b" stroke="#ffffff" strokeWidth={1.5}>
                      <title>{`Mean pole — trend ${stats.meanTrend.toFixed(1)}° / plunge ${stats.meanPlunge.toFixed(1)}°`}</title>
                    </circle>
                  </g>
                );
              })()}
            </svg>
          </div>

          <div style={{ width: 190, display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={rowLabel}>
              Projection
              <select value={projection} onChange={(e) => setProjection(e.target.value)} style={sel}>
                <option value="equalArea">Equal-area (Schmidt)</option>
                <option value="equalAngle">Equal-angle (Wulff)</option>
              </select>
            </label>
            <label style={rowLabel}>
              Structure type
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={sel}>
                <option value="all">All types</option>
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label style={{ ...rowLabel, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={showPoles} onChange={(e) => setShowPoles(e.target.checked)} /> Poles
            </label>
            <label style={{ ...rowLabel, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={showCircles} onChange={(e) => setShowCircles(e.target.checked)} /> Great circles
            </label>
            <label style={{ ...rowLabel, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={showMean} onChange={(e) => setShowMean(e.target.checked)} /> Mean orientation
            </label>

            {/* TASKS.csv #236 — mean vector / Fisher statistics readout. This was the Stereonet's own
                original justification (#141/#178): letting a geologist check numerically, not just by
                eye, whether a trend is representative before feeding it to the anisotropy/structural
                tools. See stereonet.js's fisherStats for why this uses the orientation-tensor
                (eigenvector) method rather than naive vector averaging. */}
            {stats ? (
              <div style={{ background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, padding: "7px 8px", fontSize: 10.5, color: "#1a2028", lineHeight: 1.55 }}>
                <div style={{ fontWeight: 600, marginBottom: 3, color: "#c0392b" }}>Mean orientation (n={stats.n})</div>
                <div>Plane: <b>{stats.meanDip.toFixed(1)}° / {stats.meanDipDir.toFixed(1)}°</b> <span style={{ color: "#94a1b0" }}>(dip/dipdir)</span></div>
                <div>Pole: {stats.meanPlunge.toFixed(1)}° → {stats.meanTrend.toFixed(1)}° <span style={{ color: "#94a1b0" }}>(plunge/trend)</span></div>
                <div style={{ marginTop: 4, borderTop: "1px solid #e3e6ea", paddingTop: 4 }}>
                  <div title="Fisher concentration parameter — higher means a tighter cluster. Rule of thumb: >100 very tight, 20-100 well defined, <10 poorly defined.">k = {stats.k === Infinity ? "∞" : stats.k.toFixed(1)}</div>
                  <div title="95% confidence cone half-angle about the mean direction. Smaller is better — this is the real 'how well do I know this trend' number.">α95 = {stats.alpha95.toFixed(1)}°</div>
                  <div title="Normalized eigenvalues of the orientation tensor. S1 near 1 = tight point cluster (one dominant orientation). S1≈S2 >> S3 = girdle (picks spread along a great circle, typical of a folded surface). All three near 0.33 = no preferred orientation.">S = {stats.s1.toFixed(2)} / {stats.s2.toFixed(2)} / {stats.s3.toFixed(2)}</div>
                </div>
                <div style={{ marginTop: 4, color: "#55606e" }}>
                  {stats.s1 > 0.65 ? "Tight cluster — a single dominant orientation."
                    : stats.s1 - stats.s2 < 0.12 && stats.s3 < 0.2 ? "Girdle — picks spread along a great circle (possible fold); a single mean plane may not be meaningful."
                    : stats.s1 < 0.45 ? "Weak / no preferred orientation — treat this mean with caution."
                    : "Moderate clustering."}
                </div>
                {onUseAsTrend && (
                  <button
                    onClick={() => onUseAsTrend({ azimuth: stats.meanDipDir, dip: stats.meanDip })}
                    style={{ ...exportBtn, width: "100%", marginTop: 7, padding: "5px 8px", fontSize: 10.5, borderColor: "#a9c6e0", color: "#2f6fe0" }}
                    title="Copy this mean plane into the Modeling tab's anisotropy trend fields"
                  >Use as anisotropy trend</button>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 10, color: "#94a1b0", lineHeight: 1.4 }}>
                Mean orientation needs at least 2 picks with a valid dip and dip direction.
              </div>
            )}

            <div style={{ fontSize: 10, color: "#94a1b0", lineHeight: 1.4, marginTop: 4 }}>
              Lower-hemisphere. Each point is a plane's pole (perpendicular to the plane) — clustering shows a
              consistent trend; scatter flags noisy/unreliable picks before feeding them into the anisotropy
              or structural-surface tools.
            </div>
            <button onClick={exportSvg} style={{ ...exportBtn, marginTop: "auto" }}><Download size={12} /> Export SVG</button>
          </div>
        </div>

        {types.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {types.map((t) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#55606e" }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: colorForStructure(t) }} />
                {t}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(20,24,30,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" };
const panel = { width: 660, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, padding: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.3)" };
const rowLabel = { fontSize: 10.5, color: "#55606e", display: "flex", flexDirection: "column", gap: 3 };
const sel = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "5px 6px", color: "#1a2028", fontSize: 11 };
const exportBtn = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 10px", borderRadius: 6, border: "1px solid #c7ccd3", background: "transparent", color: "#55606e", fontSize: 11.5, cursor: "pointer" };
