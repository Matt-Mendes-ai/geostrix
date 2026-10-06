import React, { useState, useRef, useMemo, Suspense } from "react";
import { useModuleAction } from "../lib/menuRequests.js"; // TASKS.csv #565
import { parseTableOrWorkbook, isXlsxName } from "../lib/xlsx.js"; // TASKS.csv #444 shared reader; #605 .xlsx
import { num, guessColumn, TARGET_SCHEMAS } from "../lib/layers.js"; // TASKS.csv #508; guessColumn #600 — blank / "NA" -> NaN, never 0
import { didYouMean } from "../lib/holeIds.js"; // TASKS.csv #541
import { reprojectXY, crsName } from "../lib/reproject.js"; // TASKS.csv #600 — surface samples into the project CRS
import { askAdoptCrs } from "../lib/adoptCrs.js"; // TASKS.csv #607
import { Ribbon, RibbonGroup, RibbonButton } from "../components/Ribbon.jsx"; // TASKS.csv #458
import { MapPin as GMapPin, Triangle as GTriangle, Shapes as GShapes, BarChart3 as GBarChart, Award as GAward, Rows3 as GRows, Sheet as GSheet, Image as GImage } from "../components/icons.js";
import Papa from "papaparse";
import { Upload, Download, FlaskConical, Beaker, Scale, Grid3x3, ShieldCheck, TerminalSquare, Sigma, FileCheck } from "../components/icons.js";
import { addCalculatedElement, CALC_PRESETS } from "../lib/calcElement.js"; // TASKS.csv #401
import { useStore } from "../lib/store.jsx";
import { saveFile, loadSampleFiles } from "../lib/desktop.js"; // loadSampleFiles: TASKS.csv #391
import {
  DIAGRAMS, SPIDER_DIAGRAMS, GEOCHEM_METHODS,
  isElementColumn, inferUnit, pickElementColumns, parseAssayValue, valueIn, readAssayCell, convertUnit, mergeAssayRows, holesWithChangedIntervals, dropHoleAssays, blankDetectionLimit, isBlankAssayCell, protolithForSample, PROVISIONAL_ALTERATION_BOXES, GEOCHEM_LABELS, reeProfile,
  oxideOfHeader, fromOxideHeader, // TASKS.csv #403
} from "../lib/geochem.js";
import GeochemPlot from "../components/GeochemPlot.jsx";
import AssayImportModal from "../components/AssayImportModal.jsx";
import LabCertificateModal from "../components/LabCertificateModal.jsx"; // TASKS.csv #601
import { isLabCertificateText, parseLabCertificate, combineCertificates, joinCertificatesToAssays, suggestQcTypes, qcPlacement, indexAssaysForPlacement } from "../lib/labCertificate.js"; // TASKS.csv #601
import AlterationBoxModal from "../components/AlterationBoxModal.jsx"; // TASKS.csv #503
import SurfaceImportModal, { SURFACE_MEDIA } from "../components/SurfaceImportModal.jsx";
import IsoconTool from "../components/IsoconTool.jsx";
import CorrelationMatrix from "../components/CorrelationMatrix.jsx";
import BestIntercepts from "../components/BestIntercepts.jsx";
import CompositingModal from "../components/CompositingModal.jsx";
import GradeStatistics from "../components/GradeStatistics.jsx";
import QAQCPanel from "../components/QAQCPanel.jsx";
// TASKS.csv #224 — see ViewerModule.jsx's own comment on this same lazy import (sql.js's 658KB wasm
// was pulled in on every app launch via this static import chain, regardless of whether SQL workspace
// was ever opened).
const SQLWorkspaceModal = React.lazy(() => import("../components/SQLWorkspaceModal.jsx"));
import SidebarResizeHandle from "../components/SidebarResizeHandle.jsx";
import { useSidebarWidth } from "../lib/useSidebarWidth.js";
import EmptyState, { emptyStateSecondaryBtn } from "../components/EmptyState.jsx"; // TASKS.csv #309

const ALL_DIAGRAMS = { ...DIAGRAMS, ...SPIDER_DIAGRAMS };
import { arrMin, arrMax } from "../lib/arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)

