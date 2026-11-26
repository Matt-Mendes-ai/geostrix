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
import { parseStationFile, fitStationLine } from "./dcipStations.js";
import { parseDcipWhitespaceText, guessDcipColumns, parseDcipRows, suggestModelDepth } from "./dcip.js";
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
const r1 = (v) => String(+v.toFixed(1));

// ---- IP lines from a .dat and its station file (Woodjam's reader): the line placed from its stations
export function gsqIpLine(which, spec, datText, stnText, projectEpsg) {
  const stationFile = { name: spec.stn.split("/").pop(), ...parseStationFile(stnText, spec.stn.split("/").pop()) };
  const entry = woodjamIpLine(spec.name, datText, stationFile, projectEpsg);
  return { ...entry, sample: which };
}

// ---- IP readings whose electrodes carry map coordinates (Edinburgh's .csv, Cloncurry's .esf): the chainage is the distance along the line from its first electrode;
// the line is placed from the electrodes. rows: objects with C1X, C1Y, C2X, C2Y, P1X, P1Y, P2X, P2Y (and C1Z…), a resistivity column and a chargeability column.
export function electrodeLine(which, name, rows, cols, projectEpsg) {
  const ok = (v) => Number.isFinite(v);
  const num = (v) => (v === "" || v == null ? NaN : Number(v));
  const E = ["C1", "C2", "P1", "P2"];
  const keep = rows.filter((r) => (cols.qc ? String(r[cols.qc]).trim() === "1" : true) && ok(num(r[cols.rho])) && num(r[cols.rho]) > 0);
  const pts = [];
  for (const r of keep) for (const e of E) { const x = num(r[`${e}X`]), y = num(r[`${e}Y`]); if (ok(x) && ok(y)) pts.push([x, y, num(r[`${e}Z`])]); }
  if (!keep.length || !pts.length) throw noReadings(name);
  // the line's direction: the larger spread of the electrodes, signed from the first to the last along it (a straight line, east-west or north-south in these samples)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const alongX = x1 - x0 >= y1 - y0, origin = alongX ? [x0, pts.find((p) => p[0] === x0)[1]] : [pts.find((p) => p[1] === y0)[0], y0];
  const s = (x, y) => +(alongX ? x - x0 : y - y0).toFixed(3);
  const rowsOut = keep.map((r) => ({ A: s(num(r.C1X), num(r.C1Y)), B: s(num(r.C2X), num(r.C2Y)), M: s(num(r.P1X), num(r.P1Y)), N: s(num(r.P2X), num(r.P2Y)), Res: r[cols.rho], Mx: cols.ip ? r[cols.ip] : "", SD: cols.err ? r[cols.err] : "" }));
  const p = parseDcipRows(rowsOut, { a: "A", b: "B", m: "M", n: "N", rho: "Res", ...(cols.ip ? { ip: "Mx" } : {}), ...(cols.err ? { err: "SD" } : {}) });
  if (!p.readings.length) throw noReadings(name);
  const seen = new Map();
  for (const [x, y, z] of pts) { const k = s(x, y); if (!seen.has(k)) seen.set(k, { s: k, x, y, z: ok(z) ? z : null }); }
  const stations = [...seen.values()].sort((a, b) => a.s - b.s);
  const fit = fitStationLine(stations);
  const line = { x0: "", y0: "", x1: "", y1: "", ground: "", scale: "", stations: null, positions: "horizontal" };
  if (fit) Object.assign(line, { x0: r1(fit.start[0]), y0: r1(fit.start[1]), x1: r1(fit.end[0]), y1: r1(fit.end[1]), stations: { file: name, line: name, list: stations }, fitRmsM: +fit.rmsResidual.toFixed(1) });
  const half = p.spacing ? String(+(p.spacing / 2).toFixed(2)) : "";
  return { name, readings: p.readings, rho: p.rho, ip: p.ip, line, opts: { cell: half, depth: String(suggestModelDepth(p.readings, p.span, Number(half))) }, savedAt: new Date().toISOString(), sample: which, _origin: origin };
}

// the electrode columns of a delimited IP table: Papa for a .csv, the whitespace reader for a TQIPdb .esf (one entry per Line value)
export function ipTableLines(which, spec, text, projectEpsg) {
  let headers, rows;
  if (spec.format === "esf") { const w = parseDcipWhitespaceText(text); if (!w) throw noReadings(spec.file); headers = w.headers; rows = w.rows; }
  else { const t = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false }); headers = t.meta.fields; rows = t.data; }
  const m = guessDcipColumns(headers);
  const cols = { rho: m.rho, ip: m.ip, err: m.err, qc: headers.includes("QC") ? "QC" : null };
  if (!m.rho) throw noReadings(spec.file);
  const by = new Map(), lineCol = headers.includes("Line") ? "Line" : null;
  for (const r of rows) { const k = lineCol ? String(r[lineCol]).trim() : spec.line || spec.file; (by.get(k) || by.set(k, []).get(k)).push(r); }
  return [...by].map(([k, rs]) => electrodeLine(which, (lineCol ? `${k}N` : k).replace(/NN$/, "N"), rs, cols, projectEpsg));
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
      for (const r of rows) { const x = Number(r[cols.x]), y = Number(r[cols.y]), v = Number(r[vc]); if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(v) && v > -9999) pts.push({ x, y, z: null, value: v, line: r._line != null ? String(r._line) : undefined, _src: name }); }
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
  const projectEpsg = ctx.projectEpsg;
  if (S.ipLines) {
    try {
      let n = 0, placed = 0;
      for (const spec of S.ipLines) {
        const entry = gsqIpLine(which, spec, await (await readFile(spec.dat)).text(), await (await readFile(spec.stn)).text(), projectEpsg);
        store.saveDcipLine(entry); n++; if (entry.line.stations) placed++;
        await tick();
      }
      counts.ipLines = n; counts.ipPlaced = placed;
    } catch (e) { fail("IP lines", e); }
  }
  if (S.ipTables) {
    try {
      let n = 0;
      for (const spec of S.ipTables) {
        for (const entry of ipTableLines(which, spec, await (await readFile(spec.file)).text(), projectEpsg)) { delete entry._origin; store.saveDcipLine(entry); n++; }
        await tick();
      }
      counts.ipLines = (counts.ipLines || 0) + n;
    } catch (e) { fail("IP lines", e); }
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
  if (counts.pointSurveys) parts.push(tr("{n} surveys", { n: counts.pointSurveys }));
  if (counts.dhem) parts.push(tr("{n} EM layers", { n: counts.dhem }));
  if (counts.groundEm) parts.push(tr("{n} stations", { n: counts.groundEm }));
  if (counts.plates) parts.push(tr("{n} plates", { n: counts.plates }));
  if (counts.mapLayers || counts.stationLayers) parts.push(tr("{n} map layers", { n: (counts.mapLayers || 0) + (counts.stationLayers || 0) }));
  if (counts.structures) parts.push(tr("{n} structures", { n: counts.structures }));
  if (parts.length) notes.push(notice("{name}: {list}.", { name: ctx.label || which, list: parts.join(", ") }));
  return { notes, counts };
}
