import React, { useMemo, useRef } from "react";
import { DIAGRAMS, SPIDER_DIAGRAMS, reeProfile } from "../lib/geochem.js";
import { minMax } from "../lib/layers.js";

const W = 620, H = 560, PAD = 60;

export default function GeochemPlot({ diagramId, samples, elementUnits, colorBy, svgRef }) {
  const diagram = DIAGRAMS[diagramId] || SPIDER_DIAGRAMS[diagramId];
  const localRef = useRef(null);
  const ref = svgRef || localRef;

  const projected = useMemo(() => {
    if (!diagram || diagram.spider) return [];
    return samples.map((s) => {
      const p = diagram.project(s, elementUnits);
      if (!p) return null;
      return { ...p, sample: s };
    }).filter(Boolean);
  }, [diagram, samples, elementUnits]);

  if (!diagram) return null;

  if (diagram.spider) return <SpiderPlot diagram={diagram} samples={samples} elementUnits={elementUnits} colorBy={colorBy} svgRef={ref} />;
  if (diagram.ternary) return <TernaryPlot diagram={diagram} projected={projected} colorBy={colorBy} svgRef={ref} />;
  return <BinaryPlot diagram={diagram} projected={projected} colorBy={colorBy} svgRef={ref} />;
}

// ---------- binary (x-y, optional log) ----------
function BinaryPlot({ diagram, projected, colorBy, svgRef }) {
  let [xmin, xmax] = diagram.xRange || [0, 1];
  let [ymin, ymax] = diagram.yRange || [0, 1];
  if (diagram.dynamicRange && projected.length) {
    // PER/mass-balance style diagrams have no universal natural axis scale (it depends on the rock
    // suite's absolute element concentrations), so fixed ranges like TAS's would either clip real
    // data or leave the plot mostly empty. Fit to the data instead, anchored at 0 since these
    // diagrams read trends relative to the origin (the precursor line).
    const xs = projected.map((p) => p.x), ys = projected.map((p) => p.y);
    const xr = minMax(xs), yr = minMax(ys); // not Math.min/max(...) — see layers.js's minMax comment
    const xlo = xr.min, xhi = xr.max, ylo = yr.min, yhi = yr.max;
    const xpad = (xhi - xlo) * 0.12 || xhi * 0.1 || 0.05;
    const ypad = (yhi - ylo) * 0.12 || yhi * 0.1 || 0.05;
    xmin = Math.min(0, xlo - xpad); xmax = xhi + xpad;
    ymin = Math.min(0, ylo - ypad); ymax = yhi + ypad;
  }
  const lx = diagram.logX, ly = diagram.logY;

  const sx = (x) => {
    if (lx) return PAD + ((Math.log10(x) - Math.log10(xmin)) / (Math.log10(xmax) - Math.log10(xmin))) * (W - 2 * PAD);
    return PAD + ((x - xmin) / (xmax - xmin)) * (W - 2 * PAD);
  };
  const sy = (y) => {
    if (ly) return H - PAD - ((Math.log10(y) - Math.log10(ymin)) / (Math.log10(ymax) - Math.log10(ymin))) * (H - 2 * PAD);
    return H - PAD - ((y - ymin) / (ymax - ymin)) * (H - 2 * PAD);
  };

  const xticks = lx ? logTicks(xmin, xmax) : linTicks(xmin, xmax, 6);
  const yticks = ly ? logTicks(ymin, ymax) : linTicks(ymin, ymax, 6);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ background: "var(--color-bg)", borderRadius: 8, maxHeight: "72vh" }}>
      <rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} fill="#ffffff" stroke="#d9dce1" />

      {/* reference fields */}
      {diagram.fields && diagram.fields.map((f, i) => (
        <g key={i}>
          {f.pts && <polygon points={f.pts.map(([x, y]) => `${sx(x)},${sy(y)}`).join(" ")} fill="none" stroke="#2a3444" strokeWidth="1" />}
          {f.box && (
            <polygon points={[[f.box[0][0], f.box[0][1]], [f.box[1][0], f.box[0][1]], [f.box[1][0], f.box[1][1]], [f.box[0][0], f.box[1][1]]].map(([x, y]) => `${sx(x)},${sy(y)}`).join(" ")} fill="none" stroke="#2a3444" strokeWidth="1" />
          )}
          {f.pts && <text x={sx(centroid(f.pts)[0])} y={sy(centroid(f.pts)[1])} fill="#4a5568" fontSize="9" textAnchor="middle">{f.name}</text>}
        </g>
      ))}

      {/* boxplot alteration trend guides */}
      {diagram.boxplotOverlay && <BoxplotGuides sx={sx} sy={sy} />}

      {/* PER-style trend line: OLS-through-origin fit of the currently plotted points, as a rough
          stand-in for a true "precursor line" (which properly needs a known unaltered rock suite —
          not something GeoStrix has a database of, so this fits the data itself and the caption
          says so explicitly rather than implying it's a petrologically-calibrated precursor). */}
      {diagram.trendLine && projected.length >= 2 && (() => {
        const sxy = projected.reduce((s, p) => s + p.x * p.y, 0);
        const sxx = projected.reduce((s, p) => s + p.x * p.x, 0);
        if (sxx === 0) return null;
        const slope = sxy / sxx;
        const x2 = xmax;
        return (
          <g>
            <line x1={sx(0)} y1={sy(0)} x2={sx(x2)} y2={sy(Math.min(ymax, slope * x2))} stroke="#c07a4a" strokeWidth="1.5" strokeDasharray="5 3" />
            <text x={sx(x2 * 0.55)} y={sy(Math.min(ymax, slope * x2 * 0.55)) - 6} fill="#c07a4a" fontSize="9" textAnchor="middle">trend (this dataset), slope {slope.toFixed(2)}</text>
          </g>
        );
      })()}

      {/* ticks + grid */}
      {xticks.map((t, i) => (
        <g key={`x${i}`}>
          <line x1={sx(t)} y1={PAD} x2={sx(t)} y2={H - PAD} stroke="#eceef1" strokeWidth="0.5" />
          <text x={sx(t)} y={H - PAD + 16} fill="#94a1b0" fontSize="9.5" textAnchor="middle">{fmtTick(t)}</text>
        </g>
      ))}
      {yticks.map((t, i) => (
        <g key={`y${i}`}>
          <line x1={PAD} y1={sy(t)} x2={W - PAD} y2={sy(t)} stroke="#eceef1" strokeWidth="0.5" />
          <text x={PAD - 8} y={sy(t) + 3} fill="#94a1b0" fontSize="9.5" textAnchor="end">{fmtTick(t)}</text>
        </g>
      ))}

      {/* points */}
      {projected.map((p, i) => {
        if (p.x < xmin || p.x > xmax || p.y < ymin || p.y > ymax) return null;
        return <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="3" fill={colorBy(p.sample)} fillOpacity="0.75" stroke="#ffffff" strokeWidth="0.5" />;
      })}

      {/* axis labels */}
      <text x={W / 2} y={H - 12} fill="#55606e" fontSize="11" textAnchor="middle">{diagram.xLabel}</text>
      <text x={16} y={H / 2} fill="#55606e" fontSize="11" textAnchor="middle" transform={`rotate(-90 16 ${H / 2})`}>{diagram.yLabel}</text>
    </svg>
  );
}

