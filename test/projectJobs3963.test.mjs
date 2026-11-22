// TASKS.csv #3963 — #3953's leftovers: plain file imports tied to their project, a run's early notices to its own project, a cut-off multi-model import
// said, "Cancelled" said once, and a cancelled job's downloads stopped (an AbortSignal through the fetchers, a request id the main process can abort).
// Made-up projects, tabs and responses only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// desktop.js reads window.desktop once, when it is first imported: one bridge object, its functions set by each test
const bridge = {};
globalThis.window = { desktop: bridge };

// a tiny store for createProjectJobs: projects A (shown) and B, tabs by key
function env() {
  const s = { active: "A", tabs: new Map([["A", "tab A"], ["B", "tab B"]]), notes: [] };
  return {
    s,
    activeKey: () => s.active,
    tabOfKey: (k) => (k !== s.active && s.tabs.has(k) ? { name: s.tabs.get(k) } : null),
    notify: (e) => s.notes.push(e),
  };
}

test("every job has its own AbortSignal: aborted when its project closes, and by job.abort(); noJob has none", async () => {
  const { createProjectJobs, noJob } = await import("../src/lib/projectJobs.js");
  const e = env(), jobs = createProjectJobs(e);
  const a = jobs.start({ label: "Terrain" }), b = jobs.start({ label: "Imagery", key: "B" });
  assert.ok(a.signal && !a.signal.aborted);
  assert.notEqual(a.signal, b.signal, "one signal per job");
  let cancelled = 0; a.cancel = () => cancelled++;
  jobs.projectClosed("A");
  assert.equal(a.signal.aborted, true, "its downloads stop");
  assert.equal(cancelled, 1, "and its own cancel still runs");
  assert.equal(b.signal.aborted, false, "another project's job goes on");
  b.abort();
  assert.equal(b.signal.aborted, true);
  const n = noJob("x");
  assert.equal(n.signal, undefined);
  assert.doesNotThrow(() => n.abort());
});

test("a job that landed already and then loses its project says it was cut off, once; one that never landed is cancelled as before", async () => {
  const { createProjectJobs, landed } = await import("../src/lib/projectJobs.js");
  const e = env(), jobs = createProjectJobs(e);
  // a three-model import: the first model lands, then the project is closed
  const imp = jobs.start({ label: "Block model" });
  assert.equal(await landed(imp), true);
  jobs.projectClosed("A");
  assert.deepEqual(e.s.notes, [], "#3953: a job that landed is dropped quietly at the close");
  assert.equal(await landed(imp), false, "the next model does not land");
  assert.equal(await landed(imp), false);
  assert.deepEqual(e.s.notes, [{ kind: "cutoff", label: "Block model", reason: "closed" }], "said once");
  // never landed: the close cancels it and says so; no cut-off notice after
  e.s.active = "B";
  const shell = jobs.start({ label: "Grade shell" });
  jobs.projectClosed("B");
  assert.equal(await landed(shell), false);
  assert.deepEqual(e.s.notes.slice(1).map((x) => x.kind), ["cancelled"]);
  const s = rd("src/lib/store.jsx");
  assert.match(s, /e\.kind === "cutoff" \? tr\("\{label\} was cut off: its project closed before the rest was added\.", \{ label: e\.label \}\)/);
});

test("a plain file import's CRS chooser asks and sets nothing once its job's project is no longer shown", async () => {
  const { projectEpsgChooser } = await import("../src/lib/adoptCrs.js");
  let set = null, asked = 0, live = true;
  const choose = projectEpsgChooser({ isEmpty: true, setEpsg: (c) => { set = c; }, fileName: "dem.tif", live: () => live }, () => { asked++; return true; });
  live = false;
  assert.equal(await choose(32609, 32610), 32610, "the current CRS, unchanged"); // async since #3957 (the question is an in-app dialog)
  assert.equal(set, null);
  assert.equal(asked, 0, "no question in the project now shown");
  // with no live() it is as before
  const plain = projectEpsgChooser({ isEmpty: true, setEpsg: () => {}, fileName: "x" }, () => true);
  assert.equal(typeof plain, "function");
});

