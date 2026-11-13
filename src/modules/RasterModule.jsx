import { Ribbon, RibbonGroup, RibbonButton } from "../components/Ribbon.jsx"; // TASKS.csv #458
import { defaultDrapeElevation, rasterDrapeElevation, drapeElevationNote } from "../lib/drapeElevation.js"; // TASKS.csv #1856; rasterDrapeElevation: #1505
import { isAreaBoundary } from "../lib/boundaryImport.js"; // TASKS.csv #1466
import { ensureProjectCrs, ensureExportCrs } from "../lib/projectCrsRequest.js"; // TASKS.csv #615; export: #1021
import { useModuleAction } from "../lib/menuRequests.js"; // TASKS.csv #565
import { projectEpsgChooser } from "../lib/adoptCrs.js"; // TASKS.csv #607
import { runPfieldsJob } from "../lib/desktop.js"; // TASKS.csv #1985
import { terrainElevationAt } from "../lib/inversion.js"; // TASKS.csv #1985 — Euler solutions under the terrain
import React, { useMemo, useRef, useState } from "react";
import { Image, Eye, EyeOff, Trash2, Loader2, Satellite, MapPinned, ScatterChart, SlidersHorizontal, Rainbow, Download, Crosshair } from "../components/icons.js"; // Crosshair: #2657
import { requestPlanZoom } from "../lib/planZoom.js"; // TASKS.csv #2657
import SpectralIndexModal from "../components/SpectralIndexModal.jsx"; // TASKS.csv #783
import { useStore } from "../lib/store.jsx";
import { buildRasterImport, gridToSurveyRows, ternaryRaster, parseWorldFile, tieFetchedImage, dataUrlPixels } from "../lib/raster.js"; // dataUrlPixels: #1860; // parseWorldFile: TASKS.csv #1855; tieFetchedImage: #2648
import { b64ToF32, gridDeclination } from "../lib/inversion.js"; // TASKS.csv #373
import { SAT_LEVELS, planLatestFetch, levelsAddingNothing, naipCoverage } from "../lib/imageryLevels.js"; // TASKS.csv #781 / #837; naipCoverage: #1474
const NAIP_FINEST_M = 0.6; // lib/naipFetch.js, which stays out of this module until NAIP is fetched
import { gridToGeoTIFF, saveGeoTIFF, safeFileName, rasterExportNote, imageToGeoTIFF, pictureExportNote } from "../lib/gridExport.js"; // TASKS.csv #854; rasterExportNote: #1095; picture: #1860
import { toLonLat, crsName } from "../lib/reproject.js";
import SourceCrsField from "../components/SourceCrsField.jsx"; // TASKS.csv #488
import InfoButton from "../components/InfoButton.jsx";
import BasemapView from "../components/BasemapView.jsx";
import GeoreferencerModal from "../components/GeoreferencerModal.jsx";
import SidebarResizeHandle from "../components/SidebarResizeHandle.jsx";
import { useSidebarWidth } from "../lib/useSidebarWidth.js";
import EmptyState from "../components/EmptyState.jsx"; // TASKS.csv #309
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { arrMin, arrMax } from "../lib/arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786 — messages in the interface language
import { mainClusters } from "../lib/dataClusters.js"; // TASKS.csv #1461
import { fetchAreaBox, imageryAreaCollars } from "../lib/dataExtent.js"; // #1461; imageryAreaCollars: #2126
import RasterColourControls from "../components/RasterColourControls.jsx"; // TASKS.csv #1236
import GridContourControls from "../components/GridContourControls.jsx"; // TASKS.csv #1622
import { gridCellText } from "../lib/raster.js"; // TASKS.csv #1242
import { detectKeyColour } from "../lib/rasterKey.js"; // TASKS.csv #1623
import RasterLegend from "../components/RasterLegend.jsx"; // TASKS.csv #2011
import RasterPictureLegend from "../components/RasterPictureLegend.jsx"; // TASKS.csv #1858
import { tieOf, localToWorld } from "../lib/localGridTie.js"; // TASKS.csv #2587 — a tied local grid's way in; localToWorld: #2648
import { geosoftXmlCrs, sideXmlFor } from "../lib/geosoftXml.js"; // TASKS.csv #2830
import { mineSourceOf, isMineSource } from "../lib/mineGrid.js"; // TASKS.csv #2684 — 'Local mine grid' as the Source CRS
import { farFromCollars, farLabel } from "../lib/landingCheck.js"; // TASKS.csv #2590
import { projectTargetEpsg } from "../lib/projectTarget.js"; // TASKS.csv #2287 — no reprojection INTO the placeholder CRS
import { rasterLevelM, filteredLevelM, placeEulerSolutions, filteredPlacement } from "../lib/eulerPlace.js"; // TASKS.csv #2553; filteredPlacement: #2560
import { rasterMethodOf, filterBlockedBy, ternaryChoices, fieldFilterNeedsMethod, rasterUnitOf } from "../lib/rasterMethod.js"; // TASKS.csv #2557; fieldFilterNeedsMethod: #2835; rasterUnitOf: #2837
import { SURVEY_METHODS } from "../lib/geophysSurveys.js"; // TASKS.csv #2557 — the method's label
import { defaultFilterKind } from "../lib/filterDefault.js"; // TASKS.csv #1863

// TASKS.csv — split out of the Geophysics module into its own tab (user request: "let's make a
// separate Module for Raster, not within geophysics"). Geophysics had accumulated point-cloud/UBC
// mesh/boundary/terrain import alongside raster drape import in one long sidebar, which buried the
// raster controls among a lot of unrelated stuff; rasters (imagery/value-grid drapes) get their own
// home here. Terrain (SRTM/DEM) deliberately STAYS in Geophysics — it's elevation data feeding the 3D
// scene's actual ground surface, conceptually closer to the voxel/boundary/geophysics-point workflows
// already there than to a flat imagery drape, and splitting it out too wasn't part of what was asked.
// A .tif/.gxf dropped directly on the Geophysics tab still imports as a raster exactly like before —
// see that module's onDrop, which calls the same buildRasterImport() helper this module uses (raster.js).
// TASKS.csv #749 — embedded: inside the Maps tab (its ribbon triggers import / satellite / georeference through module
// actions); no ribbon or main area of its own.
// TASKS.csv #808 — ln(power) against wavenumber with the fitted segments, their depths, and the matched-filter buttons
function SpectrumPanel({ spectrum, onSplit }) {
  const { spec, fit } = spectrum;
  const W = 260, H = 130, L = 34, B = 22;
  const k = spec.k.map((v) => v * 1000), y = spec.lnP; // rad/km for the axis
  const kx = Math.max(...k), ymin = Math.min(...y), ymax = Math.max(...y);
  const X = (v) => L + ((W - L - 6) * v) / kx, Y = (v) => 6 + ((H - B - 6) * (ymax - v)) / Math.max(1e-9, ymax - ymin);
  const line = (s) => s && <line x1={X(s.k0 * 1000)} y1={Y(s.c - 2 * s.h * s.k0)} x2={X(s.k1 * 1000)} y2={Y(s.c - 2 * s.h * s.k1)} strokeWidth="2" />;
  const btn = { flex: 1, padding: "4px 6px", border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)", borderRadius: 5, cursor: "pointer", fontSize: "var(--font-size-xs)", color: "var(--color-text)" };
  return (
    <div style={{ marginTop: 8 }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr("Radially averaged power spectrum")} style={{ display: "block" }}>
        <line x1={L} y1={H - B} x2={W - 4} y2={H - B} stroke="var(--color-border)" />
        <line x1={L} y1={4} x2={L} y2={H - B} stroke="var(--color-border)" />
        {k.map((v, i) => <circle key={i} cx={X(v)} cy={Y(y[i])} r="1.4" fill="var(--color-text-muted)" />)}
        <g stroke="var(--color-danger-fg)">{line(fit?.deep)}</g>
        <g stroke="var(--color-info)">{line(fit?.shallow)}</g>
        <text x={(L + W) / 2} y={H - 5} textAnchor="middle" fontSize="9" fill="var(--color-text-muted)">{tr("wavenumber (rad/km)")}</text>
        <text x={9} y={(H - B) / 2} textAnchor="middle" fontSize="9" fill="var(--color-text-muted)" transform={`rotate(-90 9 ${(H - B) / 2})`}>ln P</text>
      </svg>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", lineHeight: 1.45, marginTop: 4 }}>
        {!fit ? tr("The spectrum does not fall with wavenumber: no depth can be read from it.")
          : fit.shallow ? tr("Deep sources ~{deep} m (red), shallow sources ~{shallow} m (blue), below the sensor. Subtract the survey's sensor height for depth below ground; these are ensemble averages, not depths of single bodies.", { deep: Math.round(fit.deep.h), shallow: Math.round(fit.shallow.h) })
          : tr("One straight segment: sources ~{deep} m below the sensor (red). Subtract the survey's sensor height for depth below ground.", { deep: Math.round(fit.deep.h) })}
      </div>
      {fit?.shallow && (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button onClick={() => onSplit("deep")} style={btn}>{tr("Add the deep component")}</button>
          <button onClick={() => onSplit("shallow")} style={btn}>{tr("Add the shallow component")}</button>
        </div>
      )}
    </div>
  );
}

