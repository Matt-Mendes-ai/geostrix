// TASKS.csv #1035 (review #1016, QGIS / GIS) — a shapefile or GeoPackage imported as a boundary or claim: every part of
// every feature (outer rings, holes, the other parts of a multi-part claim), reprojected from the file's own CRS (.prj
// or GeoPackage srs_id) to the project CRS. Before, only each feature's first ring was kept and the coordinates were
// assumed to be in the project CRS: a BC Albers (EPSG:3005) tenure shapefile landed 5,036 km away with 77 of 131 rings.
import { getProj4Def, guessEpsgFromPrjWkt, pointTransform } from "./reproject.js";
import { t as tr } from "./i18n.js"; // TASKS.csv #1974 — the CRS notes in the interface language
import { readsAsMineGrid, mineToProject, kmFromCollars, partsBox } from "./mineGrid.js"; // TASKS.csv #2586
import { fileToLocal } from "./localGridTie.js"; // TASKS.csv #2587

// parsed: { features: [{ geometry, parts? }], geomType, epsg?, prjWkt? } (parseShapefileZip / a parseGeoPackage layer)
// -> { polylines: [[{x, y}]], closedFlags, sourceEpsg, note } — note says what was done with the CRS, in the interface language
// mineGrid / collars (TASKS.csv #2586): a project's mine grid beside its CRS (lib/mineGrid.js mineGridOf) and its collars: a file with no CRS
// whose coordinates lie on that grid is read on it; one that does not is told how far from the collars it landed
// tie (TASKS.csv #2587, review #2486): a local-grid project tied to a real CRS (lib/localGridTie.js tieOf): a file with a CRS is brought
// INTO the grid through the tie, as a map layer dropped on the plan already was (#2320). Before, Boundaries kept an MGA tenement at its
// MGA numbers, 6,240 km from the collars, saying 'the project has no coordinate system yet'.
export async function vectorToBoundaryPolylines(parsed, projectEpsg, { mineGrid = null, collars = null, tie = null } = {}) {
  const dst = Number(projectEpsg) || null;
  const src = Number(parsed.epsg) || (parsed.prjWkt ? guessEpsgFromPrjWkt(parsed.prjWkt) : null) || null;
  let T = null, note, mineGridUsed = false;
  if (tie && src && !dst) {
    if (src !== Number(tie.epsg)) await Promise.all([getProj4Def(src), getProj4Def(Number(tie.epsg))]);
    const ok = src === Number(tie.epsg) || !!pointTransform(src, Number(tie.epsg));
    if (ok) {
      T = (x, y) => { const r = fileToLocal(tie, x, y, src); return r ? [r.x, r.y] : [x, y]; };
      note = tr("brought into the local grid through its tie to EPSG:{tie} (from EPSG:{src})", { tie: tie.epsg, src });
    } else note = tr("its CRS (EPSG:{src}) cannot be brought through the local grid's tie to EPSG:{tie}: the coordinates were kept as they are, check where it lies", { src, tie: tie.epsg });
  } else if (src && dst && src !== dst) {
    await Promise.all([getProj4Def(src), getProj4Def(dst)]); // registry codes load on demand (#834)
    T = pointTransform(src, dst);
    note = T ? tr("reprojected from EPSG:{src} to EPSG:{dst}", { src, dst }) : tr("its CRS (EPSG:{src}) could not be converted: the coordinates were taken as EPSG:{dst}, check where it lies", { src, dst });
  } else if (src && !dst) note = tr("the project has no coordinate system yet: its EPSG:{src} coordinates were kept as they are, check where it lies", { src }); // #2287
  else if (src) note = null; // already the project CRS
  else if (!dst) note = tr("neither the file nor the project states a coordinate system: the coordinates were kept as they are, check where it lies"); // #2287
  else {
    const box = partsBox((parsed.features || []).flatMap((f) => (f.parts?.length ? f.parts : [f.geometry])));
    if (!parsed.prjWkt && readsAsMineGrid(box, mineGrid, collars, dst)) { // #2586
      const M = mineToProject(mineGrid, dst);
      T = (x, y) => M(x, y);
      mineGridUsed = true;
      note = tr("it states no CRS, and its coordinates lie on the project's mine grid{grid} where the collars are: read on that grid and brought into EPSG:{dst} through its tie", { grid: mineGrid.name ? ` (${mineGrid.name})` : "", dst });
    } else {
      const km = kmFromCollars(box, collars);
      const far = km != null && km > 20 ? tr(" (it landed {km} km from the collars)", { km: Math.round(km).toLocaleString() }) : ""; // #2586
      note = (parsed.prjWkt ? tr("its .prj names a CRS GeoStrix does not recognize: the coordinates were taken as EPSG:{dst}, check where it lies", { dst })
        : tr("it states no CRS: the coordinates were taken as EPSG:{dst}, check where it lies", { dst })) + far;
    }
  }
  const closed = parsed.geomType === "polygon";
  const polylines = [], closedFlags = [], featureOf = []; // featureOf: TASKS.csv #1970 — the feature each polyline came from
  (parsed.features || []).forEach((f, fi) => {
    const parts = f.parts?.length ? f.parts : [f.geometry];
    for (const part of parts) {
      if (!part || part.length < 2) continue;
      featureOf.push(fi);
      polylines.push(part.map(([x, y]) => { if (!T) return { x, y }; const [px, py] = T(x, y); return { x: px, y: py }; }));
      closedFlags.push(closed);
    }
  });
  return { polylines, closedFlags, featureOf, attributes: (parsed.features || []).map((f) => f.attributes || {}), sourceEpsg: src, note, ...(mineGridUsed ? { mineGrid: true } : {}) };
}

