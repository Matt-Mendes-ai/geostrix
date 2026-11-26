// TASKS.csv #4100 (#4070's closing audit) — the Project CRS and "A layer" choosers opened on a 60-row list ("60 of 5,811 shown", ~420 words). They
// open on the few CRSs for this place now (the current CRS, the choice, the zones at the collars), the full searchable list behind "Other CRS…";
// with none known, the full list as before. The other pickers (the file tools, the local-grid tie, Source CRS) are unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import { crsShortList } from "../src/lib/crsSearch.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(here, "..", p), "utf8").replace(/\r\n/g, "\n");

test("crsShortList: the pinned codes GeoStrix can build, in order, once each, at most five", () => {
  const list = [{ code: 26917, name: "NAD83 / UTM zone 17N" }, { code: 2959, name: "NAD83(CSRS) / UTM zone 17N" }, { code: 26717, name: "NAD27 / UTM zone 17N" }, { code: 32617, name: "WGS 84 / UTM zone 17N" }, { code: 26918, name: "NAD83 / UTM zone 18N" }, { code: 26916, name: "NAD83 / UTM zone 16N" }];
  assert.deepEqual(crsShortList(list, [26917, null, "2959", 26917, 999999, 26717, 32617, 26918, 26916]).map((c) => c.code), [26917, 2959, 26717, 32617, 26918]);
  assert.deepEqual(crsShortList(list, [null, undefined]), []); // nothing known: the caller shows the full list
  assert.deepEqual(crsShortList(list, [26916], 5).map((c) => c.code), [26916]);
});

test("the two choosers ask for it; the other pickers keep the full list", () => {
  const cart = read("src/modules/CartographyModule.jsx");
  assert.match(cart, /<CrsPicker label=\{tr\("Change to"\)\}[^>]*candidatesFirst \/\* #4100 \*\/ \/>/); // Project CRS
  assert.match(cart, /<CrsPicker label=\{tr\("Its coordinates are really in"\)\}[^>]*candidatesFirst \/\* #4100 \*\/ \/>/); // A layer
  assert.equal((cart.match(/candidatesFirst/g) || []).length, 2, "the file tools' From / To stay as they were");
  const picker = read("src/components/CrsPicker.jsx");
  assert.match(picker, /crsShortList\(all, \[crsSet \? projectEpsg : null, value, \.\.\.nearby\]\)/, "the placeholder is never a candidate (#2289)");
  assert.match(picker, /onClick=\{\(\) => setOthers\(true\)\} data-crs-others="">\{tr\("Other CRS…"\)\}/);
});

// rendered with the store (one bundle, one React context), the map hidden (it is lazy)
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-crs4100-"));
process.on("exit", () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });
const abs = (p) => JSON.stringify(path.join(here, "..", p).replace(/\\/g, "/"));
const entry = path.join(dir, "entry.jsx");
writeFileSync(entry, `export { StoreProvider } from ${abs("src/lib/store.jsx")};\nexport { default as CrsPicker } from ${abs("src/components/CrsPicker.jsx")};\n`);
const out = path.join(dir, "bundle.mjs");
writeFileSync(out, buildSync({ entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime", "lucide-react", "papaparse"], logLevel: "silent", loader: { ".json": "json" } }).outputFiles[0].text);
const { StoreProvider, CrsPicker } = await import(pathToFileURL(out).href);
const React = (await import("react")).default, { renderToStaticMarkup } = await import("react-dom/server");
const render = (props) => renderToStaticMarkup(React.createElement(StoreProvider, null, React.createElement(CrsPicker, { onChange() {}, hideMap: true, ...props })));

test("rendered: candidates first shows the short list and Other CRS…, no search box; without it, the search box and the long list", () => {
  const brief = render({ value: 28355, candidatesFirst: true });
  assert.equal((brief.match(/role="option"/g) || []).length, 1, "the one known CRS (the new project's CRS is not set: no collars, no zones)");
  assert.ok(brief.includes("data-crs-others"), "Other CRS…");
  assert.ok(!brief.includes('aria-label="Search coordinate reference systems"'), "no search box until Other CRS…");
  assert.ok(!/of [\d,]+ shown/.test(brief), "no count note");
  const full = render({ value: 28355 });
  assert.ok(full.includes('aria-label="Search coordinate reference systems"'));
  assert.ok((full.match(/role="option"/g) || []).length >= 50, "the long list");
  assert.ok(!full.includes("data-crs-others"));
  const none = render({ value: null, candidatesFirst: true }); // nothing known: the full list at once
  assert.ok(none.includes('aria-label="Search coordinate reference systems"') && !none.includes("data-crs-others"));
});
