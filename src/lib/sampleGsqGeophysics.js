// TASKS.csv #4105 (Matt, v0.2.14: "I don't see any geophysics in carbo creek sample") — the five Geoscience Queensland samples open WITH their geophysics.
// The sample list shows a Geophysics icon from the files in each folder's geophysics/ (and mapping/); the open used to load the drillhole tables only. After the holes
// (and their assays), loadGsqGeophysics reads each kind through the readers a user's own drop uses, and stores it where those readers' panes store it, with no dialog
// (the defaults the samples' READMEs state; a column picker's guess where the README says nothing):
//   IP lines (.dat + the line's .stn)        → saved DC / IP lines (as Woodjam's), placed from their stations      (lib/dcip.js, dcipStations.js)
//   IP tables with electrode coordinates     → saved DC / IP lines, placed from the electrodes                     (Edinburgh .csv, Cloncurry .esf)
//   point tables (magnetics, gradient array, a 2D model's points) → point surveys (layers.geophys_pts + geophysSurveys), as the Point survey pane makes them
//   borehole EM (.tem)                        → one custom layer per file along the matched holes, as the Borehole EM pane's "Add layers" makes
//   ground TEM (.tem)                         → ONE point survey of the decay constant per sample (the TEM pane's "Map the decay constant") and the loop as a boundary
// A Geophysics icon whose kind is not in GSQ_GEOPHYSICS fails test/gsqGeophysics4105.test.mjs. Pure parts here (testable in Node); the store writes are the last step.
import Papa from "papaparse";
import { woodjamIpLine } from "./sampleWoodjam.js";
import { parseStationFile } from "./dcipStations.js";
import { electrodeLines } from "./dcipElectrodes.js";
import { parseDcipWhitespaceText, guessDcipColumns, parseDcipRows, suggestModelDepth, lineFromTwoPoints, lineGeometry, pseudoPositions } from "./dcip.js";
import { readDownholeEm, matchEmHoles, emLayerRows, defaultChannel, sortComps } from "./downholeEm.js";
import { guessGeophysColumns, rowsToGeophysPoints } from "./geophysColumns.js";
import { parseXYZ, guessXyzChannels } from "./geosoft.js";
import { parseMapInfoTab } from "./mapinfoTab.js";
import { parseShapefileParts } from "./shapefile.js";
import { guessEpsgFromPrjWkt } from "./reprojectMore.js";
import { buildLayer, autoColorFor } from "./mapLayerBuild.js";
import { autoCategories } from "./mapLayers.js";
import { guessStructureColumns, parseStructureRows } from "./mapStructures.js";
import { guessSurveyMethodFrom } from "./geophysSurveyTools.js";
import { surveyMetaFor } from "./surveyLegendDefault.js";
import { notice, errorNotice } from "./notices.js";
import { t as tr } from "./i18n.js";
const noReadings = (name) => new Error(name); // the file that does not read, or has none; the notice names the sample and the kind before it (a message of its own would be one more string to translate)

