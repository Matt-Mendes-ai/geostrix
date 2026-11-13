// TASKS.csv #3068 (Matt, 2026-11-12) — Export project as KMZ: every layer with a map position, in folders that follow the project, with the 3D
// View's styles; hidden layers, classes and holes written unticked; drillholes at their elevation; rasters as GroundOverlays; a legend per layer.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildProjectKml, estimateProjectKmz, MAX_CLASSES } from "../src/lib/projectKmz.js";
import { buildKmz, crc32 } from "../src/lib/kmzZip.js";
import { readZipEntries } from "../src/lib/shapefile.js";
import { LAYER_META, categoryColor } from "../src/lib/layers.js";
import { kmlColor } from "../src/lib/overlayExport.js";

const toLonLat = (x, y) => [-130 + (x - 500000) / 1e5, 56 + (y - 6200000) / 1e5];
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
function project() {
  const collars = [], litho = [], sg = [], assays = [];
  for (let i = 0; i < 4; i++) {
    const h = `DH${i}`;
    collars.push({ hole_id: h, x: 500000 + 100 * i, y: 6200000, z: 800 + i, azimuth: 90, dip: 60, length: 100 });
    // three abutting QFP intervals, then ANDS, then QFP again
    litho.push({ hole_id: h, from: 0, to: 10, value: "QFP" }, { hole_id: h, from: 10, to: 20, value: "QFP" }, { hole_id: h, from: 20, to: 30, value: "QFP" }, { hole_id: h, from: 30, to: 60, value: "ANDS" }, { hole_id: h, from: 60, to: 100, value: "QFP" });
    for (let d = 0; d < 100; d += 2) sg.push({ hole_id: h, from: d, to: d + 2, value: 2.5 + d / 100 + i / 10 });
    for (let d = 0; d < 100; d += 5) assays.push({ hole_id: h, from: d, to: d + 5, values: { Cu: d * 100, Au: d / 50 } });
  }
  return {
    projectName: "Test & <project>", epsg: 32609, collars, survey: [{ hole_id: "DH0", depth: 0, azimuth: 90, dip: 60 }, { hole_id: "DH0", depth: 100, azimuth: 95, dip: 55 }],
    desurveyMethod: "minimum_curvature",
    layers: { litho, sg, alt: [{ hole_id: "DH0", from: 0, to: 50, value: "SER" }] },
    customLayers: [{ id: 7, name: "Gamma", unit: "cps", rows: [{ hole_id: "DH1", from: 0, to: 50, value: 120 }, { hole_id: "DH1", from: 50, to: 100, value: 300 }] }],
    assays, assayElements: [{ symbol: "Cu", unit: "ppm" }, { symbol: "Au", unit: "g/t" }, { symbol: "Ag", unit: "g/t" }],
    surfaceSamples: [{ sample_id: "S1", x: 500050, y: 6200050, medium: "soil", values: { Cu: 45 } }, { sample_id: "S2", x: 500060, y: 6200060, medium: "rock", values: { Cu: 900 } }],
    surfaceStructures: [{ id: 1, name: "Outcrop", visible: false, rows: [{ x: 500010, y: 6200010, dip: 60, dipDir: 135, cls: "bedding" }] }],
    mapLayers: [{ id: 2, name: "Geology", geomType: "polygon", styleField: "unit", opacity: 0.5, color: "#999999",
      categories: [{ value: "Kqm", label: "Quartz monzonite", color: "#ff0000", visible: true }, { value: "Tv", label: "Volcanics", color: "#00ff00", visible: false }],
      features: [{ parts: [[[500000, 6200000], [500100, 6200000], [500100, 6200100]]], attributes: { unit: "Kqm" } }, { parts: [[[500200, 6200000], [500300, 6200000], [500300, 6200100]]], attributes: { unit: "Tv" } }] }],
    boundaries: [{ name: "Claim", color: "#0000ff", polylines: [[{ x: 499900, y: 6199900 }, { x: 500500, y: 6199900 }, { x: 500500, y: 6200500 }]], visible: true }],
    plannedHoles: [{ name: "P1", x: 500050, y: 6200050, z: 805, azimuth: 0, dip: 70, length: 200 }],
    sections: [{ id: 1, name: "L100", ax: 500000, ay: 6200000, bx: 500400, by: 6200000, contacts: [{ unit: "QFP/ANDS", color: "#aa00aa", points: [{ x: 500000, y: 6200000, z: 780 }, { x: 500300, y: 6200000, z: 760 }] }] }],
    rasters: [{ id: 3, name: "Mag RTP", bbox: [499000, 6199000, 501000, 6201000], dataUrl: "data:image/png;base64,iVBORw0KGgo=", opacity: 0.7, visible: false, colourStops: [{ value: 0, color: "#0000ff" }, { value: 1, color: "#ff0000" }], colourRange: [-100, 300] }],
    layerGroups: [{ id: "lgroup_1", name: "Geology logs", keys: ["litho", "alt"] }],
    ui: { layerVisible: { litho: true, sg: false, alt: true }, categoryFilter: { litho: ["ANDS"] }, visibleHoles: { DH3: false }, customVisible: { 7: true }, assayVisible: true, assayDisplayElements: ["Cu"], assayStyle: { Au: { breaks: [{ max: 0.5, color: "#ffff00" }, { max: 99, color: "#ff0000" }] } }, holeLabelMode: "hole_id" },
  };
}
const legends = [];
const opts = { toLonLat, legendPng: (g) => { legends.push(g); return { bytes: png, width: 120, height: 60 }; }, rasterImage: (r) => ({ bytes: png, ext: "png", legend: { label: r.name, items: [["low", "#0000ff"], ["high", "#ff0000"]] } }) };
// the folders as a tree of names, to check the order and nesting
function folderTree(kml) {
  const root = { name: "", kids: [] }, stack = [root];
  const re = /<Folder><name>([^<]*)<\/name>(<visibility>0<\/visibility>)?|<\/Folder>/g;
  let m;
  while ((m = re.exec(kml))) {
    if (m[0] === "</Folder>") stack.pop();
    else { const f = { name: m[1], hidden: !!m[2], kids: [] }; stack[stack.length - 1].kids.push(f); stack.push(f); }
  }
  assert.equal(stack.length, 1, "every Folder is closed");
  return root.kids;
}
const placemark = (kml, name) => { const i = kml.indexOf(`<Placemark><name>${name}</name>`); assert.ok(i >= 0, name); return kml.slice(i, kml.indexOf("</Placemark>", i)); };