// TASKS.csv #1970 — a tenure file (BC Mineral Titles Online, a GeoPackage of claims) holds one feature per claim: each becomes
// its own claim, its tenure number, name and good-to date read from the attributes when a column says what it is. Up to `max`
// claims; a bigger file (a whole province) stays one claim and the caller says so. -> [{ name, polylines, closedFlags,
// tenureNumber, expiryDate }] or null when the file has one feature, no feature ids, or more than `max`.
const TENURE_COL = /^(tenure|title)(_?(number|num|no|nbr))?(_?id)?$|^(tenure|title|claim)_?(number|num|no|nbr)(_?id)?$/i;
const NAME_COL = /^(claim|tenure|title)_?name$|^name$/i;
const EXPIRY_COL = /good_?to|expir/i;
export function attrColumn(cols, rx) { return cols.find((c) => rx.test(String(c).trim())) || null; }
export function isoDateOf(v) {
  if (v == null || v === "") return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  const t = String(v).trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(t); // a dBASE date
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return "";
}
export function claimsFromVector(result, baseName, max = 300) {
  const { polylines = [], closedFlags = [], featureOf, attributes = [] } = result || {};
  if (!featureOf || featureOf.length !== polylines.length) return null;
  const used = [...new Set(featureOf)];
  if (used.length < 2 || used.length > max) return null;
  const cols = [...new Set(attributes.flatMap((a) => Object.keys(a || {})))];
  const tenureCol = attrColumn(cols, TENURE_COL), nameCol = attrColumn(cols, NAME_COL), expiryCol = attrColumn(cols, EXPIRY_COL);
  return used.map((fi, n) => {
    const at = attributes[fi] || {};
    const idx = featureOf.map((f, i) => (f === fi ? i : -1)).filter((i) => i >= 0);
    const tenure = tenureCol && at[tenureCol] != null ? String(at[tenureCol]).trim() : "";
    const label = (nameCol && at[nameCol] != null && String(at[nameCol]).trim()) || tenure || String(n + 1);
    return { name: `${baseName} ${label}`, polylines: idx.map((i) => polylines[i]), closedFlags: idx.map((i) => closedFlags[i]), tenureNumber: tenure, expiryDate: expiryCol ? isoDateOf(at[expiryCol]) : "" };
  });
}

// TASKS.csv #1466 (review #1352, Silvertip) — a boundary that can stand for an area: at least one ring of three points or more that is not
// flagged open. Contours, streams, survey lines and roads are open lines: the terrain / imagery area lists and Select by location skip them.
// A contour layer (contourLevels) is never an area, even where a level closes on itself.
export const isAreaBoundary = (b) => !(b?.contourLevels || []).length && (b?.polylines || []).some((l, i) => (l?.length || 0) >= 3 && b.closedFlags?.[i] !== false);