const ipPairs = (names, dat, stn) => names.map((n) => ({ name: n, dat: dat(n), stn: stn(n) }));
// which -> every file of its geophysics/ folder that is read ("reference" lists the ones kept only for the user: loop .tx files, a shapefile's parts, the raw .xyz columns)
export const GSQ_GEOPHYSICS = {
  gsq_carbo_creek: {
    ipLines: ipPairs(["49000E", "50000E", "7543300N", "7544100N", "7551200N", "7552000N", "7552400N"], (n) => `geophysics/ip/Line_${n}.dat`, (n) => `geophysics/ip/${n}.utm.stn`),
    groundEm: ["OSB018", "OSB060", "OSB064", "OSB065"].map((n) => `geophysics/em/${n}_BField_groundem_mga54.tem`),
  },
  gsq_cloncurry: {
    ipTables: [{ file: "geophysics/ip/LSC_DDIP_all.esf", format: "esf" }],
    pointTables: [{ file: "geophysics/ip/LSC_3600N_DCIP2D_model.csv", format: "csv", label: "2D IP model" }],
    dhem: ["LSD0003_LS_DHEM2017_1", "LSD0005_LS_DHEM2017_2", "LSR0004_LS_DHEM2017_3"].map((n) => `geophysics/dhem/${n}.tem`),
    groundEm: [...[63300, 63400, 63500, 63600, 63700, 63800, 63900].map((n) => `geophysics/em/fixedloop_75${n}.00.tem`), ...[64400, 64800, 65200].map((n) => `geophysics/em/inloop_75${n}.tem`)],
    reference: ["geophysics/dhem/LSC_DHEM2017_1.tx", "geophysics/dhem/LSC_DHEM2017_2.tx", "geophysics/dhem/LSC_DHEM2017_3.tx", "geophysics/dhem/LS_DHEM2017_1.tx", "geophysics/em/fixedloop_LSC_FLEM_1.tx"],
    mapLayers: [{ base: "mapping/lsc_mapping_2017", field: "Lith" }], // MapInfo TAB: the geology polygons, coloured by their rock code (the README: 55 polygons)
    structurePoints: ["mapping/lsc_structure_mapping"], // the 143 structural points: dip and dip direction, as a surface structure set (grid north, as the README says)
  },
  gsq_altia_south: {
    dhem: ["17IZ001_1", "17IZ001_2", "17IZ003", "17IZ004_1", "17IZ004_2", "17IZ005"].map((n) => `geophysics/dhem/${n}.tem`),
    plates: ["geophysics/dhem/17IZ001_DHEM_Plate.dxf", "geophysics/dhem/17IZ003_DHEM_Plate.dxf"],
    groundEm: ["geophysics/em/ION_MLEM_2017.tem"],
    stationLayers: ["geophysics/em/MLEM_2017_ION_stns"], // the moving-loop line's 96 stations (a shapefile): a map layer, as the README says to open it
    reference: ["geophysics/em/MLEM_2017_ION_stns.cpg", "geophysics/em/MLEM_2017_ION_stns.dbf", "geophysics/em/MLEM_2017_ION_stns.prj", "geophysics/em/MLEM_2017_ION_stns.shx", "geophysics/em/MLEM_2017_ION_stns.shp"],
  },
  gsq_black_mountain: {
    ipLines: ipPairs(["4500N", "4550N", "4600N", "4650N", "5000N", "5200N"], (n) => `geophysics/ip/${n}.dat`, (n) => `geophysics/ip/${n}.stn`),
    pointTables: [{ file: "geophysics/ip/gradient_array.csv", format: "csv", label: "gradient array" }, { file: "geophysics/mag/ground_mag_lines.xyz", format: "xyz", label: "ground magnetics" }],
  },
  gsq_edinburgh_park: {
    ipTables: ["L563200", "L563600", "L564000", "L7783800", "L7784600", "L7785400"].map((n) => ({ file: `geophysics/ip/${n}.csv`, format: "electrodes", line: n })),
    pointTables: [{ file: "geophysics/mag/ground_mag.csv", format: "csv", label: "ground magnetics" }],
  },
};
// every file of a sample's geophysics/ and mapping/ folders that GSQ_GEOPHYSICS / GSQ_MAPPING read or name as reference (the test walks the folders against this)
export const gsqKnownFiles = (which) => {
  const g = GSQ_GEOPHYSICS[which] || {};
  return new Set([
    ...(g.ipLines || []).flatMap((l) => [l.dat, l.stn]), ...(g.ipTables || []).map((t) => t.file), ...(g.pointTables || []).map((t) => t.file), ...(g.dhem || []), ...(g.plates || []),
    ...(g.groundEm || []), ...(g.reference || []),
    ...(g.mapLayers || []).flatMap((l) => ["TAB", "DAT", "ID", "MAP", "IND"].map((e) => `${l.base}.${e}`)), ...(g.structurePoints || []).flatMap((b) => ["TAB", "DAT", "ID", "MAP", "IND"].map((e) => `${b}.${e}`)),
  ]);
};

const tick = () => new Promise((r) => setTimeout(r, 0));

// ---- IP lines from a .dat and its station file (Woodjam's reader): the line placed from its stations
export function gsqIpLine(which, spec, datText, stnText, projectEpsg) {
  const stationFile = { name: spec.stn.split("/").pop(), ...parseStationFile(stnText, spec.stn.split("/").pop()) };
  const entry = woodjamIpLine(spec.name, datText, stationFile, projectEpsg);
  return { ...entry, sample: which };
}