test("the folders follow the project: drillholes (the 3D View's groups first), surface, sections, rasters", () => {
  legends.length = 0;
  const { kml, counts } = buildProjectKml(project(), opts);
  const tree = folderTree(kml);
  assert.deepEqual(tree.map((f) => f.name), ["Drillholes", "Surface", "Sections", "Rasters and grids"]);
  const dh = tree[0].kids.map((f) => f.name);
  assert.deepEqual(dh, ["Collars", "Traces", "Geology logs", "Specific gravity", "Custom layers", "Assays", "Planned holes"]);
  assert.deepEqual(tree[0].kids[2].kids.map((f) => f.name), ["Lithology", "Alteration"], "the group holds its layers");
  assert.deepEqual(tree[0].kids[5].kids.map((f) => f.name), ["Cu", "Au"], "the shown element and the classed one; Ag is neither");
  assert.deepEqual(counts.skipped, [{ kind: "assays", n: 1 }]);
  assert.deepEqual(tree[1].kids.map((f) => f.name), ["Surface samples", "Structures", "Map layers", "Boundaries"]);
  assert.equal(counts.holes, 4);
  assert.ok(counts.layers >= 9);
  // well-formed enough for Google Earth: tags balance, names escaped
  for (const t of ["Placemark", "Style", "MultiGeometry", "LineString", "Document", "ExtendedData", "GroundOverlay", "ScreenOverlay"]) assert.equal((kml.match(new RegExp(`<${t}[ >]`, "g")) || []).length, (kml.match(new RegExp(`</${t}>`, "g")) || []).length, t);
  assert.match(kml, /<name>Test &amp; &lt;project&gt;<\/name>/);
  assert.match(kml, /xmlns:gx="http:\/\/www.google.com\/kml\/ext\/2.2"/);
});

