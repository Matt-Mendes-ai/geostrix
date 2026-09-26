import { Ribbon, RibbonGroup, RibbonButton } from "../components/Ribbon.jsx"; // TASKS.csv #458
import React, { useRef, useState } from "react";
import { Image, Eye, EyeOff, Trash2, Loader2, Satellite, MapPinned, ScatterChart, SlidersHorizontal } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { buildRasterImport, gridToSurveyRows, rasterFromGrid, ternaryRaster } from "../lib/raster.js";
import { b64ToF32, gridDeclination } from "../lib/inversion.js"; // TASKS.csv #373
import { fetchSatelliteImagery } from "../lib/satelliteFetch.js";
import { toLonLat } from "../lib/reproject.js";
import InfoButton from "../components/InfoButton.jsx";
import BasemapView from "../components/BasemapView.jsx";
import GeoreferencerModal from "../components/GeoreferencerModal.jsx";
import SidebarResizeHandle from "../components/SidebarResizeHandle.jsx";
import { useSidebarWidth } from "../lib/useSidebarWidth.js";
import EmptyState from "../components/EmptyState.jsx"; // TASKS.csv #309
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { arrMin, arrMax } from "../lib/arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)

// TASKS.csv — split out of the Geophysics module into its own tab (user request: "let's make a
// separate Module for Raster, not within geophysics"). Geophysics had accumulated point-cloud/UBC
// mesh/boundary/terrain import alongside raster drape import in one long sidebar, which buried the
// raster controls among a lot of unrelated stuff; rasters (imagery/value-grid drapes) get their own
// home here. Terrain (SRTM/DEM) deliberately STAYS in Geophysics — it's elevation data feeding the 3D
// scene's actual ground surface, conceptually closer to the voxel/boundary/geophysics-point workflows
// already there than to a flat imagery drape, and splitting it out too wasn't part of what was asked.
// A .tif/.gxf dropped directly on the Geophysics tab still imports as a raster exactly like before —
// see that module's onDrop, which calls the same buildRasterImport() helper this module uses (raster.js).
export default function RasterModule() {
  const { rasters, addRaster, updateRaster, removeRaster, terrain, project, collars, boundaries, setLayers } = useStore();
  // TASKS.csv #326 — a data grid's nodes as survey points (Geophysics -> Point cloud / Inversion). Replaces
  // any earlier points made from the same grid, so doing it twice does not double the survey.
  // TASKS.csv #373 — potential-field filters on a grid's kept values; each result is a new raster
  const [filterFor, setFilterFor] = useState(null); // raster id whose filter form is open
  const [filt, setFilt] = useState({ kind: "rtp", inclination: "", declination: "", height: "" });
  const [filtering, setFiltering] = useState(false);
  const runFilter = async (r) => {
    const { applyGridFilter, FILTERS } = await import("../lib/gridFilters.js"); // loaded on first use
    const g = r.grid;
    const params = {};
    let declGrid = null;
    if (filt.kind === "rtp") {
      const I = Number(filt.inclination), D = Number(filt.declination);
      if (filt.inclination === "" || filt.declination === "" || !(Math.abs(I) <= 90) || !(Math.abs(D) <= 180)) { setError({ info: false, text: "RTP needs the field inclination and declination (true north) for the survey date and place — IGRF gives both." }); return; }
      const cx = g.x0 + (g.dx * (g.nx - 1)) / 2, cy = g.yTop - (g.dy * (g.ny - 1)) / 2;
      const d = gridDeclination(D, cx, cy, project?.epsg);
      if (!d) { setError({ info: false, text: "Could not compute grid convergence for this project CRS." }); return; }
      declGrid = d.grid;
      Object.assign(params, { inclination: I, declinationTrue: D, declinationGrid: +d.grid.toFixed(3), gridConvergence: +d.convergence.toFixed(3) });
    }
    if (filt.kind === "upward") {
      if (!(Number(filt.height) > 0)) { setError({ info: false, text: "Enter how many metres to continue upward." }); return; }
      params.height = Number(filt.height);
    }
    setFiltering(true);
    await new Promise((res) => setTimeout(res, 30)); // let the busy state paint before the FFTs block
    try {
      const values = b64ToF32(g.values);
      const out = applyGridFilter({ nx: g.nx, ny: g.ny, dx: g.dx, dy: g.dy, values }, filt.kind, { ...params, declination: declGrid ?? undefined });
      const label = FILTERS[filt.kind].label;
      const suffix = filt.kind === "rtp" ? ` (I ${params.inclination}°, D ${params.declinationTrue}° true)` : filt.kind === "upward" ? ` (+${params.height} m)` : "";
      const nr = rasterFromGrid({ name: `${r.name} — ${label}${suffix}`, values: out.values, nx: g.nx, ny: g.ny, x0: g.x0, yTop: g.yTop, dx: g.dx, dy: g.dy, elevation: r.elevation,
        extra: { filter: { kind: filt.kind, label, params, sourceRaster: r.name, method: "FFT on the kept grid: mean plane removed, gaps filled from neighbours, mirror-padded to >= 2x with a cosine taper (gridFilters.js)", at: new Date().toISOString() } } });
      addRaster(nr);
      setError({ info: !out.warning, text: `Added "${nr.name}" (colours span the 2nd–98th percentile: ${nr.colourRange.map((v) => v.toPrecision(3)).join(" to ")}).${out.warning ? " " + out.warning : ""}` });
      setFilterFor(null);
    } catch (err) {
      setError({ info: false, text: `Filter failed: ${err.message}` });
    } finally { setFiltering(false); }
  };
  // TASKS.csv #375 — radiometric ternary image from three grids with kept values
  const [tern, setTern] = useState({ open: false, k: "", th: "", u: "" });
  const gridRasters = rasters.filter((r) => r.grid);
  const makeTernary = () => {
    const pick = (id) => rasters.find((r) => r.id === id);
    const kR = pick(tern.k), thR = pick(tern.th), uR = pick(tern.u);
    if (!kR || !thR || !uR) { setError({ info: false, text: "Choose the K, eTh and eU grids." }); return; }
    try {
      const { raster, covered, ranges } = ternaryRaster({ kRaster: kR, thRaster: thR, uRaster: uR, elevation: kR.elevation });
      addRaster(raster);
      const f = (r) => `${r[0].toPrecision(3)}–${r[1].toPrecision(3)}`;
      setError({ info: true, text: `Added the ternary image (${covered.toLocaleString()} nodes). Stretches (2nd–98th percentile): K ${f(ranges[0])}, eTh ${f(ranges[1])}, eU ${f(ranges[2])}. Red = K, green = eTh, blue = eU; white = high in all three.` });
      setTern((p) => ({ ...p, open: false }));
    } catch (err) { setError({ info: false, text: `Ternary image failed: ${err.message}` }); }
  };
  const gridAsSurvey = (r) => {
    const { rows, stride, spacing } = gridToSurveyRows(r);
    if (!rows.length) { setError({ info: false, text: `"${r.name}" has no valid grid values.` }); return; }
    const src = rows[0]._src;
    setLayers((l) => ({ ...l, geophys_pts: [...(l.geophys_pts || []).filter((p) => p._src !== src), ...rows] }));
    setError({ info: true, text: `Added ${rows.length.toLocaleString()} survey points from "${r.name}"${stride > 1 ? ` (one node in ${stride} each way, ${+spacing[0].toFixed(1)} m apart, to stay within the inversion's 20,000-station limit)` : ""} as the survey "${src}". They have no elevation (grid nodes, not flight positions): in Geophysics → Inversion choose "Sensor is a fixed height above terrain" and enter the survey's nominal height. Not drawn in 3D without an elevation — the raster itself shows the data.` });
  };
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef(null);
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
  // TASKS.csv #129 — manual tie-point georeferencer for a scanned map/claim sketch with no embedded
  // geo tags at all (a GeoTIFF/gxf still trusts its own tags, per buildRasterImport above — this is
  // specifically for when there ARE none). GeoreferencerModal.jsx does the actual UI/math; this is
  // just the open/import wiring, same addRaster() call site as every other raster source on this page.
  const [georefOpen, setGeorefOpen] = useState(false);

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

  const openSatPicker = async () => {
    if (!project?.epsg) {
      setError({ info: false, text: "Project EPSG isn't set — can't reproject fetched imagery into project coordinates." });
      return;
    }
    setError(null);
    const seed = await defaultSatBboxLonLat();
    setSatSeedBbox(seed);
    setSatSeedLonLat(seed ? { lon: (seed[0] + seed[2]) / 2, lat: (seed[1] + seed[3]) / 2 } : null);
    setSatAreaOptions(await buildSatAreaOptions());
    setSatPickerOpen(true);
  };

  const runSatFetch = async (bboxLonLat) => {
    const [lonMin, latMin, lonMax, latMax] = bboxLonLat;
    setSatPickerOpen(false);
    setSatBusy(true);
    setSatProgress({ done: 0, total: 1 });
    try {
      const parsed = await fetchSatelliteImagery({
        lonMin, latMin, lonMax, latMax, targetEpsg: project.epsg,
        onProgress: (done, total) => setSatProgress({ done, total }),
      });
      addRaster({ name: parsed.name, bbox: parsed.bbox, dataUrl: parsed.dataUrl, elevation: defaultElevation });
      let msg = `Fetched and imported "${parsed.name}" for the area you picked (${parsed.tileCount} tile(s) @ zoom ${parsed.zoom}).`;
      if (parsed.reprojectedTo) msg += ` Reprojected from WGS84 to the project's EPSG:${parsed.reprojectedTo}.`;
      if (parsed.reprojectNote) msg += ` ${parsed.reprojectNote}`;
      if (parsed.failedTiles) msg += ` ${parsed.failedTiles} tile(s) failed to fetch and are left transparent.`;
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
      const { raster, msg } = await buildRasterImport(file, { epsg: project?.epsg, defaultElevation, sourceEpsg });
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
      style={{ width: "100%" }}
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
        <Ribbon label="Raster tools">
          <RibbonGroup label="Import">
            <RibbonButton icon={busy ? Loader2 : Image} label={busy ? "Reading…" : "GeoTIFF / GXF"} tone="data" disabled={busy} title="Import a georeferenced GeoTIFF or Geosoft .gxf grid (uses the Source CRS below)" onClick={() => fileInput.current.click()} />
            <RibbonButton icon={Satellite} label={satProgress ? `Fetching ${satProgress.done}/${satProgress.total}` : "Satellite"} tone="data" disabled={satBusy} title="Free Sentinel-2 cloudless imagery (no account) — pick an area on a map, or match an existing terrain / boundary / raster extent" onClick={openSatPicker} />
            <RibbonButton icon={MapPinned} label="Georeference" tone="data" title="Georeference a scanned map or sketch with no coordinates: click matching points and type their real X/Y" onClick={() => setGeorefOpen(true)} />
          </RibbonGroup>
        </Ribbon>
        <div className="ge-section-label" style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
          Raster drape (GeoTIFF / Geosoft GXF)
          <InfoButton title="Raster drape" text={`Import a georeferenced GeoTIFF (mag/radiometrics grid, orthophoto, whatever), or a Geosoft .gxf grid export (the plain-text Geosoft interchange format; the proprietary binary .grd isn't supported, no public spec to implement against), as a flat plane in the 3D view — set its elevation and opacity below once imported, or drape it onto a terrain surface (import one under Geophysics → Terrain first). If the file's coordinates aren't already in the project's EPSG (${project?.epsg ?? "?"}), set Source CRS below and the raster is reprojected on import. Drag files in anywhere on this page, or use the button below.`} />
        </div>
        {/* TASKS.csv #287 — Source CRS override. Sits ABOVE the import button (and applies to
            drag-dropped files too) because it has to be set before the file is read, not after. */}
        <label style={{ display: "block", fontSize: "var(--font-size-sm)", color: "var(--color-text-caption)", marginBottom: 8 }}>
          Source CRS (EPSG, optional)
          <input
            type="number" value={sourceEpsg} placeholder={`blank = use the file's own tag, else assume EPSG:${project?.epsg ?? "?"}`}
            onChange={(e) => setSourceEpsg(e.target.value)}
            title="The CRS the file's own coordinates are in. Leave blank to trust a GeoTIFF's embedded CRS tag. Set it for a .gxf (that format has no CRS tag at all) or when a file's tag is wrong — the raster is then reprojected into the project's EPSG on import."
            style={{ width: "100%", boxSizing: "border-box", marginTop: 3, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 7px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" }}
          />
        </label>
        {(Number(sourceEpsg) === 4267 || (Number(sourceEpsg) >= 26701 && Number(sourceEpsg) <= 26722)) && (
          <div style={{ fontSize: "var(--font-size-sm)", color: "#e0a030", marginTop: -4, marginBottom: 8, lineHeight: 1.4 }}>
            ⚠ NAD27 (TASKS.csv #299): an approximate NAD27→NAD83 datum shift is applied (EPSG:1179, a
            published 3-parameter fit for Alberta/BC — typically within ~10&nbsp;m). Not survey-grade;
            that needs a grid-based (NTv2) transform, which GeoStrix doesn't ship yet.
          </div>
        )}
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
            title="Draw the area to fetch satellite imagery for"
            confirmLabel="Fetch imagery for this area"
            lon={satSeedLonLat?.lon}
            lat={satSeedLonLat?.lat}
            initialBboxLonLat={satSeedBbox}
            areaOptions={satAreaOptions}
            onClose={() => setSatPickerOpen(false)}
            onConfirm={runSatFetch}
          />
        )}
        {/* projectEpsg: TASKS.csv #290 — lets the tie-point table declare its own CRS. */}
        {georefOpen && (
          <GeoreferencerModal
            projectEpsg={project?.epsg}
            onClose={() => setGeorefOpen(false)}
            onImport={(raster) => {
              addRaster({ ...raster, elevation: defaultElevation });
              setGeorefOpen(false);
              setError({ info: true, text: `Georeferenced and imported "${raster.name}".` });
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
            <button type="button" onClick={() => setTern((p) => ({ ...p, open: !p.open }))} aria-expanded={tern.open} style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg-subtle)", color: "var(--color-text)", cursor: "pointer", fontSize: "var(--font-size-sm)", textAlign: "left" }}>
              Radiometric ternary image (K-eTh-eU)…
            </button>
            {tern.open && (
              <div style={{ marginTop: 6, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: 5 }}>
                {[["k", "K (red)"], ["th", "eTh (green)"], ["u", "eU (blue)"]].map(([key, label]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <span style={{ width: 74, flexShrink: 0, color: "var(--color-text-faint)", fontSize: "var(--font-size-sm)" }}>{label}</span>
                    <select value={tern[key]} onChange={(e) => setTern((p) => ({ ...p, [key]: e.target.value }))} style={{ ...numInput, minWidth: 0 }} aria-label={`${label} grid`}>
                      <option value="">Choose a grid…</option>
                      {gridRasters.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                ))}
                <button type="button" onClick={makeTernary} style={{ width: "100%", padding: "5px 8px", border: "1px solid var(--color-selected-border)", background: "var(--color-selected-bg)", color: "var(--color-primary)", borderRadius: 5, cursor: "pointer", fontSize: "var(--font-size-sm)" }}>Build — adds a new raster</button>
              </div>
            )}
          </div>
        )}
        {rasters.length === 0 && (
          <div style={{ marginTop: 14, fontSize: "var(--font-size-base)", color: "var(--color-text-muted)" }}>No rasters imported yet.</div>
        )}
        {rasters.map((r) => (
          <div key={r.id} style={{ marginTop: 10, padding: "9px 10px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-base)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => updateRaster(r.id, { visible: r.visible === false })} style={{ cursor: "pointer", color: r.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                {r.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
              {r.grid && <SlidersHorizontal role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: filterFor === r.id ? "var(--color-info)" : "var(--color-text-secondary)", flexShrink: 0 }} aria-label={`Filter the values of "${r.name}"`} title="Grid filters: RTP, first vertical derivative, upward continuation, tilt derivative, analytic signal" onClick={() => setFilterFor(filterFor === r.id ? null : r.id)} />}
              {r.grid && <ScatterChart role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} aria-label={`Use the values of "${r.name}" as survey points`} title={`Use as survey points (${r.grid.nx}×${r.grid.ny} grid values, ${+r.grid.dx.toFixed(1)} m) — for the Geophysics inversion`} onClick={() => gridAsSurvey(r)} />}
              <Trash2 aria-label={`Remove raster "${r.name}"`} title={`Remove raster "${r.name}"`} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} onClick={() => { if (window.confirm(`Remove "${r.name}"?`)) removeRaster(r.id); }} />
            </div>
            {filterFor === r.id && r.grid && (
              <div style={{ marginTop: 7, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <select value={filt.kind} onChange={(e) => setFilt((p) => ({ ...p, kind: e.target.value }))} style={{ ...numInput, flex: 1 }} aria-label="Grid filter">
                    <option value="rtp">Reduction to the pole (RTP)</option>
                    <option value="vd1">First vertical derivative (1VD)</option>
                    <option value="tilt">Tilt derivative</option>
                    <option value="as">Analytic signal (3D)</option>
                    <option value="upward">Upward continuation</option>
                  </select>
                </div>
                {filt.kind === "rtp" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <input type="number" placeholder="Inclination °" value={filt.inclination} onChange={(e) => setFilt((p) => ({ ...p, inclination: e.target.value }))} style={numInput} aria-label="Field inclination" />
                    <input type="number" placeholder="Declination ° (true)" value={filt.declination} onChange={(e) => setFilt((p) => ({ ...p, declination: e.target.value }))} style={numInput} aria-label="Field declination, true north" />
                  </div>
                )}
                {filt.kind === "upward" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <input type="number" min={1} placeholder="Height (m)" value={filt.height} onChange={(e) => setFilt((p) => ({ ...p, height: e.target.value }))} style={numInput} aria-label="Upward continuation height" />
                  </div>
                )}
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 5, lineHeight: 1.4 }}>
                  {{ rtp: "For total-field magnetics, assuming induced magnetisation (remanence breaks it). Unstable below ~20° inclination — use tilt or analytic signal there.", vd1: "Sharpens shallow sources; also amplifies noise.", tilt: "Angle between vertical and horizontal gradients (±90°); zero-crossings trace source edges whatever the depth or amplitude.", as: "Peaks over source edges regardless of magnetisation direction — the honest choice where remanence breaks RTP.", upward: "Smooths out shallow sources to show the deeper / regional field; the height is metres above the grid's observation level." }[filt.kind]}
                </div>
                <button onClick={() => runFilter(r)} disabled={filtering} style={{ marginTop: 6, width: "100%", padding: "5px 8px", border: "1px solid var(--color-selected-border)", background: "var(--color-selected-bg)", color: "var(--color-primary)", borderRadius: 5, cursor: filtering ? "default" : "pointer", fontSize: "var(--font-size-sm)" }}>
                  {filtering ? "Filtering…" : "Apply — adds a new raster"}
                </button>
              </div>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, cursor: terrain ? "pointer" : "default", opacity: terrain ? 1 : 0.45 }}>
              <input type="checkbox" checked={r.drapeMode === "terrain"} disabled={!terrain}
                onChange={(e) => updateRaster(r.id, { drapeMode: e.target.checked ? "terrain" : "flat" })} />
              <span style={{ color: "var(--color-text-caption)" }}>Drape on terrain{!terrain ? " (import a DEM under Geophysics → Terrain first)" : ""}</span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, opacity: r.drapeMode === "terrain" ? 0.4 : 1 }}>
              <span style={{ color: "var(--color-text-faint)", width: 46, flexShrink: 0 }}>Elev.</span>
              <input type="number" value={Math.round(r.elevation)} disabled={r.drapeMode === "terrain"} onChange={(e) => updateRaster(r.id, { elevation: Number(e.target.value) })} style={numInput} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <span style={{ color: "var(--color-text-faint)", width: 46, flexShrink: 0 }}>Opacity</span>
              <input type="range" min={0.1} max={1} step={0.05} value={r.opacity ?? 0.85} onChange={(e) => updateRaster(r.id, { opacity: Number(e.target.value) })} style={{ flex: 1 }} />
            </div>
          </div>
        ))}
      </div>

      <SidebarResizeHandle width={sidebarWidth} onResize={setSidebarWidth} />

      <div className="ge-main" style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        {/* TASKS.csv #309 — was two lines of centred grey text with no icon and nothing to click,
            one of four different empty-state treatments across seven tabs. Now the shared
            EmptyState card (components/EmptyState.jsx), same as 3D View / Geochem / Geophysics.
            Kept unconditional rather than gated on rasters.length, because this pane never shows
            the rasters themselves — they render in the 3D View — so "switch tabs to see them" is
            the useful message whether or not anything is loaded yet. */}
        <EmptyState
          icon={<Image size={18} />}
          headline={rasters.length ? `${rasters.length} raster${rasters.length === 1 ? "" : "s"} loaded` : "No rasters yet"}
          actionLabel={busy ? "Reading…" : "Import GeoTIFF / GXF…"}
          onAction={() => fileInput.current.click()}
          actionDisabled={busy}
          actionTitle="Pick a georeferenced raster — GeoTIFF or Geosoft .gxf grid"
          footnote="Or drag a file straight onto this pane. Anything imported here is reprojected to the project CRS if its own CRS differs."
        >
          <div style={{ marginBottom: 12 }}>
            Georeferenced image and grid layers — orthophotos, satellite imagery, geology maps, geophysical grids — draped over the terrain. Rasters render in the <b>3D View</b>, so switch tabs after importing to see them.
          </div>
        </EmptyState>
        {dragOver && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(226,166,60,0.08)", border: "3px dashed var(--color-accent)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ fontSize: "var(--font-size-xl)", color: "var(--color-accent)", background: "var(--color-bg)", padding: "14px 22px", borderRadius: 8, border: "1px solid var(--color-accent)" }}>Drop GeoTIFF(s)/.gxf to import</div>
          </div>
        )}
      </div>
    </div>
  );
}

const pBtn = { display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "9px 10px", marginBottom: 8, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", fontSize: "var(--font-size-base)", cursor: "pointer", justifyContent: "flex-start" };
const numInput = { flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" };