function BoxplotGuides({ sx, sy }) {
  // least-altered box (~ AI 20-60, CCPI 20-60) and alteration vectors
  const box = [[20, 20], [60, 20], [60, 60], [20, 60]];
  return (
    <g>
      <polygon points={box.map(([x, y]) => `${sx(x)},${sy(y)}`).join(" ")} fill="#eaf1fa" fillOpacity="0.5" stroke="#3a5068" strokeDasharray="3 2" />
      <text x={sx(40)} y={sy(40)} fill="#5a7290" fontSize="9" textAnchor="middle">least-altered box</text>
      {/* corner labels */}
      <text x={sx(8)} y={sy(92)} fill="#8290a0" fontSize="9">sericite / K-feldspar</text>
      <text x={sx(70)} y={sy(92)} fill="#8290a0" fontSize="9">chlorite-pyrite</text>
      <text x={sx(70)} y={sy(8)} fill="#8290a0" fontSize="9">epidote-calcite</text>
      <text x={sx(4)} y={sy(8)} fill="#8290a0" fontSize="9">albite</text>
    </g>
  );
}

// ---------- ternary ----------
function TernaryPlot({ diagram, projected, colorBy, svgRef }) {
  // triangle corners in svg space
  const cx = W / 2, top = PAD, bottom = H - PAD, half = (W - 2 * PAD) / 2;
  const A = [cx, top], Fp = [cx - half, bottom], M = [cx + half, bottom];
  const tx = (p) => Fp[0] + p.x * (M[0] - Fp[0]);
  const ty = (p) => bottom - (p.y / (Math.sqrt(3) / 2)) * (bottom - top);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ background: "var(--color-bg)", borderRadius: 8, maxHeight: "72vh" }}>
      <polygon points={`${A[0]},${A[1]} ${Fp[0]},${Fp[1]} ${M[0]},${M[1]}`} fill="#ffffff" stroke="#d9dce1" strokeWidth="1.5" />
      {/* gridlines every 20% */}
      {[0.2, 0.4, 0.6, 0.8].map((f, i) => {
        const a1 = lerp(A, Fp, f), a2 = lerp(A, M, f);
        const b1 = lerp(Fp, A, f), b2 = lerp(Fp, M, f);
        const c1 = lerp(M, A, f), c2 = lerp(M, Fp, f);
        return (
          <g key={i} stroke="#eceef1" strokeWidth="0.5">
            <line x1={a1[0]} y1={a1[1]} x2={a2[0]} y2={a2[1]} />
            <line x1={b1[0]} y1={b1[1]} x2={b2[0]} y2={b2[1]} />
            <line x1={c1[0]} y1={c1[1]} x2={c2[0]} y2={c2[1]} />
          </g>
        );
      })}

      {/* tholeiitic/calc-alkaline divider */}
      {diagram.dividers && (
        <polyline points={diagram.dividers.map((p) => `${tx(p)},${ty(p)}`).join(" ")} fill="none" stroke="#c07a4a" strokeWidth="1.5" strokeDasharray="4 3" />
      )}

      {/* points */}
      {projected.map((p, i) => (
        <circle key={i} cx={tx(p)} cy={ty(p)} r="3" fill={colorBy(p.sample)} fillOpacity="0.75" stroke="#ffffff" strokeWidth="0.5" />
      ))}

      {/* corner labels */}
      <text x={A[0]} y={A[1] - 10} fill="#55606e" fontSize="11" textAnchor="middle">{diagram.corners[0]}</text>
      <text x={Fp[0] - 6} y={Fp[1] + 18} fill="#55606e" fontSize="11" textAnchor="middle">{diagram.corners[1]}</text>
      <text x={M[0] + 6} y={M[1] + 18} fill="#55606e" fontSize="11" textAnchor="middle">{diagram.corners[2]}</text>
      {diagram.dividers && <text x={cx} y={bottom - 30} fill="#c07a4a" fontSize="9" textAnchor="middle">calc-alkaline ↑ / tholeiitic ↓</text>}
    </svg>
  );
}

