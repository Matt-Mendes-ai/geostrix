// TASKS.csv #3954 — one list of areas for every online fetch (Macrostrat, terrain, satellite, spectral index, web layers): the project area, the
// terrain, the satellite image, a boundary or claim (its extent plus a margin, and its outline for clipping), only what the project has.
// Made-up coordinates only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchAreaChoices, fetchAreaOptions, outlineMask, clipTerrainToOutline, clipRgbaToOutline, optionForBox, startingOption, rememberedFetchArea, rememberFetchArea, isSatelliteRaster, growLonLat, optionBox, rememberedFetchMargin, rememberFetchMargin, FETCH_AREA_MARGIN_M } from "../src/lib/fetchAreas.js";
import { b64ToBytes } from "../src/lib/base64.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const collars = [{ hole_id: "DH-23-001", x: 1000, y: 2000 }, { hole_id: "DH-23-002", x: 1400, y: 2300 }];

test("only what the project has, project area first; a claim and a boundary with a margin and their outline", () => {
  assert.deepEqual(fetchAreaChoices({}), [], "an empty project offers nothing (the chooser then says to draw)");
  const c = fetchAreaChoices({
    collars,
    terrain: { bbox: [0, 0, 5000, 5000] },
    rasters: [{ id: "s", name: "Sentinel-2 2024-07-01 natural colour (~10 m pixels)", bbox: [100, 100, 4000, 4000] }, { id: "g", name: "Mag RTP", bbox: [0, 0, 9000, 9000] }],
    boundaries: [{ id: "c1", name: "Test claim", kind: "claim", polylines: [sq(900, 1900, 1500, 2400)], closedFlags: [true] },
      { id: "b1", name: "Lease", polylines: [sq(0, 0, 100, 100)], closedFlags: [true] }, { id: "l1", name: "Road", polylines: [sq(0, 0, 100, 100)], closedFlags: [false] }],
  }, { marginM: 100 });
  assert.deepEqual(c.map((o) => o.kind), ["project", "terrain", "satellite", "raster", "claim", "boundary"], "an open line is not an area");
  assert.equal(c[0].label, "Project area");
  assert.equal(c[1].label, "Same as the terrain");
  assert.equal(c[2].label, "Same as the satellite image");
  assert.deepEqual(c[4].box, [800, 1800, 1600, 2500], "the claim's extent plus the 100 m margin");
  assert.equal(c[4].label, "Claim: Test claim");
  assert.deepEqual(c[4].outline, [[[900, 1900], [1500, 1900], [1500, 2400], [900, 2400]]]);
  assert.equal(isSatelliteRaster({ name: "Mag RTP" }), false);
  assert.equal(isSatelliteRaster({ name: "x", scene: { id: "a" } }), true);
  // no holes: the map layers' extent is the project area
  const m = fetchAreaChoices({ mapLayers: [{ features: [{ parts: [[[0, 0], [1000, 500]]] }] }] });
  assert.equal(m[0].kind, "project");
});

test("lon / lat options: corners, far layers marked, one line per box; a confirmed box finds its option", async () => {
  const lonLatOf = (x, y) => ({ lon: -130 + x / 100000, lat: 56 + y / 100000 });
  const c = fetchAreaChoices({ collars, terrain: { bbox: [0, 0, 5000, 5000] }, rasters: [{ id: "r", name: "Same box", bbox: [0, 0, 5000, 5000] }] });
  const o = await fetchAreaOptions(c, lonLatOf, collars);
  assert.equal(o.length, 2, "the raster with the terrain's box is one line");
  assert.match(o[1].label, /^Same as the terrain \(\+1 with the same box\)$/);
  assert.deepEqual(o[1].bboxLonLat, [-130, 56, -129.95, 56.05]);
  assert.equal(optionForBox(o, [-130, 56, -129.95, 56.05])?.id, "terrain");
  assert.equal(optionForBox(o, [-130, 56, -129.9, 56.05]), null, "a drawn box is none of them");
  assert.deepEqual(await fetchAreaOptions(c, () => null, collars), [], "no CRS to reach lon / lat: nothing offered");
});

test("clipping: a terrain's nodes outside the outline join its no-data mask; an image's pixels go transparent", () => {
  const outline = [[[0, 0], [2, 0], [2, 2], [0, 2]]];
  const m = outlineMask(outline, [0, 0, 4, 4], 4, 4); // pixels 1 m wide: the south-west quarter
  assert.deepEqual([...m], [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0]);
  const t = clipTerrainToOutline({ bbox: [0, 0, 4, 4], gridW: 5, gridH: 5, elevations: new Float32Array(25), noDataMask: null }, [[[-0.1, -0.1], [2.1, -0.1], [2.1, 2.1], [-0.1, 2.1]]]);
  const bits = b64ToBytes(t.noDataMask), off = (i) => (bits[i >> 3] & (1 << (i & 7))) !== 0;
  assert.equal(t.clippedNodes, 16, "the 3 x 3 nodes inside stay, the other 16 are empty");
  assert.equal(off(4 * 5 + 0), false, "the south-west node is kept");
  assert.equal(off(0), true, "the north-west node is cleared");
  const rgba = new Uint8ClampedArray(16 * 4).fill(255);
  assert.equal(clipRgbaToOutline(rgba, outline, [0, 0, 4, 4], 4, 4), 12);
  assert.equal(rgba[8 * 4 + 3], 255); assert.equal(rgba[3], 0);
});

