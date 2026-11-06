// TASKS.csv #1064 (review #1016, QGIS / GIS) — the CRS of a coordinate CSV's x / y, as a column value: "EPSG:26910", or
// "not set" while the project's coordinate system is only a placeholder. (A leading "# ..." line made QGIS / GDAL read it
// as the header: no points, columns lost.)
// TASKS.csv #1493 — in its own file (no papaparse) so the 3D View can import it without pulling the CSV engine into startup;
// tabular.js re-exports it for everyone else.
export function crsCell(project) {
  return project?.epsg && project?.crsSet !== false ? `EPSG:${project.epsg}` : "not set";
}
