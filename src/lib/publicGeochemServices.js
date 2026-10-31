// TASKS.csv #1155 — the second batch of public geochemistry (Matt: "do all five plus Ireland", "keep looking for Brazil"):
// Newfoundland & Labrador, Saskatchewan, Yukon (ArcGIS REST), Western Australia, Victoria, Brazil (WFS) and Ireland's
// Tellus file. Each parser was written against a real response from the service (2026-10-31, small boxes in
// scratch tests); the codes each survey uses for "no result" differ, so they are per survey here, never a shared rule:
//   NL -9 = no result (whole columns of it where a survey did not run a method); a 0 is kept as reported-zero
//   SK / Yukon negative = below that limit; 0, " " and "*" = no result (Yukon's 1977 rows read 0 in every method not run)
//   WA -9999 = no result, other negative = below that limit; VIC -999 and -0.999 = no result, other negative = below it
//   Brazil: each result carries its own "<" / ">"; Ireland: below the limit was replaced with half the limit
// fetchServiceSamples takes the fetcher, so the paging is tested without a network. Output as publicGeochem.table().
import { table, parseCsv, usgsValue, serviceError } from "./publicGeochem.js";
import { isElementColumn } from "./geochem.js";
import { t as tr } from "./i18n.js";

export const SERVICE_MAX_ROWS = 40000; // an area holding more is refused (the fetch cap is 64 MB a request; this is a project, not a province)

const inBox = (lon, lat, b) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
const titleCase = (s) => s[0].toUpperCase() + s.slice(1).toLowerCase();
const NOT_ELEMENTS = new Set(["Tc", "Ts", "Pm", "Po"]); // TC_PCT / TS_PCT are total carbon and total sulphur
const element = (s) => { const sym = titleCase(s); return !NOT_ELEMENTS.has(sym) && isElementColumn(sym) ? sym : null; };
const UNIT = { PPM: "ppm", PPB: "ppb", PCT: "pct" };
// these services store floats: 0.25999999 -> 0.26
const tidy = (n) => String(+n.toPrecision(7));

// a cell: blank for the survey's no-result codes, "<limit" for a negative
const censored = (v, noResult = () => false) => {
  if (v == null) return "";
  const t = String(v).trim();
  if (t === "" || t === "*") return "";
  const n = Number(t);
  if (!Number.isFinite(n) || noResult(n)) return "";
  return n < 0 ? usgsValue(tidy(n)) : tidy(n);
};

const OXIDES = { SIO2: "SiO2", TIO2: "TiO2", AL2O3: "Al2O3", FE2O3: "Fe2O3", FE2O3_TOT: "Fe2O3T", FE2O3T: "Fe2O3T", FEO: "FeO", MNO: "MnO", MGO: "MgO", CAO: "CaO", NA2O: "Na2O", K2O: "K2O", P2O5: "P2O5" };
// CU_PPM, AG_ICP_PPB, AU2_AAS_FA_PPB, SN_INA_PPM_FUSION, AS_HYD_PPM; oxides as weight percent only
export function esriColumn(h) {
  const s = String(h);
  const ox = /^([A-Z0-9_]+)_PCT$/.exec(s);
  if (ox && OXIDES[ox[1]]) return `${OXIDES[ox[1]]}_pct`;
  const m = /^([A-Z]{1,2})(2?)(?:_([A-Z_]+?))?_(PPM|PPB|PCT)(?:_FUSION)?$/.exec(s);
  if (!m) return null;
  const sym = element(m[1]);
  if (!sym) return null;
  const method = m[3] ? m[3].replace(/_/g, "-") : "";
  return method ? `${sym}_${method}${m[2]}_${UNIT[m[4]]}` : `${sym}${m[2] ? `_${m[2]}` : ""}_${UNIT[m[4]]}`;
}
// NL: AG3_PPM, AU1_PPB, FE1_PCT - the number is the Atlas's method code (1 INAA and 2 ICP, read from its layer names; the
// others are kept as the code). FW9_PPB and UW10_PPB are fluorine and uranium in water: not elements of the sediment.
export function nlColumn(h) {
  const m = /^([A-Z]{1,2})(\d+)_(PPM|PPB|PCT)$/.exec(String(h));
  if (!m) return null;
  const sym = element(m[1]);
  return sym ? `${sym}_${{ 1: "INA", 2: "ICP" }[m[2]] || m[2]}_${UNIT[m[3]]}` : null;
}
// The GSC National Geochemical Reconnaissance columns Saskatchewan republishes carry no units: these are that program's
// own (Au and Hg in ppb, Fe in percent, the rest ppm; by neutron activation Au ppb, Fe and Na percent, the rest ppm)
export function gscColumn(h) {
  const m = /^(AS_|C0|[A-Z]{1,2})(_INA)?$/.exec(String(h));
  if (!m) return null;
  const sym = element(m[1] === "AS_" ? "AS" : m[1] === "C0" ? "CO" : m[1]);
  if (!sym) return null;
  const unit = sym === "Au" || (sym === "Hg" && !m[2]) ? "ppb" : sym === "Fe" || (sym === "Na" && m[2]) ? "pct" : "ppm";
  return m[2] ? `${sym}_INA_${unit}` : `${sym}_${unit}`;
}

