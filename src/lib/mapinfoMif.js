// TASKS.csv #945 — MapInfo Interchange Format (.MIF + .MID), the text form of a MapInfo table. Micromine's File > Export >
// MapInfo, GDAL / QGIS by default, and many ARIS report folders and MINFILE exports write MIF/MID rather than TAB, and
// GeoStrix read only the native TAB (#818). Same output as parseMapInfoTab, so the map-layer and structure imports take
// either: { layers: [{ name, features, geomType, epsg, crsNote, fields, skippedCount }], skippedCount, skipped }.
//
//   .MIF  header: Version, Charset, Delimiter, CoordSys (the #818 parser maps it to EPSG), Columns n + n field lines,
//         Data; then one object per .MID row: Point, Line, Pline [Multiple n], Region n, Rect, Roundrect, Ellipse, Arc,
//         Text, Multipoint, Collection, or none. Style clauses (Pen, Brush, Symbol, Smooth, Center, Font, Angle, ...)
//         follow an object and are skipped.
//   .MID  one delimited row of attributes per object ("" doubles a quote inside a quoted value).
// Shapes are generated as GDAL does and as the TAB reader does (same helpers): rectangle 5 points, rounded rectangle 45
// points per corner, ellipse 180 points, arc in 2-degree steps. Pure: text or bytes in, features out.
import { t as tr } from "./i18n.js";
import { makeDecoder, generateArc, closeRing, mapinfoCoordSysToEpsg } from "./mapinfoTab.js";

const toText = (src, decoder) => (src == null ? "" : typeof src === "string" ? src : decoder.decode(src instanceof Uint8Array ? src : new Uint8Array(src)));
const OBJECTS = new Set(["point", "line", "pline", "region", "rect", "roundrect", "ellipse", "arc", "text", "multipoint", "collection", "none"]);
const FIELD_KIND = { char: "string", integer: "integer", smallint: "integer", largeint: "integer", decimal: "number", float: "number", date: "date", time: "time", datetime: "datetime", logical: "string" };

// a MIF line's tokens: whitespace / commas / parentheses separate, "quoted" runs stay whole (quotes dropped)
function tokens(line) {
  const out = [];
  let cur = "", inQ = false, had = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; had = true; continue; }
    if (!inQ && /[\s,()]/.test(ch)) { if (cur || had) out.push(cur); cur = ""; had = false; continue; }
    cur += ch;
  }
  if (cur || had) out.push(cur);
  return out;
}

// one .MID row split on the delimiter, honouring quotes ("" inside quotes is a quote)
function splitMid(line, delim) {
  const out = [];
  let cur = "", inQ = false, quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch;
    } else if (ch === '"') { inQ = true; quoted = true; } else if (ch === delim) { out.push({ v: cur, quoted }); cur = ""; quoted = false; } else cur += ch;
  }
  out.push({ v: cur, quoted });
  return out;
}

function parseHeader(lines) {
  const h = { charset: null, delimiter: "\t", coordSys: null, fields: [], dataAt: -1 };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim(), k = raw.split(/\s+/)[0].toLowerCase();
    if (k === "charset") h.charset = tokens(raw)[1];
    else if (k === "delimiter") { const m = /"(.)"/.exec(raw); if (m) h.delimiter = m[1]; }
    else if (k === "coordsys") {
      // a Bounds clause may sit on the next line
      h.coordSys = raw + (/^\s*bounds\b/i.test(lines[i + 1] || "") ? ` ${lines[++i].trim()}` : "");
    } else if (k === "columns") {
      const n = parseInt(tokens(raw)[1], 10) || 0;
      for (let f = 0; f < n && i + 1 < lines.length; f++) {
        const t = tokens(lines[++i]);
        const type = (t[1] || "char").toLowerCase();
        h.fields.push({ name: t[0], tabType: type, kind: FIELD_KIND[type] || "string" });
      }
    } else if (k === "data") { h.dataAt = i + 1; break; }
  }
  return h;
}

