import React, { useMemo, useState } from "react";
import { X, Download, Info } from "lucide-react";
import Papa from "papaparse";
import { voronoiTessellation, paddedBounds, declusteredStats } from "../lib/geoprocessing.js";
import { minMax } from "../lib/layers.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { overlay } from "../lib/modalStyles.js";

// TASKS.csv #51 — Voronoi tessellation + polygonal declustering panel. Opened from GeophysicsModule
// over whatever geophys_pts point cloud is currently loaded (needs x/y/value, which is exactly that
// layer's shape already — see normGeophysRow there). Kept as its own modal component (same pattern as
// IsoconTool/CorrelationMatrix) rather than inlined in GeophysicsModule, which was already a long file
// before this.
const SVG_W = 560, SVG_H = 460, PAD = 16;

// Simple blue -> yellow -> red ramp, local to this component (CorrelationMatrix and raster.js each
// keep their own small ramp rather than sharing one — the three have different domains: diverging
// -1..1 correlation, elevation/geophysics grids, and here a plain low..high value range).
function rampColor(t) {
  t = Math.max(0, Math.min(1, t));
  if (t < 0.5) {
    const k = t / 0.5;
    return `rgb(${Math.round(40 + k * 180)}, ${Math.round(70 + k * 150)}, ${Math.round(200 - k * 40)})`;
  }
  const k = (t - 0.5) / 0.5;
  return `rgb(${Math.round(220)}, ${Math.round(220 - k * 170)}, ${Math.round(160 - k * 150)})`;
}

export default function SpatialAnalysis({ points, onClose }) {
  useEscapeKey(onClose); // TASKS.csv #238
  const [hoverIdx, setHoverIdx] = useState(null);

  const valid = useMemo(
    () => points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.value)),
    [points]
  );

  const bounds = useMemo(() => (valid.length ? paddedBounds(valid) : null), [valid]);
  const { cells } = useMemo(() => (bounds ? voronoiTessellation(valid, bounds) : { cells: [] }), [valid, bounds]);
  const stats = useMemo(() => (bounds ? declusteredStats(valid, bounds) : null), [valid, bounds]);

  const vals = valid.map((p) => p.value);
  // Not Math.min(...vals)/Math.max(...vals) — a real geophysics survey point cloud can exceed the JS
  // engine's argument-spread limit (see layers.js's minMax comment, and voxel.js's cellValueRange for
  // the real crash this pattern caused elsewhere in the app).
  const vr = vals.length ? minMax(vals) : { min: 0, max: 1 };
  const vmin = vr.min, vmax = vr.max;
  const vrange = vmax - vmin || 1;

  const sx = (x) => bounds ? PAD + ((x - bounds.xmin) / (bounds.xmax - bounds.xmin)) * (SVG_W - 2 * PAD) : 0;
  // World y grows north; SVG y grows down — flip.
  const sy = (y) => bounds ? PAD + (1 - (y - bounds.ymin) / (bounds.ymax - bounds.ymin)) * (SVG_H - 2 * PAD) : 0;

  const exportCSV = () => {
    if (!stats) return;
    const rows = stats.cells.map((c) => ({
      x: c.point.x, y: c.point.y, z: c.point.z ?? "", value: c.point.value, label: c.point.label ?? "",
      voronoi_area: c.area.toFixed(3), decluster_weight: c.weight.toFixed(6),
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "voronoi_decluster.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ color: "#1a2028", fontSize: 13, fontWeight: 600 }}>Spatial analysis — Voronoi / declustering</div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onClose} />
        </div>

        {valid.length < 3 ? (
          <div style={{ padding: 20, fontSize: 12.5, color: "#55606e" }}>
            Need at least 3 points with valid x, y, and value to build a tessellation — currently {valid.length}.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 14, padding: 14, overflow: "auto" }}>
            <div>
              <svg width={SVG_W} height={SVG_H} style={{ background: "#ffffff", borderRadius: 6, border: "1px solid #d9dce1" }}>
                {cells.map((c, i) =>
                  c.polygon ? (
                    <polygon
                      key={i}
                      points={c.polygon.map(([x, y]) => `${sx(x)},${sy(y)}`).join(" ")}
                      fill={rampColor((c.point.value - vmin) / vrange)}
                      fillOpacity={hoverIdx === null || hoverIdx === i ? 0.75 : 0.25}
                      stroke="#ffffff"
                      strokeWidth={1}
                      onMouseEnter={() => setHoverIdx(i)}
                      onMouseLeave={() => setHoverIdx(null)}
                    />
                  ) : null
                )}
                {valid.map((p, i) => (
                  <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={hoverIdx === i ? 3.5 : 2} fill="#ffffff" stroke="#1a2028" strokeWidth={0.75} />
                ))}
              </svg>
              {hoverIdx !== null && cells[hoverIdx] && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#7b8794" }}>
                  {cells[hoverIdx].point.label ? `${cells[hoverIdx].point.label} — ` : ""}
                  value {cells[hoverIdx].point.value.toLocaleString()}, cell area {cells[hoverIdx].area.toFixed(1)} units²,
                  decluster weight {(stats.cells[hoverIdx]?.weight * 100).toFixed(2)}%
                </div>
              )}
            </div>

            <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, color: "#55606e", lineHeight: 1.6, display: "flex", gap: 6 }}>
                <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  Each point's Voronoi cell area is used as a declustering weight (Isaaks &amp; Srivastava
                  polygonal method) — clustered points get small cells/low weight, isolated points get
                  large cells/high weight, correcting a naive mean's bias toward over-sampled areas.
                </span>
              </div>

              <StatRow label="Points" value={stats.n} />
              <StatRow label="Naive mean" value={stats.naiveMean?.toLocaleString(undefined, { maximumFractionDigits: 3 })} />
              <StatRow label="Declustered mean" value={stats.declusteredMean?.toLocaleString(undefined, { maximumFractionDigits: 3 })} highlight />
              {stats.declusteredStd !== null && <StatRow label="Declustered std dev" value={stats.declusteredStd.toLocaleString(undefined, { maximumFractionDigits: 3 })} />}
              <StatRow label="Total tessellated area" value={stats.totalArea.toLocaleString(undefined, { maximumFractionDigits: 0 })} />

              <button onClick={exportCSV} style={btn}>
                <Download size={13} /> Export cells (CSV)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value, highlight }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: highlight ? "#eaf1fa" : "#f4f5f7", border: `1px solid ${highlight ? "#a9c6e0" : "#d9dce1"}`, borderRadius: 5, fontSize: 11.5 }}>
      <span style={{ color: "#55606e" }}>{label}</span>
      <span style={{ color: highlight ? "#e2a63c" : "#1a2028", fontWeight: highlight ? 600 : 400 }}>{value ?? "—"}</span>
    </div>
  );
}

const panel = { width: "min(880px, 94vw)", maxHeight: "88vh", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #d9dce1" };
const btn = { display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", padding: "8px 10px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, color: "#1a2028", fontSize: 12, cursor: "pointer" };