const yearFromMs = (ms) => (Number.isFinite(ms) ? String(new Date(ms).getUTCFullYear()) : "");
const lonLatOf = (f) => { const g = f.geometry || {}; const p = g.points?.[0]; return p ? [p[0], p[1]] : [g.x, g.y]; };
const mediumOf = (t) => (/stream|silt|sediment/i.test(t) && !/lake/i.test(t) ? "stream sediment" : /soil/i.test(t) ? "soil" : /rock|outcrop|float/i.test(t) ? "rock chip" : "other");

// one ArcGIS feature -> a row. columns: [[field, output name]...] for the layer, worked out once from the first feature
const ARC_LAYERS = {
  "nl": {
    columnOf: nlColumn, extra: ["source_type"],
    row: (a, layer, ctx) => {
      const o = { sample_id: String(a.SAMPLE_ID ?? a.OBJECTID ?? ""), medium: layer.medium, source_type: layer.label, collected: a.YEAR != null && a.YEAR > 0 ? String(a.YEAR) : "" };
      for (const [h, n] of ctx.columns) {
        if (a[h] === 0) { o[n] = ""; (o.zeroReported ||= []).push(n); ctx.zeros++; } else o[n] = censored(a[h], (v) => v < 0);
      }
      return o;
    },
  },
  "sk-lake": {
    columnOf: esriColumn, extra: ["source_type", "method"],
    row: (a, layer, ctx) => {
      const y = Number(a.YR);
      const o = { sample_id: String(a.SAMPLE_NO ?? a.OBJECTID ?? ""), medium: layer.medium, source_type: a.TYPE || layer.label, method: a.TECHNIQUE || "", collected: Number.isFinite(y) && y > 0 ? String(y < 100 ? 1900 + y : y) : "" };
      for (const [h, n] of ctx.columns) o[n] = censored(a[h], (v) => v === 0);
      return o;
    },
  },
  "sk-gsc": {
    columnOf: gscColumn, extra: ["source_type", "survey"],
    row: (a, layer, ctx) => {
      const o = { sample_id: String(a.UNIQ_ID ?? a.OBJECTID ?? ""), medium: layer.medium, source_type: layer.label, survey: a.GSC_OF != null ? `GSC OF ${a.GSC_OF}` : "" };
      for (const [h, n] of ctx.columns) o[n] = censored(a[h], (v) => v === 0);
      return o;
    },
  },
  "sk-till": {
    columnOf: esriColumn, extra: ["source_type", "method"],
    row: (a, layer, ctx) => {
      const o = { sample_id: String(a.SAMPLE_NUMBER_ID ?? a.OBJECTID ?? ""), medium: mediumOf(a.SAMPLE_TYPE || ""), source_type: a.SAMPLE_TYPE || layer.label, method: [a.DIGESTION, a.ANALYTICAL_METHOD].filter(Boolean).join(", "), collected: yearFromMs(a.DATE_SAMPLE_COLLECTED) };
      for (const [h, n] of ctx.columns) o[n] = censored(a[h], (v) => v === 0);
      return o;
    },
  },
  "yt-rgs": {
    columnOf: esriColumn, extra: ["source_type", "survey"],
    row: (a, layer, ctx) => {
      const o = { sample_id: String(a.SAMPLE_ID ?? a.OBJECTID ?? ""), medium: layer.medium, source_type: layer.label, survey: a.OPEN_FILE_ORIGINAL || "", collected: a.YEAR ? String(a.YEAR) : "" };
      for (const [h, n] of ctx.columns) o[n] = censored(a[h], (v) => v === 0);
      return o;
    },
  },
  "yt-ar": {
    columnOf: esriColumn, extra: ["source_type", "method", "report", "location_confidence"],
    row: (a, layer, ctx) => {
      const o = { sample_id: String(a.SAMPLE_NAME ?? a.OBJECTID ?? ""), medium: mediumOf(a.SAMPLE_TYPE || ""), source_type: a.SAMPLE_TYPE || "", method: a.ANALYTICAL_METHOD_FAMILY || "", report: a.REPORT_NUMBER ? `AR ${a.REPORT_NUMBER}` : "", location_confidence: a.COORDINATE_CONFIDENCE || "" };
      for (const [h, n] of ctx.columns) o[n] = censored(a[h], (v) => v === 0);
      return o;
    },
  },
};

