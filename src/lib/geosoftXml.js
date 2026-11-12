// TASKS.csv #2830 (GSC geophysics review) — a Geosoft grid (.grd / .gxf) carries no CRS of its own (its header's PROJ and unit fields are 0),
// but the GSC deliver a Geosoft .xml beside each one: <geosoft><dataset><georeference><projection name="NAD83 / UTM zone 19N"
// wellknown_epsg="26919">… with the same CRS as ESRI WKT. This reads it, and pairs it with its grid by name ('x.GRD.xml' or 'x.xml' for
// 'x.GRD'). Pure.
import { guessEpsgFromPrjWkt } from "./reproject.js";

// the .xml's text -> { epsg, name } | null
export function geosoftXmlCrs(text) {
  const s = String(text || "");
  if (!/<geosoft\b/i.test(s) && !/<projection\b/i.test(s)) return null;
  const proj = /<projection\b([^>]*)>/i.exec(s);
  const attr = (k) => { const m = proj && new RegExp(`\\b${k}\\s*=\\s*"([^"]*)"`, "i").exec(proj[1]); return m ? m[1] : null; };
  const name = attr("name");
  const code = Number(attr("wellknown_epsg") || attr("epsg"));
  if (Number.isInteger(code) && code > 0) return { epsg: code, name };
  // the WKT (an ESRI PROJCS / GEOGCS string) inside the projection or coordinate-system element
  const wkt = /((?:PROJCS|GEOGCS)\[[^<]+\])/i.exec(s.replace(/&quot;/g, '"'));
  const g = wkt ? guessEpsgFromPrjWkt(wkt[1]) : null;
  return g ? { epsg: Number(g), name } : null;
}
// the .xml selected with a grid, by name: 'x.GRD.xml', or 'x.xml' beside 'x.GRD'
export function sideXmlFor(file, xmls) {
  const n = String(file?.name || "").toLowerCase(), stem = n.replace(/\.[^.]+$/, "");
  return (xmls || []).find((x) => { const xn = String(x.name).toLowerCase(); return xn === `${n}.xml` || xn === `${stem}.xml`; }) || null;
}
