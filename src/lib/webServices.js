// TASKS.csv #1468 (review #1352, Silvertip) — 'Add web layer' asked for a raw OGC URL with no presets, so a geologist had to find the
// government service addresses themselves. A short list of open-licence services, each checked on 2026-11-06: GetCapabilities
// answered, and the licence read from the publisher (the BC Data Catalogue record / the service's own AccessConstraints). Only
// open licences: BC's MINFILE is 'Access Only' and the BC imagery WMS too (#816), so neither is here. GeoServer's per-layer
// endpoint (openmaps.gov.bc.ca/geo/pub/<layer>/ows) keeps the capabilities to one layer (15 kB instead of the 6 MB catalogue).
// Hosts: openmaps.gov.bc.ca and services.ga.gov.au, both listed in PRIVACY.md. Labels are names (not translated); project data
// and the layer names stay English.
const BC_OGL = { licence: "Open Government Licence – British Columbia", licenceUrl: "https://www2.gov.bc.ca/gov/content?id=A519A56BC2BF44E4A008B33FCF527F61" };
const bcOws = (layer) => `https://openmaps.gov.bc.ca/geo/pub/${layer}/ows`;

export const COMMON_WEB_SERVICES = [
  { id: "bc-bedrock", label: "British Columbia — Bedrock Geology (BC Geological Survey)", region: "Canada · BC", wms: bcOws("WHSE_MINERAL_TENURE.GEOL_BEDROCK_UNIT_POLY_SVW"), wfs: bcOws("WHSE_MINERAL_TENURE.GEOL_BEDROCK_UNIT_POLY_SVW"), layer: "pub:WHSE_MINERAL_TENURE.GEOL_BEDROCK_UNIT_POLY_SVW", ...BC_OGL },
  { id: "bc-tenure", label: "British Columbia — Mineral, Placer and Coal Tenure (Mineral Titles Online)", region: "Canada · BC", wms: bcOws("WHSE_MINERAL_TENURE.MTA_ACQUIRED_TENURE_SVW"), wfs: bcOws("WHSE_MINERAL_TENURE.MTA_ACQUIRED_TENURE_SVW"), layer: "pub:WHSE_MINERAL_TENURE.MTA_ACQUIRED_TENURE_SVW", ...BC_OGL },
  { id: "ga-surface", label: "Australia — Surface Geology 1:1M (Geoscience Australia)", region: "Australia", wms: "https://services.ga.gov.au/gis/services/GA_Surface_Geology/MapServer/WMSServer", wfs: null, layer: "AUS_GA_1M_GUPoly_Lithostratigraphy", licence: "Creative Commons Attribution 4.0", licenceUrl: "https://creativecommons.org/licenses/by/4.0/" },
];

// the service type to use for a preset: the one asked for when it offers it, else the one it has
export function presetService(preset, wanted) {
  if (!preset) return wanted;
  return preset[wanted] ? wanted : preset.wms ? "wms" : "wfs";
}
