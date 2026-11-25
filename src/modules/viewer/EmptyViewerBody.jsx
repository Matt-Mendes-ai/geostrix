// The body of the 3D viewer's empty card (moved out of ViewerModule, which is capped by TASKS.csv #1084). TASKS.csv #1448 (review #1352,
// Silvertip) — the Surface Geology tab showed the 3D View's drillhole text ('Everything starts from a collar file') under its mapping
// headline; it has its own body now. Other modes keep the drillhole text.
// TASKS.csv #3939 — pictures first (Matt's worked example): a diagram, two or three short lines, the rest behind a closed More.
import React from "react";
import { t as tr } from "../../lib/i18n.js";
import { tx } from "../../lib/i18nRich.js";
import { requestModuleAction } from "../../lib/menuRequests.js"; // TASKS.csv #3888 — the start dialogs (App.jsx mounts them)
import { openHelp } from "../../lib/help.js"; // TASKS.csv #3887 — the First steps guide
import DropDiagram from "../../components/DropDiagram.jsx";
import MoreFold from "../../components/MoreFold.jsx";

export default function EmptyViewerBody({ mode }) {
  if (mode === "surface") return (
    <>
      <DropDiagram picture="map" data-empty-diagram="map" drop={tr("Drop your geology map here")} caption={tr("A shapefile, GeoPackage, KML or DXF")} cells={["SHP", "GPKG", "KML", "DXF"]}
        label={tr("A geology map dropped on this view is drawn over the terrain: a shapefile, GeoPackage, KML or DXF.")} tooltip={tr("Drag your geology map here to start.")} />
      <div style={{ marginBottom: 6 }}>{tx("Or use {map} and {structures} on the ribbon.", { map: <b>{tr("Geology map")}</b>, structures: <b>{tr("Outcrop structures")}</b> })}</div>
      <div style={{ marginBottom: 6 }}>{tx("A terrain from {maps} puts the map and the measurements on the ground.", { maps: <b>{tr("Maps > Terrain")}</b> })}</div>
      <MoreFold style={{ marginBottom: 10 }}>{tx("Surface samples come in through {geochem}.", { geochem: <b>{tr("Geochem")}</b> })}</MoreFold>
    </>
  );
  return (
    <>
      {/* TASKS.csv #3888 (redesign P5) — the two start dialogs, from here too (as Matt agreed) */}
      <button data-btn-own="" type="button" className="ge-tool-btn" data-start-open="" onClick={() => requestModuleAction("open-start-dialog")} style={{ marginBottom: 10, fontWeight: 600 }}>{tr("Let's begin a project!")}</button>
      {" "}<button data-btn-own="" type="button" className="ge-tool-btn" data-first-steps-open="" onClick={() => openHelp("first-steps")} style={{ marginBottom: 10 }}>{tr("First steps")}</button>{/* TASKS.csv #3887 — the guide, in Help */}
      <DropDiagram picture="holes" data-empty-diagram="holes" drop={tr("Drop your collar file here")} viewLabel={tr("Ground")} caption={tr("Your file needs these four columns")} cells={[tr("Hole ID"), "x", "y", "z"]}
        label={tr("A collar file dropped on the 3D view becomes drill hole traces. The file needs four columns: hole ID, x, y and z.")} tooltip={tr("Drag your collar file here to start.")} />
      <div style={{ marginBottom: 6 }}>{tx("Drag a collar file onto this view, or click {collars} in the left panel.", { collars: <b>{tr("Collars")}</b> })}</div>
      <div style={{ marginBottom: 6 }}>{tr("A collar file needs a hole ID and x, y, z. Columns are matched for you, and you're asked if anything is unclear.")}</div>
      <div style={{ marginBottom: 6 }}>{tx("Then add surveys, lithology and other logs. Assays go in the {geochem} tab.", { geochem: <b>{tr("Geochem")}</b> })}</div>
      <MoreFold data-empty-more="" style={{ marginBottom: 10 }}>{tx("A collar file can also be a zipped shapefile or GeoPackage, with optional {az}, {dip} and {len} columns; File ▸ Import CSV (Ctrl+I) opens the same import. Survey lines and grids go in {geophysics}; GeoTIFFs, imagery and terrain in {maps}. Coordinates are reprojected to the project CRS on import.", { az: <code>azimuth</code>, dip: <code>dip</code>, len: <code>length</code>, geophysics: <b>{tr("Geophysics")}</b>, maps: <b>{tr("Maps")}</b> })}</MoreFold>
    </>
  );
}