// One sample's results often come as a row per lab package (Yukon's aqua regia row and fire-assay row, Saskatchewan's till
// packages). They are one sample: rows with the same id and place merge, unless two give the same column different values,
// when the later one stays its own row under a suffixed id (the surface import merges by id, #954, and would lose it).
export function mergeSamples(rows, attrs = []) {
  const firsts = new Map(), out = [], used = new Map();
  for (const r of rows) {
    const key = `${r.sample_id}|${r.longitude}|${r.latitude}`, list = firsts.get(key) || [];
    const home = list.find((o) => Object.keys(r).every((k) => attrs.includes(k) || k === "zeroReported" || r[k] === "" || r[k] == null || o[k] === "" || o[k] == null || o[k] === r[k]));
    if (home) {
      for (const k of Object.keys(r)) {
        if (k === "zeroReported") { home.zeroReported = [...new Set([...(home.zeroReported || []), ...r.zeroReported])]; continue; }
        if (attrs.includes(k)) { if (r[k] && !String(home[k] || "").includes(r[k])) home[k] = home[k] ? `${home[k]}; ${r[k]}` : r[k]; continue; }
        if (home[k] === "" || home[k] == null) home[k] = r[k];
      }
      continue;
    }
    const n = (used.get(r.sample_id) || 0) + 1;
    used.set(r.sample_id, n);
    if (n > 1) r.sample_id = `${r.sample_id}-${n}`;
    list.push(r); firsts.set(key, list); out.push(r);
  }
  return out;
}

export function parseArcFeatures(features, layer, entry, area) {
  const def = ARC_LAYERS[layer.parse];
  const names = new Map();
  for (const f of features) for (const h of Object.keys(f.attributes || {})) if (!names.has(h)) names.set(h, def.columnOf(h));
  const ctx = { columns: [...names].filter(([, n]) => n), zeros: 0 };
  const rows = [];
  for (const f of features) {
    const [lon, lat] = lonLatOf(f);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || (area && !inBox(lon, lat, area))) continue;
    rows.push({ ...def.row(f.attributes, layer, ctx), longitude: String(lon), latitude: String(lat), elevation: "" });
  }
  const notes = ctx.zeros ? [{ key: "{n} zero value(s) read as no value: this layer has no below-detection marker, so a 0 may be below detection or not analysed. Thresholds and Surface QA/QC count them separately.", n: ctx.zeros }] : [];
  return table(mergeSamples(rows, ["method"]), [...new Set(ctx.columns.map(([, n]) => n))], def.extra, entry, notes);
}