// ---------- spider / multi-element (each sample is a line, not a point) ----------
// Rendering (not sample count) is what needs a cap here — a few hundred <polyline>s each with a
// dozen vertices is still fine, but plotting thousands of overlapping intervals just turns into an
// opaque smear with no readable pattern, so this caps at the most recently-imported MAX_LINES and
// tells the user how many were left out rather than silently dropping the rest.
const MAX_LINES = 250;
function SpiderPlot({ diagram, samples, elementUnits, colorBy, svgRef }) {
  const order = diagram.order, norm = diagram.norm;
  const n = order.length;
  const innerW = W - 2 * PAD, innerH = H - 2 * PAD;
  const sx = (i) => PAD + (i / (n - 1)) * innerW;

  const lines = useMemo(() => {
    return samples.map((s) => ({ sample: s, profile: reeProfile(s, elementUnits, order, norm) }))
      .filter((l) => l.profile.some((p) => p.value != null));
  }, [samples, elementUnits, order, norm]);
  const shown = lines.length > MAX_LINES ? lines.slice(-MAX_LINES) : lines;
  const hiddenCount = lines.length - shown.length;

  const allVals = shown.flatMap((l) => l.profile.map((p) => p.value).filter((v) => v != null));
  const ymin = allVals.length ? Math.pow(10, Math.floor(Math.log10(Math.min(...allVals, 0.9)))) : 0.1;
  const ymax = allVals.length ? Math.pow(10, Math.ceil(Math.log10(Math.max(...allVals, 1.1)))) : 100;
  const sy = (v) => H - PAD - ((Math.log10(v) - Math.log10(ymin)) / (Math.log10(ymax) - Math.log10(ymin))) * innerH;
  const yticks = logTicks(ymin, ymax);

  const pathFor = (profile) => {
    let d = "";
    profile.forEach((p, i) => {
      if (p.value == null) return; // gap: lift the pen, don't interpolate across missing elements
      d += `${d ? "L" : "M"}${sx(i)},${sy(p.value)} `;
    });
    return d.trim();
  };

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ background: "var(--color-bg)", borderRadius: 8, maxHeight: "72vh" }}>
      <rect x={PAD} y={PAD} width={innerW} height={innerH} fill="#ffffff" stroke="#d9dce1" />

      {yticks.map((t, i) => (
        <g key={`y${i}`}>
          <line x1={PAD} y1={sy(t)} x2={W - PAD} y2={sy(t)} stroke="#eceef1" strokeWidth="0.5" />
          <text x={PAD - 8} y={sy(t) + 3} fill="#94a1b0" fontSize="9.5" textAnchor="end">{fmtTick(t)}</text>
        </g>
      ))}
      {/* normalized value of 1 = same as the reference (chondrite/primitive mantle) */}
      {ymin <= 1 && ymax >= 1 && <line x1={PAD} y1={sy(1)} x2={W - PAD} y2={sy(1)} stroke="#eef1f4" strokeWidth="1" strokeDasharray="3 2" />}

      {order.map((sym, i) => (
        <g key={sym}>
          <line x1={sx(i)} y1={PAD} x2={sx(i)} y2={H - PAD} stroke="#eceef1" strokeWidth="0.5" />
          <text x={sx(i)} y={H - PAD + 16} fill="#94a1b0" fontSize="9.5" textAnchor="middle">{sym}</text>
        </g>
      ))}

      {shown.map((l, i) => (
        <path key={i} d={pathFor(l.profile)} fill="none" stroke={colorBy(l.sample)} strokeWidth="1" strokeOpacity="0.55" />
      ))}

      <text x={W / 2} y={H - 12} fill="#55606e" fontSize="11" textAnchor="middle">Element (chondrite/primitive-mantle order)</text>
      <text x={16} y={H / 2} fill="#55606e" fontSize="11" textAnchor="middle" transform={`rotate(-90 16 ${H / 2})`}>Sample / normalizing value</text>
      {hiddenCount > 0 && (
        <text x={W - PAD} y={PAD - 10} fill="#8a6a3a" fontSize="9.5" textAnchor="end">+{hiddenCount} more samples not drawn (showing most recent {MAX_LINES})</text>
      )}
    </svg>
  );
}

