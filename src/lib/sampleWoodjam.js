// TASKS.csv #637 — the parts of the Woodjam sample project (sample_data/woodjam, ARIS 41597) that are not drillhole
// tables: assays (into Geochem), the 2023 ZTEM inversion (OMF → block model) and the six 2023 IP lines (kept in the
// project's DC/IP lines, placed from the survey's GPS stations, ready to invert). The drillhole CSVs go through the
// normal import queue like the Harry sample's. Each part is independent: one failing doesn't stop the others.
import Papa from "papaparse";
import { inferUnit, mergeAssayRows, convertUnit } from "./geochem.js";
import { percentileSorted } from "./arrayStats.js"; // TASKS.csv #740
import { omfToProjectObjects } from "./omfImport.js";
import { parseDcipWhitespaceText, guessDcipColumns, parseDcipRows, suggestModelDepth } from "./dcip.js"; // suggestModelDepth: #680
import { parseStationFile, matchStationLine, fitStationLine } from "./dcipStations.js";
import { reprojectXY, getProj4DefSync } from "./reproject.js";

export const WOODJAM_EPSG = 26910; // NAD83 / UTM zone 10N — the drillhole database's grid
export const WOODJAM_TABLES = ["collars.csv", "survey.csv", "litho.csv", "alt.csv", "vein.csv", "mnlgy.csv", "geotech.csv", "magsusc.csv", "sg.csv", "structure.csv"];
export const WOODJAM_IP_LINES = ["109N", "112N", "115N", "118N", "6200E", "6400E"];
export const WOODJAM_EXTRA_FILES = ["assays.csv", "ztem_inversion_2023.omf", "ip/2357GPS_All.txt", ...WOODJAM_IP_LINES.map((l) => `ip/${l}.dat`)];

// assays.csv (hole_id, from, to, sample_id, <El>_ppm | <El>_pct …) → Geochem rows + element list
export function woodjamAssays(text, srcFile = "assays.csv") {
  const t = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  const elements = t.meta.fields.map((h) => { const m = /^([A-Z][a-z]?)_(ppm|pct)$/.exec(h); return m ? { symbol: m[1], header: h, unit: inferUnit(h, m[1]), checked: true } : null; }).filter(Boolean);
  const rows = [];
  for (const r of t.data) {
    const from = Number(r.from), to = Number(r.to), hole = String(r.hole_id || "").trim();
    if (!hole || !Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) continue;
    const values = {};
    for (const e of elements) { const s = String(r[e.header] ?? "").trim(); const v = Number(s); if (s !== "" && Number.isFinite(v)) values[e.symbol] = v; }
    rows.push({ hole_id: hole, from, to, values, source: "assay", srcFile, ...(r.sample_id ? { sample_id: String(r.sample_id).trim() } : {}) });
  }
  return { rows, elements };
}

// TASKS.csv #722 — sample assays merged into a project that already holds some elements in another unit (Cu in %)
// are converted to the project's unit first, as the Geochem importer does (#334); without it Woodjam's ppm values
// were stored under %. Returns the converted rows / elements and what was converted.
export function alignAssayUnits(rows, elements, existing = []) {
  const projUnit = new Map((existing || []).map((e) => [e.symbol, e.unit]));
  const conv = elements.filter((e) => projUnit.has(e.symbol) && projUnit.get(e.symbol) !== e.unit).map((e) => ({ symbol: e.symbol, from: e.unit, to: projUnit.get(e.symbol) }));
  if (!conv.length) return { rows, elements, converted: [] };
  const out = rows.map((r) => {
    const values = { ...r.values };
    for (const c of conv) if (values[c.symbol] != null) values[c.symbol] = convertUnit(values[c.symbol], c.from, c.to);
    return { ...r, values };
  });
  return { rows: out, elements: elements.map((e) => (projUnit.has(e.symbol) ? { ...e, unit: projUnit.get(e.symbol) } : e)), converted: conv };
}

// one IP line file + the parsed GPS station file → a saved DC/IP line ({ name, readings, rho, ip, line, opts })
export function woodjamIpLine(name, datText, stationFile, projectEpsg) {
  const w = parseDcipWhitespaceText(datText);
  if (!w) throw new Error(`${name}: not a recognised IP data file`);
  const m = guessDcipColumns(w.headers);
  const p = m.a && m.m && m.rho ? parseDcipRows(w.rows, m) : null;
  if (!p?.readings.length) throw new Error(`${name}: no readings`);
  const line = { x0: "", y0: "", x1: "", y1: "", ground: "", scale: "", stations: null, positions: "horizontal" };
  const key = matchStationLine(Object.keys(stationFile.lines), name);
  if (key != null) {
    let list = stationFile.lines[key].map((q) => ({ s: q.s, x: q.x, y: q.y, z: q.z }));
    const dst = Number(projectEpsg);
    if (stationFile.epsg && dst && stationFile.epsg !== dst && getProj4DefSync(stationFile.epsg) && getProj4DefSync(dst)) {
      list = list.map((q) => { const r = reprojectXY(q.x, q.y, stationFile.epsg, dst); return r ? { ...q, x: r.x, y: r.y } : q; });
    }
    const fit = fitStationLine(list);
    if (fit) {
      const r1 = (v) => String(+v.toFixed(1));
      Object.assign(line, { x0: r1(fit.start[0]), y0: r1(fit.start[1]), x1: r1(fit.end[0]), y1: r1(fit.end[1]), scale: Math.abs(fit.scale - 1) > 0.002 ? String(+fit.scale.toFixed(4)) : "", stations: { file: stationFile.name, line: key, list },
        fitRmsM: +fit.rmsResidual.toFixed(1) }); // #712 — kept with the line: how well the stations fit it
    }
  }
  const half = p.spacing ? String(+(p.spacing / 2).toFixed(2)) : "";
  return { name, readings: p.readings, rho: p.rho, ip: p.ip, line, opts: { cell: half, depth: String(suggestModelDepth(p.readings, p.span, Number(half))) } /* #680 */, savedAt: new Date().toISOString(), sample: "woodjam" };
}