// ---------- Western Australia: WACHEM, one CSV ----------
const WA_NAMES = { ars: "As", ind: "In" };
export function waColumn(h) {
  const ox = /^([a-z0-9]+)_pct$/.exec(String(h));
  if (ox && OXIDES[ox[1].toUpperCase()]) return `${OXIDES[ox[1].toUpperCase()]}_pct`;
  const m = /^([a-z]{1,3})_(ppm|ppb|pct)$/.exec(String(h));
  if (!m) return null;
  const sym = WA_NAMES[m[1]] || (m[1].length <= 2 ? element(m[1]) : null);
  return sym ? `${sym}_${m[2]}` : null;
}
const waMedium = (type, lith) => (/^outcr/i.test(type) ? "rock chip" : /stream|drainage/i.test(lith) ? "stream sediment" : /soil/i.test(lith) ? "soil" : "other");
export function parseWachem(csvText, entry) {
  const { headers, rows } = parseCsv(csvText);
  const map = headers.map((h) => [h, waColumn(h)]).filter(([, n]) => n);
  let drill = 0;
  const out = [];
  for (const r of rows) {
    if (/^drill/i.test(r.sampletype)) { drill++; continue; } // core from depth, at its collar: not a surface sample
    if (!Number.isFinite(parseFloat(r.dlong)) || !Number.isFinite(parseFloat(r.dlat))) continue;
    const o = { sample_id: r.sampleid || r.gswano || "", longitude: r.dlong, latitude: r.dlat, elevation: "", medium: waMedium(r.sampletype, r.lithname), source_type: r.sampletype || "", lithology: r.lithname || "", location_within_m: String(r.reliability || "").replace(/^Within:/, "") };
    for (const [h, n] of map) o[n] = censored(r[h], (v) => v <= -9999);
    out.push(o);
  }
  const notes = drill ? [{ key: "{n} drill core sample(s) left out: they come from depth, not from the surface.", n: drill }] : [];
  return table(out, map.map(([, n]) => n), ["source_type", "lithology", "location_within_m"], entry, notes);
}

// ---------- Victoria: company surface samples, GEOCHEMISTRY and the older GCHEM ----------
const VIC_MEDIUM = { SOIL: "soil", SED: "stream sediment", ROCK: "rock chip" };
const point = (wkt) => { const m = /POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)/.exec(String(wkt || "")); return m ? [Number(m[1]), Number(m[2])] : [NaN, NaN]; };
// au_other is free text: "0.001 ppm", ".091 ppm". Read when it is plainly a number and a unit, as ppb; anything else is left
export function vicGoldOther(v) {
  const m = /^(<?)\s*(\d*\.?\d+)\s*(ppm|ppb|g\/t)$/i.exec(String(v ?? "").trim());
  if (!m) return "";
  const ppb = /ppb/i.test(m[3]) ? Number(m[2]) : Number(m[2]) * 1000;
  return `${m[1]}${tidy(ppb)}`;
}
export function parseVic(csvText, entry) {
  const { headers, rows } = parseCsv(csvText);
  const map = headers.map((h) => { const m = /^([a-z]{1,2})_(ppm|ppb)$/.exec(h), sym = m && element(m[1]); return sym ? [h, `${sym}_${m[2]}`] : null; }).filter(Boolean);
  const out = [];
  let gold = 0;
  for (const r of rows) {
    const [lon, lat] = point(r.geom);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const type = String(r.samp_type || "").trim();
    const o = { sample_id: String(r.siteid || ""), longitude: String(lon), latitude: String(lat), elevation: "", medium: VIC_MEDIUM[type] || "other", source_type: type, company: String(r.company || "").trim(), location_within_m: String(r.locn_acc || "").trim() };
    for (const [h, n] of map) o[n] = censored(r[h], (v) => v === -999 || v === -0.999);
    if (o.Au_ppb === "") { const g = vicGoldOther(r.au_other); if (g) { o.Au_ppb = g; gold++; } }
    out.push(o);
  }
  const notes = gold ? [{ key: "{n} gold result(s) reported in another unit were converted to ppb.", n: gold }] : [];
  return table(out, map.map(([, n]) => n), ["source_type", "company", "location_within_m"], entry, notes);
}

