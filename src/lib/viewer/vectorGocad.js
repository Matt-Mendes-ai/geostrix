// TASKS.csv #2631 — the GOCAD file of a vector layer (the same { features, geomType } the Shapefile / GeoPackage / DXF exports take): points are a
// VSet (.vs) with every numeric attribute as a property column, lines and polygon rings a PLine (.pl). Its own file, loaded on demand, as vectorDxf.js.
import { writePLine, writeVSet } from "../gocadWrite.js";

const MAX_PROPS = 24;

// numeric attribute columns: every non-empty value a finite number (a text column, or a mixed one, is left out)
export function numericColumns(features) {
  const cols = new Map();
  for (const f of features) {
    for (const [k, v] of Object.entries(f.attributes || {})) {
      const c = cols.get(k) || { ok: true, seen: 0 };
      if (v === null || v === undefined || v === "") { cols.set(k, c); continue; }
      if (typeof v !== "number" || !Number.isFinite(v)) c.ok = false; else c.seen++;
      cols.set(k, c);
    }
  }
  return [...cols].filter(([, c]) => c.ok && c.seen > 0).map(([k]) => k).slice(0, MAX_PROPS);
}

// -> { text, ext: "vs" | "pl", count, zMissing, properties }
export function vectorGocadText({ features, geomType }, { label, epsg = null, crs = "", comments = [] }) {
  const meta = { epsg, comments: [crs ? `Project CRS: ${crs}` : "", `Exported: ${new Date().toISOString()}`, ...comments] };
  if (geomType === "point") {
    const cols = numericColumns(features);
    const pts = features.flatMap((f) => (f.geometry || []).map((p) => ({ x: p[0], y: p[1], z: p[2], values: cols.map((k) => f.attributes?.[k]) })));
    const r = writeVSet(label, pts, cols, meta);
    return { text: r.text, ext: "vs", count: r.points, zMissing: r.zMissing, properties: r.properties };
  }
  const lines = features.flatMap((f) => (f.parts?.length ? f.parts : [f.geometry]));
  const r = writePLine(label, lines, meta);
  return { text: r.text, ext: "pl", count: r.lines, zMissing: r.zMissing, properties: [] };
}
