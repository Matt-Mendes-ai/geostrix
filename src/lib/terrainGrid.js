// TASKS.csv #814 — what every online terrain source does once it has elevations on a lon/lat node grid: the grid size
// (#796), the reprojection into the project CRS the way parseDEMFiles does for a geographic source, and the no-data fill
// (#421). Moved out of srtmFetch.js unchanged so the AWS Terrain Tiles and the Copernicus GLO-30 sources share it.
import { getProj4Def, reprojectGrid } from "./reproject.js";
import { fillNoData, noDataNote } from "./demFill.js"; // TASKS.csv #421

// TASKS.csv #796 — in ground distance: a degree of longitude is cos(latitude) of a degree of latitude, so a square
// area at 52°N used to get 200 x 124 nodes (cells 60% longer north-south than east-west)
export function gridDims(lonMin, latMin, lonMax, latMax, gridMax) {
  const aspect = ((lonMax - lonMin) * Math.cos(((latMin + latMax) / 2) * (Math.PI / 180))) / Math.max(1e-12, latMax - latMin);
  return {
    gridW: aspect >= 1 ? gridMax : Math.max(2, Math.round(gridMax * aspect)),
    gridH: aspect >= 1 ? Math.max(2, Math.round(gridMax / aspect)) : gridMax,
  };
}

// raw: gridW x gridH elevations over the lon/lat box (row 0 north, NaN = no data) -> the terrain fields both sources return
export async function finishTerrain(raw, { lonMin, latMin, lonMax, latMax }, gridW, gridH, targetEpsg) {
  let outBbox = [lonMin, latMin, lonMax, latMax];
  let outGridW = gridW, outGridH = gridH, outElevations = raw;
  let reprojectedTo = null, reprojectNote = null;
  if (targetEpsg && Number(targetEpsg) !== 4326) {
    const [fromDef, toDef] = await Promise.all([getProj4Def(4326), getProj4Def(targetEpsg)]);
    if (fromDef && toDef) {
      const r = reprojectGrid({ xmin: lonMin, ymin: latMin, xmax: lonMax, ymax: latMax, gridW, gridH, band: raw }, fromDef, toDef, gridW, gridH);
      outBbox = r.bbox; outGridW = r.gridW; outGridH = r.gridH; outElevations = r.elevations;
      reprojectedTo = Number(targetEpsg);
    } else {
      reprojectNote = `Fetched in WGS84 (lon/lat) — automatic reprojection to the project's EPSG:${targetEpsg} wasn't available (unrecognized EPSG code), so it's landing at raw lon/lat coordinates. Double-check it lines up with the rest of the project.`;
    }
  }

  // TASKS.csv #421 — no-data cells are still filled (for sampling) but recorded and reported; see demFill.js.
  const fill = fillNoData(outElevations);
  const elevations = fill.elevations;

  return { bbox: outBbox, gridW: outGridW, gridH: outGridH, elevations, reprojectedTo, reprojectNote, noDataMask: fill.noDataMask, noDataNote: noDataNote(fill) };
}