test("the choice is remembered per fetch, and a choice the project no longer has falls back to the first", () => {
  const mem = new Map(), storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  rememberFetchArea(storage, "terrain", "boundary_c1");
  assert.equal(rememberedFetchArea(storage, "terrain"), "boundary_c1");
  assert.equal(rememberedFetchArea(storage, "macrostrat"), null);
  const opts = [{ id: "project" }, { id: "boundary_c1" }];
  assert.equal(startingOption(opts, "boundary_c1").id, "boundary_c1");
  assert.equal(startingOption(opts, "boundary_gone").id, "project");
});

test("wiring: every fetch takes the shared list; terrain and images can clip", () => {
  const g = read("../src/modules/GeophysicsModule.jsx"), r = read("../src/modules/RasterModule.jsx");
  assert.match(g, /const buildSrtmAreaOptions = buildFetchAreas;/);
  assert.match(g, /areaOptions=\{webAreaOptions\} \/\* #3954 \*\/ \/><\/React\.Suspense>\}/, "Macrostrat");
  assert.match(g, /parsed = clipTerrainToOutline\(parsed, o\.outline\)/);
  assert.match(r, /fetchAreaChoices\(\{ collars, survey, surfaceSamples, terrain, rasters, boundaries \}, \{ imagery: true \}\)/, "satellite and spectral index");
  assert.match(r, /clipImageToOutline\(p\.dataUrl, p\.bbox, o\.outline\)/);
  assert.match(read("../src/components/MacrostratModal.jsx"), /<AreaChooser options=\{options\} area=\{area\}/);
  assert.match(read("../src/components/AddWebLayerModal.jsx"), /<AreaChooser options=\{options\} area=\{area\}/);
});

test("the Margin box: a boundary or claim grows from its own extent by the margin typed (0 allowed), remembered per fetch", async () => {
  const lonLatOf = (x, y) => ({ lon: -130 + x / 100000, lat: 56 + y / 100000 });
  const c = fetchAreaChoices({ collars, boundaries: [{ id: "c1", name: "Test claim", kind: "claim", polylines: [sq(900, 1900, 1500, 2400)], closedFlags: [true] }] });
  const o = await fetchAreaOptions(c, lonLatOf, collars), claim = o.find((x) => x.kind === "claim"), project = o.find((x) => x.kind === "project");
  assert.deepEqual(claim.coreLonLat, [-129.991, 56.019, -129.985, 56.024], "the claim's own extent");
  assert.deepEqual(optionBox(claim, 0), claim.coreLonLat, "0 m: the extent itself");
  const g = optionBox(claim, 1000), dLat = 1000 / 110574;
  assert.ok(Math.abs(g[1] - (56.019 - dLat)) < 1e-9 && Math.abs(g[3] - (56.024 + dLat)) < 1e-9, "1,000 m north and south");
  assert.ok(g[0] < claim.coreLonLat[0] - dLat, "and east-west in longitude degrees, wider at 56° N");
  assert.deepEqual(optionBox(project, 1000), project.bboxLonLat, "the project area takes no margin from the box");
  assert.deepEqual(growLonLat([0, 0, 1, 1], -5), [0, 0, 1, 1], "a negative margin is none");
  const mem = new Map(), storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(rememberedFetchMargin(storage, "macrostrat"), FETCH_AREA_MARGIN_M, "250 m until one is typed");
  rememberFetchMargin(storage, "macrostrat", 0);
  assert.equal(rememberedFetchMargin(storage, "macrostrat"), 0, "0 is kept");
  assert.equal(rememberedFetchMargin(storage, "web"), FETCH_AREA_MARGIN_M, "per fetch");
  const ch = read("../src/components/AreaChooser.jsx");
  assert.match(ch, /\{area\.option\?\.coreLonLat && \(/, "shown only for an area that takes a margin");
  assert.match(ch, /<NumberInput value=\{area\.margin\} min=\{0\}/, "comma or point, 0 allowed (NumberInput)");
  assert.match(ch, /const bboxLonLat = id === "drawn" \? drawn : optionBox\(option, margin\);/, "the size line and the fetch read the margined box");
});
