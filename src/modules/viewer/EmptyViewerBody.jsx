// The body of the 3D viewer's empty card (moved out of ViewerModule, which is capped by TASKS.csv #1084). TASKS.csv #1448 (review #1352,
// Silvertip) — the Surface Geology tab showed the 3D View's drillhole text ('Everything starts from a collar file') under its mapping
// headline; it has its own body now. Other modes keep the drillhole text.
import React from "react";
import { t as tr } from "../../lib/i18n.js";
import { tx } from "../../lib/i18nRich.js";

export default function EmptyViewerBody({ mode }) {
  if (mode === "surface") return (
    <>
      <div style={{ marginBottom: 8 }}>{tx("This is the Surface Geology tab: a geological map (polygons and lines from a shapefile, GeoPackage, KML or DXF) and outcrop structure measurements, drawn in 3D over the terrain and the drilling.", {})}</div>
      <div style={{ marginBottom: 12 }}>{tx("Use {map} and {structures} on the ribbon, or drag the files onto this view. Surface samples come in through {geochem}; a terrain from {maps} lets the map and the measurements sit on the ground.", { map: <b>{tr("Geology map")}</b>, structures: <b>{tr("Outcrop structures")}</b>, geochem: <b>{tr("Geochem")}</b>, maps: <b>{tr("Maps > Terrain")}</b> })}</div>
    </>
  );
  return (
    <>
      <div style={{ marginBottom: 8 }}>{tx("This is the 3D view — drillhole traces in real world coordinates, with lithology, alteration, veining, geotech and assay data hung off them downhole. Everything starts from a {collar} file.", { collar: <b>{tr("collar")}</b> })}</div>
      <div style={{ marginBottom: 8 }}>{tx("Use the {collars} button under {geometry} in the panel on the left (or File ▸ Import CSV, Ctrl+I), or drag a file straight onto this view. Collars: a CSV (or zipped shapefile / GeoPackage) with a hole ID and x/y/z — {cols}, plus optional {az}, {dip} and {len}. Column names are guessed for you (easting/northing/elevation and friends all work) and anything ambiguous opens a mapping dialog rather than importing wrong.", { collars: <b>{tr("Collars")}</b>, geometry: <b>{tr("Geometry")}</b>, cols: <code>hole_id, x, y, z</code>, az: <code>azimuth</code>, dip: <code>dip</code>, len: <code>length</code> })}</div>
      <div style={{ marginBottom: 12 }}>{tx("Then add downhole survey stations, and any interval layers you have (lithology, alteration, veins, mineralization, geotech, mag susceptibility, structure). Assays live in the {geochem} tab; survey lines and geophysical grids in {geophysics}; GeoTIFFs, satellite imagery, terrain and map layers in {maps}. Coordinates are reprojected to the project CRS on import if the source CRS differs.", { geochem: <b>{tr("Geochem")}</b>, geophysics: <b>{tr("Geophysics")}</b>, maps: <b>{tr("Maps")}</b> })}</div>
    </>
  );
}