export default function GeochemModule() {
  const store = useStore();
  const { assays, setAssays, assayElements, setAssayElements, surfaceSamples, setSurfaceSamples, surfaceElements, setSurfaceElements, replaceLayer, layers, collars, survey, boundaries, alterationBoxes, setAlterationBoxes, project, projectIsEmpty, setEpsg } = store;
  const [altBoxOpen, setAltBoxOpen] = useState(false); // TASKS.csv #503
  const assayHoleIds = useMemo(() => new Set(assays.map((a) => a.hole_id)), [assays]);

  const [diagramId, setDiagramId] = useState("boxplot");
  const [colorMode, setColorMode] = useState("hole"); // hole | element | uniform
  const [colorElement, setColorElement] = useState(null);
  const [assayModal, setAssayModal] = useState(null);
  const [certReview, setCertReview] = useState(null); // TASKS.csv #601
  const [surfaceModal, setSurfaceModal] = useState(null);
  const [isoconOpen, setIsoconOpen] = useState(false);
  // TASKS.csv #401 — calculated element (vectoring index) panel
  const [calc, setCalc] = useState(null); // null | { name, expr, msg }
  const [corrOpen, setCorrOpen] = useState(false);
  const [bestIntOpen, setBestIntOpen] = useState(false);
  const [compositingOpen, setCompositingOpen] = useState(false);
  const [gradeStatsOpen, setGradeStatsOpen] = useState(false);
  const [qaqcOpen, setQaqcOpen] = useState(false);
  const [sqlOpen, setSqlOpen] = useState(false);
  const [notices, setNotices] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useSidebarWidth();
  const fileRef = useRef(null);
  const pxrfRef = useRef(null);
  const surfaceFileRef = useRef(null);
  const certRef = useRef(null); // TASKS.csv #601
  // TASKS.csv #565 — File > Import CSV / Import Assays / Import pXRF
  useModuleAction(["import-assays", "import-pxrf"], (a) => (a === "import-pxrf" ? pxrfRef : fileRef).current?.click());
  const svgRef = useRef(null);

  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const holeColors = useMemo(() => {
    const holes = Array.from(new Set(assays.map((a) => a.hole_id)));
    const map = {};
    holes.forEach((h, i) => { map[h] = `hsl(${(i * 67) % 360}, 55%, 58%)`; });
    return map;
  }, [assays]);

  const colorBy = (sample) => {
    if (colorMode === "uniform") return "#4a9be0";
    if (colorMode === "hole") return holeColors[sample.hole_id] || "#55606e";
    if (colorMode === "element" && colorElement) {
      const v = valueIn(sample, colorElement, "ppm", elementUnits);
      if (v == null) return "#eef1f4";
      const vals = assays.map((a) => valueIn(a, colorElement, "ppm", elementUnits)).filter((x) => x != null);
      const min = arrMin(vals), max = arrMax(vals);
      const t = max > min ? (v - min) / (max - min) : 0.5;
      const lo = [70, 110, 190], hi = [220, 70, 60];
      return `rgb(${lo.map((x, i) => Math.round(x + (hi[i] - x) * t)).join(",")})`;
    }
    return "#4a9be0";
  };

  const diagram = ALL_DIAGRAMS[diagramId];
  const availableSymbols = new Set(assayElements.map((e) => e.symbol));
  const missingForDiagram = diagram.requires.filter((s) => !availableSymbols.has(s));

  // TASKS.csv #391 — the Harry property sample's assays (the same shipped file the 3D View's "Load sample
  // project" notice points to), through the normal assay import so every check and notice is the usual one.
  const [sampleLoading, setSampleLoading] = useState(false);
  const loadSampleAssays = async () => {
    setSampleLoading(true);
    try {
      const [file] = await loadSampleFiles("harry_property", ["assay_wide.csv"]);
      handleFile(file, false);
    } catch (err) {
      setNotices((p) => [...p, `Couldn't load the sample assays: ${err.message}`]);
    } finally {
      setSampleLoading(false);
    }
  };
  // TASKS.csv #605 — an .xlsx gives its sheet with the most element columns (an MX "Assay Samples" sheet)
  const elementScore = (headers) => headers.filter((h) => isElementColumn(h)).length;
  const handleFile = (file, isPxrf) => {
    parseTableOrWorkbook(file, elementScore).then((t) => { // TASKS.csv #444 — shared reader: comma decimals + encoding fallback
        const res = { data: t.rows, meta: { fields: t.headers }, note: t.note };
        // TASKS.csv #284 — comma-decimal (European-locale) assay values parse as strings, which
        // Number()s to NaN and silently drops the sample. Same shared fix as the collar/interval
        // import path (src/lib/numberLocale.js) — and the note is surfaced, not swallowed.
        const data = res.data, note = res.note ? ` ${res.note.trim()}` : "";
        if (!data.length) { setNotices((p) => [...p, `${file.name}: empty file.`]); return; }
        if (note) setNotices((p) => [...p, `${file.name}:${note}`]);
        const headers = Object.keys(data[0]);
        openAssayModal(file, headers, data, isPxrf);
    });
  };

  const openAssayModal = (file, headers, data, isPxrf) => {
    // TASKS.csv #600 (40958Z) — the shared column matcher: "To (m)" / "Hole ID" style headers, and no bare
    // substring match on a short alias ("to" inside any header that contains those two letters)
    const guess = (aliases) => guessColumn(headers, aliases);
    // the interval schemas' own alias lists (sampfrom / sampto / geolto... — "SAMPTO" only matched the bare "to")
    const aliasesOf = (key) => TARGET_SCHEMAS.litho.fields.find((f) => f.key === key).aliases;
    const holeCol = guess(aliasesOf("hole_id"));
    const fromCol = guess(aliasesOf("from"));
    const toCol = guess(aliasesOf("to"));
    const isLong = headers.some((h) => /^(analyte|element)$/i.test(h.trim())) && headers.some((h) => /^(abundance|value|result)$/i.test(h.trim()));
    if (isLong) {
      const analyteCol = guess(["analyte", "element"]);
      const valueCol = guess(["abundance", "value", "result"]);
      const methodCol = guess(["method"]);
      const methods = methodCol ? Array.from(new Set(data.map((r) => r[methodCol]).filter(Boolean))) : [];
      const analytes = Array.from(new Set(data.map((r) => r[analyteCol]).filter(Boolean)));
      const elements = analytes.filter(isElementColumn).map((sym) => ({ symbol: sym, header: sym, unit: inferUnit(sym, sym), checked: true }));
      setAssayModal({ file, fileName: file.name, format: "long", isPxrf, headers, sampleRows: data.slice(0, 5), allRows: data, mapping: { hole_id: holeCol, from: fromCol, to: toCol, analyte: analyteCol, value: valueCol, method: methodCol }, methods, selectedMethod: methods[0] || null, elements });
    } else {
      // TASKS.csv #210 — a single lab export can carry more than one column for the same element
      // (e.g. this session's real pXRF sample data has "Ag_XRF_Corrected_ppm_D", "Ag_pXRF_ppm", AND
      // "Ag_Error_pXRF_ppm" all matching isElementColumn's front-token match) — one row per matching
      // header would show duplicate "Ag" checkboxes and, if more than one got checked, silently let
      // whichever happened to be LAST in header order win in commitAssayImport's values[e.symbol]
      // assignment. Dedupe to one row per symbol, preferring the first non-"error" match (an
      // uncertainty/error-margin column is never the intended assay value) — the header dropdown in
      // AssayImportModal lets the user repoint any row at a different column, including one of the
      // other candidates this dedupe didn't pick, or a column the auto-detector missed entirely.
      // TASKS.csv #600 / #542 — the most complete column per element, an over-limit (ore-grade) column when one
      // exists, descriptive / error columns skipped, implausible default-% units corrected (pickElementColumns).
      const elements = pickElementColumns(headers, data).map((e) => ({ ...e, mainHeader: e.header, checked: true }));
      setAssayModal({ file, fileName: file.name, format: "wide", isPxrf, headers, sampleRows: data.slice(0, 5), allRows: data, mapping: { hole_id: holeCol, from: fromCol, to: toCol }, methods: [], selectedMethod: null, elements });
    }
  };

  // TASKS.csv #601 — lab certificates: parse, join to the loaded assays by sample id, compare values, and suggest a QC
  // type for each certificate sample the drillhole data doesn't have. Nothing is written until the review is accepted.
  const handleCertificates = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const parsed = [], skipped = [];
    for (const f of files) {
      const text = await f.text();
      if (!isLabCertificateText(text)) { skipped.push(f.name); continue; }
      parsed.push(parseLabCertificate(text, f.name));
    }
    if (skipped.length) setNotices((p) => [...p, `Not a lab certificate (no "<id> - Finalized" title with SAMPLE / DESCRIPTION rows), skipped: ${skipped.join(", ")}.`]);
    if (!parsed.length) return;
    const all = combineCertificates(parsed);
    const join = joinCertificatesToAssays(all.rows, assays);
    if (!join.matched.length) {
      setNotices((p) => [...p, `None of the ${all.rows.length.toLocaleString()} certificate samples matches a loaded assay's sample id${join.assaysWithoutId ? ` (${join.assaysWithoutId.toLocaleString()} assay rows carry no sample id — import the drill samples with their sample-number column)` : ""}. Certificates are joined to the drill samples by sample id.`]);
      return;
    }
    const columns = parsed.flatMap((p) => p.columns).filter((c, i, a) => a.findIndex((x) => x.header === c.header) === i);
    const elementCols = pickElementColumns(all.headers.filter((h) => h !== "sample_id" && h !== "certificate"), all.rows);
    // value check + what the certificates could add
    let mismatchCount = 0, fillable = 0; const mismatchExamples = [], fillElements = new Set();
    for (const { cert, assay } of join.matched) {
      for (const e of elementCols) {
        const raw = String(cert[e.header] ?? "").trim();
        if (!raw || /^[<>]/.test(raw)) continue;
        const v = parseAssayValue(raw);
        if (v == null || !Number.isFinite(v)) continue;
        const db = assay.values?.[e.symbol];
        if (db == null) { fillable++; fillElements.add(e.symbol); continue; }
        const c = convertUnit(v, e.unit, elementUnits[e.symbol] || e.unit);
        if (Math.abs(c - db) > 0.02 * Math.max(Math.abs(c), Math.abs(db)) && Math.abs(c - db) > 1e-9) {
          mismatchCount++;
          if (mismatchExamples.length < 4) mismatchExamples.push(`${assay.sample_id} ${e.symbol}: database ${db}, certificate ${c} ${elementUnits[e.symbol] || e.unit}`);
        }
      }
    }
    const suggestions = suggestQcTypes(join.unmatched, join.matched.map((m) => m.cert), columns)
      .map((s, i) => ({ ...s, certificate: join.unmatched[i].certificate }));
    setCertReview({
      all, elementCols, suggestions, fill: fillable > 0,
      summary: { certificates: parsed.length, rows: all.rows.length, matched: join.matched.length, unmatched: join.unmatched.length, mismatchCount, mismatchExamples, fillable, fillElements: [...fillElements].slice(0, 12), labs: [...new Set(parsed.map((p) => p.meta.project).filter(Boolean))].join(", ") },
      matched: join.matched,
    });
  };

  const commitCertificates = (review) => {
    const { all, elementCols, suggestions, fill, matched } = review;
    const certById = new Map(all.rows.map((r) => [String(r.sample_id).trim().toUpperCase(), r]));
    const { byId, byPrefix } = indexAssaysForPlacement(assays);
    const certHeaders = elementCols.flatMap((e) => [e.header, ...(e.overLimit ? [e.overLimit.header] : [])]);
    const rows = []; let unplaced = 0;
    const counts = { standard: 0, blank: 0, duplicate: 0 };
    for (const s of suggestions) {
      if (!counts.hasOwnProperty(s.type)) continue; // "unclassified" = not imported
      const cert = certById.get(String(s.sample_id).trim().toUpperCase());
      const place = qcPlacement(s.sample_id, s.type === "duplicate" ? s.parent_id : null, byId, byPrefix);
      if (!cert || !place) { unplaced++; continue; }
      const row = { ...place, sample_type: s.type, sample_id: s.sample_id, parent_id: s.type === "duplicate" ? (s.parent_id || "") : "", qc_code: s.type === "standard" ? (s.qc_code || "") : "" };
      certHeaders.forEach((h) => { row[h] = cert[h]; });
      rows.push(row); counts[s.type]++;
    }
    let filled = 0;
    if (fill) {
      for (const { cert, assay } of matched) {
        const row = { hole_id: assay.hole_id, from: assay.from, to: assay.to, sample_id: assay.sample_id, sample_type: assay.sample_type || "", parent_id: assay.parent_id || "", qc_code: assay.qc_code || "" };
        let any = false;
        for (const e of elementCols) {
          const has = assay.values?.[e.symbol] != null;
          row[e.header] = has ? "" : cert[e.header];
          if (e.overLimit) row[e.overLimit.header] = has ? "" : cert[e.overLimit.header];
          if (!has && String(cert[e.header] ?? "").trim()) { any = true; filled++; }
        }
        if (any) rows.push(row);
      }
    }
    if (!rows.length) { setCertReview(null); return; }
    commitAssayImport({
      format: "wide", isPxrf: false, negativeMode: "bdl", blankMode: "missing",
      headers: ["hole_id", "from", "to", "sample_type", "sample_id", "parent_id", "qc_code", ...certHeaders],
      allRows: rows, mapping: { hole_id: "hole_id", from: "from", to: "to" },
      elements: elementCols.map((e) => ({ ...e, mainHeader: e.header, checked: true })),
    });
    setNotices((p) => [...p, `Lab certificates: imported ${counts.standard} standard(s), ${counts.blank} blank(s) and ${counts.duplicate} duplicate(s) as QC samples${fill && filled ? `, and filled ${filled.toLocaleString()} missing value(s) of the drill samples` : ""}${unplaced ? `; ${unplaced} could not be placed (no drill sample with a nearby number or the given parent)` : ""}. They are in the QAQC panel; intercepts, statistics and models leave them out.`]);
    setCertReview(null);
  };

  const commitAssayImport = (modal) => {
    const { format, allRows, mapping, selectedMethod, elements } = modal;
    const chosen = elements.filter((e) => e.checked);
    if (!mapping.hole_id || !mapping.from || !mapping.to) { setNotices((p) => [...p, "Map hole ID, from, and to columns."]); return; }
    // TASKS.csv #334 — the project keeps ONE unit per element (assayElements) and valueIn reads every
    // stored value in it, so importing a batch in a different unit used to silently rescale all the
    // EARLIER values (Au in ppm, then a ppb batch: every earlier Au read 1000x too low). Incoming values
    // are now converted into the unit the project already uses for that element, and the notice says so.
    const existingUnit = Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit]));
    const chosenBySymbol = new Map(chosen.map((e) => [e.symbol, e]));
    const converted = chosen.filter((e) => existingUnit[e.symbol] && existingUnit[e.symbol] !== e.unit);
    // TASKS.csv #333 — negative lab/database codes resolved at import (see readAssayCell).
    const negativeMode = modal.negativeMode || "bdl";
    let negBdl = 0, negMissing = 0;
    const oxideNotes = new Set(); // #403
    const read = (raw, sym, header) => {
      const c = readAssayCell(raw, negativeMode);
      if (c.kind === "neg_bdl") negBdl++;
      else if (c.kind === "neg_missing") negMissing++;
      const e = chosenBySymbol.get(sym);
      // TASKS.csv #403 — an oxide column (SiO2, Fe2O3T...) is stored as element wt%.
      const ox = oxideOfHeader(header);
      if (ox && c.value != null) oxideNotes.add(`${ox.oxide} → ${ox.symbol} (÷${ox.factor})`);
      const elemPct = fromOxideHeader(c.value, header);
      return { v: e ? convertUnit(elemPct, ox ? "%" : e.unit, existingUnit[sym] || (ox ? "%" : e.unit)) : elemPct, q: c.qualifier };
    };
    // TASKS.csv #400 — keep a QC-type and a sample-id column when the file has them (acQuire / MX exports
    // mark standards / blanks / duplicates there, under the real hole_id). Auto-detected by header name.
    const findCol = (names) => (modal.headers || []).find((h) => names.includes(String(h).trim().toLowerCase().replace(/[\s-]+/g, "_"))) || null;
    const typeCol = findCol(["sample_type", "sampletype", "qc_type", "qctype", "qaqc_type", "qaqc", "sample_class", "sample_category", "type"]);
    const idCol = findCol(["sample_id", "sampleid", "sample_no", "sample_number", "sample"]);
    // #400 — the original a duplicate was split from, and which CRM a standard is
    const parentCol = findCol(["parent_id", "parent", "parent_sample", "parent_sample_id", "original_id", "orig_sample_id", "primary_id", "original_sample"]);
    const codeCol = findCol(["standard_id", "std_id", "crm", "crm_id", "crm_name", "standard_name", "qc_code", "qc_id", "qc_name", "reference_material"]);
    const tagQC = (out, r) => {
      if (typeCol && r[typeCol] != null && r[typeCol] !== "") out.sample_type = String(r[typeCol]).trim();
      if (idCol && r[idCol] != null && r[idCol] !== "") out.sample_id = String(r[idCol]).trim();
      if (parentCol && r[parentCol] != null && r[parentCol] !== "") out.parent_id = String(r[parentCol]).trim();
      if (codeCol && r[codeCol] != null && r[codeCol] !== "") out.qc_code = String(r[codeCol]).trim();
      return out;
    };
    let rows = [];
    // TASKS.csv #508 — Number("") / Number(null) is 0, so a blank from or to used to become a phantom 0 m
    // interval (a real 2-3 m @ 10 g/t read as 5.5 g/t once averaged with it). Such rows are skipped and counted.
    const validInterval = (r) => r.hole_id && Number.isFinite(r.from) && Number.isFinite(r.to);
    let skippedNoDepth = 0;
    const overLimitFilled = new Map(); // #600 / #542 — element -> samples filled from the ore-grade column
    // TASKS.csv #502 — what an EMPTY element cell means in this file (the import dialog asks when there are
    // any): "missing" = not assayed (default; excluded from grades everywhere, reported as unsampled), or
    // "bdl" = below detection, stored as '<DL' at half the limit like any lab '<x'. The limit per element is
    // the lab's most common '<x' in that column, else the lowest value reported (blankDetectionLimit). A row
    // whose element cells are ALL empty had nothing analysed, so it stays not-assayed either way.
    const blankMode = modal.blankMode || "missing";
    const blankLimits = new Map(), blankBdl = new Map(), blankNoLimit = new Set();
    if (blankMode === "bdl") {
      chosen.forEach((e) => blankLimits.set(e.symbol, blankDetectionLimit(format === "wide"
        ? allRows.map((r) => r[e.header])
        : allRows.filter((r) => (!mapping.method || r[mapping.method] === selectedMethod) && isElementColumn(String(r[mapping.analyte] ?? "")) === e.symbol).map((r) => r[mapping.value]))));
    }
    const blankAsBdl = (sym, header) => {
      const L = blankLimits.get(sym);
      if (!L?.limit) { blankNoLimit.add(sym); return null; }
      blankBdl.set(sym, (blankBdl.get(sym) || 0) + 1);
      return read(`<${L.limit}`, sym, header);
    };
    if (format === "wide") {
      rows = allRows.map((r) => {
        const values = {};
        // TASKS.csv #261 — keep the censoring qualifier ('<' below detection / '>' over-range) alongside
        // the substituted number so the substitution stops being invisible downstream (dataQC warns on
        // over-range rows; nothing else has to care).
        const quals = {};
        const anyResult = blankMode === "bdl" && chosen.some((e) => !isBlankAssayCell(r[e.header])); // #502
        chosen.forEach((e) => {
          let { v, q } = read(r[e.header], e.symbol, e.header);
          // #600 / #542 — a sample at the main column's cap takes its ore-grade re-assay (converted to the main
          // column's unit) when the file has one; only while the element still reads the auto-picked column
          const ol = e.overLimit && e.header === e.mainHeader ? e.overLimit : null;
          if (ol && parseAssayValue(r[e.header]) === ol.limit) {
            const og = parseAssayValue(r[ol.header]);
            if (og != null && Number.isFinite(og)) {
              v = convertUnit(og, ol.unit, existingUnit[e.symbol] || e.unit); q = null;
              overLimitFilled.set(e.symbol, (overLimitFilled.get(e.symbol) || 0) + 1);
            }
          }
          if (v == null && anyResult && isBlankAssayCell(r[e.header])) ({ v, q } = blankAsBdl(e.symbol, e.header) || { v, q });
          if (v != null) {
            values[e.symbol] = v;
            if (q) quals[e.symbol] = q;
          }
        });
        const out = { hole_id: String(r[mapping.hole_id] ?? "").trim(), from: num(r[mapping.from]), to: num(r[mapping.to]), values, source: modal.isPxrf ? "pXRF" : "assay" };
        if (Object.keys(quals).length) out.qualifiers = quals;
        return tagQC(out, r);
      });
      const before = rows.length;
      rows = rows.filter(validInterval);
      skippedNoDepth = before - rows.length;
    } else {
      const byInterval = new Map();
      allRows.filter((r) => !mapping.method || r[mapping.method] === selectedMethod).forEach((r) => {
        const sym = isElementColumn(String(r[mapping.analyte] ?? ""));
        if (!sym || !chosen.find((c) => c.symbol === sym)) return;
        const hole = String(r[mapping.hole_id] ?? "").trim(), from = num(r[mapping.from]), to = num(r[mapping.to]);
        const key = `${hole}|${from}|${to}`;
        if (!byInterval.has(key)) byInterval.set(key, tagQC({ hole_id: hole, from, to, values: {}, source: modal.isPxrf ? "pXRF" : "assay" }, r));
        let { v, q } = read(r[mapping.value], sym, String(r[mapping.analyte] ?? "")); // TASKS.csv #261 qualifiers, #333 negatives, #334 units, #403 oxides
        if (v == null && blankMode === "bdl" && isBlankAssayCell(r[mapping.value])) ({ v, q } = blankAsBdl(sym, String(r[mapping.analyte] ?? "")) || { v, q }); // #502
        if (v != null) {
          const target = byInterval.get(key);
          target.values[sym] = v;
          if (q) { if (!target.qualifiers) target.qualifiers = {}; target.qualifiers[sym] = q; }
        }
      });
      const all = Array.from(byInterval.values());
      rows = all.filter(validInterval);
      skippedNoDepth = all.length - rows.length;
    }
    // TASKS.csv #336 — same hole/from/to merges into the existing row instead of duplicating it.
    // TASKS.csv #530 — a corrected file whose intervals changed for some holes: replace those holes (asked), else
    // the stale intervals stay beside the new ones and every intercept averages both
    const changed = holesWithChangedIntervals(assays, rows);
    let replaceHoles = [];
    if (changed.length) {
      const ok = window.confirm(
        `${changed.length} hole(s) in this file have different sample intervals from the assays already loaded (e.g. ${changed.slice(0, 3).map((h) => `${h.hole_id}: old ${h.example} not in the file`).join("; ")}${changed.length > 3 ? "; …" : ""}).

` +
        `OK — REPLACE those holes' assays with this file's (a corrected or re-split file).
` +
        `Cancel — keep both (the old intervals stay beside the new ones; intercepts and statistics then see both).`);
      if (ok) replaceHoles = changed;
    }
    const base = replaceHoles.length ? dropHoleAssays(assays, replaceHoles) : assays;
    const { merged: mergedCount, repeatedInFile } = mergeAssayRows(base, rows); // for the notice only
    setAssays((prev) => mergeAssayRows(replaceHoles.length ? dropHoleAssays(prev, replaceHoles) : prev, rows).rows);
    // Existing elements keep their unit (#334); only new symbols add an entry.
    setAssayElements((prev) => { const merged = new Map(prev.map((e) => [e.symbol, e])); chosen.forEach((e) => { if (!merged.has(e.symbol)) merged.set(e.symbol, oxideOfHeader(e.header) ? { ...e, unit: "%" } : e); }); return Array.from(merged.values()); }); // #403: oxide-sourced elements are stored in %
    if (!colorElement && chosen.length) setColorElement((chosen.find((e) => e.symbol === "Au") || chosen[0]).symbol);
    const extra = [
      converted.length ? `Converted ${converted.map((e) => `${e.symbol} ${e.unit} → ${existingUnit[e.symbol]}`).join(", ")} to match the unit already used in this project.` : null,
      negBdl ? `${negBdl} negative value(s) read as below detection (e.g. -0.005 → "<0.005", stored at half).` : null,
      negMissing ? `${negMissing} negative value(s) treated as not assayed.` : null,
      mergedCount ? `${mergedCount} interval(s) were already loaded and were updated in place, not duplicated.` : null,
      (() => { // #541 — ids that miss a collar only by case / spaces / hyphens
        const ids = new Set(collars.map((c) => c.hole_id)); if (!ids.size) return null;
        const near = new Map(); rows.forEach((r) => { if (ids.has(r.hole_id) || near.has(r.hole_id)) return; const m = /Did you mean "([^"]+)"/.exec(didYouMean(ids, r.hole_id)); if (m) near.set(r.hole_id, m[1]); });
        return near.size ? `${near.size} hole id(s) match a collar only if case / spaces / hyphens are ignored (${[...near].slice(0, 4).map(([x, y]) => `"${x}" → "${y}"`).join(", ")}) — kept as typed; fix them in the file to attach these assays.` : null;
      })(),
      replaceHoles.length ? `Replaced the assays of ${replaceHoles.length} hole(s) whose sample intervals changed (${replaceHoles.slice(0, 6).map((h) => h.hole_id).join(", ")}${replaceHoles.length > 6 ? ", …" : ""}).` : null, // #530
      changed.length && !replaceHoles.length ? `${changed.length} hole(s) kept their old intervals beside this file's different ones (${changed.slice(0, 6).map((h) => h.hole_id).join(", ")}${changed.length > 6 ? ", …" : ""}) — Data QC lists the overlaps.` : null, // #530
      skippedNoDepth ? `${skippedNoDepth} row(s) skipped: no hole id, or a blank / non-numeric from or to depth.` : null, // #508
      overLimitFilled.size ? `Over-limit samples filled from the ore-grade column: ${[...overLimitFilled].map(([sym, n]) => { const e = chosen.find((x) => x.symbol === sym); return `${sym} ${n} (at ${e.overLimit.limit} ${e.unit} in "${e.header}", from "${e.overLimit.header}")`; }).join("; ")}.` : null, // #600 / #542
      blankBdl.size ? `Empty cells read as below detection: ${[...blankBdl].map(([sym, n]) => { const L = blankLimits.get(sym); return `${sym} ${n} at <${L.limit} (${L.basis === "lt" ? "the lab's most common '<' limit in the file" : "the lowest value reported — no '<' limit in the file"})`; }).join("; ")}; stored at half the limit and flagged '<'.` : null, // #502
      blankNoLimit.size ? `No detection limit could be found for ${[...blankNoLimit].join(", ")} (no '<' values and no reported values), so their empty cells stay not assayed.` : null,
      // #510 — same-interval rows in ONE file are kept, not merged: usually field / lab duplicates
      repeatedInFile ? `${repeatedInFile} interval(s) appear more than once in this file (often field or lab duplicates) — all kept as separate rows; Data QC and Best Intercepts flag them as overlaps.` : null,
      oxideNotes.size ? `Whole-rock oxide columns stored as element wt% (${[...oxideNotes].join(", ")}); diagrams convert back to oxides.` : null,
    ].filter(Boolean).join(" ");
    setNotices((p) => [...p, `Loaded ${rows.length} ${modal.isPxrf ? "pXRF" : "assay"} intervals (${chosen.length} elements).${extra ? " " + extra : ""}`]);
    setAssayModal(null);
  };

  // TASKS.csv #228 — surface geochemistry (soil/rock-chip/stream-sediment/talus-fines) import. Reuses
  // the exact same isElementColumn/inferUnit dedupe-by-symbol logic the wide-format assay path above
  // already uses (see that branch's own TASKS.csv #210 comment for why the dedupe matters) — surface
  // sample lab exports have the same "more than one candidate column per element" problem.
  const handleSurfaceFile = (file) => {
    parseTableOrWorkbook(file, elementScore).then((t) => { // TASKS.csv #444 — shared reader: comma decimals + encoding fallback
        const res = { data: t.rows, meta: { fields: t.headers }, note: t.note };
        const data = res.data, note = res.note ? ` ${res.note.trim()}` : ""; // TASKS.csv #284
        if (!data.length) { setNotices((p) => [...p, `${file.name}: empty file.`]); return; }
        if (note) setNotices((p) => [...p, `${file.name}:${note}`]);
        const headers = Object.keys(data[0]);
        // TASKS.csv #600 (40958Z) — the shared matcher + MX-style names: e_utm / n_utm, elev_m, samp_num, samp_type
        const guess = (aliases) => guessColumn(headers, aliases);
        const mapping = {
          x: guess(["x", "easting", "east", "e_utm", "utm_e", "utme", "utm_east", "x_utm"]),
          y: guess(["y", "northing", "north", "n_utm", "utm_n", "utmn", "utm_north", "y_utm"]),
          z: guess(["z", "elevation", "elev", "elev_m", "rl", "elev_dem_m"]),
          sample_id: guess(["sample_id", "sampleid", "samp_num", "sample_num", "sample_number", "samp_id", "sample", "sample_no"]),
          medium: guess(["medium", "sample_medium", "samp_type", "sample_type", "smpl_medium", "type"]),
        };
        // Bug found live-testing this feature: a bare "y" (northing) header false-positives against
        // isElementColumn as the element symbol Y (yttrium) — same first-token match logic that
        // correctly handles "Ag_XRF_..." also matches a coordinate column that just happens to BE an
        // element symbol. x/y/z/sample_id/medium are excluded from element detection since whichever
        // columns they resolved to are already spoken for by the mapping above, never a real analyte.
        const mappedCols = new Set(Object.values(mapping).filter(Boolean));
        // TASKS.csv #600 — the same column choice as drillhole assays (pickElementColumns): the most complete
        // numeric column per element, over-limit column paired, descriptive columns skipped. The old
        // first-match dedupe took "au_cert_num" (a certificate number) as Au and "v_datum" as vanadium in an
        // MX soil export (ARIS 42648Z).
        const elements = pickElementColumns(headers.filter((h) => !mappedCols.has(h)), data).map((e) => ({ ...e, mainHeader: e.header, checked: true }));
        // TASKS.csv #600 — a CRS tag column (srid_source / epsg...) with one recognised code pre-fills the Source CRS.
        const crsCol = headers.find((h) => /^(srid(_source)?|source_srid|epsg(_srid)?|source_epsg|crs_epsg)$/i.test(h.trim()));
        const codes = crsCol ? [...new Set(data.map((r) => Number(r[crsCol])).filter((v) => Number.isInteger(v) && v > 0))] : [];
        const sourceEpsg = codes.length === 1 && crsName(codes[0]) ? String(codes[0]) : "";
        setSurfaceModal({
          file, fileName: file.name, headers, allRows: data,
          mapping, sourceEpsg, sourceEpsgFrom: sourceEpsg ? crsCol : null,
          defaultMedium: "soil", elements,
        });
    });
  };

  const commitSurfaceImport = (modal) => {
    const { allRows, mapping, elements, defaultMedium } = modal;
    const chosen = elements.filter((e) => e.checked);
    if (!mapping.x || !mapping.y) { setNotices((p) => [...p, "Map the X and Y columns."]); return; }
    // TASKS.csv #606 — Z is optional: a blank z, or a Z column that is 0 on every row (an MX soil export whose
    // elevation was never filled in), is MISSING, not sea level; the 3D view places those samples on the terrain.
    const zAllZero = !!mapping.z && allRows.length > 0 && allRows.every((r) => { const v = num(r[mapping.z]); return v === 0 || !Number.isFinite(v); });
    const zOf = (r) => { if (!mapping.z || zAllZero) return null; const v = num(r[mapping.z]); return Number.isFinite(v) ? v : null; };
    const mediaSet = new Set(SURFACE_MEDIA);
    // TASKS.csv #600 (40958Z) — the words exports use for a medium: an MX rock file says "rock", which used to
    // fall back to the default ("soil"), so every rock sample was labelled soil
    const mediumAlias = (m) => (/rock|grab|chip|outcrop|float|channel/.test(m) ? "rock chip" : /stream|silt|sediment|\bsed\b|bleg/.test(m) ? "stream sediment" : /talus/.test(m) ? "talus fines" : /soil|b.?horizon/.test(m) ? "soil" : null);
    // TASKS.csv #333/#334 — same rules as drillhole assays: negative codes are never grades (-0.005 read as
    // below detection, <= -99 as not assayed), and an element already in the project keeps its unit.
    const existingUnit = Object.fromEntries(surfaceElements.map((e) => [e.symbol, e.unit]));
    const converted = chosen.filter((e) => existingUnit[e.symbol] && existingUnit[e.symbol] !== e.unit);
    let negBdl = 0, negMissing = 0;
    const overLimitFilled = new Map(); // #600 — as in commitAssayImport
    // TASKS.csv #600 — surface samples in another CRS are reprojected into the project CRS like collars are
    // (they used to be stored as-is, so an MX soil file in UTM 10 sat ~400 km from collars reprojected to UTM 9).
    const fromEpsg = modal.sourceEpsg ? Number(modal.sourceEpsg) : null;
    let toEpsg = project?.epsg ? Number(project.epsg) : null;
    const adopted = askAdoptCrs({ isEmpty: projectIsEmpty, currentEpsg: toEpsg, declaredEpsg: fromEpsg, fileName: modal.fileName }); // #607
    if (adopted) { setEpsg(adopted); toEpsg = adopted; setNotices((p) => [...p, `Project CRS set to ${crsName(adopted)} (EPSG:${adopted}) from ${modal.fileName}.`]); }
    const doReproject = fromEpsg && toEpsg && fromEpsg !== toEpsg;
    let reprojectFailed = 0;
    const rows = allRows.map((r) => {
      const values = {};
      chosen.forEach((e) => {
        const c = readAssayCell(r[e.header]);
        if (c.kind === "neg_bdl") negBdl++; else if (c.kind === "neg_missing") negMissing++;
        const ox = oxideOfHeader(e.header); // TASKS.csv #403
        let v = convertUnit(fromOxideHeader(c.value, e.header), ox ? "%" : e.unit, existingUnit[e.symbol] || (ox ? "%" : e.unit));
        const ol = e.overLimit && e.header === e.mainHeader ? e.overLimit : null;
        if (ol && parseAssayValue(r[e.header]) === ol.limit) {
          const og = parseAssayValue(r[ol.header]);
          if (og != null && Number.isFinite(og)) { v = convertUnit(og, ol.unit, existingUnit[e.symbol] || e.unit); overLimitFilled.set(e.symbol, (overLimitFilled.get(e.symbol) || 0) + 1); }
        }
        if (v != null) values[e.symbol] = v;
      });
      const rawMedium = mapping.medium ? String(r[mapping.medium] ?? "").trim().toLowerCase() : "";
      let x = num(r[mapping.x]), y = num(r[mapping.y]);
      if (doReproject && Number.isFinite(x) && Number.isFinite(y)) {
        const p = reprojectXY(x, y, fromEpsg, toEpsg);
        if (p) ({ x, y } = p); else { reprojectFailed++; x = NaN; }
      }
      return {
        sample_id: mapping.sample_id ? String(r[mapping.sample_id] ?? "").trim() : "",
        x, y, z: zOf(r), // #508 / #606 — a blank (or all-zero) z is missing, not sea level
        medium: mediaSet.has(rawMedium) ? rawMedium : (mediumAlias(rawMedium) || defaultMedium), // #600: "rock" -> rock chip
        values,
      };
    }).filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y));
    const noZ = rows.filter((r) => r.z == null).length;
    setSurfaceSamples((prev) => [...prev, ...rows]);
    setSurfaceElements((prev) => { const merged = new Map(prev.map((e) => [e.symbol, e])); chosen.forEach((e) => { if (!merged.has(e.symbol)) merged.set(e.symbol, oxideOfHeader(e.header) ? { ...e, unit: "%" } : e); }); return Array.from(merged.values()); }); // #403
    const extra = [
      converted.length ? `Converted ${converted.map((e) => `${e.symbol} ${e.unit} → ${existingUnit[e.symbol]}`).join(", ")} to match the unit already used in this project.` : null,
      negBdl ? `${negBdl} negative value(s) read as below detection.` : null,
      negMissing ? `${negMissing} value(s) ≤ -99 treated as not assayed (no-data codes).` : null,
      overLimitFilled.size ? `Over-limit samples filled from the ore-grade column: ${[...overLimitFilled].map(([sym, n]) => `${sym} ${n}`).join(", ")}.` : null,
      noZ ? `${noZ} sample(s) have no elevation${zAllZero ? ` (the "${mapping.z}" column is 0 on every row)` : ""} — the 3D view places them on the terrain.` : null,
      doReproject ? `Reprojected from EPSG:${fromEpsg} to the project's EPSG:${toEpsg}${reprojectFailed ? ` (${reprojectFailed} row(s) could not be converted and were skipped)` : ""}.` : null,
    ].filter(Boolean).join(" ");
    setNotices((p) => [...p, `Loaded ${rows.length} surface samples (${chosen.length} elements). Switch to 3D View to see them.${extra ? " " + extra : ""}`]);
    setSurfaceModal(null);
  };

  // TASKS.csv #78 — drag-and-drop as a consistent import method across all data types. Geochem was
  // the one importer left button-only (ViewerModule's CSV importer and GeophysicsModule's CSV/GeoTIFF/
  // GXF importer both already support it) — same file/name-heuristic pattern as GeophysicsModule's
  // dem/srtm/elev heuristic for choosing terrain vs raster drape: a dropped filename containing
  // "pxrf" or "xrf" goes to the pXRF path, everything else defaults to the assay path (matching the
  // button layout's own ordering — "Import assays" is the primary action, pXRF is the secondary one).
  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []).filter((f) => f.name.toLowerCase().endsWith(".csv") || isXlsxName(f.name)); // #605
    const skipped = e.dataTransfer.files.length - files.length;
    if (!files.length) { setNotices((p) => [...p, "Only .csv or .xlsx files can be dropped in directly."]); return; }
    if (skipped) setNotices((p) => [...p, `${skipped} other file(s) skipped.`]);
    files.forEach((f) => handleFile(f, /pxrf|xrf/i.test(f.name)));
  };

  const runMethod = (methodKey, altSetup = null) => {
    const method = GEOCHEM_METHODS[methodKey];
    const missing = method.requires.filter((s) => !availableSymbols.has(s));
    if (missing.length) { setNotices((p) => [...p, `${method.label}: missing ${missing.join(", ")}.`]); return; }
    // TASKS.csv #503 — the box plot needs its protolith set-up first (dialog), then classifies per sample
    if (methodKey === "alteration_boxplot" && !altSetup) { setAltBoxOpen(true); return; }
    const targetKey = method.target === "litho" ? "litho_gc" : "alt_gc";
    let lithoByHole = null, noProtolith = 0;
    if (altSetup && altSetup.source === "logged") {
      lithoByHole = new Map();
      (layers.litho || []).forEach((r) => { if (!lithoByHole.has(r.hole_id)) lithoByHole.set(r.hole_id, []); lithoByHole.get(r.hole_id).push(r); });
    }
    const counts = {};
    const rows = assays.map((a) => {
      let opts;
      if (altSetup) {
        const protolith = protolithForSample(a, { fixed: altSetup.source === "logged" ? null : altSetup.source, lithoByHole, map: altSetup.map });
        if (!protolith) { noProtolith++; return null; }
        opts = { protolith, boxes: altSetup.boxes };
      }
      const value = method.classify(a.values, elementUnits, a, opts);
      if (!value) return null;
      counts[value] = (counts[value] || 0) + 1;
      return { hole_id: a.hole_id, from: a.from, to: a.to, value };
    }).filter(Boolean);
    replaceLayer(targetKey, rows);
    const detail = altSetup ? ` ${Object.entries(counts).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${GEOCHEM_LABELS[k] || k} ${n}`).join(", ")}.${noProtolith ? ` ${noProtolith} sample(s) not classified: no protolith (unmapped lithology code or no logged interval).` : ""}${JSON.stringify(altSetup.boxes) === JSON.stringify(PROVISIONAL_ALTERATION_BOXES) ? " Box limits are the PROVISIONAL defaults (not yet checked against Large et al. 2001)." : " Box limits: your edited values."} Screening level: protolith assumed.` : "";
    setNotices((p) => [...p, `Generated ${rows.length} intervals → ${method.target === "litho" ? "Lithology (geochem)" : "Alteration (geochem)"} layer.${detail} Switch to 3D View to see it.`]);
  };

  // ---------- exports ----------
  const exportPlotSVG = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    saveFile({ suggestedName: `${diagramId}.svg`, filters: [{ name: "SVG", extensions: ["svg"] }], content: xml });
  };
  const exportPlotPNG = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1240; canvas.height = 1120;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const b64 = canvas.toDataURL("image/png").split(",")[1];
      saveFile({ suggestedName: `${diagramId}.png`, filters: [{ name: "PNG", extensions: ["png"] }], content: b64, encoding: "base64" });
    };
    img.src = url;
  };
  const exportProjectedCSV = () => {
    let rows;
    if (diagram.spider) {
      // spider diagrams don't reduce to a single {x,y} per sample — export the full normalized
      // profile instead, one column per element, so the export still means something.
      rows = assays.map((a) => {
        const profile = reeProfile(a, elementUnits, diagram.order, diagram.norm);
        const cols = Object.fromEntries(profile.map((p) => [p.symbol, p.value ?? ""]));
        return { hole_id: a.hole_id, from: a.from, to: a.to, ...cols };
      });
    } else {
      rows = assays.map((a) => {
        const p = diagram.project(a, elementUnits);
        return { hole_id: a.hole_id, from: a.from, to: a.to, x: p?.x ?? "", y: p?.y ?? "" };
      });
    }
    const csv = Papa.unparse(rows);
    saveFile({ suggestedName: `${diagramId}_projected.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: csv });
  };
  const exportAssaysCSV = () => {
    const symbols = assayElements.map((e) => e.symbol);
    const rows = assays.map((a) => ({ hole_id: a.hole_id, from: a.from, to: a.to, source: a.source, ...Object.fromEntries(symbols.map((s) => [s, a.values[s] ?? ""])) }));
    const csv = Papa.unparse(rows);
    saveFile({ suggestedName: "assays.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: csv });
  };

  return (
    <div
      className="ge-body"
      style={{ width: "100%", border: dragOver ? "2px dashed #4a9be0" : "2px dashed transparent", borderRadius: 8 }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* left panel */}
      <div className="ge-panel" style={{ padding: "16px 14px", width: sidebarWidth }}>
        {/* TASKS.csv #458 — Geochem ribbon: every tool that used to be a button in this sidebar. */}
        <Ribbon label="Geochem tools">
          <RibbonGroup label="Import">
            <RibbonButton icon={Upload} label="Assays" tone="data" title="Import drillhole assays (CSV)" onClick={() => fileRef.current.click()} />
            <RibbonButton icon={Beaker} label="pXRF" tone="data" title="Import pXRF readings (CSV)" onClick={() => pxrfRef.current.click()} />
            <RibbonButton icon={FileCheck} label="Lab certificates" tone="data" disabled={!assays.length} disabledReason="Import the drill samples (hole, from, to, sample id) first" title={assays.length ? "Lab certificates (ALS CSV): join them to the drill samples by sample id, check the values, and review GeoStrix's QC-type suggestions for the samples only the lab has (blanks, standards, duplicates)" : "Import the drill samples (hole, from, to, sample id) first — certificates are joined to them by sample id"} onClick={() => certRef.current.click()} />
            <RibbonButton icon={GMapPin} label="Surface samples" tone="data" title="Soil, rock-chip, stream-sediment or talus-fines samples (CSV) — no drillhole needed" onClick={() => surfaceFileRef.current.click()} />
          </RibbonGroup>
          <RibbonGroup label="Classify">
            <RibbonButton icon={FlaskConical} label="AI / CCPI" tone="analyse" disabled={!assayElements.length} disabledReason="Import assays first" title="Alteration from geochem (Ishikawa AI / CCPI box plot) — screening level" onClick={() => runMethod("alteration_boxplot")} />
            <RibbonButton icon={GTriangle} label="Winchester" tone="analyse" disabled={!assayElements.length} disabledReason="Import assays first" title="Lithology from immobile elements (Winchester & Floyd) — screening level" onClick={() => runMethod("litho_winchester")} />
            <RibbonButton icon={GShapes} label="Jensen" tone="analyse" disabled={!assayElements.length} disabledReason="Import assays first" title="Lithology (Jensen cation plot) — screening level" onClick={() => runMethod("litho_jensen")} />
          </RibbonGroup>
          <RibbonGroup label="Calculate">
            <RibbonButton icon={Sigma} label="Calc. element" tone="analyse" disabled={!assayElements.length} disabledReason="Import assays first" active={!!calc} title="Add a calculated element from a formula (AI, CCPI, ratios...) — usable everywhere a real element is" onClick={() => setCalc((c) => (c ? null : { name: "", expr: "", msg: null }))} />
            <RibbonButton icon={Scale} label="Isocon" tone="analyse" disabled={!assayElements.length} disabledReason="Import assays first" title="Isocon / mass-change calculator" onClick={() => setIsoconOpen(true)} />
          </RibbonGroup>
          <RibbonGroup label="Analyse">
            <RibbonButton icon={Grid3x3} label="Correlation" tone="analyse" disabled={!assayElements.length} disabledReason="Import assays first" title="Correlation matrix" onClick={() => setCorrOpen(true)} />
            <RibbonButton icon={GBarChart} label="Grade stats" tone="analyse" disabled={!(assayElements.length || surfaceElements.length)} disabledReason="Import assays or surface samples first" title="Grade statistics (assays or surface samples)" onClick={() => setGradeStatsOpen(true)} />
            <RibbonButton icon={ShieldCheck} label="QAQC" tone="analyse" disabled={!assayElements.length} disabledReason="Import assays first" title="QAQC: standards, blanks, duplicates" onClick={() => setQaqcOpen(true)} />
            <RibbonButton icon={TerminalSquare} label="SQL" tone="data" disabled={!assayElements.length} disabledReason="Import assays first" title="SQL workspace" onClick={() => setSqlOpen(true)} />
          </RibbonGroup>
          <RibbonGroup label="Report">
            <RibbonButton icon={GAward} label="Best intercepts" tone="output" disabled={!assayElements.length} disabledReason="Import assays first" title="Best-intercept report" onClick={() => setBestIntOpen(true)} />
            <RibbonButton icon={GRows} label="Compositing" tone="output" disabled={!assayElements.length} disabledReason="Import assays first" title="Downhole compositing" onClick={() => setCompositingOpen(true)} />
          </RibbonGroup>
          <RibbonGroup label="Export">
            <RibbonButton icon={GSheet} label="Assays CSV" tone="output" disabled={!assayElements.length} disabledReason="Import assays first" title="Assays → CSV" onClick={exportAssaysCSV} />
            <RibbonButton icon={Download} label="Plot data" tone="output" disabled={!assayElements.length} disabledReason="Import assays first" title="Plot data → CSV" onClick={exportProjectedCSV} />
            <RibbonButton icon={GImage} label="Plot PNG" tone="output" disabled={!assayElements.length} disabledReason="Import assays first" title="Plot → PNG" onClick={exportPlotPNG} />
            <RibbonButton icon={GImage} label="Plot SVG" tone="output" disabled={!assayElements.length} disabledReason="Import assays first" title="Plot → SVG" onClick={exportPlotSVG} />
          </RibbonGroup>
        </Ribbon>
        <input ref={certRef} type="file" accept=".csv" multiple style={{ display: "none" }} onChange={(e) => { handleCertificates(e.target.files); e.target.value = ""; }} />
        <input ref={fileRef} type="file" accept=".csv,.xlsx" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) handleFile(f, false); e.target.value = ""; }} />
        <input ref={pxrfRef} type="file" accept=".csv,.xlsx" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) handleFile(f, true); e.target.value = ""; }} />
        <input ref={surfaceFileRef} type="file" accept=".csv,.xlsx" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) handleSurfaceFile(f); e.target.value = ""; }} />

        <div className="ge-section-label">Assays &amp; pXRF</div>
        <div style={{ fontSize: 11, color: "#65717e", margin: "10px 0 4px" }}>
          {assays.length ? `${assays.length} intervals · ${assayElements.length} elements` : "No assays loaded"}
        </div>
        <div className="ge-section-label" style={{ marginTop: 14 }}>Surface samples</div>
        <div style={{ fontSize: 11, color: "#65717e", margin: "10px 0 4px" }}>
          {surfaceSamples.length ? `${surfaceSamples.length} samples · ${surfaceElements.length} elements` : "No surface samples loaded"}
        </div>
        <div style={{ fontSize: 10, color: "#65717e", marginTop: 2, lineHeight: 1.4 }}>Or drag a CSV or Excel workbook (.xlsx — the sheet with the most element columns is read) anywhere on this page — filenames with "pxrf"/"xrf" go to the pXRF path, everything else imports as assays.</div>
        {assayElements.length > 0 && <div style={{ fontSize: 10, color: "#65717e", marginTop: 8, lineHeight: 1.5 }}>Screening-level classifications — a first pass, not a substitute for a proper plot and petrologic review.</div>}

        {/* TASKS.csv #401 — calculated element form, opened from the ribbon */}
        {calc && assayElements.length > 0 && (
          <>
            <div className="ge-section-label" style={{ marginTop: 18 }}>Calculated element</div>
              <div style={{ padding: 8, border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-sm)", display: "flex", flexDirection: "column", gap: 6 }}>
                <select value="" onChange={(e) => { const p = CALC_PRESETS.find((x) => x.name === e.target.value); if (p) setCalc({ name: p.name, expr: p.expr, msg: { ok: true, text: `${p.label}. ${p.unitNote}.` } }); }} style={{ fontSize: "var(--font-size-sm)" }} aria-label="Preset">
                  <option value="">Preset… (or write your own below)</option>
                  {CALC_PRESETS.map((p) => <option key={p.name} value={p.name} disabled={!p.needs.every((s) => assayElements.some((e) => e.symbol === s))}>{p.label}{p.needs.every((s) => assayElements.some((e) => e.symbol === s)) ? "" : ` — needs ${p.needs.join(", ")}`}</option>)}
                </select>
                <input value={calc.name} onChange={(e) => setCalc((c) => ({ ...c, name: e.target.value }))} placeholder="Name, e.g. AI" aria-label="Calculated element name" style={{ fontSize: "var(--font-size-sm)" }} />
                <textarea value={calc.expr} onChange={(e) => setCalc((c) => ({ ...c, expr: e.target.value }))} rows={3} placeholder="Formula over element symbols, e.g. 100*Zn/(Zn+Pb)" aria-label="Calculated element formula" style={{ fontSize: "var(--font-size-sm)", fontFamily: "monospace" }} />
                <div style={{ color: "var(--color-text-muted)" }}>Elements are read in their stored units ({assayElements.slice(0, 6).map((e) => `${e.symbol} ${e.unit}`).join(", ")}{assayElements.length > 6 ? ", …" : ""}). Rows missing any element in the formula get no value.</div>
                {calc.msg && <div style={{ color: calc.msg.ok ? "var(--color-text-secondary)" : "var(--color-danger-icon-strong)" }}>{calc.msg.text}</div>}
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...genBtn, flex: 1 }} onClick={() => {
                    try {
                      const r = addCalculatedElement(assays, assayElements, calc.name, calc.expr);
                      setAssays(r.assays);
                      setAssayElements((prev) => [...prev, r.element]);
                      setNotices((p) => [...p, `Added calculated element ${r.element.symbol} = ${r.element.calculated.expr} on ${r.computed.toLocaleString()} assay interval(s) (range ${r.min.toFixed(2)}–${r.max.toFixed(2)})${r.skipped ? `; ${r.skipped.toLocaleString()} interval(s) missing an element in the formula have no value` : ""}. It can now be shown downhole, in 3D and on sections like any element. It is not recalculated if assays are re-imported.`]);
                      setCalc(null);
                    } catch (err) { setCalc((c) => ({ ...c, msg: { ok: false, text: err.message } })); }
                  }}>Add</button>
                  <button style={{ ...panelBtn, flex: 1 }} onClick={() => setCalc(null)}>Cancel</button>
                </div>
              </div>
          </>
        )}

        {/* TASKS.csv #298 — this module has no floating toast of its own (unlike the 3D View), so this
            list is the ONLY surface a setNotices() message appears on while the user is in Geochem —
            which made every one of those messages completely silent to a screen reader. It's the live
            region here, rather than merely labelled as it is in ViewerModule (where the toast already
            announces and a second live region would double up). aria-live is on a wrapper that always
            renders, so the region exists before the first message lands — a live region inserted at
            the same moment as its text is routinely missed. */}
        <div aria-live="polite" aria-relevant="additions text" aria-label="Import and analysis messages">
          {notices.length > 0 && (
            <div style={{ marginTop: 16, padding: "8px 10px", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, fontSize: 10.5, color: "#7b8794", lineHeight: 1.5, maxHeight: 160, overflowY: "auto" }}>
              {notices.slice(-6).map((n, i) => <div key={i} style={{ marginBottom: 4 }}>{n}</div>)}
            </div>
          )}
        </div>
      </div>

      <SidebarResizeHandle width={sidebarWidth} onResize={setSidebarWidth} />

      {/* main plot area */}
      <div className="ge-main" style={{ display: "flex", flexDirection: "column", padding: 20, overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <select value={diagramId} onChange={(e) => setDiagramId(e.target.value)} style={selectStyle}>
            {Object.values(ALL_DIAGRAMS).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, color: "#55606e" }}>
            Colour:
            <select value={colorMode} onChange={(e) => setColorMode(e.target.value)} style={{ ...selectStyle, padding: "5px 8px" }}>
              <option value="hole">by hole</option>
              <option value="element">by element</option>
              <option value="uniform">uniform</option>
            </select>
            {colorMode === "element" && (
              <select value={colorElement || ""} onChange={(e) => setColorElement(e.target.value)} style={{ ...selectStyle, padding: "5px 8px" }}>
                {assayElements.map((el) => <option key={el.symbol} value={el.symbol}>{el.symbol}</option>)}
              </select>
            )}
          </div>
        </div>

        <div style={{ fontSize: 11, color: "#65717e", marginBottom: 10 }}>{diagram.caption}</div>

        {missingForDiagram.length > 0 && (
          <div style={{ padding: "10px 12px", background: "#241f14", border: "1px solid #4a3d1e", borderRadius: 8, fontSize: 12, color: "#d8c080", marginBottom: 12 }}>
            This diagram needs {diagram.requires.join(", ")} — missing {missingForDiagram.join(", ")}. Points that can't be projected are dropped.
          </div>
        )}

        {assays.length === 0 ? (
          // TASKS.csv #309 — was a single line of centred grey text, one of four different
          // empty-state treatments across the app's seven tabs. Now the shared EmptyState card (see
          // components/EmptyState.jsx), same as 3D View / Raster / Geophysics. `position: relative`
          // on the wrapper because EmptyState positions itself absolutely into its container.
          <div style={{ flex: 1, position: "relative", minHeight: 260 }}>
            <EmptyState
              icon={<FlaskConical size={18} />}
              headline="No assay data yet"
              actionLabel="Import assays…"
              onAction={() => fileRef.current.click()}
              actionTitle="Pick an assay CSV — a hole ID, from/to depths, and one column per element"
              secondary={
                <>
                  <button onClick={() => pxrfRef.current.click()} style={emptyStateSecondaryBtn} title="Import a pXRF export instead">Import pXRF…</button>
                  {/* TASKS.csv #391 — the empty Geochem tab offered imports only; the sample assays ship with the app */}
                  <button onClick={loadSampleAssays} disabled={sampleLoading} style={emptyStateSecondaryBtn} title="The Harry property sample: assays of 37 real drillholes from BC's public ARIS database (report #37584)">
                    {sampleLoading ? "Loading sample…" : "Load sample assays"}
                  </button>
                </>
              }
              footnote="An assay CSV needs a hole ID, from/to depths and one column per element; a surface-sample CSV needs x/y instead. Both are picked up automatically."
            >
              <div style={{ marginBottom: 12 }}>
                Ternary, bivariate and REE-spider diagrams over your assay or pXRF data, plus alteration indices, correlation matrices, QAQC and downhole compositing. Import a file to start plotting.
              </div>
            </EmptyState>
          </div>
        ) : (
          <div style={{ maxWidth: 680 }}>
            <GeochemPlot diagramId={diagramId} samples={assays} elementUnits={elementUnits} colorBy={colorBy} svgRef={svgRef} altBoxes={alterationBoxes?.boxes || PROVISIONAL_ALTERATION_BOXES} />
            <div style={{ fontSize: 10.5, color: "#65717e", marginTop: 8 }}>
              {diagram.spider
                ? `${assays.filter((a) => reeProfile(a, elementUnits, diagram.order, diagram.norm).some((p) => p.value != null)).length} of ${assays.length} samples have at least one plottable element.`
                : `${assays.filter((a) => diagram.project(a, elementUnits)).length} of ${assays.length} samples plotted.`}
              {" "}Below-detection values substituted at half the detection limit.
            </div>
          </div>
        )}
      </div>

      {altBoxOpen && (
        <AlterationBoxModal
          saved={alterationBoxes}
          lithoCodes={[...new Set((layers.litho || []).filter((r) => assayHoleIds.has(r.hole_id)).map((r) => String(r.value ?? "").trim()).filter(Boolean))].sort()}
          onCancel={() => setAltBoxOpen(false)}
          onRun={(setup) => { setAlterationBoxes(setup); setAltBoxOpen(false); runMethod("alteration_boxplot", setup); }}
        />
      )}
      {assayModal && (
        <AssayImportModal
          modal={assayModal}
          existingUnits={elementUnits}
          onChange={setAssayModal}
          onCancel={() => setAssayModal(null)}
          onCommit={() => commitAssayImport(assayModal)}
        />
      )}

      {certReview && (
        <LabCertificateModal review={certReview} onChange={setCertReview} onCancel={() => setCertReview(null)} onCommit={() => commitCertificates(certReview)} />
      )}

      {surfaceModal && (
        <SurfaceImportModal
          modal={surfaceModal}
          onChange={setSurfaceModal}
          onCancel={() => setSurfaceModal(null)}
          onCommit={() => commitSurfaceImport(surfaceModal)}
          projectEpsg={project?.epsg}
        />
      )}

      {isoconOpen && (
        <IsoconTool
          assays={assays}
          assayElements={assayElements}
          onClose={() => setIsoconOpen(false)}
        />
      )}

      {corrOpen && (
        <CorrelationMatrix
          assays={assays}
          assayElements={assayElements}
          onClose={() => setCorrOpen(false)}
        />
      )}

      {bestIntOpen && (
        <BestIntercepts
          assays={assays}
          assayElements={assayElements}
          collars={collars}
          survey={survey}
          layers={layers}
          onClose={() => setBestIntOpen(false)}
        />
      )}

      {compositingOpen && (
        <CompositingModal
          assays={assays}
          assayElements={assayElements}
          layers={layers}
          onClose={() => setCompositingOpen(false)}
        />
      )}

      {gradeStatsOpen && (
        <GradeStatistics
          assays={assays}
          assayElements={assayElements}
          layers={layers}
          surfaceSamples={surfaceSamples}
          surfaceElements={surfaceElements}
          onClose={() => setGradeStatsOpen(false)}
        />
      )}

      {qaqcOpen && (
        <QAQCPanel
          assays={assays}
          assayElements={assayElements}
          onClose={() => setQaqcOpen(false)}
        />
      )}

      {sqlOpen && (
        <Suspense fallback={null}>
          <SQLWorkspaceModal
            collars={collars}
            survey={survey}
            layers={layers}
            assays={assays}
            assayElements={assayElements}
            boundaries={boundaries}
            onClose={() => setSqlOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

const panelBtn = { display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "8px 10px", marginBottom: 6, background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, color: "#1a2028", fontSize: 12, cursor: "pointer" };
const genBtn = { ...panelBtn, background: "#1e3629", border: "1px solid #3d6b52", color: "#8fd9ab" };
const selectStyle = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "7px 10px", color: "#1a2028", fontSize: 12.5 };
