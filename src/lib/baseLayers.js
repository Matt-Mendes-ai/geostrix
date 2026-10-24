// Base map layer definitions shared by LocatorMap.jsx (small corner mosaic) and BasemapView.jsx (full
// map / SRTM area picker). User request: "let's get their [Tracestrack] topo map instead of the
// standard one as default. Also, is there a way to get a satellite image there?"
//
// "standard" (tile.openstreetmap.org) stays the true, zero-config fallback/default for a fresh
// install — same reasoning that kept SRTM auto-fetch off any service needing a personal account (see
// srtmFetch.js's header comment). Checked what it'd take to make Tracestrack Topo the literal default:
// its own docs (tracestrack.com/docs) require a personal API key even on the free "Intro" tier (100K
// monthly credits, non-commercial only) — there is no key-free way to fetch its tiles, so it can't be
// silently defaulted to for someone who hasn't signed up. Offered instead as a selectable layer with a
// spot to paste a key; whichever layer was last picked is remembered (localStorage) and becomes the
// default from then on — so once a key is entered once, Tracestrack genuinely IS the default every
// time after that, without ever shipping a key-gated service as the out-of-the-box default.
//
// Satellite: EOX's "Sentinel-2 cloudless" mosaic (cloudless.eox.at), no API key, no account, via its "g" (Web
// Mercator / GoogleMapsCompatible) TileMatrixSet, which matches this app's slippy-tile x/y/z math exactly (z/y/x
// order, per WMTS REST's {TileMatrix}/{TileRow}/{TileCol} convention).
// TASKS.csv #837 — LICENCE, from EOX's own WMTS GetCapabilities (tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml,
// read 2026-10-24): the 2016 and 2017 layers are CC BY 4.0; EVERY layer from 2018 to 2025 is CC BY-NC-SA 4.0
// (non-commercial; "commercial use requires contacting cloudless.eox.at"). The earlier "CC BY 4.0" here read the
// service-level AccessConstraints, not the layer abstracts. The CC BY 2017 layer serves blank tiles over British
// Columbia (checked: Woodjam and Harry at z8-z14 are 116-668 byte blanks; Vienna is real), so it is no swap.
// Matt chose option B: the 2025 mosaic stays as a DISPLAY-ONLY basemap, labelled with its real licence below, and
// the fetch that stores imagery in the project (RasterModule) uses the Copernicus Sentinel-2 scene path only
// (imageryFetch.js #816: free and open, any use with attribution). The former EOX tile mosaic fetch
// (satelliteFetch.js, #204 / #423 / #781) was removed.
const LS_LAYER = "geostrix_basemap_layer";
const LS_TRACESTRACK_KEY = "geostrix_tracestrack_key";

export const BASE_LAYERS = [
  {
    id: "standard",
    label: "Standard",
    attribution: "© OpenStreetMap contributors",
    needsKey: false,
    tileUrl: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  },
  {
    id: "tracestrack",
    label: "Topo (Tracestrack)",
    attribution: "© Tracestrack, © OpenStreetMap contributors",
    needsKey: true,
    keyLabel: "Tracestrack API key",
    keyHelpUrl: "https://tracestrack.com/",
    tileUrl: (z, x, y, key) => `https://tile.tracestrack.com/topo_en/${z}/${x}/${y}.png?key=${encodeURIComponent(key || "")}`,
  },
  {
    id: "satellite",
    label: "Satellite",
    attribution: "Sentinel-2 cloudless 2025 © EOX IT Services GmbH, contains modified Copernicus Sentinel data (CC BY-NC-SA 4.0: non-commercial use; commercial use needs a licence from EOX)",
    needsKey: false,
    tileUrl: (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/${z}/${y}/${x}.jpg`,
  },
];

export function getBaseLayer(id) {
  return BASE_LAYERS.find((l) => l.id === id) || BASE_LAYERS[0];
}

export function getSavedLayerId() {
  try {
    const id = localStorage.getItem(LS_LAYER);
    return BASE_LAYERS.some((l) => l.id === id) ? id : "standard";
  } catch { return "standard"; }
}
export function saveLayerId(id) {
  try { localStorage.setItem(LS_LAYER, id); } catch { /* ignore (private mode, etc.) */ }
}
export function getSavedTracestrackKey() {
  try { return localStorage.getItem(LS_TRACESTRACK_KEY) || ""; } catch { return ""; }
}
export function saveTracestrackKey(key) {
  try { localStorage.setItem(LS_TRACESTRACK_KEY, key || ""); } catch { /* ignore */ }
}

// Resolves the actual tile URL for the given layer, or null if it needs a key that isn't set yet —
// callers fall back to the standard layer's URL in that case, same shape as the rest of this app's
// "can't help, here's why" fallbacks.
export function tileUrlFor(layerId, z, x, y, tracestrackKey) {
  const layer = getBaseLayer(layerId);
  if (layer.needsKey && !tracestrackKey) return null;
  return layer.tileUrl(z, x, y, tracestrackKey);
}
