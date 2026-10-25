// TASKS.csv #846 — public geochemistry catalogue: government stream-sediment / soil surveys a geologist can bring in for
// the project area without hunting for them (docs/ideas/soils-stream-sediments.md §7.5; Matt approved researching and
// downloading samples, 2026-10-25). An entry becomes downloadable only after its licence was read and its service and
// file format were tested against real responses; the others are links to the agency's page. Each download is clipped
// to the area by the service itself, parsed here into an ordinary table (one row per sample, lon / lat, element columns
// named "<Symbol>_<method>_<unit>"), and goes through the normal surface-sample import (units, below detection, CRS).
// Pure: no React, no network (the URLs are fetched by the caller through the main-process allow-list, geochem-fetch).

export const CATALOGUE_CHECKED = "2026-10-25";

// coverage: one box [lonMin, latMin, lonMax, latMax] or several (the US: the lower 48, Alaska, Hawaii - one box over all
// of them took in most of British Columbia)
const US_BOXES = [[-125.0, 24.4, -66.9, 49.4], [-180.0, 51.2, -129.98, 71.5], [-160.6, 18.8, -154.7, 22.3]];

export const CATALOGUE = [
  {
    id: "bc-rgs", name: "BC Regional Geochemical Survey (RGS)", agency: "British Columbia Geological Survey", country: "Canada (British Columbia)",
    media: "Stream sediment and water, lake sediment", samples: "53,075 sites",
    coverage: [-139.1, 48.2, -114.0, 60.0],
    licence: "Open Government Licence – British Columbia v2.0", licenceUrl: "https://www2.gov.bc.ca/gov/content/data/open-data/open-government-licence-bc",
    attribution: "Contains information licensed under the Open Government Licence – British Columbia.",
    page: "https://catalogue.data.gov.bc.ca/dataset/49a73c36-4a25-4be5-b6d1-abd020fb031a", host: "openmaps.gov.bc.ca",
    downloadable: true,
    caveat: "This is the province's map layer (loaded in 2014). It stores AAS silver, cadmium and antimony as whole ppm and has no below-detection marker, so zeros are left empty and low values are coarse. The full-precision RGS2020 workbook (48 MB) is on the agency page.",
  },
  {
    id: "ga-ngsa", name: "National Geochemical Survey of Australia (NGSA)", agency: "Geoscience Australia", country: "Australia",
    media: "Catchment outlet (floodplain) sediment", samples: "1,315 sites", years: "2007-2009",
    coverage: [112.0, -44.0, 154.0, -10.0],
    licence: "CC BY 4.0", licenceUrl: "https://www.ga.gov.au/copyright",
    attribution: "© Commonwealth of Australia (Geoscience Australia).",
    page: "https://ecat.ga.gov.au/geonetwork/srv/eng/catalog.search#/metadata/a4a1ac2e-0a2c-653b-e044-00144fdd4fa6", host: "services.ga.gov.au",
    downloadable: true, options: true,
    caveat: "About one site per 5,500 km²: a project-sized area often holds none. Each site was sampled at two depths, sieved to two fractions and analyzed by several digestions; choose one of each.",
  },
  {
    id: "usgs-ngdb", name: "USGS National Geochemical Database: sediment (NGDB)", agency: "U.S. Geological Survey", country: "United States",
    media: "Stream sediment, soil", samples: "335,026 samples",
    coverage: US_BOXES,
    licence: "Public domain (U.S. Government work)", licenceUrl: "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits",
    attribution: "U.S. Geological Survey.",
    page: "https://mrdata.usgs.gov/ngdb/sediment/", downloadable: false,
    caveat: "Download by area is not built yet: the service hands out data by map quadrangle, not by box. Download the area from the agency page and import the CSV as surface samples.",
  },
  {
    id: "usgs-nure", name: "USGS NURE Hydrogeochemical and Stream Sediment Reconnaissance (HSSR)", agency: "U.S. Geological Survey", country: "United States",
    media: "Stream and lake sediment", samples: "397,625 samples",
    coverage: US_BOXES,
    licence: "Public domain (U.S. Government work)", licenceUrl: "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits",
    attribution: "U.S. Geological Survey.",
    page: "https://mrdata.usgs.gov/nure/sediment/", downloadable: false,
    caveat: "Download by area is not built yet (by quadrangle on the agency page). Coordinates are NAD27; negative values mean below detection.",
  },
  {
    id: "gsc-cdogs", name: "Canadian Database of Geochemical Surveys (CDoGS) / National Geochemical Reconnaissance", agency: "Geological Survey of Canada", country: "Canada",
    media: "Stream and lake sediment, till, soil, water", samples: "219,201 sites in 1,646 surveys",
    coverage: [-141.0, 41.7, -52.6, 83.1],
    licence: "Open Government Licence – Canada", licenceUrl: "https://open.canada.ca/en/open-government-licence-canada",
    attribution: "Contains information licensed under the Open Government Licence – Canada.",
    page: "https://geochem.nrcan.gc.ca/", downloadable: false,
    caveat: "Download by area is not built yet: the data come as one workbook per survey and lab batch, with units only on the web pages. Find the survey on the agency site and import its workbook as surface samples.",
  },
];

