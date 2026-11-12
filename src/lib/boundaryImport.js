// TASKS.csv #1035 (review #1016, QGIS / GIS) — a shapefile or GeoPackage imported as a boundary or claim: every part of
// every feature (outer rings, holes, the other parts of a multi-part claim), reprojected from the file's own CRS (.prj
// or GeoPackage srs_id) to the project CRS. Before, only each feature's first ring was kept and the coordinates were
// assumed to be in the project CRS: a BC Albers (EPSG:3005) tenure shapefile landed 5,036 km away with 77 of 131 rings.
import { getProj4Def, guessEpsgFromPrjWkt, pointTransform, crsName, datumNote } from "./reproject.js"; // crsName, datumNote: #2467

// TASKS.csv #2467 (review #2325, WA uranium) — what an import says about its CRS depended on the file type: a GDA94 shapefile and a lon / lat
// KML said nothing, another CRS read 'reprojected from EPSG:20351 to EPSG:28351' in bare codes, and the AGD84 datum-shift caveat was never
// shown. One shape now: the CRS the file declared, by name, what was done, and the datum caveat when a datum shift was applied.
export const crsLabel = (c) => { const n = crsName(Number(c)); return n ? `${n} (EPSG:${c})` : `EPSG:${c}`; };
const withDatum = (note, ...codes) => { const d = codes.map((c) => datumNote(c)).find(Boolean); return d ? `${note}; ${String(d).replace(/\.\s*$/, "")}` : note; };
import { t as tr } from "./i18n.js"; // TASKS.csv #1974 — the CRS notes in the interface language
import { readsAsMineGrid, mineToProject, kmFromCollars, partsBox, isMineSource, mineSourceNote } from "./mineGrid.js"; // TASKS.csv #2586; isMineSource, mineSourceNote: #2684
import { fileToLocal } from "./localGridTie.js"; // TASKS.csv #2587

// parsed: { features: [{ geometry, parts? }], geomType, epsg?, prjWkt? } (parseShapefileZip / a parseGeoPackage layer)
// -> { polylines: [[{x, y}]], closedFlags, sourceEpsg, note } — note says what was done with the CRS, in the interface language
// mineGrid / collars (TASKS.csv #2586): a project's mine grid beside its CRS (lib/mineGrid.js mineGridOf) and its collars: a file with no CRS
// whose coordinates lie on that grid is read on it; one that does not is told how far from the collars it landed
// tie (TASKS.csv #2587, review #2486): a local-grid project tied to a real CRS (lib/localGridTie.js tieOf): a file with a CRS is brought
// INTO the grid through the tie, as a map layer dropped on the plan already was (#2320). Before, Boundaries kept an MGA tenement at its
// MGA numbers, 6,240 km from the collars, saying 'the project has no coordinate system yet'.
// source / mineSource (TASKS.csv #2684): a Source CRS chosen in the Boundaries / Claims pane (components/SourceCrsField.jsx) over the file's
// own: an EPSG code, or "mine" with mineSource = lib/mineGrid.js mineSourceOf(project) ('Local mine grid (no CRS)')
export async function vectorToBoundaryPolylines(parsed, projectEpsg, { mineGrid = null, collars = null, tie = null, source = null, mineSource = null } = {}) {
  const dst = Number(projectEpsg) || null;
  const src = Number(parsed.epsg) || (parsed.prjWkt ? guessEpsgFromPrjWkt(parsed.prjWkt) : null) || null;
  const box = () => partsBox((parsed.features || []).flatMap((f) => (f.parts?.length ? f.parts : [f.geometry])));
  const { T, note, mineGridUsed } = await boundaryCrsTransform({ src, prjWkt: parsed.prjWkt, dst, box, mineGrid, collars, tie, source, mineSource });
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
  const attributes = (parsed.features || []).map((f) => f.attributes || {});
  const partNames = featureOf.map((fi) => featureLabel(attributes[fi])); // #1767
  return { polylines, closedFlags, featureOf, attributes, ...(partNames.some(Boolean) ? { partNames } : {}), sourceEpsg: src, note, ...(mineGridUsed ? { mineGrid: true } : {}) };
}

