import React, { useRef, useState } from "react";
import { Image, Eye, EyeOff, Trash2, Loader2, Satellite, MapPinned } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { buildRasterImport } from "../lib/raster.js";
import { fetchSatelliteImagery } from "../lib/satelliteFetch.js";
import { toLonLat } from "../lib/reproject.js";
import InfoButton from "../components/InfoButton.jsx";
import BasemapView from "../components/BasemapView.jsx";
import GeoreferencerModal from "../components/GeoreferencerModal.jsx";
import SidebarResizeHandle from "../components/SidebarResizeHandle.jsx";
import { useSidebarWidth } from "../lib/useSidebarWidth.js";

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
  const { rasters, addRaster, updateRaster, removeRaster, terrain, project, collars, boundaries } = useStore();
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
    const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
    const marginX = Math.max((xmax - xmin) * 0.25, 200), marginY = Math.max((ymax - ymin) * 0.25, 200);
    const corners = [
      [xmin - marginX, ymin - marginY], [xmax + marginX, ymin - marginY],
      [xmax + marginX, ymax + marginY], [xmin - marginX, ymax + marginY],
    ];
    const lonLats = await Promise.all(corners.map(([x, y]) => toLonLat(x, y, project.epsg)));
    if (lonLats.some((ll) => !ll)) return null;
    const lons = lonLats.map((ll) => ll.lon), lats = lonLats.map((ll) => ll.lat);
    return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
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
      jobs.push({ id: `boundary_${b.id}`, label: `Boundary: ${b.name}`, xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys) });
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
      return { id: j.id, label: j.label, bboxLonLat: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] };
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
        <div className="ge-section-label" style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
          Raster drape (GeoTIFF / Geosoft GXF)
          <InfoButton title="Raster drape" text={`Import a georeferenced GeoTIFF (mag/radiometrics grid, orthophoto, whatever), or a Geosoft .gxf grid export (the plain-text Geosoft interchange format; the proprietary binary .grd isn't supported, no public spec to implement against), as a flat plane in the 3D view — set its elevation and opacity below once imported, or drape it onto a terrain surface (import one under Geophysics → Terrain first). If the file's coordinates aren't already in the project's EPSG (${project?.epsg ?? "?"}), set Source CRS below and the raster is reprojected on import. Drag files in anywhere on this page, or use the button below.`} />
        </div>
        {/* TASKS.csv #287 — Source CRS override. Sits ABOVE the import button (and applies to
            drag-dropped files too) because it has to be set before the file is read, not after. */}
        <label style={{ display: "block", fontSize: 10.5, color: "var(--color-text-caption)", marginBottom: 8 }}>
          Source CRS (EPSG, optional)
          <input
            type="number" value={sourceEpsg} placeholder={`blank = use the file's own tag, else assume EPSG:${project?.epsg ?? "?"}`}
            onChange={(e) => setSourceEpsg(e.target.value)}
            title="The CRS the file's own coordinates are in. Leave blank to trust a GeoTIFF's embedded CRS tag. Set it for a .gxf (that format has no CRS tag at all) or when a file's tag is wrong — the raster is then reprojected into the project's EPSG on import."
            style={{ width: "100%", boxSizing: "border-box", marginTop: 3, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 7px", color: "var(--color-text)", fontSize: 11.5, fontFamily: "inherit" }}
          />
        </label>
        {(Number(sourceEpsg) === 4267 || (Number(sourceEpsg) >= 26701 && Number(sourceEpsg) <= 26722)) && (
          <div style={{ fontSize: 10.5, color: "#e0a030", marginTop: -4, marginBottom: 8, lineHeight: 1.4 }}>
            ⚠ NAD27 (TASKS.csv #299): an approximate NAD27→NAD83 datum shift is applied (EPSG:1179, a
            published 3-parameter fit for Alberta/BC — typically within ~10&nbsp;m). Not survey-grade;
            that needs a grid-based (NTv2) transform, which GeoStrix doesn't ship yet.
          </div>
        )}
        <button onClick={() => fileInput.current.click()} style={pBtn} disabled={busy}>
          {busy ? <Loader2 size={13} className="spin" /> : <Image size={13} />} {busy ? "Reading…" : "Import GeoTIFF / GXF…"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".tif,.tiff,.gxf"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { Array.from(e.target.files || []).forEach((f) => importRaster(f)); e.target.value = ""; }}
        />
        <button onClick={openSatPicker} style={pBtn} disabled={satBusy}>
          {satProgress ? <Loader2 size={13} className="spin" /> : <Satellite size={13} />} {satProgress ? `Fetching ${satProgress.done}/${satProgress.total}…` : "Import satellite imagery…"}
        </button>
        <div style={{ fontSize: 10.5, color: "var(--color-text-muted)", marginTop: -4, marginBottom: 8 }}>
          Free Sentinel-2 cloudless imagery (no account needed) — pick an area on a map, or match an existing terrain/boundary/raster's extent.
        </div>
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
        <button onClick={() => setGeorefOpen(true)} style={pBtn}>
          <MapPinned size={13} /> Georeference scan (manual tie points)…
        </button>
        <div style={{ fontSize: 10.5, color: "var(--color-text-muted)", marginTop: -4, marginBottom: 8 }}>
          For a scanned map or claim sketch with no embedded coordinates at all — click matching points and type their real-world X/Y.
        </div>
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
          <div style={{ marginTop: 8, padding: "8px 10px", background: error.info ? "var(--color-bg-subtle)" : "var(--color-danger-bg)", border: `1px solid ${error.info ? "var(--color-border)" : "var(--color-danger-border)"}`, borderRadius: 6, fontSize: 11.5, color: error.info ? "var(--color-text-secondary)" : "var(--color-danger-text)", lineHeight: 1.5 }}>
            {error.text}
          </div>
        )}

        {rasters.length === 0 && (
          <div style={{ marginTop: 14, fontSize: 11.5, color: "var(--color-text-muted)" }}>No rasters imported yet.</div>
        )}
        {rasters.map((r) => (
          <div key={r.id} style={{ marginTop: 10, padding: "9px 10px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 11.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div onClick={() => updateRaster(r.id, { visible: r.visible === false })} style={{ cursor: "pointer", color: r.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                {r.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
              <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} onClick={() => { if (window.confirm(`Remove "${r.name}"?`)) removeRaster(r.id); }} />
            </div>
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
        <div style={{ color: "var(--color-text-muted)", fontSize: 13, textAlign: "center", pointerEvents: "none" }}>
          Drag a GeoTIFF or .gxf in, or use the button on the left.<br />
          Rasters render in the 3D View — switch tabs to see them.
        </div>
        {dragOver && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(226,166,60,0.08)", border: "3px dashed var(--color-accent)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ fontSize: 18, color: "var(--color-accent)", background: "var(--color-bg)", padding: "14px 22px", borderRadius: 8, border: "1px solid var(--color-accent)" }}>Drop GeoTIFF(s)/.gxf to import</div>
          </div>
        )}
      </div>
    </div>
  );
}

const pBtn = { display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "9px 10px", marginBottom: 8, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "#1a2028", fontSize: 12.5, cursor: "pointer", justifyContent: "flex-start" };
const numInput = { flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "#1a2028", fontSize: 11 };
