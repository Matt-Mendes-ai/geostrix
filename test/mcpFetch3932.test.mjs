// TASKS.csv #3932 (Matt's decision, 2026-11-21) — the two change tools that download (fetch_satellite_image, fetch_terrain). The download is asked for in GeoStrix's main
// process every time, before the window sees the call (declined and offline said plainly); the pane's own fetch does the work; nothing is overwritten (a second terrain is
// refused); the toast's Undo removes what was added. No network here: the box, the panes and the store are stand-ins; no real place or data.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { runChange } from "../src/lib/mcpActions.js";

const require = createRequire(import.meta.url);
const proto = require("../electron/mcpProtocol.js");
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const rpc = (id, method, params) => JSON.stringify({ jsonrpc: "2.0", id, method, params });
const parse = (t) => JSON.parse(t);
const call = (id, name, args = {}) => rpc(id, "tools/call", { name, arguments: args });

function session({ yes = true, online = true } = {}) {
  const st = { asked: [], calls: [] };
  const s = proto.createSession({
    changesAllowed: () => true, askAllow: async () => "once", isOnline: () => online,
    askNetwork: async (c, tool) => { st.asked.push([c, tool]); return yes; },
    callTool: async (n, a, meta) => { st.calls.push([n, meta]); return { ok: true, data: { changed: "raster" } }; },
  });
  return { s, st };
}
const init = (s) => s.handleLine(rpc(1, "initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "Claude Desktop" } }));

test("#3932 a download is asked for every time, in the main process, before the window sees it; declined and offline are said plainly; the others never ask", async () => {
  assert.deepEqual(proto.TOOLS.filter(proto.isNetworkTool).map((t) => t.name).sort(), ["fetch_satellite_image", "fetch_terrain"]);
  const a = session({ yes: true });
  await init(a.s);
  assert.equal(parse(await a.s.handleLine(call(2, "fetch_satellite_image", { max_cloud_percent: 20 }))).result.isError, false);
  assert.equal(parse(await a.s.handleLine(call(3, "fetch_satellite_image"))).result.isError, false);
  assert.deepEqual(a.st.asked, [["Claude Desktop", "fetch_satellite_image"], ["Claude Desktop", "fetch_satellite_image"]], "asked each time: no 'always'");
  assert.deepEqual(a.st.calls[0], ["fetch_satellite_image", { client: "Claude Desktop", change: true, network: true }], "the host is told it is a download (its longer wait)");
  await a.s.handleLine(call(4, "make_section", { along_hole: "DH-23-001" }));
  assert.equal(a.st.asked.length, 2, "a change that downloads nothing is not asked about a download");
  const no = session({ yes: false });
  await init(no.s);
  const r = parse(await no.s.handleLine(call(2, "fetch_terrain"))).result;
  assert.equal(r.isError, true); assert.equal(r.content[0].text, "The user declined the download in GeoStrix.");
  assert.equal(no.st.calls.length, 0, "declined: nothing reached the window");
  const off = session({ online: false });
  await init(off.s);
  assert.equal(parse(await off.s.handleLine(call(2, "fetch_terrain"))).result.content[0].text, "No internet connection.");
  assert.deepEqual([off.st.asked.length, off.st.calls.length], [0, 0], "offline: not even asked");
  // the safe default when no question can be put: no
  const bare = proto.createSession({ changesAllowed: () => true, askAllow: async () => "once", callTool: async () => ({ ok: true, data: {} }) });
  await init(bare);
  assert.equal(parse(await bare.handleLine(call(2, "fetch_terrain"))).result.content[0].text, "The user declined the download in GeoStrix.");
  // the schema: a whole percentage, a fixed area
  const d = proto.TOOLS.find((t) => t.name === "fetch_satellite_image");
  assert.equal(proto.refuseArgs(d, { max_cloud_percent: 101 })?.message, "'max_cloud_percent' must be at most 100.");
  assert.equal(proto.refuseArgs(d, { max_cloud_percent: 2.5 })?.message, "'max_cloud_percent' must be a whole number.");
  assert.equal(proto.refuseArgs(d, { area: "C:\\x" })?.code, "path");
  assert.match(proto.refuseArgs(d, { area: "world" })?.message, /must be one of: terrain, holes/);
  assert.equal(proto.refuseArgs(proto.TOOLS.find((t) => t.name === "fetch_terrain"), { area: "holes" })?.message, "Unknown argument 'area'.");
});

// the stand-in Maps tab: answers the fetch through the payload's reply, as RasterModule / GeophysicsModule do
if (!globalThis.window) globalThis.window = new EventTarget();
let pane = null;
window.addEventListener("geostrix-module-action", (e) => { if (pane && /^mcp-fetch-/.test(e.detail.action)) pane(e.detail.action, e.detail.payload); });
function store() {
  const s = { rasters: [{ id: "r0", name: "The user's own" }], terrain: null, tabs: [], log: [] };
  s.undoCheckpoint = (l) => s.log.push(["checkpoint", l ?? null]);
  s.goToModule = (m) => s.tabs.push(m);
  s.removeRaster = (id) => { s.rasters = s.rasters.filter((r) => r.id !== id); };
  s.removeTerrain = () => { s.terrain = null; };
  return s;
}
const run = (name, args, s, toasts) => runChange(name, args, { getStore: () => s, client: "Claude Desktop", toast: (t) => toasts.push(t), settle: async () => {} });

test("#3932 fetch_satellite_image: the Maps tab's own fetch, its cloud limit passed on; the answer short; the toast's Undo removes only that image; a failure said as the pane says it", async () => {
  const s = store(), toasts = [], seen = [];
  pane = (action, p) => { seen.push([action, { maxCloud: p.maxCloud, area: p.area }]); s.rasters = [...s.rasters, { id: "r1", name: "Sentinel-2 2026-08-01" }]; p.reply({ ok: true, name: "Sentinel-2 2026-08-01", ids: ["r1"], pictures: 1, over: "terrain", area_cloud_percent: 0.4 }); };
  const r = await run("fetch_satellite_image", { max_cloud_percent: 20 }, s, toasts);
  assert.deepEqual(r, { ok: true, data: { ok: true, changed: "raster", name: "Sentinel-2 2026-08-01", id: "r1", pictures: 1, over: "terrain", area_cloud_percent: 0.4 } });
  assert.deepEqual(seen, [["mcp-fetch-satellite", { maxCloud: 20, area: undefined }]]);
  assert.deepEqual(s.tabs, ["maps"]);
  assert.equal(toasts[0].message, "Claude Desktop: added the satellite image 'Sentinel-2 2026-08-01'");
  toasts[0].undo();
  assert.deepEqual(s.rasters.map((x) => x.id), ["r0"]);
  pane = (_a, p) => p.reply({ ok: false, error: "No Sentinel-2 scene of the last 12 months covers this area with under 20% cloud." });
  assert.deepEqual(await run("fetch_satellite_image", { max_cloud_percent: 20 }, s, toasts), { ok: false, error: "No Sentinel-2 scene of the last 12 months covers this area with under 20% cloud." });
  assert.equal(toasts.length, 1);
});

test("#3932 fetch_terrain: refused when a terrain is loaded (no overwrite, nothing asked of the pane); the misfit reported, not acted on; Undo removes only the terrain it added", async () => {
  const s = store(), toasts = [], seen = [];
  s.terrain = { id: "t0", name: "The user's terrain" };
  pane = (a) => seen.push(a);
  assert.deepEqual(await run("fetch_terrain", {}, s, toasts), { ok: false, error: "A terrain is already loaded: remove it in GeoStrix first." });
  assert.deepEqual([seen, s.terrain.id], [[], "t0"]);
  s.terrain = null;
  pane = (_a, p) => { s.terrain = { id: "t1", name: "Copernicus DEM GLO-30" }; p.reply({ ok: true, name: "Copernicus DEM GLO-30", id: "t1", grid: "200 x 180", collar_misfit_m: 412, a_better_fit: "NAD83 / UTM zone 10N (EPSG:26910), within 6 m" }); };
  const r = await run("fetch_terrain", {}, s, toasts);
  assert.deepEqual(r.data, { ok: true, changed: "terrain", name: "Copernicus DEM GLO-30", id: "t1", grid: "200 x 180", collar_misfit_m: 412, a_better_fit: "NAD83 / UTM zone 10N (EPSG:26910), within 6 m" });
  assert.equal(toasts[0].message, "Claude Desktop: added the terrain 'Copernicus DEM GLO-30'");
  s.terrain = { id: "t9", name: "One the user loaded after" };
  toasts[0].undo();
  assert.equal(s.terrain.id, "t9", "Undo leaves a terrain it did not add");
  s.terrain = null; await run("fetch_terrain", {}, s, toasts); // a second fetch (its own change, its own Undo)
  assert.equal(s.terrain.id, "t1"); toasts[1].undo(); assert.equal(s.terrain, null);
});

test("#3932 wiring: the native download box (safe default, the hosts named), the host's longer wait, Maps forwarding to its panes, the panes' own fetches with the AI's overrides", () => {
  const main = read("../electron/main.js"), host = read("../electron/mcpHost.js"), maps = read("../src/modules/MapsModule.jsx"), raster = read("../src/modules/RasterModule.jsx"), geo = read("../src/modules/GeophysicsModule.jsx");
  assert.match(main, /message: L\("Download for the AI app\?"\)[^\n]*buttons: \[L\("Download"\), L\("Don't download"\)\], defaultId: 1, cancelId: 1/);
  assert.match(main, /copernicus-dem-30m\.s3\.amazonaws\.com/); assert.match(main, /earth-search\.aws\.element84\.com and sentinel-cogs\.s3\.us-west-2\.amazonaws\.com/);
  assert.match(main, /isOnline: \(\) => \{ try \{ return require\("electron"\)\.net\.isOnline\(\); \}/);
  for (const lang of ["es", "pt", "fr", "ar"]) assert.match(main, new RegExp(`\\n  ${lang}: \\{ "GeoStrix Help"[^\\n]*"Download for the AI app\\?": "[^"]+"[^\\n]*"Don't download": "[^"]+"`), lang);
  assert.match(host, /meta\.network \? NETWORK_CALL_TIMEOUT_MS : CALL_TIMEOUT_MS/);
  assert.match(maps, /useModuleAction\(\["mcp-fetch-terrain"\], \(_a, p\) => \{ setPane\("terrain"\); requestModuleAction\("mcp-terrain-run", p\); \}\);/);
  assert.match(maps, /useModuleAction\(\["mcp-fetch-satellite"\], \(_a, p\) => \{ setPane\("raster"\); requestModuleAction\("mcp-satellite-run", p\); \}\);/);
  assert.match(raster, /const runSatFetch = async \(bboxLonLat, ai = null\) => \{\n\s+const src = ai \? "sentinel2" : satSource;/);
  assert.match(raster, /\.\.\.\(Number\.isFinite\(ai\?\.maxTileCloud\) \? \{ maxTileCloud: ai\.maxTileCloud \} : \{\}\)/);
  assert.match(raster, /if \(p\?\.area !== "holes" && terrain\?\.bbox\)/, "over the terrain when there is one (Matt's request)");
  assert.match(geo, /const runSrtmFetch = async \(bboxLonLat, epsgOverride = null, ai = null\) => \{\n\s+const src = ai \? "copernicus" : terrainSource;/);
  assert.match(geo, /const relabelOk = better && !ai \? await askConfirm\(/, "an AI fetch never relabels the project's CRS");
  assert.match(geo, /if \(terrain\) return reply\(\{ ok: false, error: "A terrain is already loaded: remove it in GeoStrix first\." \}\);/);
  const runBody = geo.slice(geo.indexOf("const runSrtmFetch = async"), geo.indexOf("\n  };\n", geo.indexOf("const runSrtmFetch = async")));
  assert.ok(!/terrainSource/.test(runBody.slice(runBody.indexOf("const src = ") + 60)), "inside the fetch only `src` picks the source");
});
