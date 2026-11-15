// TASKS.csv #1468 (review #1352, Silvertip) — 'Add web layer' asked for a raw OGC URL with no presets, so a geologist had to find the
// government service addresses themselves. A short list of open-licence services, each checked on 2026-11-06: GetCapabilities
// answered, and the licence read from the publisher (#3472, 2026-11-15, Matt's yes: WA's GetCapabilities answered 29 layers; its catalogue record says cc-by, CC BY 4.0, DMIRS-016) (the BC Data Catalogue record / the service's own AccessConstraints). Only
// open licences: BC's MINFILE is 'Access Only' and the BC imagery WMS too (#816), so neither is here. GeoServer's per-layer
// endpoint (openmaps.gov.bc.ca/geo/pub/<layer>/ows) keeps the capabilities to one layer (15 kB instead of the 6 MB catalogue).
// Hosts: openmaps.gov.bc.ca, services.ga.gov.au and (TASKS.csv #3472) public-services.slip.wa.gov.au, all listed in PRIVACY.md. Labels are names (not translated); project data
// and the layer names stay English.
const BC_OGL = { licence: "Open Government Licence – British Columbia", licenceUrl: "https://www2.gov.bc.ca/gov/content?id=A519A56BC2BF44E4A008B33FCF527F61" };
const bcOws = (layer) => `https://openmaps.gov.bc.ca/geo/pub/${layer}/ows`;

export const COMMON_WEB_SERVICES = [
  { id: "bc-bedrock", label: "British Columbia — Bedrock Geology (BC Geological Survey)", region: "Canada · BC", wms: bcOws("WHSE_MINERAL_TENURE.GEOL_BEDROCK_UNIT_POLY_SVW"), wfs: bcOws("WHSE_MINERAL_TENURE.GEOL_BEDROCK_UNIT_POLY_SVW"), layer: "pub:WHSE_MINERAL_TENURE.GEOL_BEDROCK_UNIT_POLY_SVW", ...BC_OGL },
  { id: "bc-tenure", label: "British Columbia — Mineral, Placer and Coal Tenure (Mineral Titles Online)", region: "Canada · BC", wms: bcOws("WHSE_MINERAL_TENURE.MTA_ACQUIRED_TENURE_SVW"), wfs: bcOws("WHSE_MINERAL_TENURE.MTA_ACQUIRED_TENURE_SVW"), layer: "pub:WHSE_MINERAL_TENURE.MTA_ACQUIRED_TENURE_SVW", ...BC_OGL },
  { id: "ga-surface", label: "Australia — Surface Geology 1:1M (Geoscience Australia)", region: "Australia", wms: "https://services.ga.gov.au/gis/services/GA_Surface_Geology/MapServer/WMSServer", wfs: null, layer: "AUS_GA_1M_GUPoly_Lithostratigraphy", licence: "Creative Commons Attribution 4.0", licenceUrl: "https://creativecommons.org/licenses/by/4.0/" },
  { id: "wa-bedrock", label: "Western Australia — State interpreted bedrock geology 1:500 000 (GSWA, DMIRS)", region: "Australia · WA", wms: "https://public-services.slip.wa.gov.au/public/services/SLIP_Public_Services/Geology_and_Soils_Map/MapServer/WMSServer", wfs: null, layer: "16", licence: "Creative Commons Attribution 4.0 (Department of Energy, Mines, Industry Regulation and Safety, WA)", licenceUrl: "https://creativecommons.org/licenses/by/4.0/" },
];

// TASKS.csv #3000 (WA iron review) — the list opened with two British Columbia services on a project at 22.5 S, 120 E. Each service's area, a
// [west, south, east, north] box in degrees; the list puts the services whose area holds the project (its centre) first, the order otherwise unchanged
const SERVICE_AREAS = { "bc-bedrock": [-140, 48, -114, 60.1], "bc-tenure": [-140, 48, -114, 60.1], "ga-surface": [112, -44, 154, -9], "wa-bedrock": [112.9, -35.2, 129.1, -13.6] };
export function servicesFirst(services, centreLonLat) {
  if (!centreLonLat || !Number.isFinite(centreLonLat.lon) || !Number.isFinite(centreLonLat.lat)) return services;
  const inside = (p) => { const a = SERVICE_AREAS[p.id]; return !!a && centreLonLat.lon >= a[0] && centreLonLat.lon <= a[2] && centreLonLat.lat >= a[1] && centreLonLat.lat <= a[3]; };
  return [...services.filter(inside), ...services.filter((p) => !inside(p))];
}

// the service type to use for a preset: the one asked for when it offers it, else the one it has
export function presetService(preset, wanted) {
  if (!preset) return wanted;
  return preset[wanted] ? wanted : preset.wms ? "wms" : "wfs";
}
