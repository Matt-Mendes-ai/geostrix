// TASKS.csv #749 — one tab for everything that lies on the map: Matt, 2026-10-19: "I don't like having SRTM and sat imaging in
// different tabs, they should be on the same tab one beside the other ... create a new tab and have raster, terrain, map and web
// layers and all the cartography tab in one tab" (+ "also boundaries, currently in geophysics tab"). The tools themselves stay in
// their modules (RasterModule, GeophysicsModule's map panes, CartographyModule), shown here "embedded": this tab owns the ribbon,
// each button picks the pane (and, for an import, asks the module to start it through a module action, #565).
import React, { useState } from "react";
import { Ribbon, RibbonGroup, RibbonButton } from "../components/Ribbon.jsx";
import { Image, Satellite, Mountain, MapPinned, Map as MapIcon, Globe, Globe2, Shapes, Flag, Layers, FileSpreadsheet, Rainbow } from "../components/icons.js";
import { requestModuleAction, useModuleAction } from "../lib/menuRequests.js";
import { useStore } from "../lib/store.jsx";
import { crsName } from "../lib/reproject.js";
import EmptyState from "../components/EmptyState.jsx";
import RasterModule from "./RasterModule.jsx";
import GeophysicsModule from "./GeophysicsModule.jsx";
import CartographyModule from "./CartographyModule.jsx";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786 — messages in the interface language

const GEO_PANES = new Set(["terrain", "web", "boundaries", "claims"]); // "maps" (geology map layers + outcrop structures) moved to the Surface Geology tab: #820
const CRS_PANES = new Set(["crs", "layer", "file"]);

export default function MapsModule() {
  const [pane, setPane] = useState("raster");
  const { rasters = [], terrain, mapLayers = [], boundaries = [], project } = useStore();
  useModuleAction(["maps-crs"], () => setPane("crs")); // the Set project CRS menu item
  const btn = (id, action) => ({ active: pane === id, onClick: () => { setPane(id); if (action) requestModuleAction(action); } });

  return (
    <div className="ge-body" style={{ width: "100%" }}>
      <Ribbon label="Map tools">
        <RibbonGroup label="Imagery & terrain">
          <RibbonButton icon={Image} label="GeoTIFF / GXF" tone="data" title="Import a georeferenced GeoTIFF or Geosoft .gxf grid and manage the raster drapes" {...btn("raster", "import-raster")} active={pane === "raster"} />
          <RibbonButton icon={Satellite} label="Satellite" tone="data" title="Free Sentinel-2 imagery (no account): the latest clear scene over an area you draw" {...btn("raster", "raster-satellite")} active={false} />
          <RibbonButton icon={Mountain} label="Terrain" tone="data" title="Terrain: fetch SRTM elevation or import a DEM" {...btn("terrain")} />
          <RibbonButton advanced icon={MapPinned} label="Georeference" tone="data" title="Georeference a scanned map or sketch with no coordinates" {...btn("raster", "raster-georeference")} active={false} />
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

      {!CRS_PANES.has(pane) && (
        <div className="ge-main" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <EmptyState
            icon={<MapIcon size={18} />}
            headline={(() => {
              const parts = [];
              if (rasters.length) parts.push(tr(rasters.length === 1 ? "{rasters} raster" : "{rasters} rasters", { rasters: rasters.length }));
              if (terrain) parts.push(tr("a terrain surface"));
              if (mapLayers.length) parts.push(tr(mapLayers.length === 1 ? "{mapLayers} map layer" : "{mapLayers} map layers", { mapLayers: mapLayers.length }));
              if (boundaries.length) parts.push(tr(boundaries.length === 1 ? "{boundaries} boundary" : "{boundaries} boundaries", { boundaries: boundaries.length }));
              return parts.length ? tr("Loaded: {list}", { list: parts.join(", ") }) : tr("Nothing on the map yet");
            })()}
          >
            <div style={{ marginBottom: 8 }}>{tr("Imagery, terrain, map layers and boundaries all lie under your drillholes in the")}{" "}<b>{tr("3D View")}</b>{" "}{tr("— switch tabs to see them. Everything is placed in the project CRS{v}.", { v: project?.crsSet === false ? tr(" (not chosen yet: Project CRS above)") : `, ${crsName(project?.epsg) || tr("EPSG:{v}", { v: project?.epsg })}` })}</div>
          </EmptyState>
        </div>
      )}
    </div>
  );
}
