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
    page: "https://mrdata.usgs.gov/ngdb/sediment/", host: "mrdata.usgs.gov", downloadable: true, usgs: "ngdb",
    caveat: "The service hands out whole map quadrangles, so the download can take a minute; samples are then clipped to the area. Values are the USGS \"best value\" per element, from methods that differ between surveys (ICP-AES, older semi-quantitative emission spectrography): each sample keeps its main method as an attribute. Mine-dump and tailings samples come in as \"other\", not stream sediment."
  },
  {
    id: "usgs-nure", name: "USGS NURE Hydrogeochemical and Stream Sediment Reconnaissance (HSSR)", agency: "U.S. Geological Survey", country: "United States",
    media: "Stream and lake sediment", samples: "397,625 samples",
    coverage: US_BOXES,
    licence: "Public domain (U.S. Government work)", licenceUrl: "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits",
    attribution: "U.S. Geological Survey.",
    page: "https://mrdata.usgs.gov/nure/sediment/", host: "mrdata.usgs.gov", downloadable: true, usgs: "nure", sourceEpsg: "4267",
    caveat: "Whole map quadrangles, clipped to the area. Coordinates are NAD27 given to 0.0001° and converted with GeoStrix's one NAD27 datum shift, fitted for Alberta / BC (#973: about 12 m from EPSG's own fit for the lower 48 states and 31 m for Alaska, each good to about 10 m itself); negative values mean below detection. Lake sediments come in as \"other\"."
  },
  {
    id: "gsc-cdogs", name: "Canadian Database of Geochemical Surveys (CDoGS) / National Geochemical Reconnaissance", agency: "Geological Survey of Canada", country: "Canada",
    media: "Stream and lake sediment, till, soil, water", samples: "219,201 sites in 1,646 surveys",
    coverage: [-141.0, 41.7, -52.6, 83.1],
    licence: "Open Government Licence – Canada", licenceUrl: "https://open.canada.ca/en/open-government-licence-canada",
    attribution: "Contains information licensed under the Open Government Licence – Canada.",
    page: "https://geochem.nrcan.gc.ca/", host: "geochem.nrcan.gc.ca", downloadable: true, cdogs: true,
    caveat: "The 287 surveys with standardised data packages (an index built from the GSC's metadata database, 2026-10-25). Each survey's data come as one workbook per analytical package (one sample type, size fraction and lab method): choose one so the samples are comparable; it is clipped to the area. Till, lake sediment and water samples come in under their own sample type, not as stream sediment."
  },
  // TASKS.csv #1155 — parsers and requests in publicGeochemServices.js, each tested against a real response on `checked`
  {
    id: "nl-atlas", name: "Geoscience Atlas geochemistry (Newfoundland and Labrador)", agency: "Geological Survey of Newfoundland and Labrador", country: "Canada (Newfoundland and Labrador)",
    media: "Lake sediment, till, stream sediment", samples: "35,768 lake, 22,422 till and 1,244 stream sites", years: "1973-2020",
    coverage: [-67.9, 46.5, -52.5, 60.5],
    licence: "Geoscience Atlas terms: no digital copies to third parties", licenceUrl: "https://geoatlas.gov.nl.ca/custom/help/Help_layers.html",
    attribution: "Source: Geological Survey of Newfoundland and Labrador, Geoscience Atlas.",
    page: "https://geoatlas.gov.nl.ca/", host: "dnrmaps.gov.nl.ca", downloadable: true, checked: "2026-10-31", sourceEpsg: "4267",
    service: { kind: "arc", url: "https://dnrmaps.gov.nl.ca/arcgis/rest/services/GeoAtlas/Geochemistry_All/MapServer", pageSize: 1000 },
    layers: [
      { id: 84, parse: "nl", label: "Regional lake sediment", medium: "other" },
      { id: 4, parse: "nl", label: "Till", medium: "other" },
      { id: 247, parse: "nl", label: "Regional stream sediment (northern Labrador)", medium: "stream sediment" },
    ],
    caveat: "Read the terms: the Atlas gives these data for public use, but asks you not to pass digital copies to a third party, and to acknowledge the source in anything derived from them. Not a licence to share a project holding them. The service does not state its codes: -9 reads as no result (whole columns of it where a survey did not run a method) and a 0 as possibly below detection. Column numbers are the Atlas's method codes (1 INAA, 2 ICP; others kept as the code). Coordinates are NAD27, converted with GeoStrix's one NAD27 datum shift, which was fitted for Alberta / BC, not here. Lake sediment and till come in as \"other\".",
  },
  {
    id: "sk-geoatlas", name: "Saskatchewan geochemistry", agency: "Saskatchewan Geological Survey", country: "Canada (Saskatchewan)",
    media: "Lake sediment, till", samples: "13,195 GSC and 3,001 provincial lake sediments, 12,675 till analyses",
    coverage: [-110.1, 48.9, -101.3, 60.1],
    licence: "Saskatchewan Standard Unrestricted Use Data Licence v2.0", licenceUrl: "https://gisappl.saskatchewan.ca/Html5Ext/Resources/GOS_Standard_Unrestricted_Use_Data_Licence_v2.0.pdf",
    attribution: "Contains information licensed under the Government of Saskatchewan Standard Unrestricted Use Data Licence (Version 2.0).",
    page: "https://gis.saskatchewan.ca/egis/rest/services/Economy/Analytical_and_Rock_Property_Data/FeatureServer", host: "gis.saskatchewan.ca", downloadable: true, checked: "2026-10-31",
    service: { kind: "arc", url: "https://gis.saskatchewan.ca/egis/rest/services/Economy/Analytical_and_Rock_Property_Data/FeatureServer", pageSize: 2000 },
    layers: [
      { id: 2, parse: "sk-gsc", label: "GSC lake sediment (National Geochemical Reconnaissance)", medium: "other" },
      { id: 1, parse: "sk-lake", label: "Provincial lake sediment (Athabasca area, 1970s)", medium: "other" },
      { id: 4, parse: "sk-till", label: "Till and other surficial samples", medium: "other" },
    ],
    caveat: "The GSC layer's columns carry no units: GeoStrix applies that program's own (Au and Hg in ppb, Fe in percent, the rest ppm). The provincial layer is labelled ppm throughout, gold and mercury included, and is taken as labelled. Negative values mean below detection; 0 reads as no result. The till layer mixes labs and digestions: each sample keeps its method as an attribute. Lake sediment and till come in as \"other\".",
  },
  {
    id: "yt-rgs", name: "Yukon geochemistry (regional surveys, assessment reports)", agency: "Yukon Geological Survey", country: "Canada (Yukon)",
    media: "Stream sediment; company soil, rock and stream samples", samples: "31,380 stream sites (1976-2006), 424,269 assessment report results",
    coverage: [-141.1, 60.0, -123.8, 69.7],
    licence: "Open Government Licence – Yukon", licenceUrl: "https://yukon.ca/en/your-government/open-government/open-government-licence-yukon",
    attribution: "Contains information licensed under the Open Government Licence – Yukon.",
    page: "https://open.yukon.ca/dataset/yukon-regional-geochemical-database-stream-sediment-analyses", host: "mapservices.gov.yk.ca", downloadable: true, checked: "2026-10-31",
    service: { kind: "arc", url: "https://mapservices.gov.yk.ca/arcgis/rest/services/GeoYukon/GY_Geological/MapServer", pageSize: 1000 },
    layers: [
      { id: 41, parse: "yt-rgs", label: "Regional stream sediment, all methods (AAS, INAA, ICP-MS)", medium: "stream sediment" },
      { id: 1, parse: "yt-ar", label: "Assessment report samples (company soil, rock, stream)", medium: "other" },
    ],
    caveat: "Stream sediment: 24,000 samples were reanalyzed by ICP-MS, whose partial digestion is poor for Al, Ba, Cr, Fe, P, Sn, Ti, Y and Zr, and too small a sample for gold; AAS is mostly superseded. Most of this survey is also in CDoGS. Assessment report samples are company results from many labs and programs: compare them with care. Negative values mean below detection; 0 reads as no result.",
  },
  {
    id: "wa-wachem", name: "GSWA Geochemistry (WACHEM)", agency: "Geological Survey of Western Australia", country: "Australia (Western Australia)",
    media: "Outcrop rock, regolith", samples: "68,405 analyses statewide, including drill core (left out)",
    coverage: [112.5, -35.5, 129.1, -13.5],
    licence: "CC BY 4.0", licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "GSWA Geochemistry (DMIRS-047), Department of Energy, Mines, Industry Regulation and Safety, Western Australia, licensed under CC BY 4.0.",
    page: "https://catalogue.data.wa.gov.au/dataset/gswa-geochemistry", host: "public-services.slip.wa.gov.au", downloadable: true, checked: "2026-10-31",
    service: { kind: "wa", url: "https://public-services.slip.wa.gov.au/public/services/SLIP_Public_Services/Geology_and_Soils_Map_WFS/MapServer/WFSServer", typeName: "esri:GSWA_Geochemistry__DMIRS-047_" },
    caveat: "Mostly rock samples: outcrop comes in as \"rock chip\", regolith as \"other\" unless its lithology says stream sediment or soil. Drill core is left out at the source, since it comes from depth. Each sample keeps how close its location is known (location_within_m; 9999 means unknown). Labs and methods differ by batch, and this layer does not say which.",
  },
  {
    id: "vic-gchem", name: "Victoria surface geochemistry samples", agency: "Geological Survey of Victoria", country: "Australia (Victoria)",
    media: "Soil, stream sediment (company data)", samples: "55,864 GEOCHEMISTRY and 455,226 older GCHEM records",
    coverage: [140.9, -39.2, 150.1, -33.9],
    licence: "CC BY 4.0", licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "Surface Geochemistry Samples, State of Victoria (Department of Energy, Environment and Climate Action), licensed under CC BY 4.0.",
    page: "https://discover.data.vic.gov.au/dataset/surface-geochemistry-samples-replacing-gchem-over-time", host: "opendata.maps.vic.gov.au", downloadable: true, checked: "2026-10-31",
    service: { kind: "wfs", parse: "vic", url: "https://opendata.maps.vic.gov.au/geoserver/wfs", pageSize: 10000, sortBy: "siteid" },
    layers: [
      { typeName: "open-data-platform:geochemistry", label: "GEOCHEMISTRY (the newer dataset)" },
      { typeName: "open-data-platform:gchem", label: "GCHEM (older and larger, being superseded)" },
    ],
    caveat: "Company results from reports on expired licences, from 1965 on, with no collection date in the data: labs, digestions and fractions differ between programs, so compare within one company's program. The two datasets overlap little in the areas tested, but they may share samples: load one at a time. Each sample keeps how close its location is known (location_within_m). The data do not state their codes: -999 and -0.999 read as no result, other negatives as below that limit. Gold reported as free text is read only when it is plainly a number and a unit.",
  },
  {
    id: "ie-tellus", name: "Tellus stream sediment geochemistry", agency: "Geological Survey Ireland", country: "Ireland",
    media: "Stream sediment (<150 µm)", samples: "8,861 samples, 59 analytes", years: "2011-2017",
    coverage: [-10.8, 51.3, -5.3, 55.5],
    licence: "CC BY 4.0", licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "Contains Irish Public Sector Data (Geological Survey) licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence.",
    page: "https://data.gov.ie/dataset/tellus-geochemistry-stream-sediments", host: "gsi.geodata.gov.ie", downloadable: true, checked: "2026-10-31",
    service: { kind: "tellus", url: "https://gsi.geodata.gov.ie/downloads/Geochemistry/Data/GSI_Tellus_C_stream_sediment_geochemistry.zip" },
    caveat: "This service has no area search: the whole file (3 MB) is downloaded and clipped to the area here, so nothing about your area is sent. It covers the Border, North and West regions, not the older South-East samples. Below-limit results, which the file gives as half the limit, are marked as below detection; results above the upper limit are given at that limit. XRF on pressed pellets; gold, palladium and platinum by fire assay ICP-MS. Coordinates are Irish Grid (TM65), converted here.",
  },
  {
    id: "br-sgb", name: "SGB geochemistry (GEOQ)", agency: "Serviço Geológico do Brasil (SGB-CPRM)", country: "Brazil",
    media: "Stream sediment, soil, rock", samples: "148,998 stream sediment, 62,677 soil and 88,522 rock records",
    coverage: [-74.1, -33.8, -34.7, 5.3],
    licence: "GeoSGB site terms (CC BY-NC 4.0; data not stated)", licenceUrl: "https://creativecommons.org/licenses/by-nc/4.0/",
    attribution: "Serviço Geológico do Brasil (SGB-CPRM), GeoSGB.",
    page: "https://geosgb.sgb.gov.br/", host: "opendata.sgb.gov.br", downloadable: true, checked: "2026-10-31",
    service: { kind: "wfs", parse: "sgb", url: "https://opendata.sgb.gov.br/geoserver/wfs", pageSize: 5000, sortBy: "objectid" },
    layers: [
      { typeName: "p3m:vw_cprm_geoq_sedimento_de_corrente", label: "Stream sediment" },
      { typeName: "p3m:vw_cprm_geoq_solo", label: "Soil" },
      { typeName: "p3m:vw_cprm_geoq_rocha", label: "Rock" },
    ],
    caveat: "Check the terms before commercial use: SGB offers this service free and with no access constraint, but states no licence for the data itself; its GeoSGB site is under CC BY-NC 4.0 (non-commercial), which may or may not extend to these data. Fifty years of projects: labs, digestions and methods differ, and each sample keeps its project, digestion, method and lab. The year is the year of analysis, the only date here. Older surveys report \"not detected\" with no limit: those read as no value and are counted separately. SGB's separate low-density layer is not offered: in the area tested its values did not match their columns.",
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

// TASKS.csv #905 — USGS (mrdata.usgs.gov): the WFS gives only locations and the map-quadrangle code of each sample in the
// box (lat,lon axis order, GML); the chemistry comes as a package of whole quadrangles, asked for by a form POST that
// answers with a page linking the output file. Tested 2026-10-25 (Leadville, Colorado: 8 quadrangles, 745 NGDB samples).
export const USGS_MAX_QUADS = 40;
export function usgsQuadUrl(db, b) {
  const type = db === "nure" ? "nuresed" : "ngdbsed", prop = db === "nure" ? "quad_code" : "quad";
  const q = new URLSearchParams({ service: "WFS", version: "1.1.0", request: "GetFeature", typeName: type, propertyName: prop, srsName: "EPSG:4326", maxFeatures: "50000" });
  return `https://mrdata.usgs.gov/services/wfs/${type}?${q}&BBOX=${[b[1], b[0], b[3], b[2]].map(f6).join(",")},urn:ogc:def:crs:EPSG::4326`;
}
export function parseQuadCodes(gml) {
  const out = new Set();
  for (const m of String(gml || "").matchAll(/<ms:(?:quad|quad_code)>\s*(q[0-9A-Z]+)\s*<\/ms:(?:quad|quad_code)>/g)) out.add(m[1]);
  return [...out].sort();
}
export function usgsPackageRequest(db, quads) {
  const form = { format: "csv" };
  quads.forEach((q, i) => { form[`area[${i}]`] = q; });
  return { url: `https://mrdata.usgs.gov/${db === "nure" ? "nure" : "ngdb"}/sediment/package.php`, form };
}
export function usgsPackageLink(html, db) {
  const m = String(html || "").match(/href="(output\/[A-Za-z0-9_.-]+\.(?:zip|txt|csv))"/);
  return m ? `https://mrdata.usgs.gov/${db === "nure" ? "nure" : "ngdb"}/sediment/${m[1]}` : null;
}
const inBox = (lon, lat, b) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
// In USGS data a negative value is ALWAYS "below this detection limit" - and the old emission-spectrography limits are
// often 100 or 200 ppm. Written as "<100" so the import reads it as below detection at half the limit; left negative,
// the generic rule for drillhole databases (<= -99 = a no-data code) dropped 568 real results in a Leadville test.
// -9999 and below stay missing.
export const usgsValue = (v) => { const t = String(v ?? "").trim(), n = Number(t); return t === "" || !Number.isFinite(n) || n >= 0 ? t : n <= -9999 ? "" : `<${-n}`; };
// NGDB package: main.txt (lab_id, lat_wgs84, long_wgs84, primary_class, sample_source ...) + bestvalue.txt (one row per
// sample x element: species, unit ppm / pct, qvalue - negative = below detection, amethod)
export function parseNgdbPackage(texts, b) {
  const main = parseCsv(texts.main).rows, best = parseCsv(texts.bestvalue).rows;
  const vals = new Map(), methods = new Map(), cols = new Set();
  for (const r of best) {
    const sp = String(r.species || "").trim(), unit = String(r.unit || "").trim().toLowerCase();
    if (!/^[A-Z][a-z]?$/.test(sp) || !/^(ppm|ppb|pct)$/.test(unit)) continue; // C_tot, C_org...: not elements
    const col = `${sp}_${unit}`;
    cols.add(col);
    if (!vals.has(r.lab_id)) vals.set(r.lab_id, {});
    vals.get(r.lab_id)[col] = usgsValue(r.qvalue);
    const mm = methods.get(r.lab_id) || new Map(); mm.set(r.amethod, (mm.get(r.amethod) || 0) + 1); methods.set(r.lab_id, mm);
  }
  let outside = 0, other = 0;
  const out = [];
  for (const r of main) {
    const lon = parseFloat(r.long_wgs84), lat = parseFloat(r.lat_wgs84);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (!inBox(lon, lat, b)) { outside++; continue; }
    const src = String(r.sample_source || "").toLowerCase(), cls = String(r.primary_class || "").toLowerCase();
    const medium = cls === "sediment" && /stream|river/.test(src) ? "stream sediment" : cls === "soil" ? "soil" : cls === "rock" ? "rock chip" : "other";
    if (medium === "other") other++;
    const mm = methods.get(r.lab_id);
    const method = mm ? [...mm].sort((p, q) => q[1] - p[1])[0][0] : "";
    out.push({ sample_id: r.lab_id, longitude: r.long_wgs84, latitude: r.lat_wgs84, elevation: "", medium, source_type: r.sample_source || r.primary_class || "", method, collected: r.date_collect || "", ...(vals.get(r.lab_id) || {}) });
  }
  const notes = [];
  if (outside) notes.push({ key: "{n} sample(s) of the quadrangles fall outside the area and were left out.", n: outside });
  if (other) notes.push({ key: "{n} sample(s) are not stream sediment (mine dumps, tailings, other sources) and come in as \"other\".", n: other });
  return table(out, [...cols].sort(), ["source_type", "method", "collected"], CATALOGUE.find((e) => e.id === "usgs-ngdb"), notes);
}
// NURE: one wide CSV - latitude / longitude (NAD27), smpmedia, sampsrc, sampdat, <el>_ppm / _pct (uranium by several
// methods: u_dn_ppm...), negative = below detection
export function nureColumn(h) {
  const m = /^([a-z]{1,2})(?:_([a-z]{2}))?_(ppm|ppb|pct)$/.exec(String(h));
  if (!m) return null;
  const sym = m[1][0].toUpperCase() + m[1].slice(1);
  return /^[A-Z][a-z]?$/.test(sym) && sym !== "Po" ? `${sym}${m[2] ? `_${m[2]}` : ""}_${m[3]}` : null; // po4_ppm is phosphate, not polonium (no match anyway)
}
export function parseNure(csvText, b) {
  const { headers, rows } = parseCsv(csvText);
  const map = headers.map((h) => [h, nureColumn(h)]).filter(([, n]) => n);
  let outside = 0, lake = 0;
  const out = [];
  for (const r of rows) {
    const lon = parseFloat(r.longitude), lat = parseFloat(r.latitude);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (!inBox(lon, lat, b)) { outside++; continue; }
    const src = String(r.sampsrc || "").toUpperCase();
    const medium = /STREAM/.test(src) ? "stream sediment" : "other";
    if (/LAKE|POND/.test(src)) lake++;
    const o = { sample_id: String(r.rec_no || ""), longitude: r.longitude, latitude: r.latitude, elevation: "", medium, source_type: [r.smpmedia, r.sampsrc].filter(Boolean).join(" / "), collected: r.sampdat || "" };
    for (const [h, n] of map) o[n] = usgsValue(r[h]);
    out.push(o);
  }
  const notes = [];
  if (outside) notes.push({ key: "{n} sample(s) of the quadrangles fall outside the area and were left out.", n: outside });
  if (lake) notes.push({ key: "{n} lake or pond sediment sample(s) come in as \"other\".", n: lake });
  return table(out, map.map(([, n]) => n), ["source_type", "collected"], CATALOGUE.find((e) => e.id === "usgs-nure"), notes);
}

// TASKS.csv #905 — GSC CDoGS. index = src/lib/cdogsIndex.json (scripts/samples/build-cdogs-index.py): surveys
// [key, name, year, w, s, e, n, [[package, sample type, fraction, samples]...]], packages { id: [name, lab, { column:
// [symbol, unit, limit] }] }. cdogsCandidates: every survey x package whose survey extent overlaps the area.
export function cdogsCandidates(index, b) {
  const out = [];
  for (const [key, name, year, w, s, e, n, pk] of index?.surveys || []) {
    if (e < b[0] || w > b[2] || n < b[1] || s > b[3]) continue;
    for (const [pkg, sampleType, prep, count] of pk) {
      const p = index.packages[String(pkg)];
      if (p) out.push({ key, name, year, pkg, pkgName: p[0], lab: p[1], sampleType, prep, n: count });
    }
  }
  return out.sort((p, q) => (q.year || 0) - (p.year || 0) || p.key.localeCompare(q.key) || p.pkg - q.pkg);
}
export const cdogsUrl = (key, pkg) => `https://geochem.nrcan.gc.ca/ftp/data/raw_data/svy/svy${key}_pkg_${String(pkg).padStart(4, "0")}a.xlsx`;
const CDOGS_MEDIUM = (t) => (/stream sediment/i.test(t) ? "stream sediment" : /hmc|heavy/i.test(t) ? "heavy mineral concentrate" : /stream water/i.test(t) ? "stream water" : /soil/i.test(t) ? "soil" : "other");
// rows: the workbook's sheet (header row first: Lab_Sample_Identifier, Latitude_NAD83, Longitude_NAD83,
// Sample_Type_Name_en, Preparation_Method_Name_en, then the package's columns, e.g. Cu_ICPES); variant "a" writes a
// below-detection result as minus the limit
export function parseCdogsWorkbook(rows, cols, b, cand) {
  const head = (rows[0] || []).map((h) => String(h || "").trim());
  const ix = (name) => head.indexOf(name);
  const iLat = ix("Latitude_NAD83"), iLon = ix("Longitude_NAD83"), iId = ix("Lab_Sample_Identifier"), iType = ix("Sample_Type_Name_en"), iPrep = ix("Preparation_Method_Name_en");
  if (iLat < 0 || iLon < 0) throw new Error("This workbook has no Latitude_NAD83 / Longitude_NAD83 columns.");
  const map = head.map((h, i) => (cols[h] ? [i, `${cols[h][0]}_${h.split("_").slice(1).join("_") || "x"}_${cols[h][1]}`] : null)).filter(Boolean);
  let outside = 0;
  const out = [];
  for (const r of rows.slice(1)) {
    const lat = parseFloat(r[iLat]), lon = parseFloat(r[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!inBox(lon, lat, b)) { outside++; continue; }
    const type = iType >= 0 ? String(r[iType] || "") : cand?.sampleType || "";
    const o = { sample_id: String(r[iId] ?? ""), longitude: String(lon), latitude: String(lat), elevation: "", medium: CDOGS_MEDIUM(type), source_type: type, fraction: iPrep >= 0 ? String(r[iPrep] || "") : cand?.prep || "", survey: cand ? `svy${cand.key} ${cand.year || ""}`.trim() : "" };
    for (const [i, n] of map) o[n] = usgsValue(r[i]); // negative = below this limit, as for the USGS
    out.push(o);
  }
  const notes = outside ? [{ key: "{n} sample(s) of the survey fall outside the area and were left out.", n: outside }] : [];
  return table(out, map.map(([, n]) => n), ["source_type", "fraction", "survey"], CATALOGUE.find((e) => e.id === "gsc-cdogs"), notes);
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
// TASKS.csv #930 — the vintage is the first thing a geologist must see (fifty years of labs and methods), so each row
// gets the year it was collected (USGS `collected`, CDoGS survey year) as a `year` column: a full date has a distinct
// value per sample and was dropped by the surface import's 100-distinct cap, a year passes it and splits populations
// usefully. `source` carries the survey's own year range (the data's, else the catalogue's checked `years`), never the
// day the service was tested, which used to read "(2026-10-25)" on a 1977 NURE sample; that date is in the import notice.
// A long survey name is cut to fit the 60-character attribute, never the years.
export const yearOf = (v) => { const m = /(?:^|\D)((?:19|20)\d\d)(?!\d)/.exec(String(v ?? "")); return m ? m[1] : ""; };
// TASKS.csv #987 — the rows are the parsers' own fresh objects, so year / source / licence are written into them in place:
// copying each ~57-key row twice ({ ...r, year } then { ...r, ...tag }) was 1.6 s of the 4 s a 100,000-row NURE area took.
export function table(rows, elementCols, extra, entry, notes) {
  const used = elementCols.filter((h) => rows.some((r) => r[h] !== "" && r[h] != null));
  let lo = Infinity, hi = -Infinity, nYears = 0;
  for (const r of rows) {
    const y = yearOf(r.collected) || yearOf(r.survey);
    r.year = y;
    if (y) { const n = Number(y); nYears++; if (n < lo) lo = n; if (n > hi) hi = n; }
  }
  const span = nYears ? (lo === hi ? String(lo) : `${lo}-${hi}`) : entry.years || "";
  const name = entry.name.replace(/ \(.*/, "");
  const source = span ? `${name.slice(0, 57 - span.length).trim()} (${span})` : name.slice(0, 60), licence = entry.licence.slice(0, 60);
  for (const r of rows) { if (!nYears) delete r.year; r.source = source; r.licence = licence; }
  const yearCol = nYears ? ["year"] : [];
  return { headers: ["sample_id", "longitude", "latitude", "elevation", "medium", ...extra, ...yearCol, ...used, ...SOURCE_COLS], rows, notes };
}

export function parseBcRgs(csvText) {
  const { headers, rows } = parseCsv(csvText);
  const map = headers.map((h) => [h, bcColumn(h)]).filter(([, n]) => n);
  let zeros = 0;
  const out = rows.map((r) => {
    const o = { sample_id: r.MASTER_ID || "", longitude: r.LONGITUDE, latitude: r.LATITUDE, elevation: r.ELEVATION || "", medium: /lake/i.test(r.MATERIAL || "") ? "other" : "stream sediment", material: r.MATERIAL || "" };
    for (const [h, n] of map) {
      const v = String(r[h] ?? "").trim();
      // no below-detection marker in this layer: a 0 is not a grade. TASKS.csv #931 — but it is not "not analysed" either
      // (much of RGS gold sits at the FA limit), so the columns that read 0 are listed for the surface import, which
      // keeps them on the sample (`nd`) for the censored shares and the threshold warnings
      if (v === "0" || v === "0.0") { zeros++; o[n] = ""; (o.zeroReported ||= []).push(n); } else o[n] = v;
    }
    return o;
  }).filter((o) => Number.isFinite(parseFloat(o.longitude)) && Number.isFinite(parseFloat(o.latitude)));
  const notes = zeros ? [{ key: "{n} zero value(s) read as no value: this layer has no below-detection marker, so a 0 may be below detection or not analysed. Thresholds and Surface QA/QC count them separately.", n: zeros }] : [];
  return { ...table(out, map.map(([, n]) => n), ["material"], CATALOGUE[0], notes), fetched: rows.length }; // fetched: for paging
}

// NGSA: <EL>_PPM / _PPB, oxides <OXIDE>_WEIGHT_PERCENT, arsenic is ARS_PPM; negative = below detection, written
// as "<limit" like the USGS / CDoGS values (#974: left negative, a limit of 100 ppm or more read as a no-data code)
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
    for (const [h, n] of map) o[n] = usgsValue(r[h]); // TASKS.csv #974 — "-100" is "<100", not the generic rule's ≤ -99 no-data code
    return o;
  }).filter((o) => Number.isFinite(parseFloat(o.longitude)) && Number.isFinite(parseFloat(o.latitude)));
  return table(out, map.map(([, n]) => n), ["fraction", "depth", "digestion"], CATALOGUE[1], []);
}

// the project's working area in project coordinates [xmin, ymin, xmax, ymax], with a margin: collars, then surface
// samples, then boundaries and map layers - null when nothing is located. The margin is at least 10 km: regional surveys
// have a site every 10-15 km² or sparser, so a drill-pad-sized box usually holds none
export function projectBoxXY({ collars = [], surfaceSamples = [], boundaries = [], mapLayers = [] } = {}, { geographic = false } = {}) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { if (Number.isFinite(x) && Number.isFinite(y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } };
  for (const c of collars) add(c.x, c.y);
  if (!(x1 >= x0)) for (const s of surfaceSamples) add(s.x, s.y);
  if (!(x1 >= x0)) for (const b of boundaries) for (const pl of b.polylines || []) for (const p of pl) add(p.x, p.y);
  if (!(x1 >= x0)) for (const l of mapLayers) for (const f of l.features || []) for (const part of f.parts || [f.geometry || []]) for (const p of part) add(p?.[0], p?.[1]);
  if (!(x1 >= x0)) return null;
  const minM = geographic ? 0.1 : 10000; // #905 — a longitude / latitude project: 0.1 degree, not 10,000 units
  const mx = Math.max((x1 - x0) * 0.25, minM), my = Math.max((y1 - y0) * 0.25, minM);
  return [x0 - mx, y0 - my, x1 + mx, y1 + my];
}