// ---------- helpers ----------
function linTicks(min, max, n) { const step = (max - min) / n; return Array.from({ length: n + 1 }, (_, i) => min + i * step); }
function logTicks(min, max) {
  const ticks = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) ticks.push(Math.pow(10, e));
  return ticks.filter((t) => t >= min && t <= max);
}
// TASKS.csv #234 (independently found by two specialist-review agents, live-confirmed: real axis
// ticks rendering as "0e+0" and "16.666666666666668") — two bugs. (1) `t < 0.001` treated an exact 0
// tick as "very small, needs exponential notation" (0 < 0.001 is true), so 0.toExponential(0) rendered
// literally as "0e+0" instead of "0" — now checked first, as its own case. (2) the fallback branch for
// a non-integer tick just called the raw toString() and stripped trailing zeros, which does nothing
// for a float with no exact trailing zeros (e.g. a /6-divided axis range like 100/6 = 16.666666666666668)
// — now rounded to 4 significant figures via toPrecision before stripping.
function fmtTick(t) {
  if (t === 0) return "0";
  const abs = Math.abs(t);
  if (abs >= 1000 || abs < 0.001) return t.toExponential(0);
  if (Number.isInteger(t)) return String(t);
  return t.toPrecision(4).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
function centroid(pts) { const x = pts.reduce((s, p) => s + p[0], 0) / pts.length, y = pts.reduce((s, p) => s + p[1], 0) / pts.length; return [x, y]; }
function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