test("hidden layers, classes, holes and categories are written unticked, not left out", () => {
  const { kml } = buildProjectKml(project(), opts);
  const tree = folderTree(kml);
  const find = (kids, name) => kids.find((f) => f.name === name);
  assert.equal(find(tree[0].kids, "Specific gravity").hidden, true, "a layer the view hides");
  assert.equal(find(tree[0].kids[2].kids, "Lithology").hidden, false);
  assert.match(placemark(kml, "ANDS"), /<visibility>0<\/visibility>/, "a hidden category");
  assert.doesNotMatch(placemark(kml, "QFP"), /<visibility>0/);
  assert.match(placemark(kml, "QFP \\(hidden holes\\)".replace(/\\/g, "")), /<visibility>0<\/visibility>/, "a hidden hole's intervals");
  assert.match(kml, /<Placemark><name>DH3<\/name><visibility>0<\/visibility>/, "its collar and trace too");
  assert.equal(find(find(tree[1].kids, "Structures").kids, "Outcrop").hidden, true);
  const geol = find(find(tree[1].kids, "Map layers").kids, "Geology");
  assert.deepEqual(geol.kids.map((f) => [f.name, f.hidden]), [["Quartz monzonite", false], ["Volcanics", true]], "a map layer's categories as sub-folders");
  assert.equal(find(tree[3].kids, "Mag RTP").hidden, true);
});