// years: only where the data were checked (NGSA: the GA file's DATE SAMPLED); the others are left out rather than guessed

// search over name, agency, country, media
export function searchCatalogue(q) {
  const words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return CATALOGUE;
  return CATALOGUE.filter((e) => { const t = `${e.name} ${e.agency} ${e.country} ${e.media}`.toLowerCase(); return words.every((w) => t.includes(w)); });
}

// does the entry's coverage overlap the area [lonMin, latMin, lonMax, latMax]?
export const coversArea = (entry, b) => !!b && (Array.isArray(entry.coverage[0]) ? entry.coverage : [entry.coverage]).some((c) => !(b[2] < c[0] || b[0] > c[2] || b[3] < c[1] || b[1] > c[3]));

const f6 = (v) => Number(v).toFixed(6);

// the request URL(s) for an area. BC: GeoServer pages of 10,000 (startIndex); NGSA: one request, the NGSA project only
export const BC_PAGE = 10000;
export function areaUrl(id, b, { page = 0 } = {}) {
  if (id === "bc-rgs") {
    const q = new URLSearchParams({ service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: "pub:WHSE_MINERAL_TENURE.GEOL_REG_GEOCHMCL_SURV_PNT_SP", srsName: "EPSG:4326", outputFormat: "csv", count: String(BC_PAGE), startIndex: String(page * BC_PAGE), sortBy: "OBJECTID" });
    return `https://openmaps.gov.bc.ca/geo/pub/wfs?${q}&bbox=${[b[0], b[1], b[2], b[3]].map(f6).join(",")},CRS:84`;
  }
  if (id === "ga-ngsa") {
    // CQL BBOX on this layer is lon, lat (tested 2026-10-25)
    const cql = `PROJECT ILIKE '%NGSA%' AND BBOX(SAMPLING_FEATURE_LOCATION,${[b[0], b[1], b[2], b[3]].map(f6).join(",")},'EPSG:4326')`;
    const q = new URLSearchParams({ service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: "geochemistry:Samples", outputFormat: "csv", CQL_FILTER: cql });
    return `https://services.ga.gov.au/gis/inorganic-geochemistry/wfs?${q}`;
  }
  return null;
}

// a small CSV reader (quoted fields, CRLF) - the services' CSVs are plain comma-separated UTF-8
export function parseCsv(text) {
  const s = String(text || "").replace(/^﻿/, "");
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift() || [];
  return { headers: head, rows: rows.filter((r) => r.length > 1 || r[0] !== "").map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""]))) };
}

// a service answers an error as a 200 with an XML / HTML body
export function serviceError(text) {
  const t = String(text || "").slice(0, 2000);
  if (/<(ows:)?ExceptionReport|<ServiceExceptionReport|<html/i.test(t)) return (t.match(/<(?:ows:)?ExceptionText>([\s\S]*?)<\/(?:ows:)?ExceptionText>|<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/i)?.slice(1).find(Boolean) || "The service answered with an error page.").trim().slice(0, 300);
  return null;
}