test("a notice for a tab: the shown one directly, another one's stash (it comes back with the tab), none for a closed project", async () => {
  const { noticesToTab, tabNoticesSwitch } = await import("../src/lib/useTabNotices.js");
  const stash = new Map();
  let shown = ["shown 1"];
  const setShown = (u) => { shown = typeof u === "function" ? u(shown) : u; };
  noticesToTab(stash, "t1", "t1", (p) => [...p, "for t1"], setShown);
  assert.deepEqual(shown, ["shown 1", "for t1"]);
  noticesToTab(stash, "t1", "t2", (p) => [...p, "Unsampled metres read as barren"], setShown);
  assert.deepEqual(shown, ["shown 1", "for t1"], "not in the tab shown");
  assert.deepEqual(stash.get("t2"), ["Unsampled metres read as barren"]);
  noticesToTab(stash, "t1", null, (p) => [...p, "lost"], setShown);
  assert.equal(stash.size, 1);
  // switching to t2 brings its notice back
  assert.deepEqual(tabNoticesSwitch(stash, "t1", "t2", shown), ["Unsampled metres read as barren"]);
});

test("abortableNet: no request once aborted; a request carries an id the abort sends to the main process; no signal, no id", async () => {
  const calls = [], aborts = [];
  Object.assign(bridge, { abortNetFetch: (id) => aborts.push(id), macrostratFetch: async (req) => { calls.push(req); return { ok: true, status: 200, bytes: new Uint8Array(0) }; } });
  const { abortableNet, macrostratFetch, cancelledError, isCancelledError } = await import("../src/lib/desktop.js");
  const ac = new AbortController(); ac.abort();
  const r0 = await abortableNet(ac.signal, async () => { throw new Error("must not run"); });
  assert.equal(r0.cancelled, true); assert.equal(r0.ok, false);
  const ac2 = new AbortController();
  const r1 = await abortableNet(ac2.signal, async (reqId) => { assert.match(reqId, /^n[a-z0-9]+_[a-z0-9]+$/); ac2.abort(); return { ok: false, cancelled: true }; });
  assert.equal(r1.cancelled, true);
  assert.equal(aborts.length, 1, "the main process was told");
  await abortableNet(undefined, async (reqId) => assert.equal(reqId, undefined));
  // the signal never crosses the IPC: the request has a reqId instead
  const ac3 = new AbortController();
  await macrostratFetch({ url: "https://tiles.macrostrat.org/x", binary: true, signal: ac3.signal });
  assert.equal("signal" in calls[0], false);
  assert.ok(calls[0].reqId);
  await macrostratFetch({ url: "https://tiles.macrostrat.org/y" });
  assert.equal("reqId" in calls[1], false, "no signal: the request as before");
  assert.equal(isCancelledError(cancelledError()), true);
  assert.equal(isCancelledError(Object.assign(new Error("x"), { name: "AbortError" })), true);
  assert.equal(isCancelledError(new Error("HTTP 500")), false);
});

