import React, { useMemo, useState } from "react";
import { X, Download } from "lucide-react";
import { projectPole, projectLowerHemisphere, greatCirclePoints, fisherStats, kambContourGrid, roseDiagramBins, DEFAULT_TERZAGHI_MAX_WEIGHT } from "../lib/stereonet.js";
import { colorForStructure, PALETTES } from "../lib/layers.js";
import { saveFile } from "../lib/desktop.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";

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
// Originally shipped WITHOUT density contouring (a first-pass pole/great-circle plot already answered
// the audit finding's core complaint). The Kamb contouring follow-up flagged in that first pass is now
// in (TASKS.csv #141 follow-up, "Density contours" checkbox below) — see kambContourGrid in
// stereonet.js for the method and the CONTOUR_LEVELS comment below for what the colours mean.
// TASKS.csv #278 — a rose diagram (circular frequency histogram of strike/dip-direction) is the
// stereonet's standard companion, and is added here as a second VIEW of the same population rather
// than a separate modal: every control on the right (structure type, spatial domain, Terzaghi) and
// every statistic applies identically to both, so splitting them into two windows would just mean
// setting the same filters twice and comparing across windows by memory.
// TASKS.csv #281 — `domains`/`domainFilter` add a SPATIAL filter alongside the existing type filter.
// Both are optional props: the modal still works standalone with picks alone (domainFilter absent =
// the domain control simply isn't offered), so nothing here depends on the caller having a scene.
export default function StereonetModal({ picks, onClose, onUseAsTrend, domains = [], domainFilter = null }) {
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const [view, setView] = useState("stereonet"); // TASKS.csv #278 — "stereonet" | "rose"
  const [projection, setProjection] = useState("equalArea");
  const [showPoles, setShowPoles] = useState(true);
  const [showCircles, setShowCircles] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [domainId, setDomainId] = useState(""); // TASKS.csv #281 — "" = whole property
  const [showMean, setShowMean] = useState(true); // TASKS.csv #236
  const [showContours, setShowContours] = useState(false); // TASKS.csv #141 follow-up (Kamb density)
  const [terzaghiOn, setTerzaghiOn] = useState(false); // TASKS.csv #280
  const [roseMode, setRoseMode] = useState("strike"); // TASKS.csv #278
  const [roseBin, setRoseBin] = useState(10); // TASKS.csv #278

  const types = useMemo(() => {
    const set = new Set();
    picks.forEach((p) => set.add(String(p.value || "").trim() || "(unlabeled)"));
    return Array.from(set).sort();
  }, [picks]);

  // TASKS.csv #281 (structural-geology specialist review): the stereonet filtered by structure TYPE but
  // never by spatial DOMAIN, so on a property with two genuinely different structural domains (two fault
  // blocks with different fabric trends, say) the mean/Fisher/Kamb outputs silently averaged populations
  // that should never have been combined — and the result looked perfectly respectable, which is what
  // made it dangerous. This reuses the EXACT domain machinery the GemPy orientation feed already uses
  // (ViewerModule's filterRowsByDomain, TASKS.csv #89/#231) via the injected `domainFilter` callback,
  // rather than inventing a second, subtly-different definition of "inside a domain" for structural QC.
  // Applied BEFORE the type filter so the count readouts below describe the same subset the plot draws.
  const domainScoped = useMemo(() => {
    if (!domainId || !domainFilter) return picks;
    return domainFilter(picks, domainId);
  }, [picks, domainId, domainFilter]);

  const filtered = useMemo(() => {
    if (typeFilter === "all") return domainScoped;
    return domainScoped.filter((p) => (String(p.value || "").trim() || "(unlabeled)") === typeFilter);
  }, [domainScoped, typeFilter]);

  // TASKS.csv #280 — Terzaghi option object, shared by every statistic below so the stereonet, the
  // contours, the rose and the numeric readout can never disagree about which correction is in force.
  // A pick can only be weighted if it carries its hole's attitude at its own depth (holeAz/holeDip,
  // supplied by the caller) — offering the control at all is therefore gated on the data supporting it.
  const canTerzaghi = useMemo(() => picks.some((p) => p.holeAz != null && p.holeDip != null && !isNaN(p.holeAz) && !isNaN(p.holeDip)), [picks]);
  const terzaghi = useMemo(
    () => (terzaghiOn && canTerzaghi ? { enabled: true, maxWeight: DEFAULT_TERZAGHI_MAX_WEIGHT } : null),
    [terzaghiOn, canTerzaghi]
  );

  // TASKS.csv #236 — mean vector / Fisher statistics over whatever subset is currently filtered in,
  // so switching Structure type recomputes for just that population (which is the useful thing: the
  // mean of "all faults + all bedding together" is meaningless, the mean of one set is not).
  const stats = useMemo(() => fisherStats(filtered, { terzaghi }), [filtered, terzaghi]);

  // TASKS.csv #141 follow-up — Kamb density grid over the SAME filtered subset the poles/circles/mean
  // use, and in the SAME projection, so a contour band sits exactly under the poles that produced it.
  // Only computed while the checkbox is on (the grid is ~1.4M dot products for a 600-pick layer — a
  // few ms, but there's no reason to spend them when nothing's drawn).
  const contour = useMemo(
    () => (showContours && view === "stereonet" ? kambContourGrid(filtered, { gridSize: CONTOUR_GRID, projection, terzaghi }) : null),
    [filtered, projection, showContours, view, terzaghi]
  );

  // TASKS.csv #278 — rose bins, only computed while that view is showing.
  const rose = useMemo(
    () => (view === "rose" ? roseDiagramBins(filtered, { binSizeDeg: roseBin, mode: roseMode, terzaghi }) : null),
    [filtered, view, roseBin, roseMode, terzaghi]
  );

  // TASKS.csv #279 — the girdle ("possible fold") interpretation already fired below but stopped
  // there, even though fisherStats' eigendecomposition had already computed the fold axis. This is the
  // same shape test that drives that message, hoisted so both the readout and the plotted β symbol use
  // one definition of "this population is a girdle" and can never disagree about whether to show it.
  const isGirdle = !!stats && stats.s1 - stats.s2 < 0.12 && stats.s3 < 0.2;

  const SIZE = 420, PAD = 24, R = SIZE / 2 - PAD, CX = SIZE / 2, CY = SIZE / 2;
  const toSvg = (p) => ({ x: CX + p.x * R, y: CY - p.y * R }); // net y+ = north = up on screen, so flip for SVG's y-down

  const svgRef = React.useRef(null);
  const exportSvg = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const content = new XMLSerializer().serializeToString(svgEl);
    saveFile({ suggestedName: view === "rose" ? "rose-diagram.svg" : "stereonet.svg", filters: [{ name: "SVG", extensions: ["svg"] }], content, encoding: "text" });
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1a2028" }}>
            {view === "rose" ? "Rose diagram" : "Stereonet"} — structure picks ({filtered.length}/{picks.length})
            {domainId && domains.length > 0 && (
              <span style={{ fontWeight: 400, fontSize: 11, color: "#7d3c98", marginLeft: 6 }}>
                · domain: {(domains.find((d) => d.id === domainId) || {}).name || domainId}
              </span>
            )}
          </div>
          <X size={16} style={{ cursor: "pointer", color: "#55606e" }} onClick={onClose} />
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          <div>
            {view === "rose" ? (
              <RoseDiagram svgRef={svgRef} rose={rose} size={SIZE} pad={PAD} />
            ) : (
            <svg ref={svgRef} width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ background: "#fbfbfc", border: "1px solid #d9dce1", borderRadius: 8 }}>
              {/* TASKS.csv #141 follow-up — Kamb density contours, drawn FIRST so poles, great circles,
                  grid lines and the mean overlay all stay legible on top. Rendered as a filled grid of
                  small cells (one per kambContourGrid node) colour-banded at CONTOUR_LEVELS rather than
                  traced isolines: same information a geologist reads off a contoured net (where the
                  fabric concentrates, and how strongly), with none of the marching-squares edge cases
                  that make isoline tracing fragile at the primitive. Clipped to the net boundary so the
                  straddle cells kambContourGrid keeps along the edge don't paint outside the circle.
                  Cells below the first level (2σ — "no more crowded than random") are left unpainted,
                  which is the standard convention: contouring starts where the density becomes
                  meaningful, and the blank background IS the information for the rest of the net. */}
              {contour && (
                <>
                  <defs><clipPath id="stereonet-net-clip"><circle cx={CX} cy={CY} r={R} /></clipPath></defs>
                  <g clipPath="url(#stereonet-net-clip)" shapeRendering="crispEdges" opacity={0.78}>
                    {contour.values.map((v, idx) => {
                      if (v == null || v < CONTOUR_LEVELS[0]) return null;
                      const cellNet = 2 / contour.gridSize;
                      const i = idx % contour.gridSize, j = Math.floor(idx / contour.gridSize);
                      const c = toSvg({ x: -1 + (i + 0.5) * cellNet, y: -1 + (j + 0.5) * cellNet });
                      const px = cellNet * R;
                      return <rect key={`kc_${idx}`} x={c.x - px / 2} y={c.y - px / 2} width={px + 0.4} height={px + 0.4} fill={contourColor(v)} />;
                    })}
                  </g>
                </>
              )}
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

              {/* TASKS.csv #279 — fold (β) axis overlay, drawn only when the population is actually a
                  girdle. Two things are plotted, because a geologist reads them together: the best-fit
                  GIRDLE great circle (the π-circle the poles spread along) and the β axis itself (its
                  pole — the fold axis). Deliberately a different colour and a square marker so it can
                  never be confused with the round red mean pole: on a girdle population the "mean"
                  plane is close to meaningless, and the β axis is the number that actually matters. */}
              {showMean && stats && isGirdle && (() => {
                const gc = greatCirclePoints(stats.girdleDipDir, stats.girdleDip, projection, 64).map(toSvg);
                const gcd = gc.map((pt, j) => `${j === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(" ");
                const bp = toSvg(projectLowerHemisphere(stats.betaTrend, stats.betaPlunge, projection));
                return (
                  <g>
                    <path d={gcd} fill="none" stroke="#7d3c98" strokeWidth={1.8} opacity={0.9}>
                      <title>{`Best-fit girdle (π-circle) — dip ${stats.girdleDip.toFixed(1)}° / dipdir ${stats.girdleDipDir.toFixed(1)}°`}</title>
                    </path>
                    <rect x={bp.x - 5} y={bp.y - 5} width={10} height={10} fill="#7d3c98" stroke="#ffffff" strokeWidth={1.5} transform={`rotate(45 ${bp.x} ${bp.y})`}>
                      <title>{`Fold (β) axis — trend ${stats.betaTrend.toFixed(1)}° / plunge ${stats.betaPlunge.toFixed(1)}°`}</title>
                    </rect>
                  </g>
                );
              })()}
            </svg>
            )}
          </div>

          <div style={{ width: 190, display: "flex", flexDirection: "column", gap: 10 }}>
            {/* TASKS.csv #278 — plot selector. Both views read the same filtered population. */}
            <label style={rowLabel}>
              Plot
              <select value={view} onChange={(e) => setView(e.target.value)} style={sel}>
                <option value="stereonet">Stereonet (pole plot)</option>
                <option value="rose">Rose diagram</option>
              </select>
            </label>
            {view === "stereonet" && (
              <label style={rowLabel}>
                Projection
                <select value={projection} onChange={(e) => setProjection(e.target.value)} style={sel}>
                  <option value="equalArea">Equal-area (Schmidt)</option>
                  <option value="equalAngle">Equal-angle (Wulff)</option>
                </select>
              </label>
            )}
            {view === "rose" && (
              <>
                <label style={rowLabel} title="Strike is bidirectional (a plane striking 040 also strikes 220), so that rose is symmetric — the standard convention for planar fabrics. Dip direction genuinely has a sense (it points downhill), so that one is not mirrored.">
                  Rose measures
                  <select value={roseMode} onChange={(e) => setRoseMode(e.target.value)} style={sel}>
                    <option value="strike">Strike (bidirectional)</option>
                    <option value="dipdir">Dip direction (0-360°)</option>
                  </select>
                </label>
                <label style={rowLabel}>
                  Bin size
                  <select value={roseBin} onChange={(e) => setRoseBin(Number(e.target.value))} style={sel}>
                    {[5, 10, 15, 20, 30].map((b) => <option key={b} value={b}>{b}°</option>)}
                  </select>
                </label>
              </>
            )}
            <label style={rowLabel}>
              Structure type
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={sel}>
                <option value="all">All types</option>
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            {/* TASKS.csv #281 — spatial-domain filter. Only offered when the caller actually supplied
                domains and a filter (i.e. from the 3D viewer, where a domain has a meaning); the same
                domains the Modeling tab's tools use, so "Fault block A" means one thing app-wide. */}
            {domainFilter && domains.length > 0 && (
              <label style={rowLabel} title="Restrict this plot to structure picks whose downhole position falls inside one structural domain — the same domains the Modeling tab's tools use. Blending two genuinely different structural domains into one mean or contour is one of the easiest ways to produce a confident-looking but meaningless trend.">
                Structural domain
                <select value={domainId} onChange={(e) => setDomainId(e.target.value)} style={sel}>
                  <option value="">Whole property</option>
                  {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
            )}
            {view === "stereonet" && (
              <>
                <label style={{ ...rowLabel, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={showPoles} onChange={(e) => setShowPoles(e.target.checked)} /> Poles
                </label>
                <label style={{ ...rowLabel, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={showCircles} onChange={(e) => setShowCircles(e.target.checked)} /> Great circles
                </label>
                <label style={{ ...rowLabel, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={showMean} onChange={(e) => setShowMean(e.target.checked)} /> Mean orientation
                </label>
                <label style={{ ...rowLabel, flexDirection: "row", alignItems: "center", gap: 6 }} title="Kamb (1959) counting-circle density contours — shades the net by how much more crowded each spot is than a random (uniform) spread of the same number of poles would be">
                  <input type="checkbox" checked={showContours} onChange={(e) => setShowContours(e.target.checked)} /> Density contours
                </label>
              </>
            )}
            {/* TASKS.csv #280 — Terzaghi sampling-bias correction. Disabled (with an explanatory title)
                when no pick carries its hole's attitude, since the correction is undefined without it. */}
            <label
              style={{ ...rowLabel, flexDirection: "row", alignItems: "center", gap: 6, color: canTerzaghi ? "#55606e" : "#a8b0ba", cursor: canTerzaghi ? "pointer" : "default" }}
              title={canTerzaghi
                ? "Terzaghi (1965) correction. Every pick here comes from a drillhole, and a hole intersects structures at a rate proportional to sin(alpha) — so it under-samples anything near-parallel to it and over-samples anything near-perpendicular. This weights each pick by 1/sin(alpha) to undo that, which can genuinely change which orientation reads as dominant."
                : "Needs each pick's hole attitude at its own depth (collar + survey data for the holes these picks came from)."}
            >
              <input type="checkbox" checked={terzaghiOn && canTerzaghi} disabled={!canTerzaghi} onChange={(e) => setTerzaghiOn(e.target.checked)} /> Terzaghi correction
            </label>
            {terzaghi && stats && stats.terzaghi && stats.terzaghi.applied && (
              <div style={{ background: "#fdf6ec", border: "1px solid #e6d3b3", borderRadius: 6, padding: "6px 8px", fontSize: 9.8, color: "#6b4e20", lineHeight: 1.45 }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>Terzaghi-corrected</div>
                <div>{stats.terzaghi.weighted} of {stats.n} pick(s) weighted{stats.terzaghi.unweighted ? `; ${stats.terzaghi.unweighted} left at weight 1 (no hole attitude)` : ""}.</div>
                <div>Effective n = {stats.nEff.toFixed(1)} <span style={{ color: "#9a7c46" }}>(k/α95 use this, not the raw count)</span></div>
                {stats.terzaghi.cappedCount > 0 && (
                  <div style={{ marginTop: 2 }}>
                    {stats.terzaghi.cappedCount} pick(s) hit the ×{stats.terzaghi.maxWeight} weight cap. Anything within {stats.terzaghi.blindZoneDeg.toFixed(1)}° of parallel to its hole is in the blind zone — weighting cannot recover a set no hole ever crossed.
                  </div>
                )}
              </div>
            )}

            {/* TASKS.csv #141 follow-up — contour legend. Levels are in standard deviations (σ) above
                the density a UNIFORM/random spread of the same n poles would give — the Kamb convention
                every standard stereonet package uses, so the numbers here read the same as in Stereonet
                / OSXStereonet / Orient. A geologist unfamiliar with it just needs: higher = more tightly
                clustered than chance; 2σ is the conventional "worth drawing" threshold; a well-defined
                fabric typically peaks somewhere between ~4σ (broad) and 10σ+ (tight). */}
            {showContours && view === "stereonet" && (
              <div style={{ background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, padding: "6px 8px", fontSize: 10, color: "#1a2028", lineHeight: 1.5 }}>
                {contour ? (
                  <>
                    <div style={{ fontWeight: 600, marginBottom: 3 }}>Kamb density (σ above uniform)</div>
                    <div style={{ display: "flex", gap: 3, alignItems: "stretch", marginBottom: 3 }}>
                      {CONTOUR_LEVELS.map((lv, k) => (
                        <div key={lv} style={{ flex: 1, textAlign: "center" }} title={k === CONTOUR_LEVELS.length - 1 ? `≥ ${lv}σ` : `${lv} – ${CONTOUR_LEVELS[k + 1]}σ`}>
                          <div style={{ height: 8, background: CONTOUR_COLORS[k], opacity: 0.78, borderRadius: 2 }} />
                          <div style={{ fontSize: 8.5, color: "#55606e", marginTop: 1 }}>{k === CONTOUR_LEVELS.length - 1 ? `${lv}+` : lv}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ color: "#55606e" }}>
                      Peak <b style={{ color: "#1a2028" }}>{contour.maxSigma.toFixed(1)}σ</b> · counting circle {contour.countingAngleDeg.toFixed(1)}° (n={contour.n})
                    </div>
                    <div style={{ color: "#94a1b0", marginTop: 2 }}>
                      Unshaded = no denser than a random spread. Higher σ = a tighter, more significant cluster.
                    </div>
                    {/* TASKS.csv #276 — small-n reliability caveat. Kamb's σ is a ratio against the
                        density expected from a UNIFORM spread of the SAME n, so it happily reports a
                        strong-looking peak from a handful of picks: with n below ~15-20 a couple of
                        similar readings (or two picks off the same broken core run) is enough to paint
                        a confident 4σ+ bullseye that carries no real structural meaning. The contours
                        are still drawn — a geologist may well be looking at all the data that exists —
                        but the number of picks behind them has to be visible next to the peak σ, not
                        something the reader has to go and count. */}
                    {contour.n < 20 && (
                      <div style={{ marginTop: 4, padding: "5px 6px", background: "#fdf4e6", border: "1px solid #edd9b7", borderRadius: 4, color: "#7a4a1f", lineHeight: 1.45 }}>
                        <b>Low sample count (n={contour.n}).</b> Kamb σ is measured against a random spread of
                        this same n, so {contour.n < 10 ? "at this few picks" : "below about 15–20 picks"} even a
                        strong-looking peak can come from two or three similar readings and may not be
                        statistically meaningful. Treat the contours as indicative only until more picks exist.
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ color: "#94a1b0" }}>Density contours need at least 3 picks with a valid dip and dip direction.</div>
                )}
              </div>
            )}

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
                    : isGirdle ? "Girdle — picks spread along a great circle (possible fold); a single mean plane may not be meaningful."
                    : stats.s1 < 0.45 ? "Weak / no preferred orientation — treat this mean with caution."
                    : "Moderate clustering."}
                </div>
                {/* TASKS.csv #279 — the girdle message above used to be the end of the road: it told the
                    user they were probably looking at a fold and then offered nothing to act on, even
                    though fisherStats' eigendecomposition had already computed the fold axis. Surfaced
                    here whenever that interpretation fires, as a trend/plunge line (the number a
                    geologist takes into the field or into a section orientation) plus the best-fit
                    girdle plane it is the pole to. */}
                {isGirdle && (
                  <div style={{ marginTop: 5, borderTop: "1px solid #e3e6ea", paddingTop: 4 }}>
                    <div style={{ fontWeight: 600, color: "#7d3c98", marginBottom: 2 }}>Fold (β) axis</div>
                    <div title="The line the folding rotates about — the pole to the best-fit girdle. For a cylindrical fold this is the single most useful orientation to take away from this population; the mean plane above is not.">
                      <b>{stats.betaPlunge.toFixed(1)}° → {stats.betaTrend.toFixed(1)}°</b> <span style={{ color: "#94a1b0" }}>(plunge/trend)</span>
                    </div>
                    <div style={{ color: "#55606e" }} title="The great circle the poles spread along (the π-circle), given as a plane.">
                      Girdle plane: {stats.girdleDip.toFixed(1)}° / {stats.girdleDipDir.toFixed(1)}° <span style={{ color: "#94a1b0" }}>(dip/dipdir)</span>
                    </div>
                  </div>
                )}
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
              {view === "rose" ? (
                rose
                  ? <>Petal AREA is proportional to frequency (radius scales as √count), so a petal twice as long holds four times the picks. Longest petal = {rose.maxCount.toFixed(rose.maxCount % 1 ? 1 : 0)}{terzaghi ? " (weighted)" : ""}, n = {rose.n}.</>
                  : <>A rose diagram needs at least one pick with a valid dip and dip direction.</>
              ) : (
                <>Lower-hemisphere. Each point is a plane's pole (perpendicular to the plane) — clustering shows a
                consistent trend; scatter flags noisy/unreliable picks before feeding them into the anisotropy
                or structural-surface tools.</>
              )}
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

// TASKS.csv #278 — rose diagram renderer. Deliberately the same 420px square, same compass labelling
// and same export path as the stereonet, so switching between the two views doesn't feel like moving to
// a different tool. Each petal is drawn as a true annular wedge (an arc, not a triangle) because a rose
// petal's whole point is that its AREA encodes frequency — a triangular approximation would understate
// wide bins and overstate narrow ones, quietly breaking the equal-area property roseDiagramBins' √count
// radius scaling exists to provide. Reference rings sit at 25/50/75/100% of the longest petal's RADIUS,
// which in count terms is 6.25/25/56.25/100% — labelled with the counts themselves so nobody has to do
// that conversion in their head.
function RoseDiagram({ svgRef, rose, size, pad }) {
  const R = size / 2 - pad, CX = size / 2, CY = size / 2;
  // Compass bearing -> SVG point. Bearing 0 is north (up, -y in SVG); bearings run clockwise.
  const pt = (bearingDeg, r) => {
    const a = (bearingDeg * Math.PI) / 180;
    return { x: CX + r * Math.sin(a), y: CY - r * Math.cos(a) };
  };
  const wedge = (fromDeg, toDeg, r) => {
    if (r <= 0) return null;
    const p0 = pt(fromDeg, r), p1 = pt(toDeg, r);
    const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
    // sweep-flag 1: SVG's positive-angle direction with y flipped is clockwise on screen, which is the
    // direction increasing compass bearing runs.
    return `M ${CX} ${CY} L ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} Z`;
  };
  return (
    <svg ref={svgRef} width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ background: "#fbfbfc", border: "1px solid #d9dce1", borderRadius: 8 }}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <circle key={f} cx={CX} cy={CY} r={R * f} fill="none" stroke={f === 1 ? "#8a5555" : "#e7e9ec"} strokeWidth={f === 1 ? 1.5 : 1} />
      ))}
      {[0, 45, 90, 135].map((a) => {
        const p0 = pt(a, R), p1 = pt(a + 180, R);
        return <line key={a} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#e7e9ec" strokeWidth={1} />;
      })}
      {rose && rose.bins.map((b, i) => {
        const d = wedge(b.from, b.to, b.radius * R);
        if (!d) return null;
        return (
          <path key={`rp_${i}`} d={d} fill="#2f6fe0" fillOpacity={0.55} stroke="#1f4e9e" strokeWidth={0.7}>
            <title>{`${String(Math.round(b.from)).padStart(3, "0")}–${String(Math.round(b.to)).padStart(3, "0")}°: ${b.count % 1 ? b.count.toFixed(1) : b.count}${rose.bidirectional ? " (bidirectional)" : ""}`}</title>
          </path>
        );
      })}
      {/* Ring labels in COUNTS, not radius fractions — the radius is √-scaled, so a ring at half the
          radius is a quarter of the peak count and reading it as "half" would be wrong. */}
      {rose && [0.5, 1].map((f) => (
        <text key={`rl_${f}`} x={CX + 3} y={CY - R * f - 2} fontSize={9} fill="#94a1b0">
          {(rose.maxCount * f * f).toFixed(rose.maxCount * f * f % 1 ? 1 : 0)}
        </text>
      ))}
      <text x={CX} y={CY - R - 6} textAnchor="middle" fontSize={11} fill="#55606e">N</text>
      <text x={CX} y={CY + R + 14} textAnchor="middle" fontSize={11} fill="#55606e">S</text>
      <text x={CX + R + 10} y={CY + 4} textAnchor="middle" fontSize={11} fill="#55606e">E</text>
      <text x={CX - R - 10} y={CY + 4} textAnchor="middle" fontSize={11} fill="#55606e">W</text>
      {!rose && <text x={CX} y={CY} textAnchor="middle" fontSize={11} fill="#94a1b0">No picks with a valid dip / dip direction</text>}
    </svg>
  );
}

// TASKS.csv #141 follow-up — density contour bands. CONTOUR_LEVELS are the lower edges of each band in
// Kamb σ units (standard deviations above the density a uniform/random spread of the same number of
// poles would give — see kambContourGrid in stereonet.js for the derivation). A 2σ interval starting
// at 2σ is the conventional Kamb contour spacing (it's what Allmendinger's Stereonet defaults to);
// anything at/above the top level saturates into the last band. Colours are the app's own viridis
// ramp (PALETTES.viridis, layers.js) — perceptually uniform and colourblind-safe, the same convention
// the geophysics grids already use, and it happens to have exactly one anchor per band. Grid resolution
// is a fixed 48×48 over the net (cells ≈ 8px at the modal's 420px net — fine enough to read as a
// smooth contour, coarse enough that even a 600-pick layer recomputes in a few ms).
const CONTOUR_LEVELS = [2, 4, 6, 8, 10, 12];
const CONTOUR_COLORS = PALETTES.viridis.colors;
const CONTOUR_GRID = 48;
const contourColor = (sigma) => {
  let k = 0;
  while (k < CONTOUR_LEVELS.length - 1 && sigma >= CONTOUR_LEVELS[k + 1]) k++;
  return CONTOUR_COLORS[k];
};

const overlay = { position: "fixed", inset: 0, background: "rgba(20,24,30,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" };
const panel = { width: 660, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, padding: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.3)" };
const rowLabel = { fontSize: 10.5, color: "#55606e", display: "flex", flexDirection: "column", gap: 3 };
const sel = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "5px 6px", color: "#1a2028", fontSize: 11 };
const exportBtn = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 10px", borderRadius: 6, border: "1px solid #c7ccd3", background: "transparent", color: "#55606e", fontSize: 11.5, cursor: "pointer" };