// BC RGS element columns are ELEMENTNAME_METHOD_UNIT (COPPER_ICPMS_PPM, GOLD_FA_PPB_2, IRON_AAS_PERCENTAGE)
const BC_NAMES = {
  ALUMINIUM: "Al", ANTIMONY: "Sb", ARSENIC: "As", BARIUM: "Ba", BISMUTH: "Bi", BROMINE: "Br", CADMIUM: "Cd", CALCIUM: "Ca", CERIUM: "Ce", CESIUM: "Cs",
  CHROMIUM: "Cr", COBALT: "Co", COPPER: "Cu", EUROPIUM: "Eu", FLUORINE: "F", GALLIUM: "Ga", GOLD: "Au", HAFNIUM: "Hf", IRON: "Fe", LANTHANUM: "La",
  LEAD: "Pb", LUTETIUM: "Lu", MAGNESIUM: "Mg", MANGANESE: "Mn", MERCURY: "Hg", MOLYBDENUM: "Mo", NICKEL: "Ni", PHOSPHORUS: "P", POTASSIUM: "K",
  RUBIDIUM: "Rb", SAMARIUM: "Sm", SCANDIUM: "Sc", SELENIUM: "Se", SILVER: "Ag", SODIUM: "Na", STRONTIUM: "Sr", SULPHUR: "S", TANTALUM: "Ta",
  TELLURIUM: "Te", TERBIUM: "Tb", THALLIUM: "Tl", THORIUM: "Th", TIN: "Sn", TITANIUM: "Ti", TUNGSTEN: "W", URANIUM: "U", VANADIUM: "V",
  YTTERBIUM: "Yb", ZINC: "Zn", ZIRCONIUM: "Zr",
};
const BC_UNIT = { PPM: "ppm", PPB: "ppb", PERCENTAGE: "pct" };
export function bcColumn(h) {
  const m = /^([A-Z]+)_([A-Z]+)_(PPM|PPB|PERCENTAGE)(?:_(\d))?$/.exec(String(h));
  if (!m || !BC_NAMES[m[1]]) return null; // WATER_*, LOSS_ON_IGNITION, sample weights: not sediment analytes
  return `${BC_NAMES[m[1]]}_${m[2]}_${BC_UNIT[m[3]]}${m[4] ? `_${m[4]}` : ""}`;
}

// common output: { headers, rows: [{ sample_id, longitude, latitude, elevation, medium, <elements>, source, licence }], notes: [] }
const SOURCE_COLS = ["source", "licence"];
function table(rows, elementCols, extra, entry, notes) {
  const used = elementCols.filter((h) => rows.some((r) => r[h] !== "" && r[h] != null));
  const tag = { source: `${entry.name.replace(/ \(.*/, "")} (${CATALOGUE_CHECKED})`.slice(0, 60), licence: entry.licence.slice(0, 60) };
  return { headers: ["sample_id", "longitude", "latitude", "elevation", "medium", ...extra, ...used, ...SOURCE_COLS], rows: rows.map((r) => ({ ...r, ...tag })), notes };
}

export function parseBcRgs(csvText) {
  const { headers, rows } = parseCsv(csvText);
  const map = headers.map((h) => [h, bcColumn(h)]).filter(([, n]) => n);
  let zeros = 0;
  const out = rows.map((r) => {
    const o = { sample_id: r.MASTER_ID || "", longitude: r.LONGITUDE, latitude: r.LATITUDE, elevation: r.ELEVATION || "", medium: /lake/i.test(r.MATERIAL || "") ? "other" : "stream sediment", material: r.MATERIAL || "" };
    for (const [h, n] of map) {
      const v = String(r[h] ?? "").trim();
      if (v === "0" || v === "0.0") { zeros++; o[n] = ""; } else o[n] = v; // no below-detection marker in this layer: a 0 is not a grade
    }
    return o;
  }).filter((o) => Number.isFinite(parseFloat(o.longitude)) && Number.isFinite(parseFloat(o.latitude)));
  const notes = zeros ? [{ key: "{n} zero value(s) left empty: this layer has no below-detection marker, so a 0 is not a grade.", n: zeros }] : [];
  return { ...table(out, map.map(([, n]) => n), ["material"], CATALOGUE[0], notes), fetched: rows.length }; // fetched: for paging
}