export default function RasterModule({ embedded = false } = {}) {
  const { rasters, addRaster, updateRaster, removeRaster, terrain, project, collars, survey = [] /* #2126 */, boundaries, setLayers, projectIsEmpty, setEpsg, surfaceSamples = [], voxelModels = [], updateGeophysSurvey, geophysSurveys = {} } = useStore(); // voxelModels: #1856 // projectIsEmpty/setEpsg: #607; updateGeophysSurvey: #1985
  // TASKS.csv #326 — a data grid's nodes as survey points (Geophysics -> Point cloud / Inversion). Replaces
  // any earlier points made from the same grid, so doing it twice does not double the survey.
  // TASKS.csv #373 — potential-field filters on a grid's kept values; each result is a new raster
  const [filterFor, setFilterFor] = useState(null); // raster id whose filter form is open
  // TASKS.csv #2835 / #2842 — a grid of unknown method (an imported one, 'This grid is' not set): the field filters say what they assume and
  // run once the method is set on the card or this is ticked (per raster, this session)
  const [assumeField, setAssumeField] = useState({});
  const unknownNeedsTick = (r) => !rasterMethodOf(r, geophysSurveys) && fieldFilterNeedsMethod(filt.kind) && !assumeField[r.id];
  const [filt, setFilt] = useState({ kind: "rtp", inclination: "", declination: "", height: "", amplitudeInclination: "", integrate: false, si: "1", window: "", date: "", igrfSource: null }); // amplitudeInclination, integrate: #1988; si, window: #1985; date, igrfSource: #2561
  const [filtering, setFiltering] = useState(false);
  const [spectrum, setSpectrum] = useState(null); // TASKS.csv #808 — { rasterId, spec, fit } for the open grid
  // TASKS.csv #2561 (review #2486) — RTP / RTE asked for I and D that 'IGRF gives both', with nothing to compute them: the field at the grid's
  // centre and level for a survey date, as Inversion's 'Compute from IGRF-14' does; typed values stay possible (and win)
  const fillIgrf = async (r) => {
    if (project?.crsSet === false && !tieOf(project)) { setError({ info: false, text: tr("IGRF needs the survey's real-world location, and the project CRS isn't set: set it in the status bar first.") }); return; }
    const { igrfField, decimalYear } = await import("../lib/igrf.js");
    const yr = decimalYear(filt.date);
    if (!Number.isFinite(yr)) { setError({ info: false, text: tr("Enter the survey date first — the field changes by tens of nT per year.") }); return; }
    const g = r.grid, cx = g.x0 + (g.dx * (g.nx - 1)) / 2, cy = g.yTop - (g.dy * (g.ny - 1)) / 2;
    const ll = await lonLatOf(cx, cy);
    if (!ll) { setError({ info: false, text: tr("Can't convert EPSG:{epsg} to longitude/latitude for IGRF.", { epsg: tieOf(project)?.epsg ?? project?.epsg }) }); return; }
    const lon = ll.lon ?? ll[0], lat = ll.lat ?? ll[1], zM = rasterLevelM(r) ?? (Number(r.elevation) || 0);
    try {
      const f = igrfField(lon, lat, zM / 1000, yr);
      const source = `IGRF-14 for ${filt.date} at ${lat.toFixed(3)}, ${lon.toFixed(3)}, ${Math.round(zM)} m (grid centre)`;
      setFilt((p) => ({ ...p, inclination: f.inclination.toFixed(2), declination: f.declination.toFixed(2), igrfSource: source }));
      setError({ info: true, text: tr("Filled from IGRF-14 for {date}: {total} nT, inclination {inclination}°, declination {declination}° (true north). Check them against your survey report — the contractor's values win.", { date: filt.date, total: f.total.toFixed(0), inclination: f.inclination.toFixed(2), declination: f.declination.toFixed(2) }) });
    } catch (e) { setError({ info: false, text: e.message }); }
  };
  // TASKS.csv #2560 — a filter's product is drawn as its parent is (lib/eulerPlace.js filteredPlacement)
  const placeOf = (r, kind, params = {}) => { const { drapeMode, elevation } = filteredPlacement(r, kind, params); return { drapeMode, elevation }; };
  const runFilter = async (r) => {
    if (filterBlockedBy(filt.kind, rasterMethodOf(r, geophysSurveys))) return; // #2557 — the button is disabled too
    if (unknownNeedsTick(r)) return; // #2835 — an imported grid of unknown method: the method or the tick first
    const { FILTERS, tiltDepth, radialSpectrum, fitSpectrumDepths, worms, filterOutputUnits } = await import("../lib/gridFilters.js"); // loaded on first use; worms: #1988; filterOutputUnits: #2837
    const g = r.grid;
    const params = {};
    let declGrid = null;
    if (filt.kind === "rtp" || filt.kind === "rtpa" || filt.kind === "rte") { // rtpa, rte: #1988
      const I = Number(filt.inclination), D = Number(filt.declination);
      if (filt.inclination === "" || filt.declination === "" || !(Math.abs(I) <= 90) || !(Math.abs(D) <= 180)) { setError({ info: false, text: tr("RTP needs the field inclination and declination (true north) for the survey date and place — IGRF gives both.") }); return; }
      const cx = g.x0 + (g.dx * (g.nx - 1)) / 2, cy = g.yTop - (g.dy * (g.ny - 1)) / 2;
      const d = gridDeclination(D, cx, cy, project?.epsg);
      if (!d) { setError({ info: false, text: tr("Could not compute grid convergence for this project CRS.") }); return; }
      declGrid = d.grid;
      Object.assign(params, { inclination: I, declinationTrue: D, declinationGrid: +d.grid.toFixed(3), gridConvergence: +d.convergence.toFixed(3), fieldSource: filt.igrfSource || "typed by the user" }); // fieldSource: #2561
      if (filt.kind === "rtpa" && filt.amplitudeInclination !== "") params.amplitudeInclination = Number(filt.amplitudeInclination);
    }
    if (filt.kind === "upward") {
      if (!(Number(filt.height) > 0)) { setError({ info: false, text: tr("Enter how many metres to continue upward.") }); return; }
      params.height = Number(filt.height);
    }
    setFiltering(true);
    await new Promise((res) => setTimeout(res, 30)); // let the busy state paint before the FFTs block
    try {
      const values = b64ToF32(g.values);
      // TASKS.csv #808 — depth estimates
      if (filt.kind === "spectrum") {
        const spec = radialSpectrum({ nx: g.nx, ny: g.ny, dx: g.dx, dy: g.dy, values });
        setSpectrum({ rasterId: r.id, spec, fit: fitSpectrumDepths(spec) });
        return;
      }
      // TASKS.csv #1985 — Euler deconvolution (Harmonica, in the Python engine): the solutions become a point survey coloured by depth
      if (filt.kind === "euler") {
        const win = Number(filt.window) > 0 ? Number(filt.window) : Math.round(10 * Math.max(g.dx, g.dy));
        const r2 = await runPfieldsJob({ op: "euler", nx: g.nx, ny: g.ny, dx: g.dx, dy: g.dy, x0: g.x0, yTop: g.yTop, values: g.values, structural_index: Number(filt.si), window: win, observation_elevation: 0 }, { onProgress: (p) => setError({ info: true, text: p.message || tr("Working…") }) });
        if (!r2.ok) { setError({ info: false, text: r2.error }); return; }
        const d = r2.data, src = `${r.name} — Euler (SI ${d.structural_index}, ${win} m windows)`;
        // TASKS.csv #2553 — below the grid's own level when it was computed at one (equivalent sources, upward continued), else under the terrain
        const levelM = rasterLevelM(r), placed = placeEulerSolutions(d, { levelM, groundAt: terrain ? (x, y) => terrainElevationAt(terrain, x, y) : null });
        const rows = d.x.map((x, i) => ({ x, y: d.y[i], z: placed.z[i], value: +d.depth[i].toFixed(1), depthSd: +d.depth_sd[i].toFixed(1), _src: src }));
        setLayers((l) => ({ ...l, geophys_pts: [...(l.geophys_pts || []).filter((p) => p._src !== src), ...rows] }));
        updateGeophysSurvey(src, { method: "euler_depth", units: "m" });
        setError({ info: true, text: d.count ? tr("Added the point survey \"{src}\": {n} solutions from {w} windows, depth {lo} to {hi} m below the grid's level (median {med} m){v}. Each kept solution lies inside its window and its depth is known to within 15 %. A depth is below the sensor: subtract the survey's height above ground for depth below ground.", { src, n: d.count.toLocaleString(), w: d.windows.toLocaleString(), lo: Math.round(Math.min(...d.depth)), hi: Math.round(Math.max(...d.depth)), med: Math.round([...d.depth].sort((a, b) => a - b)[d.depth.length >> 1]), v: placed.byLevel ? " " + tr("— in 3D at the grid's level ({lv} m) minus each depth ({n} of {all})", { lv: Math.round(levelM), n: placed.byLevel.toLocaleString(), all: d.count.toLocaleString() }) : placed.byTerrain ? " " + tr("— in 3D under the terrain ({n} of {all}; {m} with no ground under them show in plan only)", { n: placed.byTerrain.toLocaleString(), all: d.count.toLocaleString(), m: placed.missing.toLocaleString() }) : tr("; with no terrain they have no elevation and show in plan only") }) /* #2553 */ : tr("No Euler solution passed the checks in \"{name}\": try another structural index or a larger window.", { name: r.name }) });
        setFilterFor(null);
        return;
      }
      // TASKS.csv #1988 — worms: each node holds the greatest continuation height at which it is still an edge
      if (filt.kind === "worms") {
        const w = worms({ nx: g.nx, ny: g.ny, dx: g.dx, dy: g.dy, values }, { integrate: !!filt.integrate });
        if (!w.count) { setError({ info: false, text: tr("No edges found in \"{name}\".", { name: r.name }) }); return; }
        const nr = await (await import("../lib/gridFilterClient.js")).rasterFromGridAsync({ name: `${r.name} — Worms (edge heights, m)`, values: w.values, nx: g.nx, ny: g.ny, x0: g.x0, yTop: g.yTop, dx: g.dx, dy: g.dy, averagedBy: g.averagedBy || 1, sourceSize: g.sourceSize, elevation: r.elevation,
          extra: { surveyMethod: "worms_height", units: "m" /* #2639 — heights, not a field: no field filters on it */, filter: { kind: "worms", label: "Worms (Hornby et al. 1999)", params: { heightsM: w.levels.map((l) => l.h), nodesPerHeight: w.levels.map((l) => l.count), integrated: !!filt.integrate }, sourceRaster: r.name, method: "upward continuation to each height, total horizontal gradient, crests by the Blakely & Simpson 1986 test (2 of 4 directions, above the level's median); the node keeps the greatest height (gridFilters.js worms)", at: new Date().toISOString() } } });
        addRaster({ ...nr, ...placeOf(r, filt.kind) }); // drawn as its parent: #2560
        setError({ info: true, text: tr("Added \"{name}\": edges at {n} heights ({heights} m above the grid), {count} nodes. Each node holds the greatest height at which it is still an edge: an edge that stays put as the height grows is steep, one that walks sideways dips that way, and a deep-rooted one lasts to the greatest heights.", { name: nr.name, n: w.levels.length, heights: w.levels.map((l) => l.h.toLocaleString()).join(", "), count: w.count.toLocaleString() }) });
        setFilterFor(null);
        return;
      }
      if (filt.kind === "tiltdepth") {
        const td = tiltDepth({ nx: g.nx, ny: g.ny, dx: g.dx, dy: g.dy, values });
        if (!td.count) { setError({ info: false, text: tr("No tilt zero-crossings with a usable depth in \"{name}\".", { name: r.name }) }); return; }
        const nr = await (await import("../lib/gridFilterClient.js")).rasterFromGridAsync({ name: `${r.name} — Tilt-depth (contact depths, m)`, values: td.values, nx: g.nx, ny: g.ny, x0: g.x0, yTop: g.yTop, dx: g.dx, dy: g.dy, averagedBy: g.averagedBy || 1, sourceSize: g.sourceSize, elevation: r.elevation,
          extra: { surveyMethod: "tiltdepth_depth", units: "m" /* #2639 */, filter: { kind: "tiltdepth", label: "Tilt-depth (Salem et al. 2007)", params: { contactNodes: td.count, medianDepthM: Math.round(td.median) }, sourceRaster: r.name, method: "depth = 1 / |horizontal gradient of the tilt (radians)| at its zero contour, on the kept grid (gridFilters.js tiltDepth)", at: new Date().toISOString() } } });
        addRaster({ ...nr, ...placeOf(r, filt.kind) }); // drawn as its parent: #2560
        setError({ info: true, text: tr("Added \"{name}\": {n} nodes along the tilt's zero contour (the contacts), median depth {median} m below the sensor. Valid on an RTP grid over near-vertical contacts; subtract the survey's sensor height for depth below ground.", { name: nr.name, n: td.count.toLocaleString(), median: Math.round(td.median) }) });
        setFilterFor(null);
        return;
      }
      // TASKS.csv #2838 / #2850 — the FFTs run in a worker (the same applyGridFilter): the window froze 1–2 s on a 422 x 332 grid, 5–7 s on 945 x 501
      const { applyGridFilterAsync } = await import("../lib/gridFilterClient.js");
      const out = await applyGridFilterAsync({ nx: g.nx, ny: g.ny, dx: g.dx, dy: g.dy, values }, filt.kind, { ...params, declination: declGrid ?? undefined });
      const label = FILTERS[filt.kind].label;
      const ou = filterOutputUnits(filt.kind, rasterUnitOf(r)); // TASKS.csv #2837 / #2843 — the typed unit too; tilt: degrees; a gravity derivative per km
      if (ou.scale !== 1) for (let i = 0; i < out.values.length; i++) out.values[i] *= ou.scale;
      const suffix = filt.kind === "rtp" || filt.kind === "rte" ? ` (I ${params.inclination}°, D ${params.declinationTrue}° true)` : filt.kind === "rtpa" ? ` (I ${params.inclination}°, D ${params.declinationTrue}° true, Ia ${out.amplitudeInclination}°)` : filt.kind === "upward" ? ` (+${params.height} m)` : "";
      if (filt.kind === "rtpa") params.amplitudeInclination = out.amplitudeInclination; // #1988 — the one used, recorded with the raster
      const { rasterFromGridAsync } = await import("../lib/gridFilterClient.js"); // TASKS.csv #3033 — its picture made in the worker too
      const nr = await rasterFromGridAsync({ name: `${r.name} — ${label}${suffix}`, values: out.values, nx: g.nx, ny: g.ny, x0: g.x0, yTop: g.yTop, dx: g.dx, dy: g.dy, averagedBy: g.averagedBy || 1, sourceSize: g.sourceSize, elevation: r.elevation,
        extra: { levelM: filteredLevelM(r, filt.kind, params) /* #2553 */, surveyMethod: rasterMethodOf(r, geophysSurveys) || undefined, units: ou.units /* #2557, #2837 */, filter: { kind: filt.kind, label, params, sourceRaster: r.name, method: "FFT on the kept grid: mean plane removed, gaps filled from neighbours, mirror-padded to >= 2x with a cosine taper (gridFilters.js)", at: new Date().toISOString() } } });
      const place = filteredPlacement(r, filt.kind, params);
      addRaster({ ...nr, drapeMode: place.drapeMode, elevation: place.elevation }); // drawn as its parent, an upward continuation h higher: #2560
      setError({ info: !out.warning, text: tr("Added \"{name}\" (colours span the 2nd–98th percentile: {v}).{v2}", { name: nr.name, v: nr.colourRange.map((v) => v.toPrecision(3)).join(" to "), v2: out.warning ? " " + out.warning : "" }) + (place.raisedM ? " " + tr("It is drawn flat at {z} m, {h} m above the grid it was continued from.", { z: Math.round(place.elevation).toLocaleString(), h: place.raisedM }) : "") });
      setFilterFor(null);
    } catch (err) {
      setError({ info: false, text: tr("Filter failed: {message}", { message: err.message }) });
    } finally { setFiltering(false); }
  };
  // TASKS.csv #808 — matched filter: the deep or the shallow component as a new raster
  const splitByDepth = async (r, which) => {
    const { matchedFilter } = await import("../lib/gridFilters.js");
    const g = r.grid, fit = spectrum?.fit;
    try {
      const m = matchedFilter({ nx: g.nx, ny: g.ny, dx: g.dx, dy: g.dy, values: b64ToF32(g.values) }, fit);
      const h = Math.round(fit[which].h);
      const nr = await (await import("../lib/gridFilterClient.js")).rasterFromGridAsync({ name: `${r.name} — ${which === "deep" ? "deep" : "shallow"} component (~${h} m, matched filter)`, values: m[which], nx: g.nx, ny: g.ny, x0: g.x0, yTop: g.yTop, dx: g.dx, dy: g.dy, averagedBy: g.averagedBy || 1, sourceSize: g.sourceSize, elevation: r.elevation,
        extra: { filter: { kind: `matched-${which}`, label: "Matched filter (Spector & Grant 1970)", params: { deepDepthM: Math.round(fit.deep.h), shallowDepthM: Math.round(fit.shallow.h) }, sourceRaster: r.name, method: "w(k) = sqrt(P_i / (P_deep + P_shallow)) from the two fitted spectrum segments (gridFilters.js matchedFilter)", at: new Date().toISOString() } } });
      addRaster({ ...nr, ...placeOf(r, `matched-${which}`) }); // #2560
      setError({ info: true, text: tr("Added \"{name}\".", { name: nr.name }) });
    } catch (err) { setError({ info: false, text: tr("Filter failed: {message}", { message: err.message }) }); }
  };
  // TASKS.csv #375 — radiometric ternary image from three grids with kept values
  const [tern, setTern] = useState({ open: false, k: "", th: "", u: "" });
  const gridRasters = rasters.filter((r) => r.grid);
  const makeTernary = () => {
    const pick = (id) => rasters.find((r) => r.id === id);
    const kR = pick(tern.k), thR = pick(tern.th), uR = pick(tern.u);
    if (!kR || !thR || !uR) { setError({ info: false, text: tr("Choose the K, eTh and eU grids.") }); return; }
    try {
      const { raster, covered, ranges } = ternaryRaster({ kRaster: kR, thRaster: thR, uRaster: uR, elevation: kR.elevation });
      addRaster(raster);
      const f = (r) => `${r[0].toPrecision(3)}–${r[1].toPrecision(3)}`;
      setError({ info: true, text: tr("Added the ternary image ({covered} nodes). Stretches (2nd–98th percentile): K {v}, eTh {v2}, eU {v3}. Red = K, green = eTh, blue = eU; white = high in all three.", { covered: covered.toLocaleString(), v: f(ranges[0]), v2: f(ranges[1]), v3: f(ranges[2]) }) });
      setTern((p) => ({ ...p, open: false }));
    } catch (err) { setError({ info: false, text: tr("Ternary image failed: {message}", { message: err.message }) }); }
  };
  const gridAsSurvey = (r) => {
    const { rows, stride, spacing } = gridToSurveyRows(r);
    if (!rows.length) { setError({ info: false, text: tr("\"{name}\" has no valid grid values.", { name: r.name }) }); return; }
    const src = rows[0]._src;
    setLayers((l) => ({ ...l, geophys_pts: [...(l.geophys_pts || []).filter((p) => p._src !== src), ...rows] }));
    setError({ info: true, text: tr("Added {rows} survey points from \"{name}\"{v} as the survey \"{src}\". They have no elevation (grid nodes, not flight positions): in Geophysics → Inversion choose \"Sensor is a fixed height above terrain\" and enter the survey's nominal height. Not drawn in 3D without an elevation — the raster itself shows the data.", { rows: rows.length.toLocaleString(), name: r.name, v: stride > 1 ? tr(" (one node in {stride} each way, {v} m apart, to stay within the inversion's 20,000-station limit)", { stride, v: +spacing[0].toFixed(1) }) : "", src }) });
  };
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef(null);
  useModuleAction(["import-raster"], () => fileInput.current?.click()); // TASKS.csv #565 — File > Import here
  // TASKS.csv #1507 — files dropped on the Maps tab's map (MapsModule): the rasters import as a drop on this sidebar does, the rest are named
  useModuleAction(["import-raster-files"], (_a, p) => {
    (p?.files || []).forEach((f) => importRaster(f));
    if (p?.notes?.length && !p?.others?.length) setError({ info: true, text: p.notes.join(" ") }); // #2019 — the Map layers the drop added
    else if (p?.others?.length) setError({ info: true, text: tr("Dropped on the map, only rasters (.tif, .gxf, .grd) import. {names}: use Boundaries, Terrain or Web layers above, or Surface Geology for a geology map.", { names: p.others.slice(0, 3).join(", ") + (p.others.length > 3 ? "…" : "") }) });
  });
  useModuleAction(["raster-satellite", "raster-georeference", "raster-spectral"], (a) => (a === "raster-satellite" ? openSatPickerRef.current?.() : a === "raster-spectral" ? openSpectralRef.current?.() : setGeorefOpen(true))); // #749 — the Maps tab's ribbon; spectral: #783
  const [sidebarWidth, setSidebarWidth] = useSidebarWidth();

  // TASKS.csv #204 — "Any freely available sat image we can import from the raster module? If so, we
  // should also have an option to match the SRTM boundary." imageryFetch.js's fetchLatestTrueColour (#816) does the
  // actual fetch (#837: the EOX mosaic is a display-only basemap now, so the project-stored image is Copernicus data);
  // this is just the area-picker plumbing, reusing the exact same BasemapView "draw" picker (and its
  // #200 "use an existing layer's extent as the area" dropdown) the Geophysics module's SRTM fetch
  // already uses — "match the SRTM boundary" is simply offering the loaded `terrain` surface's own
  // bbox as one of those options, right alongside boundaries/rasters.
  const [satPickerOpen, setSatPickerOpen] = useState(false);
  const [satSeedBbox, setSatSeedBbox] = useState(null);
  const [satSeedLonLat, setSatSeedLonLat] = useState(null);
  const [satAreaOptions, setSatAreaOptions] = useState(null);
  const [satBusy, setSatBusy] = useState(false);
  const [satProgress, setSatProgress] = useState(null);
  // TASKS.csv #781 — resolution level, remembered per computer (a preference, not project data)
  const [satLevel, setSatLevelState] = useState(() => { try { const v = localStorage.getItem("geostrix_sat_level"); return SAT_LEVELS[v] ? v : "standard"; } catch { return "standard"; } });
  const setSatLevel = (v) => { setSatLevelState(v); try { localStorage.setItem("geostrix_sat_level", v); } catch { /* private window: session only */ } };
  // TASKS.csv #838 — where the image comes from: Sentinel-2 everywhere, NAIP's much finer aerial imagery in the USA
  const [satSource, setSatSourceState] = useState(() => { try { return localStorage.getItem("geostrix_sat_source") === "naip" ? "naip" : "sentinel2"; } catch { return "sentinel2"; } });
  const setSatSource = (v) => { setSatSourceState(v); try { localStorage.setItem("geostrix_sat_source", v); } catch { /* private window: session only */ } };
  // TASKS.csv #838 — a drone or contractor orthophoto can keep more than the usual 2048 px, at the cost of memory and project size
  const [keepDetail, setKeepDetailState] = useState(() => { try { return localStorage.getItem("geostrix_raster_keep_detail") === "1"; } catch { return false; } });
  const setKeepDetail = (v) => { setKeepDetailState(v); try { localStorage.setItem("geostrix_raster_keep_detail", v ? "1" : "0"); } catch { /* private window: session only */ } };
  // TASKS.csv #129 — manual tie-point georeferencer for a scanned map/claim sketch with no embedded
  // geo tags at all (a GeoTIFF/gxf still trusts its own tags, per buildRasterImport above — this is
  // specifically for when there ARE none). GeoreferencerModal.jsx does the actual UI/math; this is
  // just the open/import wiring, same addRaster() call site as every other raster source on this page.
  const [georefOpen, setGeorefOpen] = useState(false);
  const [spectralOpen, setSpectralOpen] = useState(false); // TASKS.csv #783
  const [spectralAreas, setSpectralAreas] = useState([]); // TASKS.csv #784 — areas offered for fetching imagery
  const openSpectralRef = useRef(null);

  // TASKS.csv #2648 — a point of the project to lon / lat: on a tied local grid through the tie (grid -> its CRS -> WGS 84)
  const lonLatOf = (x, y) => { const tie = tieOf(project); if (!tie) return toLonLat(x, y, project.epsg); const w = localToWorld(tie, x, y); return toLonLat(w.x, w.y, tie.epsg); };
  const defaultSatBboxLonLat = async () => {
    if (!collars.length || (!project?.epsg && !tieOf(project))) return null;
    // TASKS.csv #1461 — the collars and the surface samples near them (Silvertip's soil grid), not the collars alone
    const [xmin, ymin, xmax, ymax] = fetchAreaBox(imageryAreaCollars(collars, survey).collars, surfaceSamples); // #2126 — the traced holes / the main cluster, not a whole district list
    const corners = [[xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax]];
    const lonLats = await Promise.all(corners.map(([x, y]) => lonLatOf(x, y)));
    if (lonLats.some((ll) => !ll)) return null;
    const lons = lonLats.map((ll) => ll.lon), lats = lonLats.map((ll) => ll.lat);
    return [arrMin(lons), arrMin(lats), arrMax(lons), arrMax(lats)];
  };

  const buildSatAreaOptions = async () => {
    if (!project?.epsg && !tieOf(project)) return [];
    const jobs = [];
    { // TASKS.csv #2126 — the whole district box stays one click away when the seed is a part of the collars
      const a = imageryAreaCollars(collars, survey);
      if (a.by !== "all") { const [xmin, ymin, xmax, ymax] = fetchAreaBox(collars, surfaceSamples); jobs.push({ id: "all_collars", label: tr("Every collar ({n})", { n: a.total.toLocaleString() }), xmin, xmax, ymin, ymax }); }
    }
    if (terrain?.bbox) {
      const [xmin, ymin, xmax, ymax] = terrain.bbox;
      jobs.push({ id: "terrain", label: `Match terrain/SRTM: ${terrain.name}`, xmin, xmax, ymin, ymax });
    }
    { // #1461 — the surface samples' area (without far outliers), as the terrain picker offers
      const { keep } = mainClusters(surfaceSamples || []), pts = (surfaceSamples || []).filter((p, i) => keep[i]);
      if (pts.length) { const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), x0 = arrMin(xs), x1 = arrMax(xs), y0 = arrMin(ys), y1 = arrMax(ys), m = Math.max(500, 0.05 * Math.max(x1 - x0, y1 - y0)); jobs.push({ id: "surface_samples", label: tr("Around the surface samples"), xmin: x0 - m, xmax: x1 + m, ymin: y0 - m, ymax: y1 + m }); }
    }
    for (const b of boundaries) {
      if (!isAreaBoundary(b)) continue; // #1466 — contours and other open lines are not an area
      const xs = [], ys = [];
      for (const loop of b.polylines || []) for (const p of loop) { xs.push(p.x); ys.push(p.y); }
      if (!xs.length) continue;
      jobs.push({ id: `boundary_${b.id}`, label: `Boundary: ${b.name}`, xmin: arrMin(xs), xmax: arrMax(xs), ymin: arrMin(ys), ymax: arrMax(ys) });
    }
    for (const r of rasters) {
      if (!r.bbox) continue;
      const [xmin, ymin, xmax, ymax] = r.bbox;
      jobs.push({ id: `raster_${r.id}`, label: `Raster: ${r.name}`, xmin, xmax, ymin, ymax });
    }
    const options = await Promise.all(jobs.map(async (j) => {
      const corners = [[j.xmin, j.ymin], [j.xmax, j.ymin], [j.xmax, j.ymax], [j.xmin, j.ymax]];
      const lonLats = await Promise.all(corners.map(([x, y]) => lonLatOf(x, y)));
      if (lonLats.some((ll) => !ll)) return null;
      const lons = lonLats.map((ll) => ll.lon), lats = lonLats.map((ll) => ll.lat);
      return { id: j.id, label: farLabel(j.label, farFromCollars([j.xmin, j.ymin, j.xmax, j.ymax], collars)), bboxLonLat: [arrMin(lons), arrMin(lats), arrMax(lons), arrMax(lats)] }; // farLabel: #2590
    }));
    return options.filter(Boolean);
  };

  // TASKS.csv #615 — as the SRTM picker: a CRS never chosen is asked for first, then the picker re-opens
  const openSatPickerRef = useRef(null);
  const openSatPicker = async () => {
    if (project?.crsSet === false && !tieOf(project)) { // #2648 — a tied local grid fetches through its tie
      const chosen = await ensureProjectCrs(project, tr("Imagery is downloaded for the place your coordinates point to, so the project needs its coordinate system first."));
      if (chosen) setTimeout(() => openSatPickerRef.current?.(), 0);
      return;
    }
    if (!project?.epsg && !tieOf(project)) {
      setError({ info: false, text: tr("Project EPSG isn't set — can't reproject fetched imagery into project coordinates.") });
      return;
    }
    setError(null);
    const seed = await defaultSatBboxLonLat();
    setSatSeedBbox(seed);
    setSatSeedLonLat(seed ? { lon: (seed[0] + seed[2]) / 2, lat: (seed[1] + seed[3]) / 2 } : null);
    setSatAreaOptions(await buildSatAreaOptions());
    setSatPickerOpen(true);
  };
  openSatPickerRef.current = openSatPicker;

  // TASKS.csv #784 — the spectral index dialog, with the same ready-made areas as the satellite picker
  const openSpectral = async () => {
    // TASKS.csv #2292 (review #2174) — the one online tool not gated by the CRS: it offered 'Around the drillholes' from the placeholder
    if (project?.crsSet === false && !tieOf(project)) { // #2648 — a tied local grid fetches through its tie
      const chosen = await ensureProjectCrs(project, tr("Imagery is downloaded for the place your coordinates point to, so the project needs its coordinate system first."));
      if (chosen) setTimeout(() => openSpectralRef.current?.(), 0);
      return;
    }
    const seed = await defaultSatBboxLonLat();
    const opts = await buildSatAreaOptions();
    const a = imageryAreaCollars(collars, survey); // #2126
    const holesLabel = a.by === "traced" ? tr("Around the traced holes ({n} of {total})", { n: a.collars.length.toLocaleString(), total: a.total.toLocaleString() }) : a.by === "cluster" ? tr("Around the main group of collars ({n} of {total})", { n: a.collars.length.toLocaleString(), total: a.total.toLocaleString() }) : tr("Around the drillholes");
    setSpectralAreas([...(seed ? [{ id: "holes", label: holesLabel, bboxLonLat: seed }] : []), ...opts]);
    setSpectralOpen(true);
  };
  openSpectralRef.current = openSpectral;

  const runSatFetch = async (bboxLonLat) => {
    // #1474 — no catalogue search for an area NAIP cannot cover
    if (satSource === "naip" && naipCoverage(bboxLonLat) === "outside") { setError({ info: false, text: tr("This area is outside the contiguous USA, where NAIP is flown: choose Sentinel-2 (worldwide) instead.") }); return; }
    setSatPickerOpen(false);
    setSatBusy(true);
    setSatProgress({ done: 0, total: 1 });
    try { // TASKS.csv #816 / #837 — the latest clear Sentinel-2 scene (Copernicus: free and open, any use with attribution)
      const tie = tieOf(project); // TASKS.csv #2648 — a tied local grid: fetched in the tie's CRS, then brought into the grid
      const opts = { targetEpsg: tie ? Number(tie.epsg) : project.epsg, maxPx: SAT_LEVELS[satLevel]?.gridMax || 2048, onProgress: (done, total) => setSatProgress({ done, total }) };
      let r = satSource === "naip" ? await (await import("../lib/naipFetch.js")).fetchNaip(bboxLonLat, opts) : await (await import("../lib/imageryFetch.js")).fetchLatestTrueColour(bboxLonLat, opts);
      let tieNote = "";
      if (tie) {
        const local = await tieFetchedImage(r, tie, opts.targetEpsg, SAT_LEVELS[satLevel]?.gridMax || 2048);
        if (!local) throw new Error(tr("The fetched imagery could not be brought into the local grid through its tie to EPSG:{epsg}.", { epsg: opts.targetEpsg }));
        r = local;
        tieNote = " " + tr("It was fetched in EPSG:{epsg} and brought into the local grid through the grid's tie, and resampled onto the grid's own north.", { epsg: opts.targetEpsg });
      }
      addRaster({ name: r.name, bbox: r.bbox, dataUrl: r.dataUrl, elevation: defaultElevation });
      setError({ info: satSource === "naip" ? !r.partial : r.areaCloud <= 0.1, text: tr("Fetched and imported \"{name}\" ({gridW} × {gridH} px).", { name: r.name, gridW: r.gridW, gridH: r.gridH }) + r.note + tieNote });
    } catch (err) {
      setError({ info: false, text: err.message });
    } finally {
      setSatBusy(false);
      setSatProgress(null);
    }
  };

  // Same reasoning as Geophysics's defaultElevation: a flat (non-terrain-draped) raster needs SOME
  // starting elevation, and "roughly at surface/collar level" is a better default than 0 when holes
  // are already loaded.
  // TASKS.csv #1856 — with no collars, the top of the block models, else the surface samples (was 0 m: 1,500 m under Kodiak's ground)
  const defaultElevation = useMemo(() => defaultDrapeElevation({ collars, voxelModels, surfaceSamples }).z, [collars, voxelModels, surfaceSamples]);

  // TASKS.csv #287 — "Source CRS (EPSG, optional)", the field the vector/collar importers have had
  // since #120/#205 and the raster side never got. Blank = fall back to the file's own CRS tag (a
  // GeoTIFF GeoKey), which is still the common case; typed in = an explicit override, which is the
  // ONLY way to correct a .gxf (no CRS tag exists in that format) or a GeoTIFF whose embedded tag is
  // wrong/absent. Session state, not project state — it describes the file being imported, not the
  // project (same reasoning as the import modal's own Source CRS field).
  const [sourceEpsg, setSourceEpsg] = useState("");
  // TASKS.csv #2744 (follow-up of #2648) — the Source CRS line says what a local grid does with a file's tag: a grid tied to a CRS brings the
  // file in through its tie (#2587), an untied one takes its numbers as the grid's (it read 'The project CRS — not chosen yet' for both)
  const rasterTie = tieOf(project);
  const rasterSourceDefault = project?.crsSet !== false
    ? tr("From the file's own tag, else the project CRS ({crs})", { crs: crsName(project?.epsg) || `EPSG:${project?.epsg ?? "?"}` })
    : rasterTie ? tr("From the file's own tag, brought into the local grid through its tie to {crs}", { crs: crsName(rasterTie.epsg) ? `${crsName(rasterTie.epsg)} (EPSG:${rasterTie.epsg})` : `EPSG:${rasterTie.epsg}` })
    : project?.localGrid ? tr("The local grid's own numbers (a file's CRS tag is not used until the grid is tied to a CRS)")
    : tr("The project CRS — not chosen yet");

  // TASKS.csv #1860 (review #1646) — a picture raster out as an RGBA GeoTIFF in the project CRS: a plan map georeferenced here can go to
  // QGIS or a colleague without its four points being placed again
  const exportPicture = async (r) => {
    const epsgX = await ensureExportCrs(project); /* #1021 */
    if (!epsgX) return;
    try {
      const px = await dataUrlPixels(r.dataUrl, tr("The picture of \"{name}\" could not be read.", { name: r.name }));
      const res = await saveGeoTIFF(`${safeFileName(r.name)}.tif`, imageToGeoTIFF({ ...px, bbox: r.bbox, epsg: epsgX }));
      if (res?.ok) setError({ info: true, text: pictureExportNote(r, px.width, px.height, epsgX) });
      else if (res && !res.ok && res.error) setError({ info: false, text: res.error });
    } catch (e) { setError({ info: false, text: e.message }); }
  };
  // TASKS.csv #2129 — the collars' elevation range, for 'it looks like an elevation model'
  const collarZRange = (cs) => { let a = Infinity, b = -Infinity; for (const c of cs || []) if (Number.isFinite(c?.z)) { if (c.z < a) a = c.z; if (c.z > b) b = c.z; } return Number.isFinite(a) ? [a, b] : null; };
  const importRaster = async (file, world = null, xml = null) => { // world: a world file selected with it (TASKS.csv #1855); xml: a Geosoft .xml (#2830)
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const worldFile = world ? parseWorldFile(await world.text(), world.name) : null;
      // TASKS.csv #2830 — the Geosoft .xml beside a .grd / .gxf names its CRS (a Source CRS set by hand still wins)
      const xc = xml && !sourceEpsg ? geosoftXmlCrs(await xml.text()) : null;
      const sideCrs = xc ? { epsg: xc.epsg, from: xml.name } : null;
      const chooseProjectEpsg = projectEpsgChooser({ isEmpty: projectIsEmpty, setEpsg, fileName: file.name }); // #607
      const { raster, msg } = await buildRasterImport(file, { epsg: projectTargetEpsg(project), defaultElevation, sourceEpsg, chooseProjectEpsg, keepDetail, worldFile, tie: tieOf(project), collarZ: collarZRange(collars), mineSource: mineSourceOf(project), sideCrs }); // tie: #2587; collarZ: #2129; mineSource: #2684; sideCrs: #2830
      const drape = rasterDrapeElevation({ collars, voxelModels, surfaceSamples, bbox: raster.bbox, rasters, fileName: file.name }); // #1856 — the ground under this raster; #1505 — above the collars, stacked, or at the name's depth
      addRaster({ ...raster, elevation: drape.z });
      setError({ info: true, text: `${msg} ${drapeElevationNote(drape)}` });
    } catch (err) {
      setError({ info: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="ge-body"
      style={embedded ? { flex: "0 0 auto", minWidth: 0 } : { width: "100%" }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setDragOver(false);
        const files = Array.from(e.dataTransfer.files || []).filter((f) => /\.(tiff?|gxf|grd)$/i.test(f.name)); // grd: #1347
        files.forEach((f) => importRaster(f));
      }}
    >
      <div className="ge-panel" style={{ padding: "16px 14px", overflowY: "auto", width: sidebarWidth }}>
        {/* TASKS.csv #458 — Raster ribbon: the import actions; the sidebar keeps the import CRS and the rasters. */}
        <Ribbon label="Raster tools" show={!embedded}>
          <RibbonGroup label="Import">
            <RibbonButton icon={busy ? Loader2 : Image} label={busy ? "Reading…" : "GeoTIFF / GXF"} tone="data" disabled={busy} title="Import a georeferenced GeoTIFF or Geosoft .gxf grid (uses the Source CRS below)" onClick={() => fileInput.current.click()} />
            <RibbonButton icon={Satellite} label={satProgress ? `Fetching ${satProgress.done}/${satProgress.total}` : "Satellite"} tone="data" disabled={satBusy} title="Free Sentinel-2 imagery (no account): the latest clear scene over an area you pick on a map, or matching an existing terrain / boundary / raster extent" onClick={openSatPicker} />
            <RibbonButton icon={MapPinned} label="Georeference" tone="data" title="Georeference a scanned map or sketch with no coordinates: click matching points and type their real X/Y" onClick={() => setGeorefOpen(true)} />
            <RibbonButton icon={Rainbow} label="Spectral index" tone="data" title="Quartz / carbonate / mafic indices from ASTER thermal emissivity, iron-oxide and clay ratios from Sentinel-2 or Landsat, or your own band arithmetic, from a multiband GeoTIFF" onClick={openSpectral} />
          </RibbonGroup>
        </Ribbon>
        <div className="ge-section-label" style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>{tr("Raster drape")}<InfoButton title={tr("Raster drape")} text={tr("Import a georeferenced GeoTIFF (mag/radiometrics grid, orthophoto, whatever), or a Geosoft .gxf grid export (the plain-text Geosoft interchange format; the proprietary binary .grd isn't supported, no public spec to implement against), as a flat plane in the 3D view — set its elevation and opacity below once imported, or drape it onto a terrain surface (import one under Maps → Terrain first). If the file's coordinates aren't already in the project's EPSG ({v}), set Source CRS below and the raster is reprojected on import. Drag files in anywhere on this page, or use the button below.", { v: project?.crsSet === false ? tr("not chosen yet") : project?.epsg ?? "?" } /* #2289 */)} />
        </div>
        {/* TASKS.csv #287 — Source CRS override. Sits ABOVE the import button (and applies to
            drag-dropped files too) because it has to be set before the file is read, not after. */}
        <SourceCrsField
          value={sourceEpsg} onChange={(c) => setSourceEpsg(c === "" ? "" : String(c))} mineGrid={mineSourceOf(project) /* #2684 */}
          defaultText={rasterSourceDefault /* #2289; #2744 */}
          title={tr("The CRS the file's own coordinates are in. Leave it on the file's tag for a GeoTIFF; set it for a .gxf (that format has no CRS tag) or when a file's tag is wrong — the raster is then reprojected into the project CRS on import.")}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }} title={tr("For a drone or contractor orthophoto: keeps up to 4096 px on the long side instead of 2048, so a 2 km image shows about 0.5 m rather than 1 m. Uses about four times the graphics memory and a larger project file. Import the image again after changing this.")}>
          <input type="checkbox" checked={keepDetail} onChange={(e) => setKeepDetail(e.target.checked)} />{tr("Keep full detail (up to 4096 px)")}
        </label>
        <input
          ref={fileInput}
          type="file"
          accept=".tif,.tiff,.gxf,.grd,.tfw,.tifw,.tiffw,.wld,.xml" /* .xml: #2830 */
          multiple
          style={{ display: "none" }}
          onChange={(e) => { // #1855 — a world file goes with the image of the same name
            const all = Array.from(e.target.files || []), isWorld = (f) => /\.(tfw|tifw|tiffw|wld)$/i.test(f.name), base = (f) => f.name.replace(/\.[^.]+$/, "").toLowerCase();
            const isXml = (f) => /\.xml$/i.test(f.name), xmls = all.filter(isXml); // #2830 — a Geosoft .xml goes with its grid
            const worlds = all.filter(isWorld), images = all.filter((f) => !isWorld(f) && !isXml(f));
            if (!images.length && worlds.length) setError({ info: false, text: tr("A world file on its own places nothing: select it together with its image (same name).") });
            if (!images.length && xmls.length) setError({ info: false, text: tr("A Geosoft .xml on its own places nothing: select it together with its grid (same name).") }); // #2830
            images.forEach((f) => importRaster(f, worlds.find((w) => base(w) === base(f)) || null, sideXmlFor(f, xmls)));
            e.target.value = "";
          }}
        />
        {satPickerOpen && (
          <BasemapView
            mode="draw"
            title={tr("Draw the area to fetch satellite imagery for")}
            confirmLabel="Fetch imagery for this area"
            lon={satSeedLonLat?.lon}
            lat={satSeedLonLat?.lat}
            initialBboxLonLat={satSeedBbox}
            areaOptions={satAreaOptions}
            onClose={() => setSatPickerOpen(false)}
            onConfirm={runSatFetch}
            extraControls={(bbox) => { // TASKS.csv #781 — resolution, and what it would fetch for this area
              const naip = satSource === "naip";
              const p = bbox ? planLatestFetch(bbox, satLevel, naip ? NAIP_FINEST_M : undefined) : null; // #837
              return (
                <span style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 10, fontSize: "var(--font-size-sm)", color: "#5a6472" }}>
                  <select value={satSource} onChange={(e) => setSatSource(e.target.value)} aria-label={tr("Imagery source")} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)", maxWidth: 300 }}
                    title={naip ? tr("USDA NAIP aerial imagery: public domain, the USA only, usually 0.6 m, flown every few years, so it can be older than Sentinel-2.") : tr("Latest clear Sentinel-2 scene — Copernicus data, free for any use with attribution")}>{/* TASKS.csv #816 / #837 / #838 */}
                    <option value="sentinel2">{tr("Sentinel-2, worldwide (10 m, latest clear scene)")}</option>
                    <option value="naip">{tr("NAIP aerial, USA only (about 0.6 m)")}</option>
                  </select>
                  <select value={satLevel} onChange={(e) => setSatLevel(e.target.value)} aria-label={tr("Image resolution")} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)" }}
                    title={naip ? tr("Higher levels keep more of the aerial detail over a large area. A very high level over a small area reaches the imagery's own pixels.") : tr("Higher levels keep more of the 10 m detail over a large area. Sentinel-2 imagery has 10 m pixels: past that, a higher level adds nothing.")}>
                    {Object.entries(SAT_LEVELS).map(([k, l]) => { const same = bbox && levelsAddingNothing(bbox, naip ? NAIP_FINEST_M : undefined).has(k); /* #1766 */ return <option key={k} value={k} disabled={same && k !== satLevel}>{same ? tr("{label} resolution (no finer here: the imagery's own pixels)", { label: l.label }) : tr("{label} resolution", { label: l.label })}</option>; })}
                  </select>
                  {naip && bbox && naipCoverage(bbox) !== "inside" && <span style={{ color: "var(--color-danger-icon-strong)" }}>{naipCoverage(bbox) === "outside" ? tr("Outside the USA: NAIP has no imagery here.") : tr("Part of this area is outside the USA: NAIP covers only the rest.")}</span>}{/* #1474 */}
                  {p && <span>{tr("~{v} m pixels · image {gridW} × {gridH} px{v3}", { gridW: p.gridW, gridH: p.gridH, v: naip ? (p.pixelM < 10 ? p.pixelM.toFixed(1) : Math.round(p.pixelM)) : Math.round(p.pixelM), v3: p.nativeLimited ? (naip ? tr(" · imagery's finest") : tr(" · imagery's finest (10 m)")) : "" })}</span>}
                  {p && !p.nativeLimited && p.pixelM > 3 * (naip ? NAIP_FINEST_M : 10) && <span style={{ color: "var(--color-warn-text)" }}>{tr("Pixels {k} times coarser than the imagery's own: a smaller area gets finer ones.", { k: Math.round(p.pixelM / (naip ? NAIP_FINEST_M : 10)) })}</span>}{/* #2126 */}
                </span>
              );
            }}
          />
        )}
        {spectralOpen && ( // TASKS.csv #783
          <SpectralIndexModal epsg={tieOf(project) ? null : project?.epsg} tie={tieOf(project) /* #2648 */} defaultElevation={defaultElevation} sourceEpsg={isMineSource(sourceEpsg) ? "" : sourceEpsg /* #2684 — a satellite scene is never on a mine grid */} areaOptions={spectralAreas}
            onClose={() => setSpectralOpen(false)}
            onImport={(raster, msg) => { // TASKS.csv #2294 — placed as a GeoTIFF of the same footprint is (#1505), and said
              const list = [].concat(raster), drape = rasterDrapeElevation({ collars, voxelModels, surfaceSamples, bbox: list[0]?.bbox, rasters, fileName: list[0]?.name });
              list.forEach((r, k) => addRaster({ ...r, elevation: drape.z + k * 5 })); /* an array: the #807 depth + wavelength maps, stacked 5 m apart */ setSpectralOpen(false); setError({ info: true, text: `${msg} ${drapeElevationNote(drape)}` }); }} />
        )}
        {/* projectEpsg: TASKS.csv #290 — lets the tie-point table declare its own CRS. */}
        {georefOpen && (
          <GeoreferencerModal
            projectEpsg={project?.epsg}
            onClose={() => setGeorefOpen(false)}
            onImport={(raster) => {
              // TASKS.csv #2294 (review #2174) — a scan of the same footprint as a GeoTIFF landed at the collar median (an underground level,
              // mid-way through the fans) while the GeoTIFF went 5 m above the highest collar under it: the same rule now, and said
              const drape = rasterDrapeElevation({ collars, voxelModels, surfaceSamples, bbox: raster.bbox, rasters, fileName: raster.name });
              // TASKS.csv #2590 (review #2486) — control points typed on a mine grid put the picture 6,240 km from the drilling, unasked
              if (drape.far && !window.confirm(tr("These control points place the picture about {km} km from the {n} collars, without reaching them. Are they on a local mine grid, or in another CRS than the project's?", { km: Math.round(drape.far.distM / 1000).toLocaleString(), n: collars.length.toLocaleString() }) + "\n\n" + tr("OK — import it there anyway.") + "\n" + tr("Cancel — go back to the control points."))) return;
              addRaster({ ...raster, elevation: drape.z });
              setGeorefOpen(false);
              setError({ info: true, text: tr("Georeferenced and imported \"{name}\".", { name: raster.name }) + " " + drapeElevationNote(drape) });
            }}
          />
        )}
        {error && (
          <div style={{ marginTop: 8, padding: "8px 10px", background: error.info ? "var(--color-bg-subtle)" : "var(--color-danger-bg)", border: `1px solid ${error.info ? "var(--color-border)" : "var(--color-danger-border)"}`, borderRadius: 6, fontSize: "var(--font-size-base)", color: error.info ? "var(--color-text-secondary)" : "var(--color-danger-text)", lineHeight: 1.5 }}>
            {error.text}
          </div>
        )}

        {gridRasters.length >= 3 && (
          <div style={{ marginTop: 10 }}>
            <button type="button" onClick={() => setTern((p) => {
              // TASKS.csv #2559 — opening it fills each empty channel with that channel's grid when exactly one is known (K, eTh, eU from one import)
              if (p.open) return { ...p, open: false };
              const pick = (ch) => { if (p[ch]) return p[ch]; const ex = ternaryChoices(gridRasters, ch, (x) => rasterMethodOf(x, geophysSurveys)).filter((c) => c.exact); return ex.length === 1 ? ex[0].raster.id : ""; };
              return { ...p, open: true, k: pick("k"), th: pick("th"), u: pick("u") };
            })} aria-expanded={tern.open} style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg-subtle)", color: "var(--color-text)", cursor: "pointer", fontSize: "var(--font-size-sm)", textAlign: "start" }}>{tr("Radiometric ternary image (K-eTh-eU)…")}</button>
            {tern.open && (
              <div style={{ marginTop: 6, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: 5 }}>
                {[["k", "K (red)"], ["th", tr("eTh (green)")], ["u", tr("eU (blue)")]].map(([key, label]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <span style={{ width: 74, flexShrink: 0, color: "var(--color-text-faint)", fontSize: "var(--font-size-sm)" }}>{label}</span>
                    <select value={tern[key]} onChange={(e) => setTern((p) => ({ ...p, [key]: e.target.value }))} style={{ ...numInput, minWidth: 0 }} aria-label={tr("{label} grid", { label })}>
                      <option value="">{tr("Choose a grid…")}</option>
                      {ternaryChoices(gridRasters, key, (x) => rasterMethodOf(x, geophysSurveys)).map(({ raster: r, other }) => <option key={r.id} value={r.id}>{other ? tr("{name} (not radiometric)", { name: r.name }) : r.name}</option>)}{/* #2557 */}
                    </select>
                  </div>
                ))}
                <button type="button" onClick={makeTernary} style={{ width: "100%", padding: "5px 8px", border: "1px solid var(--color-selected-border)", background: "var(--color-selected-bg)", color: "var(--color-primary)", borderRadius: 5, cursor: "pointer", fontSize: "var(--font-size-sm)" }}>{tr("Build — adds a new raster")}</button>
              </div>
            )}
          </div>
        )}
        {rasters.length === 0 && (
          <div style={{ marginTop: 14, fontSize: "var(--font-size-base)", color: "var(--color-text-muted)" }}>{tr("No rasters imported yet.")}</div>
        )}
        {rasters.map((r) => (
          <div key={r.id} style={{ marginTop: 10, padding: "9px 10px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-base)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => updateRaster(r.id, { visible: r.visible === false })} style={{ cursor: "pointer", color: r.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                {r.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
              {r.grid && !r.geochem /* #1622 — no magnetic filters for a geochemistry grid */ && !r.terrainDerivative /* #1626 — nor for a slope / aspect / curvature */ && <SlidersHorizontal role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: filterFor === r.id ? "var(--color-info)" : "var(--color-text-secondary)", flexShrink: 0 }} aria-label={tr("Filter the values of \"{name}\"", { name: r.name })} title={tr("Grid filters: RTP, first vertical derivative, upward continuation, tilt derivative, analytic signal")} onClick={() => { const opening = filterFor !== r.id; setFilterFor(opening ? r.id : null); if (opening) setFilt((f) => ({ ...f, kind: defaultFilterKind(r, rasterMethodOf(r, geophysSurveys)) })); /* #1863 — RTP only for magnetics */ }} />}
              {r.grid && <Download role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} aria-label={tr("Export the values of \"{name}\" as a GeoTIFF", { name: r.name })} title={tr("Export the values of \"{name}\" as a GeoTIFF", { name: r.name })} onClick={async () => { const epsgX = await ensureExportCrs(project); if (!epsgX) return; /* #1021 */ const g = r.grid; const res = await saveGeoTIFF(`${safeFileName(r.name)}.tif`, gridToGeoTIFF({ nx: g.nx, ny: g.ny, x0: g.x0, yTop: g.yTop, dx: g.dx, dy: g.dy, bands: [{ values: g.values }], epsg: epsgX })); if (res?.ok) setError({ info: true, text: rasterExportNote(r) }); /* #1095 — what the file holds */ }} />}{/* TASKS.csv #854 */}
              {!r.grid && r.dataUrl && <Download role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} aria-label={tr("Export the picture \"{name}\" as a GeoTIFF", { name: r.name })} title={tr("Export the picture \"{name}\" as a GeoTIFF", { name: r.name })} onClick={() => exportPicture(r)} />}{/* TASKS.csv #1860 — an RGB plan map, a scan, imagery */}
              {r.grid && <ScatterChart role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} aria-label={tr("Use the values of \"{name}\" as survey points", { name: r.name })} title={tr("Use as survey points ({nx}×{ny} grid values, {v}) — for the Geophysics inversion", { nx: r.grid.nx, ny: r.grid.ny, v: gridCellText(r.grid) })} onClick={() => gridAsSurvey(r)} />}
              {r.bbox && <Crosshair role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} aria-label={tr("Zoom the plan to \"{name}\"", { name: r.name })} title={tr("Zoom the plan to \"{name}\"", { name: r.name })} onClick={() => requestPlanZoom(r.bbox)} />}{/* TASKS.csv #2657 */}
              <Trash2 aria-label={tr("Remove raster \"{name}\"", { name: r.name })} title={tr("Remove raster \"{name}\"", { name: r.name })} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} onClick={() => { if (window.confirm(tr("Remove \"{name}\"?", { name: r.name }))) removeRaster(r.id); }} />
            </div>
            {r.terrainDerivative && r.terrainDerivative.terrainId != null && terrain?.id !== r.terrainDerivative.terrainId && ( /* TASKS.csv #1626 — made from a terrain since replaced */
              <div style={{ marginTop: 5, fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", lineHeight: 1.4 }}>{tr("Made from the terrain \"{name}\", which has since been replaced: it still shows that ground, draped on the new one. Remove it and make it again from the current terrain (Maps > Terrain > Hillshade, slope, aspect…).", { name: r.terrainDerivative.terrainName || "?" })}</div>
            )}
            {filterFor === r.id && r.grid && !r.geochem && (
              <div style={{ marginTop: 7, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <select value={filt.kind} onChange={(e) => setFilt((p) => ({ ...p, kind: e.target.value }))} style={{ ...numInput, flex: 1 }} aria-label={tr("Grid filter")}>
                    <option value="rtp">{tr("Reduction to the pole (RTP)")}</option>
                    <option value="rtpa">{tr("RTP for low latitudes (amplitude-corrected)")}</option>{/* TASKS.csv #1988 */}
                    <option value="rte">{tr("Reduction to the equator (RTE)")}</option>
                    <option value="vd1">{tr("First vertical derivative (1VD)")}</option>
                    <option value="tilt">{tr("Tilt derivative")}</option>
                    <option value="as">{tr("Analytic signal (3D)")}</option>
                    <option value="upward">{tr("Upward continuation")}</option>
                    <option value="tiltdepth">{tr("Tilt-depth (contact depths)")}</option>{/* TASKS.csv #808 */}
                    <option value="worms">{tr("Worms (edges at several heights)")}</option>{/* TASKS.csv #1988 */}
                    <option value="euler">{tr("Euler deconvolution (source depths)")}</option>{/* TASKS.csv #1985 */}
                    <option value="spectrum">{tr("Power spectrum depths + matched filter")}</option>
                  </select>
                </div>
                {(filt.kind === "rtp" || filt.kind === "rtpa" || filt.kind === "rte") && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <input type="number" placeholder={tr("Inclination °")} value={filt.inclination} onChange={(e) => setFilt((p) => ({ ...p, inclination: e.target.value, igrfSource: null }))} style={numInput} aria-label={tr("Field inclination")} />
                    <input type="number" placeholder={tr("Declination ° (true)")} value={filt.declination} onChange={(e) => setFilt((p) => ({ ...p, declination: e.target.value, igrfSource: null }))} style={numInput} aria-label={tr("Field declination, true north")} />
                  </div>
                )}
                {(filt.kind === "rtp" || filt.kind === "rtpa" || filt.kind === "rte") && ( /* TASKS.csv #2561 — I and D from IGRF-14 for the survey date */
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <input type="date" value={filt.date} onChange={(e) => setFilt((p) => ({ ...p, date: e.target.value }))} style={{ ...numInput, flex: 1 }} aria-label={tr("Survey date (for IGRF)")} />
                    <button type="button" onClick={() => fillIgrf(r)} style={{ ...numInput, cursor: "pointer", flex: "0 0 auto" }}>{tr("Fill from IGRF-14")}</button>
                    {filt.igrfSource && <div style={{ flexBasis: "100%", fontSize: "var(--font-size-xs)", color: "var(--color-text-caption)" }}>{tr("Source: {source}", { source: filt.igrfSource })}</div>}
                  </div>
                )}
                {filt.kind === "rtpa" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <input type="number" min={0} max={90} placeholder={tr("Amplitude inclination ° (blank: 20° or the field's own if steeper)")} value={filt.amplitudeInclination} onChange={(e) => setFilt((p) => ({ ...p, amplitudeInclination: e.target.value }))} style={numInput} aria-label={tr("Amplitude-correction inclination")} />
                  </div>
                )}
                {filt.kind === "euler" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <select value={filt.si} aria-label={tr("Structural index")} onChange={(e) => setFilt((p) => ({ ...p, si: e.target.value }))} style={{ ...numInput, flex: 2 }}>
                      <option value="0">{tr("SI 0: magnetic contact")}</option>
                      <option value="1">{tr("SI 1: magnetic dyke, sill or thin-sheet edge")}</option>
                      <option value="2">{tr("SI 2: magnetic pipe; gravity sphere")}</option>
                      <option value="3">{tr("SI 3: magnetic sphere (dipole)")}</option>
                    </select>
                    <input type="number" min="0" placeholder={tr("Window (m)")} value={filt.window} onChange={(e) => setFilt((p) => ({ ...p, window: e.target.value }))} style={{ ...numInput, flex: 1 }} aria-label={tr("Euler window size")} />
                  </div>
                )}
                {filt.kind === "worms" && (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                    <input type="checkbox" checked={!!filt.integrate} onChange={(e) => setFilt((p) => ({ ...p, integrate: e.target.checked }))} />{tr("Magnetic RTP grid: integrate it first (pseudo-gravity)")}
                  </label>
                )}
                {filt.kind === "upward" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <input type="number" min={1} placeholder={tr("Height (m)")} value={filt.height} onChange={(e) => setFilt((p) => ({ ...p, height: e.target.value }))} style={numInput} aria-label={tr("Upward continuation height")} />
                  </div>
                )}
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 5, lineHeight: 1.4 }}>
                  {{ rtp: tr("For total-field magnetics, assuming induced magnetization (remanence breaks it). Unstable below ~20° inclination: use RTP for low latitudes, RTE, tilt or analytic signal there."),
                     rtpa: tr("RTP whose amplitude comes from a steeper inclination (MacLeod, Jones & Dai 1993), so it stays bounded near the magnetic equator. Positions and shapes are RTP's; amplitudes come out lower. Assumes induced magnetization."), // #1988
                     rte: tr("Reduction to the equator (Leu 1982): stable at any inclination. Magnetic bodies show as lows elongated along the declination; read the lows, or flip the colour ramp."),
                     euler: tr("Source positions and depths from Euler's equation in sliding windows (Reid et al. 1990; Harmonica, in the Python engine). Run it on an RTP or gravity grid. The structural index is the source shape; the window should span an anomaly (blank: 10 cells). Takes a few seconds; the first run starts the engine."),
                     worms: tr("Edges at doubling heights of upward continuation (Hornby et al. 1999): crests of the horizontal gradient at each height. Run it on gravity, or on an RTP grid with the box ticked. Takes a few seconds on a large grid."), vd1: tr("Sharpens shallow sources; also amplifies noise."), tiltdepth: tr("Depth to the top of contacts along the tilt's zero contour: 1 / its horizontal gradient (Salem et al. 2007). Run it on an RTP grid; it assumes near-vertical contacts and reads depth below the sensor."), spectrum: tr("Radially averaged power spectrum: the slope of each straight segment gives the mean depth of a group of sources (Spector & Grant 1970). Deep and shallow segments are fitted for you; the matched filter then splits the grid into those two parts."), tilt: tr("Angle between vertical and horizontal gradients (±90°); zero-crossings trace source edges whatever the depth or amplitude."), as: tr("Peaks over source edges regardless of magnetization direction — the honest choice where remanence breaks RTP."), upward: tr("Smooths out shallow sources to show the deeper / regional field; the height is metres above the grid's observation level.") }[filt.kind]}
                </div>
                {(() => { const m = rasterMethodOf(r, geophysSurveys), why = filterBlockedBy(filt.kind, m); /* #2557 */ return why ? <div style={{ marginTop: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.4 }}>{why === "magnetic" ? tr("\"{name}\" is {method}: a reduction to the pole or equator turns a magnetic field into a vertical one, and gravity is already vertical. Use the derivatives, continuation, worms or Euler.", { name: r.name, method: tr(SURVEY_METHODS[m].label) }) : tr("\"{name}\" is {method}: these filters assume a magnetic or gravity field (a potential field), which this grid is not.", { name: r.name, method: tr(SURVEY_METHODS[m].label) })}</div> : null; })()}
                {!rasterMethodOf(r, geophysSurveys) && fieldFilterNeedsMethod(filt.kind) && ( /* TASKS.csv #2835 / #2842 */
                  <div style={{ marginTop: 6, fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", lineHeight: 1.4 }}>
                    {tr("\"{name}\" has no method set: this filter assumes a magnetic or gravity field (an RTP, a magnetic one), which an EM, radiometric or IP grid is not. Set 'This grid is' on its card, or tick to run it anyway.", { name: r.name })}
                    <label style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3, color: "var(--color-text-secondary)" }}><input type="checkbox" checked={!!assumeField[r.id]} onChange={(e) => setAssumeField((p) => ({ ...p, [r.id]: e.target.checked }))} />{tr("It is a magnetic or gravity field")}</label>
                  </div>
                )}
                <button onClick={() => runFilter(r)} disabled={filtering || !!filterBlockedBy(filt.kind, rasterMethodOf(r, geophysSurveys)) || unknownNeedsTick(r) /* #2835 */} style={{ marginTop: 6, width: "100%", padding: "5px 8px", border: "1px solid var(--color-selected-border)", background: "var(--color-selected-bg)", color: "var(--color-primary)", borderRadius: 5, cursor: filtering ? "default" : "pointer", fontSize: "var(--font-size-sm)" }}>
                  {filtering ? tr("Filtering…") : filt.kind === "spectrum" ? tr("Compute the spectrum") : tr("Apply — adds a new raster")}
                </button>
                {/* TASKS.csv #808 — the spectrum, its fitted depths and the matched-filter split */}
                {filt.kind === "spectrum" && spectrum?.rasterId === r.id && <SpectrumPanel spectrum={spectrum} onSplit={(which) => splitByDepth(r, which)} />}
              </div>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, cursor: terrain ? "pointer" : "default", opacity: terrain ? 1 : 0.45 }}>
              <input type="checkbox" checked={r.drapeMode === "terrain" || (r.drapeMode === "collars" && !!terrain)} disabled={!terrain}
                onChange={(e) => updateRaster(r.id, { drapeMode: e.target.checked ? "terrain" : "flat" })} />
              <span style={{ color: "var(--color-text-caption)" }}>{tr("Drape on terrain{v}", { v: !terrain ? tr(" (import a DEM under Maps → Terrain first)") : "" })}</span>
            </label>
            {/* TASKS.csv #2447 — with no terrain, on the collar surface (a score map's default), drawn under the holes */}
            {!terrain && collars.length >= 3 && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, cursor: "pointer" }}>
                <input type="checkbox" checked={r.drapeMode === "collars"} onChange={(e) => updateRaster(r.id, { drapeMode: e.target.checked ? "collars" : "flat" })} />
                <span style={{ color: "var(--color-text-caption)" }}>{tr("On the ground between the collars (no terrain): the holes are drawn over it")}</span>
              </label>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, opacity: r.drapeMode === "terrain" || r.drapeMode === "collars" ? 0.4 : 1 }}>
              <span style={{ color: "var(--color-text-faint)", width: 46, flexShrink: 0 }}>{tr("Elev.")}</span>
              <input type="number" value={Math.round(r.elevation)} disabled={r.drapeMode === "terrain" || r.drapeMode === "collars"} onChange={(e) => updateRaster(r.id, { elevation: Number(e.target.value) })} style={numInput} />
            </div>
            {r.grid && !r.ternary && <RasterColourControls raster={r} onUpdate={updateRaster} inputStyle={numInput} />}{/* #1236 */}
            {r.grid && <GridContourControls raster={r} inputStyle={numInput} />}{/* #1622 — contours of a geochemistry grid; #2398 — of any raster that keeps its grid (a TMI, an eU grid) */}
            {!r.grid && r.dataUrl && ( /* TASKS.csv #1623 - a colour picture's background (white fill) shown transparent */
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flex: 1, minWidth: 0 }}>
                  <input type="checkbox" checked={!!r.keyColour} onChange={async (e) => {
                    if (!e.target.checked) { updateRaster(r.id, { keyColour: null }); return; }
                    const k = await detectKeyColour(r.dataUrl);
                    updateRaster(r.id, { keyColour: k?.colour || "#ffffff" });
                  }} />
                  <span style={{ color: "var(--color-text-caption)" }}>{tr("Transparent colour")}</span>
                </label>
                {r.keyColour && <input type="color" value={r.keyColour} onChange={(e) => updateRaster(r.id, { keyColour: e.target.value })} title={tr("This colour (and colours within a few shades of it) is not drawn")} style={{ width: 28, height: 20, padding: 0, border: "1px solid var(--color-border)", background: "none" }} />}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <span style={{ color: "var(--color-text-faint)", width: 46, flexShrink: 0 }}>{tr("Opacity")}</span>
              <input type="range" min={0.1} max={1} step={0.05} value={r.opacity ?? 0.85} onChange={(e) => updateRaster(r.id, { opacity: Number(e.target.value) })} style={{ flex: 1 }} />
            </div>
            <RasterLegend raster={r} updateRaster={updateRaster} />{/* TASKS.csv #2011 */}
            {!r.grid && !r.ternary && !r.legend && r.dataUrl && <RasterPictureLegend raster={r} updateRaster={updateRaster} />}{/* TASKS.csv #1858 */}
          </div>
        ))}
      </div>

      <SidebarResizeHandle width={sidebarWidth} onResize={setSidebarWidth} />

      {!embedded && (<div className="ge-main" style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        {/* TASKS.csv #309 — was two lines of centred grey text with no icon and nothing to click,
            one of four different empty-state treatments across seven tabs. Now the shared
            EmptyState card (components/EmptyState.jsx), same as 3D View / Geochem / Geophysics.
            Kept unconditional rather than gated on rasters.length, because this pane never shows
            the rasters themselves — they render in the 3D View — so "switch tabs to see them" is
            the useful message whether or not anything is loaded yet. */}
        <EmptyState
          icon={<Image size={18} />}
          headline={rasters.length ? tr(rasters.length === 1 ? "{rasters} raster loaded" : "{rasters} rasters loaded", { rasters: rasters.length }) : tr("No rasters yet")}
          actionLabel={busy ? tr("Reading…") : tr("Import GeoTIFF / GXF…")}
          onAction={() => fileInput.current.click()}
          actionDisabled={busy}
          actionTitle={tr("Pick a georeferenced raster — GeoTIFF or Geosoft .gxf grid")}
          footnote={tr("Or drag a file straight onto this pane. Anything imported here is reprojected to the project CRS if its own CRS differs.")}
        >
          <div style={{ marginBottom: 12 }}>{tr("Georeferenced image and grid layers — orthophotos, satellite imagery, geology maps, geophysical grids — draped over the terrain. Rasters render in the")}{" "}<b>{tr("3D View")}</b>{tr(", so switch tabs after importing to see them.")}</div>
        </EmptyState>
        {dragOver && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(226,166,60,0.08)", border: "3px dashed var(--color-accent)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ fontSize: "var(--font-size-xl)", color: "var(--color-accent)", background: "var(--color-bg)", padding: "14px 22px", borderRadius: 8, border: "1px solid var(--color-accent)" }}>{tr("Drop GeoTIFF(s)/.gxf to import")}</div>
          </div>
        )}
      </div>)}
    </div>
  );
}

const numInput = { flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" };
