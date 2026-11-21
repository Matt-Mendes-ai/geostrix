// TASKS.csv #749 — one tab for everything that lies on the map: Matt, 2026-10-19: "I don't like having SRTM and sat imaging in
// different tabs, they should be on the same tab one beside the other ... create a new tab and have raster, terrain, map and web
// layers and all the cartography tab in one tab" (+ "also boundaries, currently in geophysics tab"). The tools themselves stay in
// their modules (RasterModule, GeophysicsModule's map panes, CartographyModule), shown here "embedded": this tab owns the ribbon,
// each button picks the pane (and, for an import, asks the module to start it through a module action, #565).
import React, { useMemo, useState } from "react";
import { useLatestCallback } from "../lib/useLatestCallback.js"; // TASKS.csv #3931
import { mineGridOf } from "../lib/mineGrid.js"; // TASKS.csv #2586
import { Ribbon, RibbonGroup, RibbonButton } from "../components/Ribbon.jsx";
import { Image, Satellite, Mountain, MapPinned, Map as MapIcon, Globe, Globe2, Shapes, Flag, Layers, Layers3, FileSpreadsheet, Rainbow } from "../components/icons.js"; // Layers3: #3287
import { requestModuleAction, useModuleAction } from "../lib/menuRequests.js";
import { useStore } from "../lib/store.jsx";
import { crsName } from "../lib/reproject.js";
import EmptyState from "../components/EmptyState.jsx";
import DropDiagram from "../components/DropDiagram.jsx"; // TASKS.csv #3939
import { tx } from "../lib/i18nRich.js"; // TASKS.csv #3939
import MapsPlanView from "../components/MapsPlanView.jsx"; // TASKS.csv #1625
import { planDataExtent } from "../lib/mapsPlan.js";
import { surveysOnPlan } from "../lib/planSurveys.js"; // TASKS.csv #3342
import RasterModule from "./RasterModule.jsx";
import GeophysicsModule from "./GeophysicsModule.jsx";
import CartographyModule from "./CartographyModule.jsx";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786 — messages in the interface language
import { groupShapefileParts, parseVectorFile } from "../lib/viewer/importHelpers.js"; // TASKS.csv #2019
import { buildLayer, sameMapLayer, mapsDropRoutes } from "../lib/mapLayerBuild.js"; // TASKS.csv #2019
import { guessEpsgFromPrjWkt } from "../lib/reprojectMore.js"; // TASKS.csv #3590
import { featureCountText } from "../lib/featureCount.js";
import { projectTargetEpsg } from "../lib/projectTarget.js"; // TASKS.csv #2287 — no reprojection INTO the placeholder CRS

const GEO_PANES = new Set(["terrain", "web", "boundaries", "claims"]); // "maps" (geology map layers + outcrop structures) moved to the Surface Geology tab: #820
const CRS_PANES = new Set(["crs", "layer", "file"]);