// TASKS.csv #1970 — a tenure file (BC Mineral Titles Online, a GeoPackage of claims) holds one feature per claim: each becomes
// its own claim, its tenure number, name and good-to date read from the attributes when a column says what it is. Up to `max`
// claims; a bigger file (a whole province) stays one claim and the caller says so. -> [{ name, polylines, closedFlags,
// tenureNumber, expiryDate }] or null when the file has one feature, no feature ids, or more than `max`.
// TASKS.csv #2466 (review #2325, WA uranium) — Western Australian tenement files: TEN_ID / TENID / TENEMENT / TENEMENT_ID, LEASE_NO
const TENURE_COL = /^(tenure|title)(_?(number|num|no|nbr))?(_?id)?$|^(tenure|title|claim)_?(number|num|no|nbr)(_?id)?$|^ten_?id$|^tenement(_?(id|no|number|num))?$|^lease_?(id|no|number|num)$/i;
const STATUS_COL = /^(status|ten_?status|tenure_?status|claim_?status|tenstatus)$/i;
// a tenure status as the file words it -> "active" | "pending" | "expired" | null (said nothing GeoStrix knows)
export function claimStatusOf(v) {
  const t = String(v ?? "").trim().toLowerCase();
  if (!t) return null;
  if (/^(live|granted|active|good|in good standing|current|registered|issued)\b/.test(t)) return "active";
  if (/^(pending|application|applied|app|proposed|under application)\b/.test(t)) return "pending";
  if (/^(expired|dead|surrendered|cancelled|canceled|forfeited|lapsed|withdrawn|refused|terminated)\b/.test(t)) return "expired";
  return null;
}
const NAME_COL = /^(claim|tenure|title)_?name$|^name$/i;
const EXPIRY_COL = /good_?to|expir/i;
// TASKS.csv #1767 (review #1645, Copley) — a feature's own name (a name / label / title property), so the parts of one boundary file (a claim
// block, two prospect outlines, a road) can be told apart. '' when it has none.
export function featureLabel(attrs) {
  if (!attrs || typeof attrs !== "object") return "";
  const k = Object.keys(attrs).find((c) => /^(name|label|title|feature_?name|prospect|claim_?name)$/i.test(String(c).trim()) && String(attrs[c] ?? "").trim() !== "");
  return k ? String(attrs[k]).trim() : "";
}
// the file name without its extension, as the claims path names a claim (#1767)
export const fileStem = (name) => String(name || "").replace(/\.[^./\\]+$/, "") || String(name || "");
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
  if (used.length < 1 || used.length > max) return null; // #2466 — one feature too: its tenure number / status were dropped
  const cols = [...new Set(attributes.flatMap((a) => Object.keys(a || {})))];
  const tenureCol = attrColumn(cols, TENURE_COL), nameCol = attrColumn(cols, NAME_COL), expiryCol = attrColumn(cols, EXPIRY_COL), statusCol = attrColumn(cols, STATUS_COL); // statusCol: #2466
  return used.map((fi, n) => {
    const at = attributes[fi] || {};
    const idx = featureOf.map((f, i) => (f === fi ? i : -1)).filter((i) => i >= 0);
    const tenure = tenureCol && at[tenureCol] != null ? String(at[tenureCol]).trim() : "";
    const label = (nameCol && at[nameCol] != null && String(at[nameCol]).trim()) || tenure || String(n + 1);
    const status = statusCol ? claimStatusOf(at[statusCol]) : null; // #2466
    return { name: used.length === 1 ? baseName : `${baseName} ${label}`, polylines: idx.map((i) => polylines[i]), closedFlags: idx.map((i) => closedFlags[i]), tenureNumber: tenure, expiryDate: expiryCol ? isoDateOf(at[expiryCol]) : "", ...(status ? { status } : {}) };
  });
}

// TASKS.csv #1466 (review #1352, Silvertip) — a boundary that can stand for an area: at least one ring of three points or more that is not
// flagged open. Contours, streams, survey lines and roads are open lines: the terrain / imagery area lists and Select by location skip them.
// A contour layer (contourLevels) is never an area, even where a level closes on itself.
export const isAreaBoundary = (b) => !(b?.contourLevels || []).length && (b?.polylines || []).some((l, i) => (l?.length || 0) >= 3 && b.closedFlags?.[i] !== false);

// TASKS.csv #2684 — the CRS part of vectorToBoundaryPolylines, shared with the DXF / PLY routes when a Source CRS is chosen. src: the file's
// own EPSG (null when it states none); prjWkt: its .prj text; box: its [xmin, ymin, xmax, ymax] (or a function giving it), for the mine-grid
// read (#2586). -> { T: (x, y) -> [x, y] | null (null = keep the numbers), note, mineGridUsed }
export async function boundaryCrsTransform({ src = null, prjWkt = null, dst = null, box = null, mineGrid = null, collars = null, tie = null, source = null, mineSource = null } = {}) {
  let T = null, note, mineGridUsed = false;
  if (isMineSource(source)) { // #2684 — 'Local mine grid (no CRS)' wins over the file's own CRS
    const set = src ? tr("; its own {crs} was set aside", { crs: crsLabel(src) }) : "";
    if (mineSource?.kind === "tie") { const M = mineToProject({ name: mineSource.name, tie: mineSource.mg.tie }, dst); T = (x, y) => M(x, y); mineGridUsed = true; }
    return { T, note: mineSourceNote(mineSource, dst) + set, mineGridUsed };
  }
  if (source !== "" && source != null && Number(source) > 0) { src = Number(source); prjWkt = null; } // #2684 — a code chosen by hand
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
    note = T ? withDatum(tr("its {src} was reprojected to the project's {dst}", { src: crsLabel(src), dst: crsLabel(dst) }), src, dst) : tr("its CRS (EPSG:{src}) could not be converted: the coordinates were taken as EPSG:{dst}, check where it lies", { src, dst });
  } else if (src && !dst) note = tr("the project has no coordinate system yet: its EPSG:{src} coordinates were kept as they are, check where it lies", { src }); // #2287
  else if (src) note = tr("in {crs}, the project's coordinate system", { crs: crsLabel(src) }); // already the project CRS: said too (#2467)
  else if (!dst) note = tr("neither the file nor the project states a coordinate system: the coordinates were kept as they are, check where it lies"); // #2287
  else {
    const b = typeof box === "function" ? box() : box;
    if (!prjWkt && readsAsMineGrid(b, mineGrid, collars, dst)) { // #2586
      const M = mineToProject(mineGrid, dst);
      T = (x, y) => M(x, y);
      mineGridUsed = true;
      note = tr("it states no CRS, and its coordinates lie on the project's mine grid{grid} where the collars are: read on that grid and brought into EPSG:{dst} through its tie", { grid: mineGrid.name ? ` (${mineGrid.name})` : "", dst });
    } else {
      const km = kmFromCollars(b, collars);
      const far = km != null && km > 20 ? tr(" (it landed {km} km from the collars)", { km: Math.round(km).toLocaleString() }) : ""; // #2586
      note = (prjWkt ? tr("its .prj names a CRS GeoStrix does not recognize: the coordinates were taken as EPSG:{dst}, check where it lies", { dst })
        : tr("it states no CRS: the coordinates were taken as EPSG:{dst}, check where it lies", { dst })) + far;
    }
  }
  return { T, note, mineGridUsed };
}