// ---- IP readings whose electrodes carry map coordinates (Edinburgh's .csv, Cloncurry's .esf): the DC / IP pane's own reader (lib/dcipElectrodes.js electrodeLines): the electrodes read
// as one line, the repeats of an array stacked, the line placed from its electrodes (the pane's placementOf)
export function ipTableLines(which, spec, text) {
  let headers, rows;
  if (spec.format === "esf") { const w = parseDcipWhitespaceText(text); if (!w) throw noReadings(spec.file); headers = w.headers; rows = w.rows; }
  else { const t = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false }); headers = t.meta.fields; rows = t.data; }
  const base = spec.file.split("/").pop().replace(/\.[a-z0-9]+$/i, "");
  const res = electrodeLines(headers, rows, { lineCol: headers.includes("Line") ? "Line" : null, base });
  if (!res?.lines) throw noReadings(spec.file);
  return res.lines.map((L) => {
    const p = parseDcipRows(L.rows, guessDcipColumns(L.headers));
    if (!p.readings.length) throw noReadings(L.name);
    const g = L.pts ? lineFromTwoPoints(L.pts) : null, r2 = (x) => String(+x.toFixed(2));
    const line = g ? { x0: r2(g.x0), y0: r2(g.y0), x1: r2(g.x1), y1: r2(g.y1), ground: "", scale: Math.abs(g.scale - 1) > 0.002 ? String(+g.scale.toFixed(4)) : "", stations: null, pts: L.pts } : { x0: "", y0: "", x1: "", y1: "", ground: "", scale: "", stations: null };
    const cell = p.spacing ? String(+(p.spacing / 2).toFixed(2)) : "";
    return { name: L.name, readings: p.readings, rho: p.rho, ip: p.ip, ipKind: p.ipKind, ...(p.err ? { err: p.err } : {}), line, opts: { cell, depth: p.spacing ? String(suggestModelDepth(p.readings, p.span, p.spacing / 2)) : "" }, savedAt: new Date().toISOString(), sample: which };
  });
}

// ---- the saved IP lines are read in Geophysics > IP / Resistivity (a section is drawn once a line is inverted), so nothing of them showed in the 3D View or under Point survey.
// The apparent values are also kept as the two point surveys the app itself offers for a pseudo-section (methods ip_app and res_app: "points at depth, apparent values"): each
// reading at the middle of its electrodes along the placed line, half the dipole centres' distance below the ground (the line's station elevations, else the holes' mean collar level).
export function ipPseudoSurveys(entries, label, groundZ) {
  const kinds = [["ip_app", "IP apparent chargeability", (e, i) => e.ip?.[i]], ["res_app", "apparent resistivity", (e, i) => e.rho[i]]];
  const out = [];
  for (const [method, title, pick] of kinds) {
    const name = `${label} · ${title}`, pts = [];
    for (const e of entries) {
      if (e.line.x0 === "" || e.line.x1 === "") continue;
      const g = lineGeometry([Number(e.line.x0), Number(e.line.y0)], [Number(e.line.x1), Number(e.line.y1)], Number(e.line.scale) || 1);
      if (!g) continue;
      const zs = (e.line.stations?.list || []).map((q) => q.z).filter(Number.isFinite), ground = zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length : groundZ;
      pseudoPositions(e.readings).forEach((q, i) => {
        const v = pick(e, i);
        if (v == null || !Number.isFinite(v) || !Number.isFinite(ground)) return;
        const [x, y] = g.at(q.s);
        pts.push({ x, y, z: +(ground - q.depth).toFixed(2), value: v, line: e.name, _src: name });
      });
    }
    if (pts.length) out.push({ name, points: pts, meta: surveyMetaFor(method, pts.map((p) => p.value)) });
  }
  return out;
}

// ---- point tables → point surveys: [{ name, points, meta }], one per measurement column the picker would offer (the first is the importer's guess; a gradient array's
// resistivity AND chargeability, a magnetic survey's corrected reading only)
export function pointSurveys(spec, text, fileName) {
  let columns, rows, valueCols, cols;
  if (spec.format === "xyz") {
    const p = parseXYZ(text);
    columns = p.columns; rows = p.rows;
    const g = guessXyzChannels(columns, rows);
    // Geosoft line data: the corrected reading the importer offers (corr_nlf: the levelled total field)
    cols = { x: columns.find((c) => /^x/i.test(c)), y: columns.find((c) => /^y/i.test(c)), z: "", value: g.value || columns[3], line: "_line" };
    valueCols = [cols.value];
  } else {
    const t = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
    columns = t.meta.fields; rows = t.data;
    cols = guessGeophysColumns(columns);
    if (!cols.ok) throw noReadings(fileName);
    const cand = cols.valueCandidates || [cols.value];
    valueCols = spec.label === "gradient array" ? cand.filter((c) => /resistiv|chargeab/i.test(c)) : spec.label === "2D IP model" ? cand : [cols.value];
    if (!valueCols.length) valueCols = [cols.value];
  }
  const out = [];
  for (const vc of valueCols) {
    const name = valueCols.length > 1 ? `${fileName} · ${vc}` : fileName;
    const pts = [];
    if (spec.format === "xyz") {
      for (const r of rows) { const x = Number(r[cols.x]), y = Number(r[cols.y]), v = r[vc] == null || r[vc] === "" ? NaN : Number(r[vc]); /* a blank / null is no reading, not 0 */ if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(v) && v > -9999) pts.push({ x, y, z: null, value: v, line: r._line != null ? String(r._line) : undefined, _src: name }); }
    } else {
      for (const r of rowsToGeophysPoints(rows, { ...cols, value: vc })) if (Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.value)) pts.push({ ...r, _src: name });
    }
    if (!pts.length) continue;
    const method = spec.format === "xyz" ? "mag" : guessSurveyMethodFrom(vc, pts.map((r) => r.label), { columns }); // a Geosoft line file of a magnetic survey (the README): total field
    out.push({ name, points: pts, meta: method ? surveyMetaFor(method, pts.map((r) => r.value)) : null });
  }
  return out;
}

