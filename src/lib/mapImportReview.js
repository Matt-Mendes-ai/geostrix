// TASKS.csv #1325 — a report's whole MapInfo folder holds far more than map layers: legends, scale bars and page frames in page inches, section drawings in
// section coordinates, a Canada-wide location map, the grids and text of each figure. Assessment file 27622Z: 98 tables became 119 layers, and a legend
// at (3, 1) sits 6,000 km from the property, so the view opened on nothing. Sorted here by where each table sits, so only what belongs on this map is
// ticked. Pure: tables in, classes out.

import { median } from "./arrayStats.js";

// [xmin, ymin, xmax, ymax] of a table's features in its own coordinates, or null
export function featuresBox(features) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const walk = (p) => {
    if (typeof p?.[0] === "number") { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } else if (Array.isArray(p)) for (const q of p) walk(q);
  };
  for (const f of features || []) walk(f.parts ?? f.geometry);
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}
const diag = (b) => Math.hypot(b[2] - b[0], b[3] - b[1]);
const centre = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const overlaps = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
// TASKS.csv #1607 (review #1497, Lawyers) — a table that does not reach the project: how far its box lies from the project's (the gap between
// the two rectangles) and in which of 8 directions (0 = north, clockwise). The review saw a BC surficial sheet 'Regional or elsewhere ...
// 252 km across', unticked but with nothing saying it lay about 500 km from the drilling: the wrong sheet downloaded.
export function awayFrom(box, ref) {
  if (!box || !ref || overlaps(box, ref)) return null;
  const gx = Math.max(0, ref[0] - box[2], box[0] - ref[2]), gy = Math.max(0, ref[1] - box[3], box[1] - ref[3]);
  const [bx, by] = centre(box), [rx, ry] = centre(ref);
  const deg = ((Math.atan2(bx - rx, by - ry) * 180) / Math.PI + 360) % 360;
  return { distM: Math.hypot(gx, gy), dir: Math.round(deg / 45) % 8 };
}
const union = (boxes) => [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];

const isGrid = (t) => /grid/i.test(t.name) || t.layers.some((l) => (l.fields || []).includes("Coord"));
// nearly all text: a figure's label table often holds one stray point
const isLabels = (t) => {
  const all = t.layers.flatMap((l) => (l.geomType === "point" ? l.features : l.features.map(() => ({}))));
  return all.length > 0 && all.filter((f) => f.attributes?._text != null).length >= 0.9 * all.length;
};
// Tenure and masks cover everything under them in a solid colour: an outline with a faint fill shows what they enclose
export const isCoveringPolygon = (name, geomType) => geomType === "polygon" && /claim|tenure|licen[cs]e|lease|permit|mask|boundar/i.test(name);

// tables: [{ name, epsg (null: the file states none), layers: [{ features, geomType, fields }] }]. toCommon(box, epsg) -> the box in one CRS, or null. refBox: what the
// project already holds, in that CRS, or null. Returns { rows: [{ table, cls, box, sizeM }], common }. cls: map | regional | page | grid | labels; only map is ticked by default.
export function classifyTables(tables, { toCommon, refBox = null }) {
  const located = tables.map((t) => {
    const raw = featuresBox(t.layers.flatMap((l) => l.features));
    return { t, raw, box: raw && t.epsg ? toCommon(raw, t.epsg) : null };
  });
  const have = located.filter((x) => x.box);
  if (!have.length && !refBox) return located.map(({ t, raw }) => ({ table: t, cls: "map", box: raw, sizeM: raw ? diag(raw) : 0 })); // nothing to compare with: a single file with no CRS is just that
  const typical = refBox ? diag(refBox) : median(have.map((x) => diag(x.box)));
  const [cx, cy] = refBox ? centre(refBox) : [median(have.map((x) => centre(x.box)[0])), median(have.map((x) => centre(x.box)[1]))];
  const near = (b) => diag(b) <= Math.max(10 * typical, 50000) && Math.hypot(centre(b)[0] - cx, centre(b)[1] - cy) <= Math.max(5 * typical, 20000);
  const nearBoxes = have.filter((x) => near(x.box)).map((x) => x.box);
  const main = nearBoxes.length || refBox ? union([...nearBoxes, ...(refBox ? [refBox] : [])]) : null;
  return located.map(({ t, raw, box }) => {
    let cls;
    if (/legend/i.test(t.name)) cls = "page";
    else if (box) cls = near(box) ? "map" : "regional";
    else cls = raw && main && overlaps(raw, main) && near(raw) ? "map" : "page"; // no CRS: real only if it sits on the data
    if (cls === "map" && isGrid(t)) cls = "grid";
    else if (cls === "map" && isLabels(t)) cls = "labels";
    return { table: t, cls, box: box || raw, sizeM: (box || raw) ? diag(box || raw) : 0, away: box && refBox ? awayFrom(box, refBox) : null }; // away: #1607
  });
}

// Tables that are not plainly map layers are worth asking about; a tidy import goes straight through
export const needsImportReview = (rows) => rows.some((r) => r.cls !== "map");
export const IMPORT_CLASSES = ["map", "grid", "labels", "regional", "page"];
