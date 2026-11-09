// TASKS.csv #2287 (review #2174) — the CRS that imported files are reprojected INTO. While the project CRS is not set, project.epsg holds a placeholder
// (EPSG:3156, BC UTM 9N, #615): an MGA GeoTIFF was moved 21,500 km into it and an MGA claim's area came out 3.2x too large. No target then:
// the importers keep the file's own coordinates and say so (their 'no project CRS' branches).
export const projectTargetEpsg = (project) => (project?.crsSet === false ? null : project?.epsg ?? null);
