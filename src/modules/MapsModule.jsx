// TASKS.csv #749 — one tab for everything that lies on the map: Matt, 2026-10-19: "I don't like having SRTM and sat imaging in
// different tabs, they should be on the same tab one beside the other ... create a new tab and have raster, terrain, map and web
// layers and all the cartography tab in one tab" (+ "also boundaries, currently in geophysics tab"). The tools themselves stay in
// their modules (RasterModule, GeophysicsModule's map panes, CartographyModule), shown here "embedded": this tab owns the ribbon,
// each button picks the pane (and, for an import, asks the module to start it through a module action, #565).
import React, { useState } from "react";
import { mineGridOf } from "../lib/mineGrid.js"; // TASKS.csv #2586
import { Ribbon, RibbonGroup, RibbonButton } from "../components/Ribbon.jsx";
import { Image, Satellite, Mountain, MapPinned, Map as MapIcon, Globe, Globe2, Shapes, Flag, Layers, FileSpreadsheet, Rainbow } from "../components/icons.js";
import { requestModuleAction, useModuleAction } from "../lib/menuRequests.js";
import { useStore } from "../lib/store.jsx";
import { crsName } from "../lib/reproject.js";
import EmptyState from "../components/EmptyState.jsx";
import MapsPlanView from "../components/MapsPlanView.jsx"; // TASKS.csv #1625
import { planDataExtent } from "../lib/mapsPlan.js";
import RasterModule from "./RasterModule.jsx";
import GeophysicsModule from "./GeophysicsModule.jsx";
import CartographyModule from "./CartographyModule.jsx";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786 — messages in the interface language
import { groupShapefileParts, parseVectorFile } from "../lib/viewer/importHelpers.js"; // TASKS.csv #2019
import { buildLayer, sameMapLayer, mapsDropRoutes } from "../lib/mapLayerBuild.js"; // TASKS.csv #2019
import { guessEpsgFromPrjWkt } from "../lib/reproject.js";
import { featureCountText } from "../lib/featureCount.js";
import { projectTargetEpsg } from "../lib/projectTarget.js"; // TASKS.csv #2287 — no reprojection INTO the placeholder CRS

const GEO_PANES = new Set(["terrain", "web", "boundaries", "claims"]); // "maps" (geology map layers + outcrop structures) moved to the Surface Geology tab: #820
const CRS_PANES = new Set(["crs", "layer", "file"]);