test("the main process: the download handlers take a reqId and \"net-abort\" stops it; the preload passes it", () => {
  const m = rd("electron/main.js"), p = rd("electron/preload.js");
  assert.match(m, /async function netFetch\(reqId, url, opts = \{\}\) \{/);
  assert.match(m, /try \{ return await guardedFetch\(url, \{ \.\.\.opts, \.\.\.\(ctrl \? \{ signal: ctrl\.signal \} : \{\}\) \}\); \} finally/);
  assert.match(m, /ipcMain\.on\("net-abort", \(_e, reqId\) => \{ try \{ netAborts\.get\(String\(reqId\)\)\?\.abort\(\); \}/);
  for (const h of ["fetch-srtm-tile", "fetch-web-layer", "remote-sensing-fetch", "macrostrat-fetch"]) {
    const body = m.slice(m.indexOf(`ipcMain.handle("${h}"`), m.indexOf("});", m.indexOf(`ipcMain.handle("${h}"`)));
    assert.match(body, /reqId/, h);
    assert.match(body, /await netFetch\(reqId, /, h);
  }
  assert.match(p, /fetchSRTMTile: \(z, x, y, reqId\) => ipcRenderer\.invoke\("fetch-srtm-tile", \{ z, x, y, reqId \}\)/);
  assert.match(p, /fetchWebLayerUrl: \(url, reqId\) => ipcRenderer\.invoke\("fetch-web-layer", \{ url, reqId \}\)/);
  assert.match(p, /abortNetFetch: \(reqId\) => ipcRenderer\.send\("net-abort", reqId\)/);
});

test("Macrostrat: a cancelled job reads no more tiles and the fetch throws a cancel, not a 'some tiles failed' result", async () => {
  let n = 0;
  const ac = new AbortController();
  Object.assign(bridge, { abortNetFetch: () => {}, macrostratFetch: async () => { n++; if (n === 2) ac.abort(); return ac.signal.aborted ? { ok: false, cancelled: true } : { ok: true, status: 200, bytes: new Uint8Array(0) }; } });
  const { fetchMacrostratLegend } = await import("../src/lib/macrostratFetch.js");
  // a 0.3 x 0.3 degree box: many tiles at the plan's zoom
  await assert.rejects(fetchMacrostratLegend({ bboxLonLat: [-130, 56, -129.7, 56.3], signal: ac.signal }), (e) => e.cancelled === true);
  assert.ok(n <= 3, `stopped after ${n} request(s)`);
});

test("the fetchers take the signal down to every read; their callers pass the job's", () => {
  const f = (p) => rd(`src/lib/${p}`);
  assert.match(f("srtmFetch.js"), /const tile = await decodeTerrariumTile\(zoom, nw\.x \+ tx, nw\.y \+ ty, signal\);/);
  assert.match(f("srtmFetch.js"), /copRise = await copernicusRise\(lon, lat, c\.radiusM, signal\);/);
  assert.match(f("copernicusDem.js"), /const \[data\] = await lv\.img\.readRasters\(\{ window: \[x0, y0, x1, y1\], signal \}\);/);
  assert.match(f("nrcanDem.js"), /\.\.\.\(opts\.signal \? \{ signal: opts\.signal \} : \{\}\) \}\);/);
  assert.match(f("gem15Dem.js"), /readInto\(out, href, g, stats, \{ samples: \[0\], signal \}\)/);
  assert.match(f("imageryFetch.js"), /async request\(\{ headers = \{\}, signal \} = \{\}, retried = false\) \{/);
  assert.match(f("imageryFetch.js"), /export const openCog = \(href, stats, signal\) => fromCustomClient\(new RsClient\(href, stats\), \{\}, signal\);/);
  assert.match(f("imageryFetch.js"), /fillValue: 0, signal \}\);/);
  assert.match(f("naipFetch.js"), /samples: \[0, 1, 2\], fillValue: 0, signal \}\);/);
  assert.match(f("webLayers.js"), /const bmp = await getMapTile\([^\n]*, format, signal\);/);
  assert.match(f("webLayers.js"), /wfsGetFeature\(baseUrl, base, signal\)/);
  const c = (p) => rd(`src/${p}`);
  assert.match(c("components/MacrostratModal.jsx"), /fetchMacrostratRaster\(\{ bboxLonLat, projectEpsg, signal: job\.signal/);
  assert.match(c("components/MacrostratModal.jsx"), /fetchMacrostratMapLayer\(\{ bboxLonLat, projectEpsg, signal: job\.signal/);
  assert.match(c("components/AddWebLayerModal.jsx"), /signal: job\.signal \/\* #3963 \*\/ \}\); \/\/ #840/);
  assert.match(c("components/AddWebLayerModal.jsx"), /clipBboxLonLat: clip, signal: job\.signal/);
  assert.match(c("components/SpectralIndexModal.jsx"), /targetEpsg: tie \? Number\(tie\.epsg\) : epsg, signal: job\.signal \}\)/);
  assert.match(c("components/StartDialogs.jsx"), /gridMax: 200, signal: job\.signal/);
  assert.match(c("modules/RasterModule.jsx"), /full: satLevel === "full", signal: job\.signal/);
  assert.match(c("modules/GeophysicsModule.jsx"), /source: src, smoothSteps: gem && gemSmooth, \/\/ #3950\n\s*signal: job\.signal,/);
  // a download its project's close stopped says nothing in the pane: the banner said it
  for (const p of ["components/MacrostratModal.jsx", "components/AddWebLayerModal.jsx", "components/SpectralIndexModal.jsx", "modules/RasterModule.jsx", "modules/GeophysicsModule.jsx"]) assert.match(c(p), /if \(!job\.gone\) set/, p);
});

test("plain file imports are jobs of their project: raster (two panes), the Start dialog's terrain and its CRS, GOCAD SGrid", () => {
  const g = rd("src/modules/GeophysicsModule.jsx"), r = rd("src/modules/RasterModule.jsx"), s = rd("src/components/StartDialogs.jsx");
  const gi = g.slice(g.indexOf("const importRaster = async (file, side = {}) =>"), g.indexOf("const importTerrain = async"));
  assert.match(gi, /const job = beginJob\(file\.name\);/);
  assert.match(gi, /projectEpsgChooser\(\{ isEmpty: projectIsEmpty, setEpsg, fileName: file\.name, live: job\.isLive \}\)/);
  assert.match(gi, /if \(!\(await landed\(job\)\)\) \{ setRasterError\(null\); return; \}[^\n]*\n\s*const drape/);
  const ri = r.slice(r.indexOf("const importRaster = async (file, world = null"));
  assert.match(ri, /const job = beginJob\(file\.name\);/);
  assert.match(ri, /live: job\.isLive \}\);/);
  assert.match(ri, /if \(!\(await landed\(job\)\)\) return;[^\n]*\n\s*const drape/);
  assert.match(g, /fileName: files\[0\]\?\.name \|\| "the DEM", live: job\.isLive \}\)/, "Maps > Terrain's DEM import");
  const sg = g.slice(g.indexOf("const importSgrid = async"), g.indexOf("const importUBC = async"));
  assert.match(sg, /const job = beginJob\("GOCAD SGrid"\);/);
  assert.match(sg, /if \(!\(await landed\(job\)\)\) \{ setVoxelError\(null\); return; \}[^\n]*\n\s*addVoxelModel\(/, "each model lands in its project");
  const ground = s.slice(s.indexOf("const onGroundFiles = async"), s.indexOf("const pickCrs = async"));
  assert.match(ground, /live: job\.isLive \}\) \}\);/);
  // #3957 — the replace question is a dialog now: asked first, then the landing check (nothing awaited between landing and delivery)
  assert.match(ground, /if \(terrain && !await askConfirm\([^\n]*\n\s*if \(!\(await landed\(job\)\)\) return;[^\n]*\n\s*addTerrain\(/);
  const crs = s.slice(s.indexOf("const pickCrs = async"), s.indexOf("const strip = step === 2"));
  assert.match(crs, /const parsed = await parseDEMFiles\(picker\.files, epsg, String\(code\), \{\}\);\n\s*if \(!\(await landed\(job\)\)\) return;/);
});

test("a run's notices before it lands go to its own project; the gridding pane says Cancelled only when the user cancelled", () => {
  const m = rd("src/modules/viewer/modellingRuns.js"), u = rd("src/modules/viewer/useModelling.js"), v = rd("src/modules/ViewerModule.jsx"), st = rd("src/lib/store.jsx");
  assert.match(m, /const noticesOf = \(job\) => \(u\) => \(ctx\.setNoticesFor && job\?\.key != null \? ctx\.setNoticesFor\(job\.key, u\) : setNotices\(u\)\);/);
  assert.equal((m.match(/const jobNotices = noticesOf\(job\);/g) || []).length, 3, "halos / unit bodies, veins, the grade shell");
  assert.ok((m.match(/jobNotices\(/g) || []).length >= 16);
  assert.match(m, /else if \(unsFill\.filledM > 0\) jobNotices\(\(q\) => \[\.\.\.q, notice\(unsParams\.unsampledValueByDefault \? "Unsampled metres read as barren by default/, "the case side 4 named");
  assert.match(u, /const setNoticesFor = \(key, updater\) => setNoticesToTab\?\.\(store\.tabIdOfProjectKey\?\.\(key\), updater\);/);
  assert.match(u, /startProjectJob: store\.startProjectJob \/\* #3953 \*\/, setNoticesFor \/\* #3963 \*\/ \};/);
  assert.match(v, /const \[notices, setNotices, setNoticesToTab\] = useTabNotices\(store\.activeTabId,/);
  assert.match(v, /useModelling\(\{ setNoticesToTab,/);
  assert.match(st, /const tabIdOfProjectKey = useCallback\(\(key\) => \(key == null \? null : key === projectKeyRef\.current \? activeTabIdRef\.current : /);
  const g = rd("src/modules/GeophysicsModule.jsx");
  assert.equal((g.match(/if \(res\.cancelled\) \{ if \(!pj\.gone\) setError\(\{ info: true, text: tr\("Cancelled\."\) \}\); return; \}/g) || []).length, 2);
  assert.doesNotMatch(g, /if \(res\.cancelled\) \{ setError\(\{ info: true, text: tr\("Cancelled\."\) \}\); return; \}/);
});

test("the new words in every language", () => {
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(rd(`src/locales/${lang}.json`));
    assert.ok(d["{label} was cut off: its project closed before the rest was added."]?.includes("{label}"), lang);
  }
});