// ---------- Brazil: SGB's geochemistry views, each result with its own unit and qualifier in a JSON column ----------
const SGB_MEDIUM = { "sedimento de corrente": "stream sediment", solo: "soil", rocha: "rock chip" };
export function parseSgb(csvText, entry) {
  const { rows } = parseCsv(csvText);
  const cols = new Set(), out = [];
  let above = 0;
  for (const r of rows) {
    let lab;
    try { lab = JSON.parse(r.analitos || "{}"); } catch { lab = {}; }
    const [lon, lat] = [parseFloat(r.longitude), parseFloat(r.latitude)];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const o = { sample_id: r.numero_de_campo || r.numero_de_laboratorio || r.objectid || "", longitude: String(lon), latitude: String(lat), elevation: "", medium: SGB_MEDIUM[String(r.classe || "").toLowerCase()] || "other", source_type: r.classe || "", project: r.projeto_amostragem || "", digestion: r.abertura || "", method: r.leitura || "", lab: r.laboratorio || "", collected: r.data_de_analise || "" };
    for (const [k, a] of Object.entries(lab)) {
      const sym = element(k), unit = String(a?.unidade || "").toLowerCase();
      if (!sym || !/^(ppm|ppb|pct)$/.test(unit) || !Number.isFinite(Number(a.valor))) continue;
      const col = `${sym}_${unit}`;
      cols.add(col);
      if (a.qualificador === ">") above++; // kept at the limit: there is no way to mark "above" in a value
      o[col] = a.qualificador === "<" ? `<${a.valor}` : String(a.valor);
    }
    out.push(o);
  }
  const notes = above ? [{ key: "{n} result(s) above the lab's upper limit are kept at that limit.", n: above }] : [];
  return table(mergeSamples(out), [...cols].sort(), ["source_type", "project", "digestion", "method", "lab"], entry, notes);
}

// ---------- Ireland: Tellus workbook, whole country; below the limit was replaced by half the limit (its Read_Me) ----------
export function tellusColumn(h) {
  const parts = String(h).split("_");
  if (parts.length < 3) return null;
  const unit = { "%": "pct", mgkg: "ppm", "µgkg": "ppb" }[parts[1]];
  if (!unit) return null;
  if (OXIDES[parts[0].toUpperCase()]) return `${parts[0]}_pct`;
  const sym = element(parts[0]);
  return sym ? `${sym}_${parts.slice(2).join("-")}_${unit}` : null;
}
// sheets: readXlsxSheets. toLonLat: (easting, northing) in Irish Grid -> [lon, lat]
export function parseTellus(sheets, area, toLonLat, entry) {
  const data = sheets.find((s) => s.rows?.[0]?.[0] === "Sample_ID" && s.rows.length > 20);
  if (!data) throw new Error(tr("This file does not have the expected table of samples."));
  const head = data.rows[0].map((h) => String(h || "").trim()), iId = head.indexOf("Sample_ID"), iE = head.indexOf("Easting_ING"), iN = head.indexOf("Northing_ING");
  if (iE < 0 || iN < 0) throw new Error(tr("This file does not have the expected table of samples."));
  const limits = sheets.find((s) => s !== data && s.rows?.some((r) => r?.[0] === "LLD"));
  const lld = limits?.rows.find((r) => r[0] === "LLD") || [], hdl = limits?.rows.find((r) => /^HDL/.test(String(r[0]))) || [];
  const map = head.map((h, i) => { const n = tellusColumn(h); return n ? [i, n] : null; }).filter(Boolean);
  const out = [];
  let censoredCells = 0;
  for (const r of data.rows.slice(1)) {
    const e = Number(r[iE]), n = Number(r[iN]);
    if (!Number.isFinite(e) || !Number.isFinite(n)) continue;
    const [lon, lat] = toLonLat(e, n);
    if (!inBox(lon, lat, area)) continue;
    const o = { sample_id: String(r[iId] ?? ""), longitude: tidyDeg(lon), latitude: tidyDeg(lat), elevation: "", medium: "stream sediment", source_type: "stream sediment <150 µm" };
    for (const [i, name] of map) {
      const v = String(r[i] ?? "").trim();
      if (v === "") { o[name] = ""; continue; }
      const num = Number(v), half = Number(hdl[i]), lim = Number(lld[i]);
      if (Number.isFinite(half) && Number.isFinite(lim) && half > 0 && Math.abs(num - half) <= half * 1e-6) { o[name] = `<${tidy(lim)}`; censoredCells++; } else o[name] = Number.isFinite(num) ? tidy(num) : "";
    }
    out.push(o);
  }
  return table(out, map.map(([, n]) => n), ["source_type"], entry, censoredCells ? [{ key: "{n} result(s) below the lab's limit, which the file gives as half the limit, are marked as below detection.", n: censoredCells }] : []);
}
const tidyDeg = (v) => v.toFixed(6);

