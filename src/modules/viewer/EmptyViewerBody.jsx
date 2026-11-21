// The body of the 3D viewer's empty card (moved out of ViewerModule, which is capped by TASKS.csv #1084). TASKS.csv #1448 (review #1352,
// Silvertip) — the Surface Geology tab showed the 3D View's drillhole text ('Everything starts from a collar file') under its mapping
// headline; it has its own body now. Other modes keep the drillhole text.
import React from "react";
import { t as tr } from "../../lib/i18n.js";
import { tx } from "../../lib/i18nRich.js";
import { requestModuleAction } from "../../lib/menuRequests.js"; // TASKS.csv #3888 — the start dialogs (App.jsx mounts them)
import { openHelp } from "../../lib/help.js"; // TASKS.csv #3887 — the First steps guide
import CollarDropDiagram from "./CollarDropDiagram.jsx"; // TASKS.csv #3939

export default function EmptyViewerBody({ mode }) {
  if (mode === "surface") return (
    <>
      <div style={{ marginBottom: 8 }}>{tx("This is the Geological Mapping tab: a geological map (polygons and lines from a shapefile, GeoPackage, KML or DXF) and outcrop structure measurements, drawn in 3D over the terrain and the drilling.", {})}</div>
      <div style={{ marginBottom: 12 }}>{tx("Use {map} and {structures} on the ribbon, or drag the files onto this view. Surface samples come in through {geochem}; a terrain from {maps} lets the map and the measurements sit on the ground.", { map: <b>{tr("Geology map")}</b>, structures: <b>{tr("Outcrop structures")}</b>, geochem: <b>{tr("Geochem")}</b>, maps: <b>{tr("Maps > Terrain")}</b> })}</div>
    </>
  );
  return (
    <>
      {/* TASKS.csv #3888 (redesign P5) — the two start dialogs, from here too (as Matt agreed) */}
      <button type="button" className="ge-tool-btn" data-start-open="" onClick={() => requestModuleAction("open-start-dialog")} style={{ marginBottom: 10, fontWeight: 600 }}>{tr("Let's begin a project!")}</button>
      {" "}<button type="button" className="ge-tool-btn" data-first-steps-open="" onClick={() => openHelp("first-steps")} style={{ marginBottom: 10 }}>{tr("First steps")}</button>{/* TASKS.csv #3887 — the guide, in Help */}
      {/* TASKS.csv #3939 — pictures first (Matt's worked example): the diagram, three short lines, the rest behind a closed More */}
      <CollarDropDiagram />
      <div style={{ marginBottom: 6 }}>{tx("Drag a collar file onto this view, or click {collars} in the left panel.", { collars: <b>{tr("Collars")}</b> })}</div>
      <div style={{ marginBottom: 6 }}>{tr("A collar file needs a hole ID and x, y, z. Columns are matched for you, and you're asked if anything is unclear.")}</div>
      <div style={{ marginBottom: 6 }}>{tx("Then add surveys, lithology and other logs. Assays go in the {geochem} tab.", { geochem: <b>{tr("Geochem")}</b> })}</div>
      <details data-empty-more="" style={{ marginBottom: 10 }}>
        <summary style={{ cursor: "pointer", color: "var(--color-info)", fontSize: "var(--font-size-sm)" }}>{tr("More")}</summary>
        <div style={{ marginTop: 4 }}>{tx("A collar file can also be a zipped shapefile or GeoPackage, with optional {az}, {dip} and {len} columns; File ▸ Import CSV (Ctrl+I) opens the same import. Survey lines and grids go in {geophysics}; GeoTIFFs, imagery and terrain in {maps}. Coordinates are reprojected to the project CRS on import.", { az: <code>azimuth</code>, dip: <code>dip</code>, len: <code>length</code>, geophysics: <b>{tr("Geophysics")}</b>, maps: <b>{tr("Maps")}</b> })}</div>
      </details>
    </>
  );
}