// Loads the three extras into the store. readFile(relPath) → File; store: { setAssays, setAssayElements, addVoxelModel,
// addOmfObject, saveDcipLine }. Returns notices (strings) describing what was loaded or what failed.
export async function loadWoodjamExtras(readFile, store, { projectEpsg = WOODJAM_EPSG, maxCells, existingElements = [] } = {}) {
  const notes = [];
  try {
    const raw = woodjamAssays(await (await readFile("assays.csv")).text());
    const { rows, elements, converted } = alignAssayUnits(raw.rows, raw.elements, existingElements); // #722
    store.setAssays((prev) => mergeAssayRows(prev || [], rows).rows);
    store.setAssayElements((prev) => { const m = new Map((prev || []).map((e) => [e.symbol, e])); elements.forEach((e) => { if (!m.has(e.symbol)) m.set(e.symbol, e); }); return Array.from(m.values()); });
    notes.push(`Woodjam assays: ${rows.length.toLocaleString()} samples, ${elements.length} elements (ALS four-acid ICP-MS; Cu above 10,000 ppm from the ore-grade re-assay) — in the Geochem tab.${converted.length ? ` Converted to the units this project already uses: ${converted.map((c) => `${c.symbol} ${c.from} -> ${c.to}`).join(", ")}.` : ""}`);
  } catch (e) { notes.push(`Woodjam assays could not be loaded: ${e.message}`); }
  try {
    // the OMF holds two inversion iterations (m_03_01, m_05_03); m_05_03 is the final model (Matt, 2026-10-17)
    const res = await omfToProjectObjects(await (await readFile("ztem_inversion_2023.omf")).arrayBuffer(), maxCells, { attribute: "Woodjam_ZTEM_m_05_03" });
    res.omfObjects.forEach((o) => store.addOmfObject?.(o));
    // The model fills the whole property, so at full range the view opens inside a wall of blocks. It starts showing
    // only the most conductive 15% of cells, half transparent, around the drilling; the legend in the Geophysics tab
    // (or the block model's display range) brings the rest back.
    res.voxelModels.forEach((v) => {
      const vals = v.cells.map((c) => c.value).filter(Number.isFinite).sort((a, b) => a - b);
      const p85 = vals.length ? percentileSorted(vals, 0.85) : v.min; // #740
      // TASKS.csv #711 — the OMF names no unit; 1.8e-4 to 0.196 can only be conductivity in S/m (as resistivity in ohm.m it
      // would be 0.0002 ohm.m rock), so the property is set and the README says it is inferred from the values
      store.addVoxelModel({ ...v, name: `ZTEM 2023 inversion — ${v.name}`, threshold: p85, opacity: 0.55, property: "Conductivity (S/m)", propertyChosen: true });
    });
    notes.push(`Woodjam ZTEM: ${res.voxelModels.length} block model(s) from the 2023 3D inversion${res.notes.length ? ` (${res.notes.join(" ")})` : ""} — listed under Geophysics in the 3D View, showing its most conductive 15% (set the display range in the Geophysics tab to see the rest).`);
  } catch (e) { notes.push(`The Woodjam ZTEM model could not be loaded: ${e.message}`); }
  try {
    const gps = await readFile("ip/2357GPS_All.txt");
    const stationFile = { name: "2357GPS_All.txt", ...parseStationFile(await gps.text(), "2357GPS_All.txt") };
    const placed = [], scaled = []; // scaled: #712
    for (const l of WOODJAM_IP_LINES) {
      const entry = woodjamIpLine(l, await (await readFile(`ip/${l}.dat`)).text(), stationFile, projectEpsg);
      store.saveDcipLine(entry);
      placed.push(`${l}${entry.line.stations ? "" : " (not placed)"}`);
      const sc = Number(entry.line.scale);
      if (sc && Math.abs(sc - 1) > 0.01) scaled.push(`${l} by ${Math.abs((1 / sc - 1) * 100).toFixed(1)}% (chaining scale ${sc.toFixed(3)}; the stations scatter ${entry.line.fitRmsM} m rms about the line)`);
    }
    notes.push(`Woodjam IP: ${placed.length} pole-dipole lines (${placed.join(", ")}) kept in the project and placed from the GPS stations — open Geophysics › DC / IP to view or invert them.`);
    // TASKS.csv #712 — said, not applied silently: the file's electrode distances on these lines are longer than the
    // ground between the GPS stations (slope chaining, most likely); the inversion uses the file's distances
    if (scaled.length) notes.push(`Woodjam IP: the file's electrode distances are longer than the ground between the GPS stations on ${scaled.join("; ")} — probably chained along the slope. The inversion uses the file's distances; the 3D section is stretched to fit the stations.`);
  } catch (e) { notes.push(`The Woodjam IP lines could not be loaded: ${e.message}`); }
  return notes;
}