test("styles: the 3D View's category colours, map-layer fill and opacity, consecutive intervals of a class as one line, elevation absolute", () => {
  const { kml } = buildProjectKml(project(), opts);
  const styleOf = (name) => { const id = /<styleUrl>#(s\d+)<\/styleUrl>/.exec(placemark(kml, name))[1]; return new RegExp(`<Style id="${id}">.*?</Style>`).exec(kml)[0]; };
  assert.match(styleOf("QFP"), new RegExp(`<LineStyle><color>${kmlColor(categoryColor(null, LAYER_META.litho, "QFP"))}</color>`));
  // QFP 0-30 (three abutting intervals) is ONE line per hole, 60-100 another: two per shown hole (DH0-DH2)
  assert.equal((placemark(kml, "QFP").match(/<LineString>/g) || []).length, 6);
  assert.match(placemark(kml, "QFP"), /<altitudeMode>absolute<\/altitudeMode>/);
  assert.match(placemark(kml, "DH1"), /,801\.00</, "the collar at its elevation");
  assert.match(styleOf("Kqm"), /<PolyStyle><color>800000ff<\/color><\/PolyStyle>/, "fill colour at the layer's opacity (0.5 -> 0x80)");
  assert.match(placemark(kml, "Kqm"), /<tessellate>1<\/tessellate>/, "map layers on the ground");
  assert.match(kml, /<GroundOverlay><name>Mag RTP<\/name><color>b3ffffff<\/color><Icon><href>files\/raster_0.png<\/href><\/Icon><gx:LatLonQuad>/, "the raster at its opacity");
  assert.match(kml, /<heading>45<\/heading><Icon><href>files\/strike.png<\/href>/, "a structure's strike symbol (dip direction 135 -> strike 45)");
  assert.match(placemark(kml, "DH0"), /<LabelStyle>|styleUrl/, "collars");
  const collarStyle = styleOf("DH0");
  assert.match(collarStyle, /<LabelStyle><scale>0.7<\/scale>/, "labelled as the view labels its holes");
});

test("numeric logs: the view's classes, or equal bins when the ramp has more colours than a legend can list; assay grade classes and their legend", () => {
  legends.length = 0;
  const p = project();
  const { kml } = buildProjectKml(p, opts);
  const sg = kml.slice(kml.indexOf("<Folder><name>Specific gravity</name>"), kml.indexOf("</Folder>", kml.indexOf("<Folder><name>Specific gravity</name>")));
  const n = (sg.match(/<Placemark><name>[^<(]*<\/name>/g) || []).length; // the classes of the shown holes (DH3's are a second, unticked set)
  assert.ok(n <= 12 && n >= 8, `${n} classes`);
  assert.ok(MAX_CLASSES < 200);
  const au = kml.slice(kml.indexOf("<Folder><name>Au</name>"), kml.indexOf("</Folder>", kml.indexOf("<Folder><name>Au</name>")));
  assert.match(au, /<Folder><name>Au<\/name><visibility>0<\/visibility>/, "classed but not shown: unticked");
  assert.equal((au.match(/<Placemark><name>[^<(]*<\/name>/g) || []).length, 2, "the two grade classes (and the hidden hole's two, unticked)");
  const lg = legends.find((g) => g.label === "Au (g/t)");
  assert.deepEqual(lg.items.map(([, c]) => c), ["#ffff00", "#ff0000"]);
  assert.ok(legends.some((g) => g.label === "Lithology") && legends.some((g) => g.label === "Geology · unit") && legends.some((g) => g.label === "Mag RTP"));
  assert.match(kml, /<ScreenOverlay><name>Legend: Lithology<\/name><Icon><href>files\/legend_\d+\.png<\/href><\/Icon><overlayXY x="0" y="1"/);
});

test("a value raster's colour ramp (no swatch rows) still gets its legend", () => {
  legends.length = 0;
  const ramp = { kind: "ramp", colors: ["#0000ff", "#ff0000"], minLabel: "-100", maxLabel: "300" };
  const { kml } = buildProjectKml(project(), { ...opts, rasterImage: () => ({ bytes: png, ext: "png", legend: { label: "Mag RTP (nT)", items: [], ramp } }) });
  assert.ok(legends.some((g) => g.label === "Mag RTP (nT)" && g.ramp === ramp));
  assert.match(kml, /<ScreenOverlay><name>Legend: Mag RTP \(nT\)<\/name><visibility>0<\/visibility>/, "hidden with its raster");
});

test("a local grid's RL datum gives the altitude; the size estimate grows with the data", () => {
  const { kml } = buildProjectKml(project(), { ...opts, altOf: (z) => z - 1000 });
  assert.match(placemark(kml, "DH1"), /,-199\.00</);
  const p = project(), small = estimateProjectKmz(p);
  p.layers.sg = [...p.layers.sg, ...p.layers.sg, ...p.layers.sg];
  assert.ok(estimateProjectKmz(p) > small);
  assert.ok(small > 10000 && small < 1e7);
});

test("the KMZ: doc.kml deflated first, the images stored, readable by GeoStrix's own KMZ reader", async () => {
  const kml = buildProjectKml(project(), opts).kml;
  const bytes = await buildKmz([{ name: "doc.kml", data: new TextEncoder().encode(kml), deflate: true }, { name: "files/dot.png", data: png }]);
  assert.equal(new DataView(bytes.buffer).getUint16(8, true), 8, "doc.kml deflated");
  assert.equal(new TextDecoder().decode(bytes.subarray(30, 37)), "doc.kml", "the first entry");
  const entries = await readZipEntries(bytes, /\.(kml|png)$/i);
  assert.equal(new TextDecoder().decode(entries["doc.kml"]), kml);
  assert.deepEqual([...entries["files/dot.png"]], [...png]);
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("wired: File > Export Project as KMZ… and the toolbar button, translated", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /else if \(action === "export-kmz"\) doExportKmz\(\);/);
  assert.match(app, /import\("\.\/lib\/projectKmzExport\.js"\)/);
  assert.match(app, /onClick=\{doExportKmz\}/);
  const main = readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
  assert.match(main, /\{ label: L\("Export Project as KMZ…"\), click: \(\) => sendMenuWithGesture\("export-kmz"\) \}/);
  assert.equal((main.match(/"Export Project as KMZ…": "/g) || []).length, 4, "es, pt, fr, ar");
});