// ---------- requests ----------
const f6 = (v) => Number(v).toFixed(6);
export function arcQueryUrl(service, layerId, area, { offset = 0, pageSize = 1000, count = false } = {}) {
  const common = { where: "1=1", geometry: area.map(f6).join(","), geometryType: "esriGeometryEnvelope", inSR: "4326", spatialRel: "esriSpatialRelIntersects", f: "json" };
  const q = new URLSearchParams(count ? { ...common, returnCountOnly: "true" } : { ...common, outFields: "*", outSR: "4326", orderByFields: "OBJECTID", resultOffset: String(offset), resultRecordCount: String(pageSize) });
  return `${service}/${layerId}/query?${q}`;
}
export function wfsUrl(service, typeName, area, { hits = false, count, startIndex, sortBy } = {}) {
  const q = new URLSearchParams({ service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: typeName, srsName: "EPSG:4326", ...(hits ? { resultType: "hits" } : { outputFormat: "csv", count: String(count), startIndex: String(startIndex || 0), sortBy }) });
  return `${service}?${q}&bbox=${area.map(f6).join(",")},EPSG:4326`;
}
// The WA server is ArcGIS's WFS: latitude first, no paging (startIndex answers an empty table), and the core is filtered out
// at the source, or a box near a mine is mostly drill core nobody asked for
export function waUrl(service, typeName, b, { hits = false, count = SERVICE_MAX_ROWS } = {}) {
  const filter = `<Filter xmlns="http://www.opengis.net/fes/2.0" xmlns:gml="http://www.opengis.net/gml/3.2"><And><PropertyIsNotEqualTo><ValueReference>sampletype</ValueReference><Literal>Drill</Literal></PropertyIsNotEqualTo><BBOX><ValueReference>Shape</ValueReference><gml:Envelope srsName="urn:ogc:def:crs:EPSG::4326"><gml:lowerCorner>${f6(b[1])} ${f6(b[0])}</gml:lowerCorner><gml:upperCorner>${f6(b[3])} ${f6(b[2])}</gml:upperCorner></gml:Envelope></BBOX></And></Filter>`;
  return `${service}?${new URLSearchParams({ service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: typeName, FILTER: filter, ...(hits ? { resultType: "hits" } : { outputFormat: "CSV", count: String(count) }) })}`;
}
export const numberMatched = (xml) => { const m = /numberMatched="(\d+)"/.exec(String(xml || "")); return m ? Number(m[1]) : null; };