// ---- borehole EM: the component the pane lists first, at its default gate; the file's holes matched to the project's by name (a suffix such as _1 is allowed)
const slug = (s) => String(s).replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9]+/g, "_").toLowerCase();
export function boreholeEmLayer(text, fileName, holeIds) {
  const r = readDownholeEm(text, fileName, {});
  const match = {};
  for (const m of matchEmHoles(r.holes.map((h) => h.id), holeIds)) match[m.id] = m;
  const holes = r.holes.filter((h) => match[h.id]?.hole);
  if (!holes.length) return { layer: null, unmatched: r.holes.map((h) => h.id) };
  const comp = sortComps([...new Set(holes.flatMap((h) => Object.keys(h.comps)))])[0], ch = defaultChannel(r.nch || holes[0].nch);
  const rows = emLayerRows(holes, comp, ch, (h) => match[h.id].hole);
  const t = r.times?.centres?.[ch - 1];
  const layer = { id: `custom_em_${slug(fileName)}_${comp}`, name: `EM ${comp} · ${fileName} · CH${ch}${t != null ? ` (${+t.toPrecision(3)} ms)` : ""}`, rows, unit: r.units || null, defaultRampScale: "linear", em: { component: comp, nch: r.nch, times: r.times?.centres || null, widths: r.times?.widths || null, units: r.units || "", file: fileName, format: r.format, valueChannel: ch } };
  return { layer, unmatched: r.holes.filter((h) => !match[h.id]?.hole).map((h) => h.id) };
}

// ---- ground TEM: the decay constant (ms) at every station of the files, one survey for the sample; the transmitter loop (one boundary per distinct loop)
export async function groundEmSurvey(files, readFile, surveyName) {
  const { readTemText, channelMatrix, tauAll, toMs } = await import("./temLines.js");
  const pts = [], loops = new Map();
  for (const rel of files) {
    const text = await (await readFile(rel)).text();
    const d = readTemText(text, rel.split("/").pop());
    const g = d.groups.find((x) => !x.aux && x.role !== "time" && x.role !== "model") || d.groups[0], times = d.gateTimes(g);
    if (!times) continue;
    const { tau } = tauAll(channelMatrix(d, g), toMs(times));
    for (let i = 0; i < d.n; i++) if (Number.isFinite(tau[i]) && Number.isFinite(d.x[i]) && Number.isFinite(d.y[i])) pts.push({ x: d.x[i], y: d.y[i], z: d.z && Number.isFinite(d.z[i]) ? d.z[i] : null, value: +tau[i].toPrecision(5), line: String(d.line[i]), _src: surveyName });
    if (d.loop) loops.set(d.loop.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(";"), d.loop);
    await tick();
  }
  return { points: pts, loops: [...loops.values()] };
}