function cellValue(cell, f) {
  const s = cell ? cell.v.trim() : "";
  if (f.kind === "string") return cell ? cell.v : "";
  if (s === "") return null;
  if (f.kind === "integer" || f.kind === "number") { const v = Number(s); return Number.isFinite(v) ? v : null; }
  if (f.kind === "date") return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
  return s;
}

// parseMapInfoMif({ mif, mid, name }) — `mif` / `mid` text or bytes (decoded by the .MIF's Charset); `mid` may be null.
export function parseMapInfoMif({ mif, mid = null, name = "MapInfo layer" }) {
  const sniff = typeof mif === "string" ? mif : new TextDecoder("windows-1252").decode(mif instanceof Uint8Array ? mif : new Uint8Array(mif));
  const cs = /^\s*charset\s+"?([^"\s]+)/im.exec(sniff);
  const decoder = makeDecoder(cs && cs[1]);
  const lines = toText(mif, decoder).split(/\r?\n/);
  const h = parseHeader(lines);
  if (h.dataAt < 0) throw new Error(tr("This .MIF file has no Data section, so it is not a MapInfo interchange file."));
  const midRows = mid == null ? null : toText(mid, decoder).split(/\r?\n/).filter((l, i, a) => l !== "" || i < a.length - 1);
  const crs = h.coordSys ? mapinfoCoordSysToEpsg(h.coordSys) : { epsg: null, crsNote: "No CoordSys clause." };

  // the object stream: a cursor over the Data lines' tokens, with the line each token came from
  const toks = [];
  for (let i = h.dataAt; i < lines.length; i++) for (const t of tokens(lines[i])) toks.push({ t, line: i });
  let p = 0;
  const num = () => { const v = Number(toks[p++]?.t); if (!Number.isFinite(v)) throw new Error("bad number"); return v; };
  const pt = () => [num(), num()];
  const pts = (n) => { const out = new Array(n); for (let k = 0; k < n; k++) out[k] = pt(); return out; };
  const isObj = (k) => k < toks.length && OBJECTS.has(toks[k].t.toLowerCase());
  const skipStyle = () => { while (p < toks.length && !isObj(p)) p++; }; // Pen / Brush / Symbol / Smooth / Center / Font ...

  const readObject = () => {
    const kw = toks[p++].t.toLowerCase();
    if (kw === "none") return { skip: "noGeometry" };
    if (kw === "point") return { family: "point", parts: [[pt()]] };
    if (kw === "line") return { family: "polyline", parts: [[pt(), pt()]] };
    if (kw === "pline") {
      if (toks[p] && toks[p].t.toLowerCase() === "multiple") { p++; const n = num(); const parts = []; for (let s = 0; s < n; s++) parts.push(pts(num())); return { family: "polyline", parts }; }
      return { family: "polyline", parts: [pts(num())] };
    }
    if (kw === "region") { const n = num(); const parts = []; for (let s = 0; s < n; s++) { const r = pts(num()); closeRing(r); parts.push(r); } return { family: "polygon", parts }; }
    if (kw === "multipoint") return { family: "multipoint", parts: pts(num()).map((q) => [q]) };
    if (kw === "rect" || kw === "roundrect" || kw === "ellipse") {
      const [ax, ay] = pt(), [bx, by] = pt();
      const ring = [];
      if (kw === "ellipse") { generateArc(ring, 180, (ax + bx) / 2, (ay + by) / 2, Math.abs((bx - ax) / 2), Math.abs((by - ay) / 2), 0, 2 * Math.PI); closeRing(ring); return { family: "polygon", parts: [ring] }; }
      const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
      const d = kw === "roundrect" && toks[p] && Number.isFinite(Number(toks[p].t)) && toks[p].line === toks[p - 1].line ? num() : 0; // corner diameter
      if (d > 0) {
        const rx = Math.min(d / 2, (x1 - x0) / 2), ry = Math.min(d / 2, (y1 - y0) / 2);
        generateArc(ring, 45, x0 + rx, y0 + ry, rx, ry, Math.PI, 3 * Math.PI / 2);
        generateArc(ring, 45, x1 - rx, y0 + ry, rx, ry, 3 * Math.PI / 2, 2 * Math.PI);
        generateArc(ring, 45, x1 - rx, y1 - ry, rx, ry, 0, Math.PI / 2);
        generateArc(ring, 45, x0 + rx, y1 - ry, rx, ry, Math.PI / 2, Math.PI);
        closeRing(ring);
      } else ring.push([x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]);
      return { family: "polygon", parts: [ring] };
    }
    if (kw === "arc") {
      const [X0, Y0] = pt(), [X1, Y1] = pt();
      const a0 = num(), a1 = num();
      const n = Math.max(2, a1 < a0 ? Math.trunc(Math.abs((a1 + 360 - a0) / 2) + 1) : Math.trunc(Math.abs((a1 - a0) / 2) + 1));
      const line = [];
      generateArc(line, n, (X0 + X1) / 2, (Y0 + Y1) / 2, Math.abs((X1 - X0) / 2), Math.abs((Y1 - Y0) / 2), (a0 * Math.PI) / 180, (a1 * Math.PI) / 180);
      return { family: "polyline", parts: [line] };
    }
    if (kw === "text") {
      const text = toks[p++]?.t ?? "";
      const [ax, ay] = pt(), [bx, by] = pt();
      return { family: "text", text, parts: [[[Math.min(ax, bx), Math.min(ay, by)]]] }; // the label box's lower-left corner
    }
    if (kw === "collection") { // region + pline + multipoint in one record: read past its parts, not drawn
      const n = num();
      for (let s = 0; s < n && isObj(p); s++) { readObject(); skipStyle(); }
      return { skip: "unsupported" };
    }
    return { skip: "unsupported" };
  };

  const skipped = { noGeometry: 0, deleted: 0, unsupported: 0, corrupt: 0 };
  const buckets = { point: [], polyline: [], polygon: [], text: [] };
  let row = 0;
  skipStyle();
  while (p < toks.length) {
    const cells = midRows && row < midRows.length ? splitMid(midRows[row], h.delimiter) : null;
    row++;
    const attributes = {};
    h.fields.forEach((f, i) => { attributes[f.name] = cells ? cellValue(cells[i], f) : null; });
    let obj;
    try { obj = readObject(); } catch { obj = { skip: "corrupt" }; }
    skipStyle();
    if (obj.skip) { skipped[obj.skip]++; continue; }
    if (obj.family === "multipoint") { for (const part of obj.parts) buckets.point.push({ geometry: part, parts: [part], attributes }); continue; }
    if (obj.family === "text") { const g = obj.parts[0]; buckets.text.push({ geometry: g, parts: [g], attributes: { ...attributes, _text: obj.text } }); continue; }
    const parts = obj.parts.filter((q) => q.length);
    if (!parts.length) { skipped.corrupt++; continue; }
    buckets[obj.family].push({ geometry: parts[0], parts, attributes });
  }
  const skippedCount = skipped.noGeometry + skipped.deleted + skipped.unsupported + skipped.corrupt;
  const fields = h.fields.map((f) => ({ name: f.name, type: f.kind }));
  const families = ["point", "polyline", "polygon"].filter((f) => buckets[f].length);
  const suffix = { point: " (points)", polyline: " (lines)", polygon: " (polygons)" };
  const layers = families.map((f) => ({ name: families.length > 1 ? name + suffix[f] : name, features: buckets[f], geomType: f, epsg: crs.epsg, crsNote: crs.crsNote, fields, skippedCount }));
  if (buckets.text.length) layers.push({ name: `${name} (text)`, features: buckets.text, geomType: "point", isText: true, epsg: crs.epsg, crsNote: crs.crsNote, fields: [...fields, { name: "_text", type: "string" }], skippedCount });
  if (!layers.length) throw new Error(tr("No points, lines or polygons could be read from this MapInfo file."));
  return { layers, skippedCount, skipped };
}
