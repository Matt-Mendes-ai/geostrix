import React, { useMemo, useState } from "react";
import { X, Download } from "lucide-react";
import { projectPole, greatCirclePoints } from "../lib/stereonet.js";
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
export default function StereonetModal({ picks, onClose }) {
  useEscapeKey(onClose); // TASKS.csv #238
  const [projection, setProjection] = useState("equalArea");
  const [showPoles, setShowPoles] = useState(true);
  const [showCircles, setShowCircles] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");

  const types = useMemo(() => {
    const set = new Set();
    picks.forEach((p) => set.add(String(p.value || "").trim() || "(unlabeled)"));
    return Array.from(set).sort();
  }, [picks]);

  const filtered = useMemo(() => {
    if (typeFilter === "all") return picks;
    return picks.filter((p) => (String(p.value || "").trim() || "(unlabeled)") === typeFilter);
  }, [picks, typeFilter]);

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