// a request's text, or an Error saying why not: HTTP, an XML / HTML error page, ArcGIS's 200-with-{error}
async function getText(fetcher, url) {
  const r = await fetcher({ url });
  if (!r.ok) throw new Error(r.message || tr("The service answered HTTP {status}.", { status: r.status }));
  const err = serviceError(r.text);
  if (err) throw new Error(err);
  return r.text;
}
async function getJson(fetcher, url) {
  const o = JSON.parse(await getText(fetcher, url));
  if (o.error) throw new Error(o.error.message || tr("The service answered with an error page."));
  return o;
}
const tooMany = (n) => new Error(tr("The area holds {n} samples of this layer (over {max}): draw a smaller one.", { n: n.toLocaleString(), max: SERVICE_MAX_ROWS.toLocaleString() }));

// entry.service: { kind, url, typeName?... }; layer: one of entry.layers. onStep(page) reports progress.
// -> { headers, rows, notes }, rows empty when the area holds none
export async function fetchServiceSamples(entry, layer, area, fetcher, onStep = () => {}) {
  const s = entry.service;
  if (s.kind === "arc") {
    const total = (await getJson(fetcher, arcQueryUrl(s.url, layer.id, area, { count: true }))).count ?? 0;
    if (total > SERVICE_MAX_ROWS) throw tooMany(total);
    const features = [];
    for (let page = 0, offset = 0; offset < total; page++) {
      onStep(page + 1);
      const o = await getJson(fetcher, arcQueryUrl(s.url, layer.id, area, { offset, pageSize: s.pageSize }));
      const got = o.features || [];
      if (!got.length) break; // the service gave fewer than it counted: keep what came
      features.push(...got);
      offset += got.length;
    }
    return parseArcFeatures(features, layer, entry, area);
  }
  if (s.kind === "wa") {
    const total = numberMatched(await getText(fetcher, waUrl(s.url, s.typeName, area, { hits: true }))) ?? 0;
    if (total > SERVICE_MAX_ROWS) throw tooMany(total);
    if (!total) return { headers: [], rows: [], notes: [] };
    onStep(1);
    return parseWachem(await getText(fetcher, waUrl(s.url, s.typeName, area)), entry);
  }
  if (s.kind === "wfs") {
    const total = numberMatched(await getText(fetcher, wfsUrl(s.url, layer.typeName, area, { hits: true }))) ?? 0;
    if (total > SERVICE_MAX_ROWS) throw tooMany(total);
    if (!total) return { headers: [], rows: [], notes: [] };
    const parse = s.parse === "sgb" ? parseSgb : parseVic;
    const parts = [];
    for (let page = 0, start = 0; start < total; page++, start += s.pageSize) {
      onStep(page + 1);
      const t = parse(await getText(fetcher, wfsUrl(s.url, layer.typeName, area, { count: s.pageSize, startIndex: start, sortBy: s.sortBy })), entry);
      parts.push(t);
      if (!t.rows.length) break;
    }
    const notes = new Map();
    for (const t of parts) for (const n of t.notes) notes.set(n.key, (notes.get(n.key) || 0) + n.n);
    return { headers: [...new Set(parts.flatMap((t) => t.headers))], rows: parts.flatMap((t) => t.rows), notes: [...notes].map(([key, n]) => ({ key, n })) };
  }
  if (s.kind === "tellus") {
    onStep(1);
    const f = await fetcher({ url: s.url, binary: true });
    if (!f.ok) throw new Error(f.message || tr("The service answered HTTP {status}.", { status: f.status }));
    const { readZipEntries } = await import("./shapefile.js");
    const entries = await readZipEntries(f.bytes, /\.xlsx$/i);
    const name = Object.keys(entries).find((k) => entries[k]);
    if (!name) throw new Error(tr("This file does not have the expected table of samples."));
    const { readXlsxSheets } = await import("./xlsx.js");
    const { getProj4Def, pointTransform } = await import("./reproject.js");
    await getProj4Def(29902);
    const T = pointTransform(29902, 4326);
    if (!T) throw new Error(tr("The Irish Grid (EPSG:29902) could not be loaded."));
    return parseTellus(await readXlsxSheets(entries[name]), area, T, entry);
  }
  throw new Error(`Unknown service: ${s.kind}`);
}