// ---- the whole sample. readFile(rel) → File; store: { saveDcipLine, setLayers, updateGeophysSurvey, addCustomLayer, addBoundary, addMapLayer, addSurfaceStructureSet }; ctx: { projectEpsg, holeIds, importSolid(file) }
// -> { notes, counts }. Each kind is independent: one failing does not stop the others; the heavy parsing yields between files.
export async function loadGsqGeophysics(which, readFile, store, ctx = {}) {
  const S = GSQ_GEOPHYSICS[which], notes = [], counts = {};
  if (!S) return { notes, counts };
  const fail = (what, e) => notes.push(errorNotice(`${ctx.label || which} ${what}: ${e?.message || String(e)}`));
  const projectEpsg = ctx.projectEpsg, ipEntries = [];
  if (S.ipLines) {
    try {
      let n = 0, placed = 0;
      for (const spec of S.ipLines) {
        const entry = gsqIpLine(which, spec, await (await readFile(spec.dat)).text(), await (await readFile(spec.stn)).text(), projectEpsg);
        store.saveDcipLine(entry); ipEntries.push(entry); n++; if (entry.line.stations) placed++;
        await tick();
      }
      counts.ipLines = n; counts.ipPlaced = placed;
    } catch (e) { fail("IP lines", e); }
  }
  if (S.ipTables) {
    try {
      let n = 0;
      for (const spec of S.ipTables) {
        for (const entry of ipTableLines(which, spec, await (await readFile(spec.file)).text())) { store.saveDcipLine(entry); ipEntries.push(entry); n++; }
        await tick();
      }
      counts.ipLines = (counts.ipLines || 0) + n;
    } catch (e) { fail("IP lines", e); }
  }
  if (ipEntries.length) {
    try {
      // the ground for the pseudo-depth points: the holes' mean collar level (the sample's own collar table, as the borehole EM matching reads it)
      const cz = Papa.parse(await (await readFile("collars.csv")).text(), { header: true, skipEmptyLines: true }).data.map((r) => Number(r.z)).filter(Number.isFinite);
      let n = 0;
      for (const sv of ipPseudoSurveys(ipEntries, ctx.label || which, cz.length ? cz.reduce((a, b) => a + b, 0) / cz.length : NaN)) {
        store.setLayers((l) => ({ ...l, geophys_pts: [...(l.geophys_pts || []).filter((r) => (r._src || "(unnamed import)") !== sv.name), ...sv.points] }));
        if (sv.meta) store.updateGeophysSurvey(sv.name, sv.meta);
        n++;
      }
      counts.ipSurveys = n;
    } catch (e) { fail("IP points", e); }
  }
  if (S.pointTables) {
    try {
      let n = 0;
      for (const spec of S.pointTables) {
        const fileName = spec.file.split("/").pop();
        for (const sv of pointSurveys(spec, await (await readFile(spec.file)).text(), fileName)) {
          store.setLayers((l) => ({ ...l, geophys_pts: [...(l.geophys_pts || []).filter((r) => (r._src || "(unnamed import)") !== sv.name), ...sv.points] }));
          if (sv.meta) store.updateGeophysSurvey(sv.name, sv.meta);
          n++;
        }
        await tick();
      }
      counts.pointSurveys = n;
    } catch (e) { fail("point surveys", e); }
  }
  if (S.dhem) {
    try {
      const layers = [];
      // the project's holes: the sample's own collar table (the import queue may not have committed them yet)
      const holeIds = ctx.holeIds || Papa.parse(await (await readFile("collars.csv")).text(), { header: true, skipEmptyLines: true }).data.map((r) => String(r.hole_id).trim()).filter(Boolean);
      for (const rel of S.dhem) {
        const { layer } = boreholeEmLayer(await (await readFile(rel)).text(), rel.split("/").pop(), holeIds);
        if (layer) layers.push(layer);
        await tick();
      }
      for (const l of layers) store.addCustomLayer(l); // the sample's own add (a lithology-led open hides it until asked for: #4039)
      counts.dhem = layers.length;
    } catch (e) { fail("borehole EM", e); }
  }
  if (S.groundEm) {
    try {
      const name = `${ctx.label || which} · ground EM decay constant`;
      const r = await groundEmSurvey(S.groundEm, readFile, name);
      if (r.points.length) {
        store.setLayers((l) => ({ ...l, geophys_pts: [...(l.geophys_pts || []).filter((x) => (x._src || "(unnamed import)") !== name), ...r.points] }));
        store.updateGeophysSurvey(name, surveyMetaFor("em_tau", r.points.map((p) => p.value)) || { method: "em_tau" });
      }
      if (store.addBoundary) for (const loop of r.loops) store.addBoundary({ name: tr("Loop: {name}", { name: ctx.label || which }), polylines: [loop.map((p) => ({ x: p.x, y: p.y }))], closedFlags: [true], elevation: Math.round(loop.reduce((s, p) => s + p.z, 0) / loop.length) });
      counts.groundEm = r.points.length; counts.loops = r.loops.length;
    } catch (e) { fail("ground EM", e); }
  }
  if (S.plates && ctx.importSolid) {
    try { let n = 0; for (const rel of S.plates) { await ctx.importSolid(await readFile(rel)); n++; await tick(); } counts.plates = n; } catch (e) { fail("conductor plates", e); }
  }
  const bytes = async (rel) => new Uint8Array(await (await readFile(rel)).arrayBuffer());
  if (S.mapLayers && store.addMapLayer) {
    try {
      let n = 0;
      for (const L of S.mapLayers) {
        const { layers } = parseMapInfoTab({ tab: await bytes(`${L.base}.TAB`), map: await bytes(`${L.base}.MAP`), id: await bytes(`${L.base}.ID`), dat: await bytes(`${L.base}.DAT`), name: L.base.split("/").pop() });
        for (const p of layers) {
          const layer = buildLayer({ features: p.features, geomType: p.geomType, name: layers.length > 1 ? p.name : null, epsg: p.epsg, skippedCount: p.skippedCount }, { sourceName: L.base.split("/").pop(), projectEpsg });
          if (!layer) continue;
          const styleField = layer.fields.includes(L.field) ? L.field : layer.styleField;
          store.addMapLayer({ ...layer, styleField, categories: styleField ? autoCategories(layer.features, styleField, autoColorFor()) : [], drapeMode: "terrain", visible: true });
          n++;
        }
        await tick();
      }
      counts.mapLayers = n;
    } catch (e) { fail("map layers", e); }
  }
  if (S.structurePoints && store.addSurfaceStructureSet) {
    try {
      let n = 0;
      for (const base of S.structurePoints) {
        const { layers } = parseMapInfoTab({ tab: await bytes(`${base}.TAB`), map: await bytes(`${base}.MAP`), id: await bytes(`${base}.ID`), dat: await bytes(`${base}.DAT`), name: base.split("/").pop() });
        const pts = layers.find((l) => l.geomType === "point" && !l.isText);
        if (!pts) continue;
        const rows = pts.features.map((f) => ({ ...f.attributes, Easting: f.geometry[0][0], Northing: f.geometry[0][1] }));
        const cols = guessStructureColumns([...new Set(rows.flatMap((r) => Object.keys(r)))]);
        cols.x = "Easting"; cols.y = "Northing";
        const out = parseStructureRows(rows, cols);
        store.addSurfaceStructureSet({ name: base.split("/").pop(), rows: out.rows, snapToTerrain: false, azimuthRef: "grid" });
        n += out.rows.length;
      }
      counts.structures = n;
    } catch (e) { fail("structure measurements", e); }
  }
  if (S.stationLayers && store.addMapLayer) {
    try {
      let n = 0;
      for (const base of S.stationLayers) {
        const prj = await readFile(`${base}.prj`).then((f) => f.text()).catch(() => "");
        const p = parseShapefileParts({ shp: await bytes(`${base}.shp`), dbf: await bytes(`${base}.dbf`), cpg: await readFile(`${base}.cpg`).then((f) => f.text()).catch(() => null) });
        const layer = buildLayer({ features: p.features, geomType: p.geomType, name: null, epsg: guessEpsgFromPrjWkt(prj) || projectEpsg, skippedCount: p.skippedCount }, { sourceName: base.split("/").pop(), projectEpsg });
        if (layer) { store.addMapLayer({ ...layer, drapeMode: "terrain", visible: true }); n++; }
      }
      counts.stationLayers = n;
    } catch (e) { fail("station map layer", e); }
  }
  // one short notice
  const parts = [];
  if (counts.ipLines) parts.push(tr("{n} IP lines", { n: counts.ipLines }));
  if (counts.pointSurveys || counts.ipSurveys) parts.push(tr("{n} surveys", { n: (counts.pointSurveys || 0) + (counts.ipSurveys || 0) }));
  if (counts.dhem) parts.push(tr("{n} EM layers", { n: counts.dhem }));
  if (counts.groundEm) parts.push(tr("{n} stations", { n: counts.groundEm }));
  if (counts.plates) parts.push(tr("{n} plates", { n: counts.plates }));
  if (counts.mapLayers || counts.stationLayers) parts.push(tr("{n} map layers", { n: (counts.mapLayers || 0) + (counts.stationLayers || 0) }));
  if (counts.structures) parts.push(tr("{n} structures", { n: counts.structures }));
  if (parts.length) notes.push(notice("{name}: {list}.", { name: ctx.label || which, list: parts.join(", ") }));
  return { notes, counts };
}