// NGSA: <EL>_PPM / _PPB, oxides <OXIDE>_WEIGHT_PERCENT, arsenic is ARS_PPM; negative = below detection (kept: the
// surface import reads a small negative as below detection)
const NGSA_OXIDES = { SIO2: "SiO2", TIO2: "TiO2", AL2O3: "Al2O3", FE2O3_TOTAL: "Fe2O3T", FE2O3: "Fe2O3", FEO: "FeO", MNO: "MnO", MGO: "MgO", CAO: "CaO", NA2O: "Na2O", K2O: "K2O", P2O5: "P2O5" };
const NGSA_NOT = new Set(["LREE", "HREE", "REE", "REE_Y"]);
export function ngsaColumn(h) {
  let m = /^([A-Z0-9_]+)_WEIGHT_PERCENT$/.exec(String(h));
  if (m) return NGSA_OXIDES[m[1]] ? `${NGSA_OXIDES[m[1]]}_pct` : m[1] === "C" ? "C_pct" : null;
  m = /^([A-Z_]+)_(PPM|PPB)$/.exec(String(h));
  if (!m || NGSA_NOT.has(m[1])) return null;
  const sym = m[1] === "ARS" ? "As" : m[1][0] + m[1].slice(1).toLowerCase();
  return /^[A-Z][a-z]?$/.test(sym) ? `${sym}_${m[2].toLowerCase()}` : null;
}
// the choices a site offers: fraction (sample id suffix), depth (sample number 001 = top 0-0.1 m, 002 = bottom ~0.6-0.8 m:
// checked against the GA bulk file's DEPTH column, 3,945 of 3,945 each), digestion (SUBSAMPLE_ID)
export const ngsaFraction = (r) => (/fine/i.test(r.SAMPLE_ID) ? "fine" : /coarse/i.test(r.SAMPLE_ID) ? "coarse" : "bulk");
export const ngsaDepth = (r) => (/^\d{10}002/.test(String(r.SAMPLE_ID)) ? "bottom" : "top");
export const ngsaDigestion = (r) => (/^AR$/i.test(r.SUBSAMPLE_ID) ? "aqua regia" : /whole/i.test(r.SUBSAMPLE_ID) ? "whole rock" : /mmi/i.test(r.SUBSAMPLE_ID) ? "MMI" : String(r.SUBSAMPLE_ID || "").toLowerCase());
export function ngsaChoices(csvText) {
  const { rows } = parseCsv(csvText);
  const count = new Map();
  for (const r of rows) { const k = `${ngsaFraction(r)}|${ngsaDepth(r)}|${ngsaDigestion(r)}`; count.set(k, (count.get(k) || 0) + 1); }
  return { sites: new Set(rows.map((r) => r.SITE_ID)).size, combos: [...count].map(([k, n]) => { const [fraction, depth, digestion] = k.split("|"); return { fraction, depth, digestion, n }; }) };
}
export function parseNgsa(csvText, { fraction = "coarse", depth = "top", digestion = "aqua regia" } = {}) {
  const { headers, rows } = parseCsv(csvText);
  const map = headers.map((h) => [h, ngsaColumn(h)]).filter(([, n]) => n);
  const pick = rows.filter((r) => ngsaFraction(r) === fraction && ngsaDepth(r) === depth && ngsaDigestion(r) === digestion);
  const out = pick.map((r) => {
    const o = { sample_id: String(r.SAMPLE_ID || "").replace(/\s+/g, "_"), longitude: r.LONG_GDA94, latitude: r.LAT_GDA94, elevation: "", medium: "stream sediment", fraction, depth: depth === "top" ? "0-0.1 m" : "about 0.6-0.8 m", digestion };
    for (const [h, n] of map) o[n] = String(r[h] ?? "").trim();
    return o;
  }).filter((o) => Number.isFinite(parseFloat(o.longitude)) && Number.isFinite(parseFloat(o.latitude)));
  return table(out, map.map(([, n]) => n), ["fraction", "depth", "digestion"], CATALOGUE[1], []);
}

// the project's working area in project coordinates [xmin, ymin, xmax, ymax], with a margin: collars, then surface
// samples, then boundaries and map layers - null when nothing is located. The margin is at least 10 km: regional surveys
// have a site every 10-15 km² or sparser, so a drill-pad-sized box usually holds none
export function projectBoxXY({ collars = [], surfaceSamples = [], boundaries = [], mapLayers = [] } = {}) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { if (Number.isFinite(x) && Number.isFinite(y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } };
  for (const c of collars) add(c.x, c.y);
  if (!(x1 >= x0)) for (const s of surfaceSamples) add(s.x, s.y);
  if (!(x1 >= x0)) for (const b of boundaries) for (const pl of b.polylines || []) for (const p of pl) add(p.x, p.y);
  if (!(x1 >= x0)) for (const l of mapLayers) for (const f of l.features || []) for (const part of f.parts || [f.geometry || []]) for (const p of part) add(p?.[0], p?.[1]);
  if (!(x1 >= x0)) return null;
  const mx = Math.max((x1 - x0) * 0.25, 10000), my = Math.max((y1 - y0) * 0.25, 10000);
  return [x0 - mx, y0 - my, x1 + mx, y1 + my];
}