export default function MapsModule() {
  const [pane, setPane] = useState("raster");
  const { rasters = [], terrain, mapLayers = [], boundaries = [], project, surfaceSamples = [], collars = [], addMapLayer, goToModule, layers = {} } = useStore(); // surfaceSamples: TASKS.csv #1792; collars: #1625; addMapLayer / goToModule: #2019; layers: #3342
  const surveys = useMemo(() => surveysOnPlan(layers.geophys_pts), [layers.geophys_pts]); // #3342 — the point surveys are on the plan
  const hasPlan = !!planDataExtent({ rasters, terrain, mapLayers, boundaries, collars, surfaceSamples, surveys }); // #1625 — a plan of it, else the card
  useModuleAction(["maps-crs"], () => setPane("crs")); // the Set project CRS menu item
  useModuleAction(["maps-plan"], () => setPane((p) => (CRS_PANES.has(p) ? "raster" : p))); // TASKS.csv #3491 — Layout asks the plan for a fresh capture: it must be on screen
  useModuleAction(["maps-terrain"], () => setPane("terrain"));
  // TASKS.csv #3932 — an AI app's fetch_terrain / fetch_satellite_image: the pane that fetches comes forward and is asked (it answers the app through the payload's reply)
  useModuleAction(["mcp-fetch-terrain"], (_a, p) => { setPane("terrain"); requestModuleAction("mcp-terrain-run", p); });
  useModuleAction(["mcp-fetch-satellite"], (_a, p) => { setPane("raster"); requestModuleAction("mcp-satellite-run", p); }); // TASKS.csv #1429 — the inversion pane's 'Go to Maps › Terrain'
  // TASKS.csv #1994 — a lidar file dropped on the 3D View or the Geophysics tab: the Terrain pane, which opens it
  useModuleAction(["maps-lidar"], (_a, p) => { setPane("terrain"); requestModuleAction("open-lidar", p); });
  // TASKS.csv #1507 (review #1497, Lawyers) — a GeoTIFF dropped on the map (or the 'Nothing on the map yet' card) did nothing: only
  // the raster sidebar took drops. The map takes them now: rasters go to the raster pane's import, other files are named there.
  const [mapDrag, setMapDrag] = useState(false);
  const { projectLoading: mapsLoading, whenProjectLoaded: mapsWhenLoaded } = useStore(); // #3931
  const mapDropNow = useLatestCallback(async (dropped) => {
      // TASKS.csv #2019 (review #2013, Import) — only rasters imported here ('use Boundaries, Terrain or Web layers above') while the 3D view
      // took the same shapefile: lines / polygons now become Map layers here; points, tables and multi-layer files open the 3D view's import
      const grouped0 = groupShapefileParts(dropped);
      // TASKS.csv #2857 — a .prj / .xml with no shapefile may be a raster's (mapsDropRoutes pairs it by name); the rest stay unmatched
      const side = grouped0.unmatched.filter((f) => /\.(prj|xml)$/i.test(f.name)), grouped = { files: [...grouped0.files, ...side], unmatched: grouped0.unmatched.filter((f) => !side.includes(f)) };
      const all = grouped.files;
      if (!all.length) return;
      const routes = mapsDropRoutes(all.map((f) => f.name)), byName = new Map(all.map((f) => [f.name, f]));
      // TASKS.csv #3852 (#3833) — an .xyz point file (a survey's points, a loop) was named as not imported: the Geophysics tab reads it (a column picker), as a drop on the 3D View hands it there
      const xyzFiles = all.filter((f) => /\.xyz$/i.test(f.name));
      if (xyzFiles.length) {
        routes.other = routes.other.filter((n) => !/\.xyz$/i.test(n));
        goToModule?.("geophysics"); requestModuleAction("geophysics-drop", { files: xyzFiles });
        if (!routes.raster.length && !routes.vector.length && !routes.table.length && !routes.other.length && !grouped.unmatched.length) return;
      }
      const files = routes.raster.map((n) => byName.get(n)), others = [...routes.other, ...grouped.unmatched.map((f) => f.name)];
      const toViewer = [], notes = [];
      const crsReady = !!project?.epsg && project?.crsSet !== false; // an unset project CRS: the 3D view's import adopts the file's (#607)
      // TASKS.csv #3342 (Galore Creek review) — a CSV with X / Y (or longitude / latitude) and no hole id is a table of points (stations,
      // electrodes, pads, sample sites): asked, it becomes a point layer in Map layers; otherwise it opens the 3D view's import as before
      for (const n of routes.table) {
        const f = byName.get(n);
        if (!crsReady || !/\.(csv|txt)$/i.test(n) || f.size > 50e6) { toViewer.push(f); continue; }
        const [{ default: Papa }, { pointTableColumns, pointTableLayer }] = await Promise.all([import("papaparse"), import("../lib/planSurveys.js")]);
        const text = await f.text();
        const head = Papa.parse(text, { preview: 1 }).data[0] || [];
        const cols = pointTableColumns(head);
        if (!cols || !window.confirm(tr("{name} has coordinate columns ({x}, {y}) and no hole id: put its rows on the map as points?", { name: n, x: cols?.x, y: cols?.y }) + "\n\n" + tr("OK — a point layer in Map layers (stations, electrodes, sample sites).") + "\n" + tr("Cancel — open the drillhole import."))) { toViewer.push(f); continue; }
        const rows = Papa.parse(text, { header: true, skipEmptyLines: true }).data;
        const layer = buildLayer(pointTableLayer(n.replace(/\.[^.]+$/, ""), rows, cols), { sourceName: n.replace(/\.[^.]+$/, ""), projectEpsg: projectTargetEpsg(project), qml: null, sourceOverride: null, mineGrid: mineGridOf(project), collars });
        if (!layer?.features?.length) { notes.push(tr("{name}: no rows with usable coordinates.", { name: n })); continue; }
        const twin = sameMapLayer(mapLayers, layer);
        if (twin) { notes.push(tr("{name} is already in Map layers as \"{layer}\" ({features}): not added again.", { name: n, layer: twin.name, features: featureCountText(layer.features.length, layer.geomType) })); continue; }
        addMapLayer({ ...layer, drapeMode: "terrain" });
        notes.push(tr("{name}: {features} added to Map layers as points, {crsNote}.", { name: n, features: featureCountText(layer.features.length, layer.geomType), crsNote: layer.crsNote }) + (layer.skipped ? " " + tr("{n} row(s) without coordinates were left out.", { n: layer.skipped.toLocaleString() }) : ""));
      }
      for (const n of routes.vector) {
        const f = byName.get(n);
        const got = crsReady ? await new Promise((res) => parseVectorFile(f, (rows, err, meta) => res({ err, meta }))) : null;
        const vec = got?.meta?.vector;
        if (!vec || got.err || got.meta?.layerOptions || !vec.geomType || vec.geomType === "point") { toViewer.push(f); continue; }
        const layer = buildLayer({ ...vec, epsg: guessEpsgFromPrjWkt(vec.prjWkt) }, { sourceName: f.name.replace(/\.(shp|zip)$/i, ""), projectEpsg: projectTargetEpsg(project), qml: null, sourceOverride: null, mineGrid: mineGridOf(project), collars /* #2586 */ });
        if (!layer?.features?.length) { notes.push(tr("{name}: no usable line / polygon features.", { name: f.name })); continue; }
        const twin = sameMapLayer(mapLayers, layer);
        if (twin) { notes.push(tr("{name} is already in Map layers as \"{layer}\" ({features}): not added again.", { name: f.name, layer: twin.name, features: featureCountText(layer.features.length, layer.geomType) })); continue; }
        addMapLayer({ ...layer, drapeMode: "terrain" });
        notes.push(tr("{name}: {features} added to Map layers, {crsNote}.", { name: f.name, features: featureCountText(layer.features.length, layer.geomType), crsNote: layer.crsNote }));
      }
      if (toViewer.length) { // points (collars, samples), tables and layer pickers: the 3D view's import asks what they are
        goToModule?.("viewer");
        requestModuleAction("import-dropped-files", { files: [...files, ...toViewer], notes, others, origin: "maps" /* #2660 */ }); // the rasters of the same drop too: the 3D view imports them
        return;
      }
      setPane("raster");
      requestModuleAction("import-raster-files", { files, others, notes });
    }); // #3931 — the map drop's body, with the latest render's values
  const mapDrop = {
    onDragOver: (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); setMapDrag(true); } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setMapDrag(false); },
    onDrop: async (e) => { // TASKS.csv #3931 — a drop while a project is coming forward (a tab switch expanding its tables) waits for it, then goes into that project
      e.preventDefault(); setMapDrag(false);
      const dropped = Array.from(e.dataTransfer?.files || []);
      if (mapsLoading && mapsWhenLoaded) await mapsWhenLoaded();
      return mapDropNow(dropped);
    },
  };
  const dropOutline = mapDrag ? { outline: "2px dashed var(--color-accent)", outlineOffset: -6 } : null;
  const btn = (id, action) => ({ active: pane === id, onClick: () => { setPane(id); if (action) requestModuleAction(action); } });

  return (
    <div className="ge-body" style={{ width: "100%" }}>
      {/* TASKS.csv #3907 (redesign P3) — Maps is a Basic (green) tab: Basic tools mode shows five (GeoTIFF / GXF, Satellite, Terrain, Boundaries,
          Project CRS; nine at most, test/basicTools3907.test.mjs); Georeference, Spectral index and Macrostrat moved to All tools (#1861, #3287) */}
      <Ribbon label="Map tools">
        <RibbonGroup label="Imagery & terrain">
          <RibbonButton icon={Image} label="GeoTIFF / GXF" tone="data" title="Import a georeferenced GeoTIFF, Geosoft .gxf or Geosoft / Surfer .grd grid and manage the raster drapes" {...btn("raster", "import-raster")} active={pane === "raster"} />
          <RibbonButton icon={Satellite} label="Satellite" tone="data" title="Free Sentinel-2 imagery (no account): the latest clear scene over an area you draw" {...btn("raster", "raster-satellite")} active={false} />
          <RibbonButton icon={Mountain} label="Terrain" tone="data" title="Terrain: fetch SRTM elevation or import a DEM" {...btn("terrain")} />
          {/* TASKS.csv #1861 (review #1646, Kodiak) — a report's plan maps with no GeoKeys are placed only here (All tools since #3907) */}
          <RibbonButton advanced icon={MapPinned} label="Georeference" tone="data" title="Georeference a scanned map or sketch with no coordinates" {...btn("raster", "raster-georeference")} active={false} />
          <RibbonButton advanced icon={Rainbow} label="Spectral index" tone="data" title="Quartz / carbonate / mafic indices from ASTER thermal emissivity, iron-oxide and clay ratios from Sentinel-2 or Landsat, from a multiband GeoTIFF" {...btn("raster", "raster-spectral")} active={false} />
        </RibbonGroup>
        <RibbonGroup label="Map layers">
          <RibbonButton advanced icon={Globe} label="Web layers" tone="data" title="WMS / WFS layers from a government or company service" {...btn("web")} />
          {/* TASKS.csv #3287 (Matt: "macrostrat geology deserves its own icon on the ribbon") — the Web layers pane's 'Macrostrat geology…' dialog, opened here */}
          <RibbonButton advanced icon={Layers3} label="Geology (Macrostrat)" tone="data" title="Macrostrat's compilation of geologic maps (CC BY 4.0) for the project area, as a drape or map layer, and the map units at its centre" {...btn("web", "open-macrostrat")} active={false} />
          <RibbonButton icon={Shapes} label="Boundaries" tone="data" title="Property / grid boundaries (.ply, DXF, shapefile, GeoPackage, KML)" {...btn("boundaries")} />
          <RibbonButton advanced icon={Flag} label="Claims" tone="data" title="Mineral claims / tenure" {...btn("claims")} />
        </RibbonGroup>
        <RibbonGroup label="Coordinates">
          <RibbonButton icon={Globe2} label="Project CRS" tone="data" title="The coordinate reference system every import is reprojected into" {...btn("crs")} />
          <RibbonButton advanced icon={Layers} label="A layer" tone="data" title="One layer, survey, voxel model, surface or raster was imported in the wrong CRS: move it into the project CRS" {...btn("layer")} />
          <RibbonButton advanced icon={FileSpreadsheet} label="A file" tone="data" title="Reproject a CSV's X/Y columns, a zipped shapefile or a GeoTIFF and save it as a new file" {...btn("file")} />
        </RibbonGroup>
      </Ribbon>

      {pane === "raster" && <RasterModule embedded />}
      {GEO_PANES.has(pane) && <GeophysicsModule embedded forcePane={pane} />}
      {CRS_PANES.has(pane) && <CartographyModule embedded forcePane={pane} />}

      {!CRS_PANES.has(pane) && hasPlan && <div className="ge-main" style={{ position: "relative", padding: 0, ...dropOutline }} {...mapDrop}><MapsPlanView /></div>}
      {!CRS_PANES.has(pane) && !hasPlan && (
        <div className="ge-main" style={{ display: "flex", alignItems: "center", justifyContent: "center", ...dropOutline }} {...mapDrop}>
          <EmptyState
            icon={<MapIcon size={18} />}
            headline={(() => {
              const parts = [];
              if (rasters.length) parts.push(tr(rasters.length === 1 ? "{rasters} raster" : "{rasters} rasters", { rasters: rasters.length }));
              if (terrain) parts.push(tr("a terrain surface"));
              if (mapLayers.length) parts.push(tr(mapLayers.length === 1 ? "{mapLayers} map layer" : "{mapLayers} map layers", { mapLayers: mapLayers.length }));
              if (boundaries.length) parts.push(tr(boundaries.length === 1 ? "{boundaries} boundary" : "{boundaries} boundaries", { boundaries: boundaries.length }));
              if (surfaceSamples.length) parts.push(tr(surfaceSamples.length === 1 ? "{n} surface sample" : "{n} surface samples", { n: surfaceSamples.length.toLocaleString() })); // #1792
              return parts.length ? tr("Loaded: {list}", { list: parts.join(", ") }) : tr("Nothing on the map yet");
            })()}
          >
            {/* TASKS.csv #3939 — pictures first: what a dropped image, grid or map layer becomes; one sentence, no longer glued from three fragments */}
            <DropDiagram picture="grid" data-empty-diagram="maps" drop={tr("Drop a GeoTIFF, grid or map layer here")} caption={tr("Imagery, grids and map layers")} cells={["GeoTIFF", ".gxf", "SHP", "KML"]}
              label={tr("A GeoTIFF, a grid or a map layer dropped here is drawn on this plan and under your drill holes in 3D.")} tooltip={tr("Drag a GeoTIFF, grid or map layer here to start.")} />
            <div style={{ marginBottom: 8 }}>{tx("They lie under your drill holes in {sv}, placed in the project CRS{v}.", { sv: <b>{tr("StrixViewer")}</b>, v: project?.crsSet === false ? tr(" (not chosen yet: Project CRS above)") : `, ${crsName(project?.epsg) || tr("EPSG:{v}", { v: project?.epsg })}` })}</div>
            {surfaceSamples.length > 0 && <div style={{ marginBottom: 8 }}>{tr("Surface samples in plan, classed by a saved threshold and over a block-model level: Geochem > Plan map.")}</div>}{/* #1792 */}
          </EmptyState>
        </div>
      )}
    </div>
  );
}