export default function MapsModule() {
  const [pane, setPane] = useState("raster");
  const { rasters = [], terrain, mapLayers = [], boundaries = [], project, surfaceSamples = [], collars = [], addMapLayer, goToModule } = useStore(); // surfaceSamples: TASKS.csv #1792; collars: #1625; addMapLayer / goToModule: #2019
  const hasPlan = !!planDataExtent({ rasters, terrain, mapLayers, boundaries, collars, surfaceSamples }); // #1625 — a plan of it, else the card
  useModuleAction(["maps-crs"], () => setPane("crs")); // the Set project CRS menu item
  useModuleAction(["maps-terrain"], () => setPane("terrain")); // TASKS.csv #1429 — the inversion pane's 'Go to Maps › Terrain'
  // TASKS.csv #1994 — a lidar file dropped on the 3D View or the Geophysics tab: the Terrain pane, which opens it
  useModuleAction(["maps-lidar"], (_a, p) => { setPane("terrain"); requestModuleAction("open-lidar", p); });
  // TASKS.csv #1507 (review #1497, Lawyers) — a GeoTIFF dropped on the map (or the 'Nothing on the map yet' card) did nothing: only
  // the raster sidebar took drops. The map takes them now: rasters go to the raster pane's import, other files are named there.
  const [mapDrag, setMapDrag] = useState(false);
  const mapDrop = {
    onDragOver: (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); setMapDrag(true); } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setMapDrag(false); },
    onDrop: async (e) => {
      e.preventDefault(); setMapDrag(false);
      // TASKS.csv #2019 (review #2013, Import) — only rasters imported here ('use Boundaries, Terrain or Web layers above') while the 3D view
      // took the same shapefile: lines / polygons now become Map layers here; points, tables and multi-layer files open the 3D view's import
      const grouped0 = groupShapefileParts(Array.from(e.dataTransfer?.files || []));
      // TASKS.csv #2857 — a .prj / .xml with no shapefile may be a raster's (mapsDropRoutes pairs it by name); the rest stay unmatched
      const side = grouped0.unmatched.filter((f) => /\.(prj|xml)$/i.test(f.name)), grouped = { files: [...grouped0.files, ...side], unmatched: grouped0.unmatched.filter((f) => !side.includes(f)) };
      const all = grouped.files;
      if (!all.length) return;
      const routes = mapsDropRoutes(all.map((f) => f.name)), byName = new Map(all.map((f) => [f.name, f]));
      const files = routes.raster.map((n) => byName.get(n)), others = [...routes.other, ...grouped.unmatched.map((f) => f.name)];
      const toViewer = routes.table.map((n) => byName.get(n)), notes = [];
      const crsReady = !!project?.epsg && project?.crsSet !== false; // an unset project CRS: the 3D view's import adopts the file's (#607)
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
    },
  };
  const dropOutline = mapDrag ? { outline: "2px dashed var(--color-accent)", outlineOffset: -6 } : null;
  const btn = (id, action) => ({ active: pane === id, onClick: () => { setPane(id); if (action) requestModuleAction(action); } });

  return (
    <div className="ge-body" style={{ width: "100%" }}>
      <Ribbon label="Map tools">
        <RibbonGroup label="Imagery & terrain">
          <RibbonButton icon={Image} label="GeoTIFF / GXF" tone="data" title="Import a georeferenced GeoTIFF, Geosoft .gxf or Geosoft / Surfer .grd grid and manage the raster drapes" {...btn("raster", "import-raster")} active={pane === "raster"} />
          <RibbonButton icon={Satellite} label="Satellite" tone="data" title="Free Sentinel-2 imagery (no account): the latest clear scene over an area you draw" {...btn("raster", "raster-satellite")} active={false} />
          <RibbonButton icon={Mountain} label="Terrain" tone="data" title="Terrain: fetch SRTM elevation or import a DEM" {...btn("terrain")} />
          {/* TASKS.csv #1861 (review #1646, Kodiak) — on the Simple ribbon: a report's plan maps with no GeoKeys are placed only here */}
          <RibbonButton icon={MapPinned} label="Georeference" tone="data" title="Georeference a scanned map or sketch with no coordinates" {...btn("raster", "raster-georeference")} active={false} />
          <RibbonButton icon={Rainbow} label="Spectral index" tone="data" title="Quartz / carbonate / mafic indices from ASTER thermal emissivity, iron-oxide and clay ratios from Sentinel-2 or Landsat, from a multiband GeoTIFF" {...btn("raster", "raster-spectral")} active={false} />
        </RibbonGroup>
        <RibbonGroup label="Map layers">
          <RibbonButton advanced icon={Globe} label="Web layers" tone="data" title="WMS / WFS layers from a government or company service" {...btn("web")} />
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
            <div style={{ marginBottom: 8 }}>{tr("Imagery, terrain, map layers and boundaries all lie under your drillholes in the")}{" "}<b>{tr("3D View")}</b>{" "}{tr("— switch tabs to see them. Everything is placed in the project CRS{v}.", { v: project?.crsSet === false ? tr(" (not chosen yet: Project CRS above)") : `, ${crsName(project?.epsg) || tr("EPSG:{v}", { v: project?.epsg })}` })}</div>
            {surfaceSamples.length > 0 && <div style={{ marginBottom: 8 }}>{tr("Surface samples in plan, classed by a saved threshold and over a block-model level: Geochem > Plan map.")}</div>}{/* #1792 */}
          </EmptyState>
        </div>
      )}
    </div>
  );
}
