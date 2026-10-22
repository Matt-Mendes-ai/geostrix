import { Ribbon, RibbonGroup, RibbonButton } from "../components/Ribbon.jsx"; // TASKS.csv #458
import { ensureProjectCrs } from "../lib/projectCrsRequest.js"; // TASKS.csv #615
import { useModuleAction } from "../lib/menuRequests.js"; // TASKS.csv #565
import { projectEpsgChooser } from "../lib/adoptCrs.js"; // TASKS.csv #607
import React, { useRef, useState } from "react";
import { Image, Eye, EyeOff, Trash2, Loader2, Satellite, MapPinned, ScatterChart, SlidersHorizontal, Rainbow } from "../components/icons.js";
import SpectralIndexModal from "../components/SpectralIndexModal.jsx"; // TASKS.csv #783
import { useStore } from "../lib/store.jsx";
import { buildRasterImport, gridToSurveyRows, rasterFromGrid, ternaryRaster } from "../lib/raster.js";
import { b64ToF32, gridDeclination } from "../lib/inversion.js"; // TASKS.csv #373
import { fetchSatelliteImagery, planSatelliteFetch, SAT_LEVELS } from "../lib/satelliteFetch.js";
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
  const { rasters, addRaster, updateRaster, removeRaster, terrain, project, collars, boundaries, setLayers, projectIsEmpty, setEpsg } = useStore(); // projectIsEmpty/setEpsg: #607
  // TASKS.csv #326 — a data grid's nodes as survey points (Geophysics -> Point cloud / Inversion). Replaces
  // any earlier points made from the same grid, so doing it twice does not double the survey.
  // TASKS.csv #373 — potential-field filters on a grid's kept values; each result is a new raster
  const [filterFor, setFilterFor] = useState(null); // raster id whose filter form is open
  const [filt, setFilt] = useState({ kind: "rtp", inclination: "", declination: "", height: "" });
  const [filtering, setFiltering] = useState(false);
  const [spectrum, setSpectrum] = useState(null); // TASKS.csv #808 — { rasterId, spec, fit } for the open grid
  const runFilter = async (r) => {
    const { applyGridFilter, FILTERS, tiltDepth, radialSpectrum, fitSpectrumDepths } = await import("../lib/gridFilters.js"); // loaded on first use
    const g = r.grid;
    const params = {};
    let declGrid = null;
    if (filt.kind === "rtp") {
      const I = Number(filt.inclination), D = Number(filt.declination);
      if (filt.inclination === "" || filt.declination === "" || !(Math.abs(I) <= 90) || !(Math.abs(D) <= 180)) { setError({ info: false, text: tr("RTP needs the field inclination and declination (true north) for the survey date and place — IGRF gives both.") }); return; }
      const cx = g.x0 + (g.dx * (g.nx - 1)) / 2, cy = g.yTop - (g.dy * (g.ny - 1)) / 2;
      const d = gridDeclination(D, cx, cy, project?.epsg);
      if (!d) { setError({ info: false, text: tr("Could not compute grid convergence for this project CRS.") }); return; }
      declGrid = d.grid;
      Object.assign(params, { inclination: I, declinationTrue: D, declinationGrid: +d.grid.toFixed(3), gridConvergence: +d.convergence.toFixed(3) });
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
      if (filt.kind === "tiltdepth") {
        const td = tiltDepth({ nx: g.nx, ny: g.ny, dx: g.dx, dy: g.dy, values });
        if (!td.count) { setError({ info: false, text: tr("No tilt zero-crossings with a usable depth in \"{name}\".", { name: r.name }) }); return; }
        const nr = rasterFromGrid({ name: `${r.name} — Tilt-depth (contact depths, m)`, values: td.values, nx: g.nx, ny: g.ny, x0: g.x0, yTop: g.yTop, dx: g.dx, dy: g.dy, elevation: r.elevation,
          extra: { filter: { kind: "tiltdepth", label: "Tilt-depth (Salem et al. 2007)", params: { contactNodes: td.count, medianDepthM: Math.round(td.median) }, sourceRaster: r.name, method: "depth = 1 / |horizontal gradient of the tilt (radians)| at its zero contour, on the kept grid (gridFilters.js tiltDepth)", at: new Date().toISOString() } } });
        addRaster(nr);
        setError({ info: true, text: tr("Added \"{name}\": {n} nodes along the tilt's zero contour (the contacts), median depth {median} m below the sensor. Valid on an RTP grid over near-vertical contacts; subtract the survey's sensor height for depth below ground.", { name: nr.name, n: td.count.toLocaleString(), median: Math.round(td.median) }) });
        setFilterFor(null);
        return;
      }
      const out = applyGridFilter({ nx: g.nx, ny: g.ny, dx: g.dx, dy: g.dy, values }, filt.kind, { ...params, declination: declGrid ?? undefined });
      const label = FILTERS[filt.kind].label;
      const suffix = filt.kind === "rtp" ? ` (I ${params.inclination}°, D ${params.declinationTrue}° true)` : filt.kind === "upward" ? ` (+${params.height} m)` : "";
      const nr = rasterFromGrid({ name: `${r.name} — ${label}${suffix}`, values: out.values, nx: g.nx, ny: g.ny, x0: g.x0, yTop: g.yTop, dx: g.dx, dy: g.dy, elevation: r.elevation,
        extra: { filter: { kind: filt.kind, label, params, sourceRaster: r.name, method: "FFT on the kept grid: mean plane removed, gaps filled from neighbours, mirror-padded to >= 2x with a cosine taper (gridFilters.js)", at: new Date().toISOString() } } });
      addRaster(nr);
      setError({ info: !out.warning, text: tr("Added \"{name}\" (colours span the 2nd–98th percentile: {v}).{v2}", { name: nr.name, v: nr.colourRange.map((v) => v.toPrecision(3)).join(" to "), v2: out.warning ? " " + out.warning : "" }) });
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
      const nr = rasterFromGrid({ name: `${r.name} — ${which === "deep" ? "deep" : "shallow"} component (~${h} m, matched filter)`, values: m[which], nx: g.nx, ny: g.ny, x0: g.x0, yTop: g.yTop, dx: g.dx, dy: g.dy, elevation: r.elevation,
        extra: { filter: { kind: `matched-${which}`, label: "Matched filter (Spector & Grant 1970)", params: { deepDepthM: Math.round(fit.deep.h), shallowDepthM: Math.round(fit.shallow.h) }, sourceRaster: r.name, method: "w(k) = sqrt(P_i / (P_deep + P_shallow)) from the two fitted spectrum segments (gridFilters.js matchedFilter)", at: new Date().toISOString() } } });
      addRaster(nr);
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
  useModuleAction(["raster-satellite", "raster-georeference", "raster-spectral"], (a) => (a === "raster-satellite" ? openSatPickerRef.current?.() : a === "raster-spectral" ? openSpectralRef.current?.() : setGeorefOpen(true))); // #749 — the Maps tab's ribbon; spectral: #783
  const [sidebarWidth, setSidebarWidth] = useSidebarWidth();

  // TASKS.csv #204 — "Any freely available sat image we can import from the raster module? If so, we
  // should also have an option to match the SRTM boundary." satelliteFetch.js does the actual fetch;
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
  // TASKS.csv #129 — manual tie-point georeferencer for a scanned map/claim sketch with no embedded
  // geo tags at all (a GeoTIFF/gxf still trusts its own tags, per buildRasterImport above — this is
  // specifically for when there ARE none). GeoreferencerModal.jsx does the actual UI/math; this is
  // just the open/import wiring, same addRaster() call site as every other raster source on this page.
  const [georefOpen, setGeorefOpen] = useState(false);
  const [spectralOpen, setSpectralOpen] = useState(false); // TASKS.csv #783
  const [spectralAreas, setSpectralAreas] = useState([]); // TASKS.csv #784 — areas offered for fetching imagery
  const openSpectralRef = useRef(null);

  const defaultSatBboxLonLat = async () => {
    if (!collars.length || !project?.epsg) return null;
    const xs = collars.map((c) => c.x), ys = collars.map((c) => c.y);
    const xmin = arrMin(xs), xmax = arrMax(xs), ymin = arrMin(ys), ymax = arrMax(ys);
    const marginX = Math.max((xmax - xmin) * 0.25, 200), marginY = Math.max((ymax - ymin) * 0.25, 200);
    const corners = [
      [xmin - marginX, ymin - marginY], [xmax + marginX, ymin - marginY],
      [xmax + marginX, ymax + marginY], [xmin - marginX, ymax + marginY],
    ];
    const lonLats = await Promise.all(corners.map(([x, y]) => toLonLat(x, y, project.epsg)));
    if (lonLats.some((ll) => !ll)) return null;
    const lons = lonLats.map((ll) => ll.lon), lats = lonLats.map((ll) => ll.lat);
    return [arrMin(lons), arrMin(lats), arrMax(lons), arrMax(lats)];
  };

  const buildSatAreaOptions = async () => {
    if (!project?.epsg) return [];
    const jobs = [];
    if (terrain?.bbox) {
      const [xmin, ymin, xmax, ymax] = terrain.bbox;
      jobs.push({ id: "terrain", label: `Match terrain/SRTM: ${terrain.name}`, xmin, xmax, ymin, ymax });
    }
    for (const b of boundaries) {
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
      const lonLats = await Promise.all(corners.map(([x, y]) => toLonLat(x, y, project.epsg)));
      if (lonLats.some((ll) => !ll)) return null;
      const lons = lonLats.map((ll) => ll.lon), lats = lonLats.map((ll) => ll.lat);
      return { id: j.id, label: j.label, bboxLonLat: [arrMin(lons), arrMin(lats), arrMax(lons), arrMax(lats)] };
    }));
    return options.filter(Boolean);
  };

  // TASKS.csv #615 — as the SRTM picker: a CRS never chosen is asked for first, then the picker re-opens
  const openSatPickerRef = useRef(null);
  const openSatPicker = async () => {
    if (project?.crsSet === false) {
      const chosen = await ensureProjectCrs(project, tr("Imagery is downloaded for the place your coordinates point to, so the project needs its coordinate system first."));
      if (chosen) setTimeout(() => openSatPickerRef.current?.(), 0);
      return;
    }
    if (!project?.epsg) {
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
    const seed = await defaultSatBboxLonLat();
    const opts = await buildSatAreaOptions();
    setSpectralAreas([...(seed ? [{ id: "holes", label: tr("Around the drillholes"), bboxLonLat: seed }] : []), ...opts]);
    setSpectralOpen(true);
  };
  openSpectralRef.current = openSpectral;

  const runSatFetch = async (bboxLonLat) => {
    const [lonMin, latMin, lonMax, latMax] = bboxLonLat;
    setSatPickerOpen(false);
    setSatBusy(true);
    setSatProgress({ done: 0, total: 1 });
    try {
      const parsed = await fetchSatelliteImagery({
        lonMin, latMin, lonMax, latMax, targetEpsg: project.epsg, level: satLevel, // #781
        onProgress: (done, total) => setSatProgress({ done, total }),
      });
      addRaster({ name: parsed.name, bbox: parsed.bbox, dataUrl: parsed.dataUrl, elevation: defaultElevation });
      let msg = tr("Fetched and imported \"{name}\" for the area you picked ({tileCount} tile(s) @ zoom {zoom}, image {gridW} × {gridH} px).", { name: parsed.name, tileCount: parsed.tileCount, zoom: parsed.zoom, gridW: parsed.gridW, gridH: parsed.gridH });
      if (parsed.reprojectedTo) msg += tr(" Reprojected from WGS84 to the project's EPSG:{reprojectedTo}.", { reprojectedTo: parsed.reprojectedTo });
      if (parsed.reprojectNote) msg += ` ${parsed.reprojectNote}`;
      if (parsed.failedTiles) msg += tr(" {failedTiles} tile(s) failed to fetch and are left transparent.", { failedTiles: parsed.failedTiles });
      setError({ info: true, text: msg });
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
  const defaultElevation = collars.length ? collars.reduce((s, c) => s + c.z, 0) / collars.length : 0;

  // TASKS.csv #287 — "Source CRS (EPSG, optional)", the field the vector/collar importers have had
  // since #120/#205 and the raster side never got. Blank = fall back to the file's own CRS tag (a
  // GeoTIFF GeoKey), which is still the common case; typed in = an explicit override, which is the
  // ONLY way to correct a .gxf (no CRS tag exists in that format) or a GeoTIFF whose embedded tag is
  // wrong/absent. Session state, not project state — it describes the file being imported, not the
  // project (same reasoning as the import modal's own Source CRS field).
  const [sourceEpsg, setSourceEpsg] = useState("");

  const importRaster = async (file) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const chooseProjectEpsg = projectEpsgChooser({ isEmpty: projectIsEmpty, setEpsg, fileName: file.name }); // #607
      const { raster, msg } = await buildRasterImport(file, { epsg: project?.epsg, defaultElevation, sourceEpsg, chooseProjectEpsg });
      addRaster(raster);
      setError({ info: true, text: msg });
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
        const files = Array.from(e.dataTransfer.files || []).filter((f) => /\.(tiff?|gxf)$/i.test(f.name));
        files.forEach((f) => importRaster(f));
      }}
    >
      <div className="ge-panel" style={{ padding: "16px 14px", overflowY: "auto", width: sidebarWidth }}>
        {/* TASKS.csv #458 — Raster ribbon: the import actions; the sidebar keeps the import CRS and the rasters. */}
        <Ribbon label="Raster tools" show={!embedded}>
          <RibbonGroup label="Import">
            <RibbonButton icon={busy ? Loader2 : Image} label={busy ? "Reading…" : "GeoTIFF / GXF"} tone="data" disabled={busy} title="Import a georeferenced GeoTIFF or Geosoft .gxf grid (uses the Source CRS below)" onClick={() => fileInput.current.click()} />
            <RibbonButton icon={Satellite} label={satProgress ? `Fetching ${satProgress.done}/${satProgress.total}` : "Satellite"} tone="data" disabled={satBusy} title="Free Sentinel-2 cloudless imagery (no account) — pick an area on a map, or match an existing terrain / boundary / raster extent" onClick={openSatPicker} />
            <RibbonButton icon={MapPinned} label="Georeference" tone="data" title="Georeference a scanned map or sketch with no coordinates: click matching points and type their real X/Y" onClick={() => setGeorefOpen(true)} />
            <RibbonButton icon={Rainbow} label="Spectral index" tone="data" title="Quartz / carbonate / mafic indices from ASTER thermal emissivity, iron-oxide and clay ratios from Sentinel-2 or Landsat, or your own band arithmetic, from a multiband GeoTIFF" onClick={openSpectral} />
          </RibbonGroup>
        </Ribbon>
        <div className="ge-section-label" style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>{tr("Raster drape (GeoTIFF / Geosoft GXF)")}<InfoButton title={tr("Raster drape")} text={tr("Import a georeferenced GeoTIFF (mag/radiometrics grid, orthophoto, whatever), or a Geosoft .gxf grid export (the plain-text Geosoft interchange format; the proprietary binary .grd isn't supported, no public spec to implement against), as a flat plane in the 3D view — set its elevation and opacity below once imported, or drape it onto a terrain surface (import one under Maps → Terrain first). If the file's coordinates aren't already in the project's EPSG ({v}), set Source CRS below and the raster is reprojected on import. Drag files in anywhere on this page, or use the button below.", { v: project?.epsg ?? "?" })} />
        </div>
        {/* TASKS.csv #287 — Source CRS override. Sits ABOVE the import button (and applies to
            drag-dropped files too) because it has to be set before the file is read, not after. */}
        <SourceCrsField
          value={sourceEpsg} onChange={(c) => setSourceEpsg(c === "" ? "" : String(c))}
          defaultText={tr("From the file's own tag, else the project CRS ({crs})", { crs: crsName(project?.epsg) || `EPSG:${project?.epsg ?? "?"}` })}
          title={tr("The CRS the file's own coordinates are in. Leave it on the file's tag for a GeoTIFF; set it for a .gxf (that format has no CRS tag) or when a file's tag is wrong — the raster is then reprojected into the project CRS on import.")}
        />
        <input
          ref={fileInput}
          type="file"
          accept=".tif,.tiff,.gxf"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { Array.from(e.target.files || []).forEach((f) => importRaster(f)); e.target.value = ""; }}
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
              const p = bbox ? planSatelliteFetch(bbox, satLevel) : null;
              return (
                <span style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 10, fontSize: "var(--font-size-sm)", color: "#5a6472" }}>
                  <select value={satLevel} onChange={(e) => setSatLevel(e.target.value)} aria-label={tr("Image resolution")} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)" }}
                    title={tr("Higher levels download more tiles for a sharper image of large areas. Sentinel-2 imagery has 10 m pixels: past that, a higher level adds nothing.")}>
                    {Object.entries(SAT_LEVELS).map(([k, l]) => <option key={k} value={k}>{tr("{label} resolution", { label: l.label })}</option>)}
                  </select>
                  {p && <span title={tr("zoom {zoom}: {tilesX} × {tilesY} tiles; image {gridW} × {gridH} px", { zoom: p.zoom, tilesX: p.tilesX, tilesY: p.tilesY, gridW: p.gridW, gridH: p.gridH })}>{tr("~{v} m pixels · {tiles} tiles · ~{v2} MB{v3}", { v: Math.round(p.pixelM), tiles: p.tiles, v2: p.downloadMB < 1 ? "<1" : Math.round(p.downloadMB), v3: p.nativeLimited ? tr(" · imagery's finest (10 m)") : "" })}</span>}
                </span>
              );
            }}
          />
        )}
        {spectralOpen && ( // TASKS.csv #783
          <SpectralIndexModal epsg={project?.epsg} defaultElevation={defaultElevation} sourceEpsg={sourceEpsg} areaOptions={spectralAreas}
            onClose={() => setSpectralOpen(false)}
            onImport={(raster, msg) => { [].concat(raster).forEach((r) => addRaster({ ...r, elevation: defaultElevation })); /* an array: the #807 depth + wavelength maps */ setSpectralOpen(false); setError({ info: true, text: msg }); }} />
        )}
        {/* projectEpsg: TASKS.csv #290 — lets the tie-point table declare its own CRS. */}
        {georefOpen && (
          <GeoreferencerModal
            projectEpsg={project?.epsg}
            onClose={() => setGeorefOpen(false)}
            onImport={(raster) => {
              addRaster({ ...raster, elevation: defaultElevation });
              setGeorefOpen(false);
              setError({ info: true, text: tr("Georeferenced and imported \"{name}\".", { name: raster.name }) });
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
            <button type="button" onClick={() => setTern((p) => ({ ...p, open: !p.open }))} aria-expanded={tern.open} style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg-subtle)", color: "var(--color-text)", cursor: "pointer", fontSize: "var(--font-size-sm)", textAlign: "left" }}>{tr("Radiometric ternary image (K-eTh-eU)…")}</button>
            {tern.open && (
              <div style={{ marginTop: 6, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: 5 }}>
                {[["k", "K (red)"], ["th", tr("eTh (green)")], ["u", tr("eU (blue)")]].map(([key, label]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <span style={{ width: 74, flexShrink: 0, color: "var(--color-text-faint)", fontSize: "var(--font-size-sm)" }}>{label}</span>
                    <select value={tern[key]} onChange={(e) => setTern((p) => ({ ...p, [key]: e.target.value }))} style={{ ...numInput, minWidth: 0 }} aria-label={tr("{label} grid", { label })}>
                      <option value="">{tr("Choose a grid…")}</option>
                      {gridRasters.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
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
              {r.grid && <SlidersHorizontal role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: filterFor === r.id ? "var(--color-info)" : "var(--color-text-secondary)", flexShrink: 0 }} aria-label={tr("Filter the values of \"{name}\"", { name: r.name })} title={tr("Grid filters: RTP, first vertical derivative, upward continuation, tilt derivative, analytic signal")} onClick={() => setFilterFor(filterFor === r.id ? null : r.id)} />}
              {r.grid && <ScatterChart role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} aria-label={tr("Use the values of \"{name}\" as survey points", { name: r.name })} title={tr("Use as survey points ({nx}×{ny} grid values, {v} m) — for the Geophysics inversion", { nx: r.grid.nx, ny: r.grid.ny, v: +r.grid.dx.toFixed(1) })} onClick={() => gridAsSurvey(r)} />}
              <Trash2 aria-label={tr("Remove raster \"{name}\"", { name: r.name })} title={tr("Remove raster \"{name}\"", { name: r.name })} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} onClick={() => { if (window.confirm(tr("Remove \"{name}\"?", { name: r.name }))) removeRaster(r.id); }} />
            </div>
            {filterFor === r.id && r.grid && (
              <div style={{ marginTop: 7, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <select value={filt.kind} onChange={(e) => setFilt((p) => ({ ...p, kind: e.target.value }))} style={{ ...numInput, flex: 1 }} aria-label={tr("Grid filter")}>
                    <option value="rtp">{tr("Reduction to the pole (RTP)")}</option>
                    <option value="vd1">{tr("First vertical derivative (1VD)")}</option>
                    <option value="tilt">{tr("Tilt derivative")}</option>
                    <option value="as">{tr("Analytic signal (3D)")}</option>
                    <option value="upward">{tr("Upward continuation")}</option>
                    <option value="tiltdepth">{tr("Tilt-depth (contact depths)")}</option>{/* TASKS.csv #808 */}
                    <option value="spectrum">{tr("Power spectrum depths + matched filter")}</option>
                  </select>
                </div>
                {filt.kind === "rtp" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <input type="number" placeholder={tr("Inclination °")} value={filt.inclination} onChange={(e) => setFilt((p) => ({ ...p, inclination: e.target.value }))} style={numInput} aria-label={tr("Field inclination")} />
                    <input type="number" placeholder={tr("Declination ° (true)")} value={filt.declination} onChange={(e) => setFilt((p) => ({ ...p, declination: e.target.value }))} style={numInput} aria-label={tr("Field declination, true north")} />
                  </div>
                )}
                {filt.kind === "upward" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <input type="number" min={1} placeholder={tr("Height (m)")} value={filt.height} onChange={(e) => setFilt((p) => ({ ...p, height: e.target.value }))} style={numInput} aria-label={tr("Upward continuation height")} />
                  </div>
                )}
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 5, lineHeight: 1.4 }}>
                  {{ rtp: tr("For total-field magnetics, assuming induced magnetization (remanence breaks it). Unstable below ~20° inclination — use tilt or analytic signal there."), vd1: tr("Sharpens shallow sources; also amplifies noise."), tiltdepth: tr("Depth to the top of contacts along the tilt's zero contour: 1 / its horizontal gradient (Salem et al. 2007). Run it on an RTP grid; it assumes near-vertical contacts and reads depth below the sensor."), spectrum: tr("Radially averaged power spectrum: the slope of each straight segment gives the mean depth of a group of sources (Spector & Grant 1970). Deep and shallow segments are fitted for you; the matched filter then splits the grid into those two parts."), tilt: tr("Angle between vertical and horizontal gradients (±90°); zero-crossings trace source edges whatever the depth or amplitude."), as: tr("Peaks over source edges regardless of magnetization direction — the honest choice where remanence breaks RTP."), upward: tr("Smooths out shallow sources to show the deeper / regional field; the height is metres above the grid's observation level.") }[filt.kind]}
                </div>
                <button onClick={() => runFilter(r)} disabled={filtering} style={{ marginTop: 6, width: "100%", padding: "5px 8px", border: "1px solid var(--color-selected-border)", background: "var(--color-selected-bg)", color: "var(--color-primary)", borderRadius: 5, cursor: filtering ? "default" : "pointer", fontSize: "var(--font-size-sm)" }}>
                  {filtering ? tr("Filtering…") : filt.kind === "spectrum" ? tr("Compute the spectrum") : tr("Apply — adds a new raster")}
                </button>
                {/* TASKS.csv #808 — the spectrum, its fitted depths and the matched-filter split */}
                {filt.kind === "spectrum" && spectrum?.rasterId === r.id && <SpectrumPanel spectrum={spectrum} onSplit={(which) => splitByDepth(r, which)} />}
              </div>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, cursor: terrain ? "pointer" : "default", opacity: terrain ? 1 : 0.45 }}>
              <input type="checkbox" checked={r.drapeMode === "terrain"} disabled={!terrain}
                onChange={(e) => updateRaster(r.id, { drapeMode: e.target.checked ? "terrain" : "flat" })} />
              <span style={{ color: "var(--color-text-caption)" }}>{tr("Drape on terrain{v}", { v: !terrain ? tr(" (import a DEM under Maps → Terrain first)") : "" })}</span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, opacity: r.drapeMode === "terrain" ? 0.4 : 1 }}>
              <span style={{ color: "var(--color-text-faint)", width: 46, flexShrink: 0 }}>{tr("Elev.")}</span>
              <input type="number" value={Math.round(r.elevation)} disabled={r.drapeMode === "terrain"} onChange={(e) => updateRaster(r.id, { elevation: Number(e.target.value) })} style={numInput} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <span style={{ color: "var(--color-text-faint)", width: 46, flexShrink: 0 }}>{tr("Opacity")}</span>
              <input type="range" min={0.1} max={1} step={0.05} value={r.opacity ?? 0.85} onChange={(e) => updateRaster(r.id, { opacity: Number(e.target.value) })} style={{ flex: 1 }} />
            </div>
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
