// TASKS.csv #1052 (review #1016, resource geologist / QP) — the grade-tonnage table and curve of a block model, at cutoffs
// the user lists (or quantiles of the values) and a density the user enters (no default, as #264), with the
// exploration-target cautionary statement beside it and a stamped CSV. The sums are lib/gradeTonnage.js.
import React, { useMemo, useState } from "react";
import { X, Download } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";
import { t as tr } from "../lib/i18n.js";
import { saveFile } from "../lib/desktop.js";
import { toExportCsv } from "../lib/tabular.js";
import { stampLines, withStamp, NOT_A_RESOURCE } from "../lib/provenance.js";
import { valueUnit, valueColumnName } from "../lib/blockModelExport.js";
import { metalColumns } from "../lib/gradeTonnage.js"; // TASKS.csv #1577
import { gradeTonnageTable, gradeTonnageRows, autoCutoffs, cutoffPct /* #1747 */, metalOf, sgSummary, EXPLORATION_TARGET_CAUTION, blocksInsideSolid, gradeTonnageByBench } from "../lib/gradeTonnage.js"; // blocksInsideSolid: #1949; gradeTonnageByBench: #1957
import { useStore } from "../lib/store.jsx"; // TASKS.csv #1216
import { isMeshClosed } from "../lib/meshQuery.js"; // TASKS.csv #2061
import { version as APP_VERSION } from "../../package.json";
import { gradeUnitLabel } from "../lib/geochem.js"; // TASKS.csv #2218
import { nearestCodeLookup, densityByCode, intervalCodePoints, codesByMetres } from "../lib/densityByCode.js"; // TASKS.csv #2550; codesByMetres: #3013
import { numericSourceChoices } from "../lib/numericSources.js"; // TASKS.csv #3109
import { densityMeansByCode } from "../lib/densityFromLog.js"; // TASKS.csv #3109 / #3081
import { blockModelLattice } from "../lib/estimationMeta.js"; // TASKS.csv #3012
import { sameLattice, densityFromModel, DENSITY_RANGE } from "../lib/densityFromModel.js"; // TASKS.csv #3012
import { desurveyHole } from "../lib/desurvey.js"; // TASKS.csv #2550 — the code intervals placed in 3D
import { setMembersOf } from "../lib/estimateSet.js"; // TASKS.csv #3014 part b
import { setJoin, applyLimits, memberMeans, memberMeanColumns, memberMetal, memberMetalColumns /* #3274 */ } from "../lib/setLimits.js"; // TASKS.csv #3014 part b

const fmt = (v, d = 0) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: d }));
const sig = (v) => (v == null || !Number.isFinite(v) ? "—" : Number(v.toPrecision(3)).toLocaleString());
// TASKS.csv #3284 (Galore Creek review) — conceptual tonnages were printed to the tonne and the ounce ('Tonnes 2,894,940,928', 'Cu (t) 9,931,925.8')
// from 14 holes, under a caution that asks for ranges: tonnes and metal to three significant figures, the exact sum on hover and in the CSV
const exactTitle = (v) => (v == null || !Number.isFinite(v) ? undefined : tr("Exact: {v}. Shown to three significant figures: a conceptual figure; the CSV keeps it whole.", { v: fmt(v, 1) }));
const sig4 = (v) => (v == null || !Number.isFinite(v) ? "—" : Number(v.toPrecision(4)).toLocaleString(undefined, { maximumFractionDigits: 10 })); // TASKS.csv #2548 — a typed cut-off (0.2323) as typed, not 0.232
const compact = (v) => (v == null || !Number.isFinite(v) ? "—" : new Intl.NumberFormat(undefined, { notation: "compact", maximumSignificantDigits: 3 }).format(v)); // axis labels

// setModels (#3014 part b): the set's other members when the model is an Estimation result not yet added (else they are found in the project)
export default function GradeTonnageModal({ model, epsg, onClose, setModels = null }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const unit = valueUnit(model), metal = metalOf(unit);
  const element = model.params?.element || null, mcols = metalColumns(metal, element); // #1577
  const unitL = element && unit ? gradeUnitLabel(element, unit) : unit; // TASKS.csv #2218 — the label (g/t for gold in ppm); unit stays for the sums and the CSV — kg and troy oz for a precious metal, t otherwise
  const [cutoffText, setCutoffText] = useState(() => autoCutoffs(model.cells, { element, unit }).join(", "));
  const [density, setDensity] = useState("");
  const { layers, customLayers = [], generatedSurfaces = [], collars = [], survey = [], desurveyMethod, voxelModels = [] } = useStore(); // collars / survey: #2550; voxelModels: #3012; customLayers: #3109
  // TASKS.csv #1949 (Vulcan review) — the table inside a chosen closed solid, by block centre or by the share of each block inside
  // TASKS.csv #2061 (review #2013, Woodjam) — any watertight solid, as the Estimation dialog's 'Restrict to a modelled volume' takes: only Mine
  // Design solids carry closure 'closed', so an artificially closed grade shell (1.97 Mm³, watertight) was 'no closed solid in the project'
  const solids = useMemo(() => generatedSurfaces.filter((s) => s.vertices?.length >= 12 && s.indices?.length >= 12 && (s.closure === "closed" || isMeshClosed(s.vertices, s.indices).closed)), [generatedSurfaces]);
  const closureNote = (s) => (s?.closure === "artificial" ? tr(" The solid was closed artificially at the search radius, so its volume is an assumption.") : "");
  const [solidId, setSolidId] = useState("");
  const [insideMode, setInsideMode] = useState("centre");
  const solid = solids.find((s) => s.id === solidId) || null;
  const inside = useMemo(() => (solid ? blocksInsideSolid(model.cells, solid.vertices, solid.indices, { mode: insideMode }) : null), [model.cells, solid, insideMode]);
  const cellsInside = inside ? inside.cells : model.cells;
  // TASKS.csv #1957 (Vulcan review) — the sums bench by bench at one cutoff
  const [byBench, setByBench] = useState(false);
  const [benchH, setBenchH] = useState("");
  const [benchDatum, setBenchDatum] = useState("");
  const [benchCutoff, setBenchCutoff] = useState("");
  const sgLayer = useMemo(() => sgSummary(layers?.sg), [layers?.sg]); // #1216
  const [fromSg, setFromSg] = useState(false); // the density is the SG layer's until it is typed over
  const [interpOnly, setInterpOnly] = useState(false); // #1409 — count only blocks the estimate classed interpolated
  const hasSupport = useMemo(() => model.cells.some((c) => typeof c.support === "string"), [model.cells]);
  const cutoffs = useMemo(() => [...new Set(cutoffText.split(/[,;\s]+/).map(Number).filter(Number.isFinite))], [cutoffText]);
  const rho = Number(density) > 0 ? Number(density) : null;
  const beyondKnown = !!model.params?.beyondFlagged; // #2417 — blocks above / below every sample informing them
  const logKnown = Number(model.params?.unsampledLogFilledM) > 0; // #2721 — unsampled metres filled from a picked log
  // TASKS.csv #2550 (review #2486) — a density per code of a logged layer (Weathering: fresh rock about 2.7, clay-weathered 1.8-2.0), each block
  // taking the nearest logged interval within reach; the Density above is the default (no code within reach, or no density typed)
  const codeLayers = useMemo(() => ["weath", "litho", "alt"].filter((k) => (layers?.[k] || []).some((r) => r.value != null && String(r.value).trim() !== "")), [layers]);
  const [densityLayer, setDensityLayer] = useState("");
  const [codeDensity, setCodeDensity] = useState({});
  // TASKS.csv #3013 (WA iron review) — the first 30 codes by NAME had boxes: SC, SNAM, SONAM and TNAM (the second ore strand) took the default
  // without a word. All the layer's codes now, those the blocks take first (most blocks first), then the rest by logged metres (#2993's order);
  // 30 shown until 'Show all'
  const [allCodes, setAllCodes] = useState(false);
  const layerCodesAll = useMemo(() => (densityLayer ? codesByMetres(layers?.[densityLayer] || []).map((c) => c.code) : []), [densityLayer, layers]);
  const cellMax = useMemo(() => model.cells.reduce((m, c) => Math.max(m, c.dx || 0, c.dy || 0, c.dz || 0), 0), [model.cells]);
  const reachM = Math.max(50, 3 * cellMax);
  const codeOf = useMemo(() => {
    if (!densityLayer || densityLayer.startsWith("model:")) return null; // a block model's density: #3012
    const byHole = new Map(collars.map((c) => [c.hole_id, c])), surveyBy = new Map();
    for (const s of survey || []) { if (!surveyBy.has(s.hole_id)) surveyBy.set(s.hole_id, []); surveyBy.get(s.hole_id).push(s); }
    const traces = new Map(), pts = [], step = Math.max(2, cellMax / 2 || 2);
    for (const r of layers?.[densityLayer] || []) {
      const code = String(r.value ?? "").trim(), f = Number(r.from), t = Number(r.to);
      if (!code || !(t > f) || !byHole.has(r.hole_id)) continue;
      if (!traces.has(r.hole_id)) traces.set(r.hole_id, desurveyHole(byHole.get(r.hole_id), surveyBy.get(r.hole_id) || [], desurveyMethod));
      const tr0 = traces.get(r.hole_id);
      if (!tr0?.length) continue;
      for (const q of intervalCodePoints(tr0, f, t, code, step)) pts.push(q);
    }
    return nearestCodeLookup(pts, reachM);
  }, [densityLayer, layers, collars, survey, desurveyMethod, cellMax, reachM]);
  const byCode = useMemo(() => (codeOf ? densityByCode(codeOf, codeDensity, rho) : null), [codeOf, codeDensity, rho]);
  // TASKS.csv #3109 / #3081 — the boxes filled from a downhole log's mean per code (Downhole logs' code table, #2951), the log's valid range and
  // the density range applied; what was taken and what was not is said under the boxes and in the CSV's header
  const logChoices = useMemo(() => (densityLayer && !densityLayer.startsWith("model:") ? numericSourceChoices({ layers, customLayers, models: false }) : []), [densityLayer, layers, customLayers]);
  const [logFill, setLogFill] = useState(null); // { label, layer, taken, outside, few, readings, notLogged, validRange, outOfRange, range }
  const fillFromLog = (key) => {
    const ch = logChoices.find((c) => c.key === key);
    if (!ch) return;
    const r = densityMeansByCode(ch, { layers, customLayers }, layers?.[densityLayer] || []);
    setCodeDensity((p) => ({ ...p, ...r.fill }));
    setLogFill({ ...r, label: ch.label, layer: densityLayer });
  };
  // TASKS.csv #3012 (WA iron review) — the density from a block model on the same blocks (Estimation's 'Match <model>' puts a density estimate
  // there): each block takes its value when it lies in DENSITY_RANGE (t/m³), else the Density field; the review's tonnage could only use one
  // typed density though the project had a density log estimated onto the same blocks
  const latticeOf = useMemo(() => blockModelLattice(model), [model]);
  // TASKS.csv #3014 part b — limits on the set's other elements (a block counts only when it meets each one) and their means beside the grade
  const members = useMemo(() => {
    if (!latticeOf || !model.params?.set) return [];
    const list = setModels || setMembersOf(model, voxelModels);
    return list.filter((m) => m.cells?.length && m.params?.element && m.params.element !== element).map((m) => ({ element: m.params.element, unit: m.params.unit || valueUnit(m), name: m.name, col: valueColumnName(m), cells: m.cells }));
  }, [latticeOf, model, setModels, voxelModels, element]);
  const join = useMemo(() => (members.length ? setJoin(latticeOf, members) : null), [members, latticeOf]);
  const [limits, setLimits] = useState({}); // { element: { op: "max" | "min", value } }
  const limitList = useMemo(() => members.map((m) => limits[m.element] || { op: "max", value: "" }), [members, limits]);
  const limited = useMemo(() => (join ? applyLimits(cellsInside, join, limitList) : null), [join, cellsInside, limitList]);
  const cellsUsed = limited ? limited.cells : cellsInside;
  const limitText = limited?.active.length ? limited.active.map((m) => `${members[m].element} ${limitList[m].op === "min" ? ">=" : "<="} ${Number(limitList[m].value)} ${members[m].unit || ""}`.trim()).join(" and ") : "";
  // #3014 part b — not the other elements of this model's set: they are grades on the same blocks (Al2O3 at 1.8-10 % would read as a density)
  const densityModels = useMemo(() => (latticeOf ? voxelModels.filter((m) => m !== model && m.id !== model.id && m.cells?.length && !(model.params?.set?.id && m.params?.set?.id === model.params.set.id) && sameLattice(blockModelLattice(m), latticeOf)) : []), [voxelModels, model, latticeOf]);
  const densityModel = densityLayer.startsWith("model:") ? densityModels.find((m) => `model:${m.id}` === densityLayer) || null : null;
  const byModel = useMemo(() => (densityModel ? densityFromModel(densityModel.cells, latticeOf, rho) : null), [densityModel, latticeOf, rho]);
  const modelUse = useMemo(() => { if (!byModel) return null; let k = 0, sum = 0, f = 0; for (const c of cellsUsed) { if (byModel.has(c)) { k++; sum += byModel.of(c); } else f++; } return { k, f, mean: k ? sum / k : null }; }, [byModel, cellsUsed]); // #3012
  const blockCodes = useMemo(() => { if (!codeOf) return new Map(); const m = new Map(); for (const c of cellsUsed) { const code = codeOf(c); if (code != null) m.set(code, (m.get(code) || 0) + 1); } return m; }, [codeOf, cellsUsed]); // #3013
  const layerCodesOrdered = useMemo(() => [...[...blockCodes].sort((a, b) => b[1] - a[1]).map(([c]) => c), ...layerCodesAll.filter((c) => !blockCodes.has(c))], [blockCodes, layerCodesAll]);
  const layerCodes = allCodes ? layerCodesOrdered : layerCodesOrdered.slice(0, 30);
  const untypedCodes = useMemo(() => [...blockCodes].filter(([c]) => !(Number(codeDensity[c]) > 0)).sort((a, b) => b[1] - a[1]), [blockCodes, codeDensity]); // #3013 — named under the table
  // the blocks per density, for the line under the table (counted here, not inside the table's sums, so a cutoff change does not add up)
  const densityUse = useMemo(() => {
    if (!codeOf) return null;
    const m = new Map();
    for (const c of cellsUsed) { const code = codeOf(c), k = code != null && Number(codeDensity[code]) > 0 ? code : null; m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((x, y) => y[1] - x[1]).map(([code, n]) => ({ code, n, rho: code == null ? rho : Number(codeDensity[code]) }));
  }, [codeOf, cellsUsed, codeDensity, rho]);
  // #3012 — a density model gives tonnes with no single density typed; TASKS.csv #2637 — so do per-code densities that every block counted takes
  // (the WA iron strands, all filled from the density log: the table hid the tonnes until a default nobody used was typed)
  const tonnesOn = !!rho || !!byModel || (!!densityUse?.length && densityUse.every((d) => d.code != null));
  const rows = useMemo(() => gradeTonnageTable(cellsUsed, { cutoffs, density: rho, unit, interpolatedOnly: interpOnly, beyondKnown, logKnown, densityOf: byModel?.of || byCode?.of || null }), [cellsUsed, cutoffs, rho, unit, interpOnly, beyondKnown, logKnown, byCode, byModel]);
  const means = useMemo(() => (join ? memberMeans(cellsUsed, join, { cutoffs, interpolatedOnly: interpOnly, densityOf: byModel?.of || byCode?.of || null }) : null), [join, cellsUsed, cutoffs, interpOnly, byModel, byCode]); // #3014 part b
  const benchCut = cutoffs.includes(Number(benchCutoff)) ? Number(benchCutoff) : cutoffs[0];
  const benchRows = useMemo(() => (byBench && Number(benchH) > 0 && benchCut != null ? gradeTonnageByBench(cellsUsed, { cutoff: benchCut, benchH: Number(benchH), datum: Number(benchDatum) || 0, density: rho, unit, interpolatedOnly: interpOnly, densityOf: byModel?.of || byCode?.of || null }) : []), [byBench, benchH, benchDatum, benchCut, cellsUsed, rho, unit, interpOnly, byModel, byCode]); // #1957; densityOf: #2637 — the same density as the main table
  // TASKS.csv #3270 (Galore Creek review) — with a density per block, a row counts only the blocks that have one; the others are counted apart
  const perBlock = !!(byModel?.of || byCode?.of), noDensCol = perBlock && rows.some((r) => r.noDensityBlocks > 0), noDensBench = perBlock && benchRows.some((r) => r.noDensityBlocks > 0);
  // TASKS.csv #3274 — the set's other elements' contained metal beside their means (with tonnes)
  const memberMcols = useMemo(() => members.map((m) => metalColumns(metalOf(m.unit), m.element)), [members]);
  const memberMetalOn = tonnesOn && !!means && members.length > 0 && memberMcols.some((c) => c.length);
  const memberMetalLabel = (c, el) => (c.args ? tr(c.label, c.args) : c.key === "metal_kg" ? tr("{el} (kg)", { el }) : c.key === "metal_oz" ? tr("{el} (troy oz)", { el }) : tr(c.label));
  const shown = rows.find((r) => r.blocks > 0) || null, lowSupport = shown?.interpolatedShare != null && shown.interpolatedShare < 0.5;
  const merged = model.cells.some((c) => Number.isFinite(c.coverage));

  // the curve: tonnes (or volume without a density) and mean grade against the cutoff
  const W = 460, H = 200, L = 52, R = 52, T = 12, B = 30;
  const xs = rows.map((r) => r.cutoff), qty = rows.map((r) => (tonnesOn ? r.tonnes : r.volumeM3) || 0), gr = rows.map((r) => r.meanGrade || 0);
  const x0 = Math.min(...xs, 0), xm = Math.max(...xs), x1 = xm > x0 ? xm : x0 + 1, q1 = Math.max(...qty, 1), g1 = Math.max(...gr, 1e-9);
  const sx = (v) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R), sq = (v) => T + (1 - v / q1) * (H - T - B), sg = (v) => T + (1 - v / g1) * (H - T - B);

  const exportCsv = () => {
    const vname = valueColumnName(model);
    const out0 = gradeTonnageRows(rows, { vname, density: tonnesOn ? (rho || (byModel ? "from the density model" : "by code")) : null /* #3012: the tonnes column with a density model; #2637: or by code */, metal, columns: mcols, pctOf: cutoffPct(1, element, unit) != null ? (v) => cutoffPct(v, element, unit) : null }); // #1017 — rows in lib, tested; columns: #1577
    const extra = means ? memberMeanColumns(means, members.map((m) => ({ col: m.col, element: m.element }))) : null; // #3014 part b — the set's other elements beside the grade
    const extraM = memberMetalOn ? memberMetalColumns(means, members, { perBlock, rho }) : null; // #3274 — the members' contained metal
    const out = extra ? out0.map((r, i) => ({ ...r, ...extra[i], ...(extraM ? extraM[i] : {}) })) : out0;
    const stamp = stampLines({ tool: "Grade-tonnage table", version: APP_VERSION, epsg, params: [
      `Block model: ${model.name} (${model.cells.length} blocks, source ${model.source || "import"}) | value ${vname}${unit ? ` in ${unit}` : " (no unit stated)"}`,
      ...(solid ? [`Inside the solid: ${solid.name}${solid.closure === "artificial" ? " (closed artificially at the search radius: its volume is an assumption)" : ""} | ${insideMode === "share" ? `each block counted by the share of it inside (2 x 2 x 2 sample points): ${inside.inside} wholly inside, ${inside.partial} partly, ${inside.outside} outside` : `blocks counted whole by their centre: ${inside.inside} inside, ${inside.outside} outside`}`] : []), // #1949
      ...(byBench && benchRows.length ? [`By bench: ${benchH} m benches from a datum of ${Number(benchDatum) || 0} m, at the ${benchCut} ${unit || ""} cutoff; a block spanning two benches is split by its vertical overlap`] : []), // #1957
      ...(members.length ? [`Set: ${model.params.set.elements.join(", ")} (one estimate, the same blocks) | ${limitText ? `limits: ${limitText}; a block counts only when it meets every limit (${limited.failed} block(s) failed${limited.active.map((m) => (limited.missing[m] ? `, ${limited.missing[m]} with no ${members[m].element} value left out` : "")).join("")})` : "no limits"} | mean_<element>: the member's ${tonnesOn ? "tonnage" : "volume"}-weighted mean over the blocks counted at each cutoff${memberMetalOn ? " | <element>_<t, mlb, kg or oz>: the member's contained metal, its mean x the tonnes of the counted blocks that have a value of it (no price, recovery or equivalent grade)" : ""}`] : []), // #3014 part b
      // TASKS.csv #3109 — the per-code densities in the header (they were not written anywhere in the file)
      ...(byCode ? [`Density by ${densityLayer === "weath" ? "Weathering" : densityLayer === "litho" ? "Lithology" : "Alteration"}: each block takes the nearest logged interval within ${Math.round(reachM)} m and its code's density: ${Object.entries(codeDensity).filter(([, v]) => Number(v) > 0).map(([c, v]) => `${c} ${Number(v)}`).join(", ") || "none typed"}; other blocks take the Density below${logFill && logFill.layer === densityLayer && logFill.taken.length ? ` | filled from the mean of the log "${logFill.label}" per code (${logFill.readings} readings${logFill.validRange ? `, its valid range ${logFill.validRange.map((v) => (Number.isFinite(v) ? v : "open")).join(" to ")}` : ""}; means outside ${logFill.range[0]}-${logFill.range[1]} t/m3 not taken${logFill.outside.length ? `: ${logFill.outside.map((t) => t.code).join(", ")}` : ""}), then as shown` : ""}`] : []),
      ...(byModel ? [`Density by block: the block model "${densityModel.name}" on the same blocks, its value where it is ${DENSITY_RANGE[0]}-${DENSITY_RANGE[1]} t/m3 (${byModel.stats().taken} of the model's blocks), else the Density below`] : []), // #3012
      `Density: ${rho ? (fromSg ? `${rho} t/m3, length-weighted mean of ${sgLayer.n} Specific gravity rows, ${sgLayer.min}-${sgLayer.max}${sgLayer.left ? `, ${sgLayer.left} outside 1-8 left out` : ""} (one value for every block)` : `${rho} t/m3, entered by the user (${byModel ? "the blocks the density model does not cover" : "one value for every block"})`) : byModel ? "no default entered: a block the density model does not cover has no tonnes" /* #3012 */ : tonnesOn ? "no default entered: every block counted takes its code's density (above)" /* #2637 */ : "not entered: volumes only"}${merged ? " | merged blocks counted at their COVERAGE share" : ""}`,
      perBlock && rows.some((r) => r.tonnes != null) ? `Mean grade: tonnage-weighted (block volume x its density) over the blocks with a density at or above the cutoff; blocks, volume and tonnes count those blocks only${noDensCol ? "; blocks_no_density / volume_no_density_m3: the blocks at the cutoff left out for want of a density" : ""}` : "Mean grade: volume-weighted over the blocks at or above the cutoff", // #3270
      ...(hasSupport ? [interpOnly ? "Blocks: only those the estimate classed interpolated" : "Blocks: every estimated block; interpolated_pct / one_hole_pct give the volume share by support"] : []), // #1409
      ...(logKnown ? [`from_log_metal_pct: about the share of the metal from the readings of the log "${model.params.unsampledLog}" x ${model.params.unsampledLogFactor} that filled the unsampled metres (picked by the user)`] : []), // #2721
      ...(beyondKnown ? [`beyond_samples_metal_pct: share of the metal in blocks wholly above or below every sample informing them | unsampled metres: ${model.params?.unsampledMetres || "not known (left out)"}`] : []), // #2417
      EXPLORATION_TARGET_CAUTION,
    ] });
    const benchOut = byBench && benchRows.length ? benchRows.map((r) => ({ bench_floor_rl: Math.round(r.floorRL * 100) / 100, cutoff: benchCut, blocks: r.blocks, volume_m3: Math.round(r.volumeM3), [`mean_${vname}`]: r.meanGrade == null ? "" : Number(r.meanGrade.toPrecision(5)), ...(tonnesOn ? { tonnes: Math.round(r.tonnes || 0) } : {}), ...(tonnesOn && metal ? Object.fromEntries(mcols.map((c) => [c.key, r.metal == null ? "" : Number((r.metal * c.factor).toPrecision(6))])) : {}), /* #1577 */ ...(r.interpolatedShare != null ? { interpolated_pct: Math.round(r.interpolatedShare * 100) } : {}) })) : null; // #1957
    saveFile({ suggestedName: `${String(model.name).replace(/[^a-z0-9_-]+/gi, "_")}_grade_tonnage${solid ? "_inside_solid" : ""}${benchOut ? "_by_bench" : ""}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: withStamp(toExportCsv(benchOut || out), stamp) });
  };

  const th = { textAlign: "end", padding: "4px 8px", color: "var(--color-text-secondary)", fontWeight: 600, borderBottom: "1px solid var(--color-border)" };
  const td = { textAlign: "end", padding: "3px 8px", fontVariantNumeric: "tabular-nums" };
  const inp = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)", fontSize: "var(--font-size-base)" };
  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div role="dialog" aria-modal="true" aria-label={tr("Grade-tonnage")} onClick={(e) => e.stopPropagation()} style={{ width: "min(640px, 94vw)", maxHeight: "90vh", overflowY: "auto", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 16, fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600 }}>{tr("Grade-tonnage: {name}", { name: model.name })}</div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 260 }}>{tr("Cutoffs ({unit})", { unit: unitL || tr("no unit stated") })}
            <input value={cutoffText} onChange={(e) => setCutoffText(e.target.value)} style={{ ...inp, flex: 1 }} aria-label={tr("Cutoffs, separated by commas")} /></label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("Density (t/m³)")}
            <input type="number" min={0} step={0.01} value={density} placeholder={tr("required for tonnes")} onChange={(e) => { setDensity(e.target.value); setFromSg(false); }} style={{ ...inp, width: 120 }} /></label>
          {(codeLayers.length > 0 || densityModels.length > 0) && <label style={{ display: "flex", alignItems: "center", gap: 6 }} title={tr("A density per code of a logged layer: each block takes the nearest logged interval within {r} m; the Density field is the default for the rest", { r: Math.round(reachM) })}>{tr("Density by")}{/* #2550 */}
            <select value={densityLayer} onChange={(e) => setDensityLayer(e.target.value)} style={{ ...inp, maxWidth: 260 }} aria-label={tr("Density by")}><option value="">{tr("one value")}</option>{codeLayers.map((k) => <option key={k} value={k}>{k === "weath" ? tr("Weathering") : k === "litho" ? tr("Lithology") : tr("Alteration")}</option>)}{densityModels.map((m) => <option key={m.id} value={`model:${m.id}`}>{tr("the block model \"{name}\" (same blocks)", { name: m.name })}</option>)/* #3012 */}</select></label>}
          {sgLayer && <button type="button" style={{ ...inp, cursor: "pointer" }} title={tr("The length-weighted mean of the Specific gravity layer: {n} rows, {min} to {max}. One value for every block.", { n: sgLayer.n, min: sgLayer.min, max: sgLayer.max })} onClick={() => { setDensity(String(sgLayer.mean)); setFromSg(true); }}>{tr("Use the SG layer's mean ({v})", { v: sgLayer.mean })}</button>}
        </div>
        {/* TASKS.csv #3014 part b — limits from the set: each other element's ceiling or floor */}
        {members.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", alignItems: "center", marginBottom: 8, fontSize: "var(--font-size-sm)" }}>
            <span title={tr("The other elements estimated with this one, on the same blocks. A block counts only when it meets every limit you type; a block with no value of a limited element is left out.")}>{tr("Limits from the set:")}</span>
            {members.map((m, i) => (
              <label key={m.element} style={{ display: "flex", alignItems: "center", gap: 4 }}>{m.element}
                <select value={limitList[i].op} onChange={(e) => setLimits((p) => ({ ...p, [m.element]: { ...limitList[i], op: e.target.value } }))} style={inp} aria-label={tr("Limit on {el}", { el: m.element })}><option value="max">≤</option><option value="min">≥</option></select>
                <input type="number" step="any" value={limitList[i].value} placeholder={tr("none")} onChange={(e) => setLimits((p) => ({ ...p, [m.element]: { ...limitList[i], value: e.target.value } }))} style={{ ...inp, width: 70 }} aria-label={tr("Limit value of {el}", { el: m.element })} />{m.unit ? gradeUnitLabel(m.element, m.unit) : ""}
              </label>
            ))}
          </div>
        )}
        {limited?.active.length > 0 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6, lineHeight: 1.5 }}>{tr("{n} of {all} block(s) meet the limits; {f} fail them.", { n: limited.cells.length.toLocaleString(), all: cellsInside.length.toLocaleString(), f: limited.failed.toLocaleString() })}{limited.active.filter((m) => limited.missing[m]).map((m) => " " + tr("{k} block(s) with no {el} value are left out (its estimate did not reach them).", { k: limited.missing[m].toLocaleString(), el: members[m].element })).join("")}</div>}
        {densityLayer && layerCodes.length > 0 && logChoices.length > 0 && ( /* TASKS.csv #3109 / #3081 */
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: "var(--font-size-sm)" }} title={tr("Each code's mean of a downhole log over the readings inside its intervals, as Downhole logs' table by code gives it (a binned log's bins weighed by their readings). A code whose mean is outside {lo}-{hi} t/m³, or with fewer than 3 readings, is left as it is.", { lo: DENSITY_RANGE[0], hi: DENSITY_RANGE[1] })}>{tr("Fill from a log's mean per code")}
            <select value="" onChange={(e) => fillFromLog(e.target.value)} style={{ ...inp, maxWidth: 260 }} aria-label={tr("Fill the densities from a log's mean per code")}><option value="">{tr("choose a log…")}</option>{logChoices.map((c) => <option key={c.key} value={c.key}>{c.unit && c.unit !== "as logged" ? `${c.label} (${c.unit})` : c.label}</option>)}</select></label>
        )}
        {logFill && logFill.layer === densityLayer && <div role="status" style={{ fontSize: "var(--font-size-sm)", color: logFill.taken.length ? "var(--color-text-secondary)" : "var(--color-warn-text)", marginBottom: 6, lineHeight: 1.5 }}>{/* #3109 / #3081 */}
          {logFill.taken.length ? tr("Filled {k} code(s) from the mean of \"{log}\" per code ({n} readings{vr}): {list}.", { k: logFill.taken.length, log: logFill.label, n: logFill.readings.toLocaleString(), vr: logFill.validRange ? tr(", its valid range {lo} to {hi}, {out} outside left out", { lo: Number.isFinite(logFill.validRange[0]) ? logFill.validRange[0] : "—", hi: Number.isFinite(logFill.validRange[1]) ? logFill.validRange[1] : "—", out: logFill.outOfRange.toLocaleString() }) : "", list: logFill.taken.slice(0, 12).map((t) => `${t.code} ${t.mean.toFixed(2)}`).join(", ") + (logFill.taken.length > 12 ? "…" : "") }) : tr("No code took a density from \"{log}\".", { log: logFill.label })}
          {logFill.outside.length ? " " + tr("Not taken, the mean outside {lo}-{hi} t/m³ (not a density?): {list}.", { lo: logFill.range[0], hi: logFill.range[1], list: logFill.outside.slice(0, 8).map((t) => `${t.code} ${Number(t.mean.toPrecision(3))}`).join(", ") }) : ""}
          {logFill.few.length ? " " + tr("Fewer than 3 readings: {list}.", { list: logFill.few.slice(0, 8).map((t) => t.code).join(", ") }) : ""}
          {logFill.notLogged ? " " + tr("{n} readings lie in no interval of the layer.", { n: logFill.notLogged.toLocaleString() }) : ""}
        </div>}
        {densityLayer && layerCodes.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginBottom: 8, fontSize: "var(--font-size-sm)" }}>{/* #2550 */}
            {layerCodes.map((code) => <label key={code} title={blockCodes.has(code) ? tr("{n} block(s) of this model take this code", { n: blockCodes.get(code).toLocaleString() }) : tr("No block of this model takes this code")} style={{ display: "flex", alignItems: "center", gap: 4 }}>{code}<input type="number" min={0} step={0.01} value={codeDensity[code] ?? ""} placeholder={density || tr("default")} onChange={(e) => setCodeDensity((p) => ({ ...p, [code]: e.target.value }))} aria-label={tr("Density of {code} (t/m³)", { code })} style={{ ...inp, width: 70 }} /></label>)}
            {layerCodesOrdered.length > 30 && <button type="button" onClick={() => setAllCodes((v) => !v)} style={{ ...inp, width: "auto", cursor: "pointer" }}>{allCodes ? tr("Show the first 30") : tr("Show all {n}", { n: layerCodesOrdered.length })}</button>}{/* #3013 */}
          </div>
        )}
        {/* TASKS.csv #1949 — inside a closed solid; #1957 — bench by bench */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8, fontSize: "var(--font-size-sm)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("Inside the solid")}
            <select value={solidId} onChange={(e) => setSolidId(e.target.value)} style={{ ...inp, maxWidth: 220 }} aria-label={tr("Solid to report inside")}><option value="">{solids.length ? tr("— the whole model —") : tr("— no closed solid in the project —")}</option>{solids.map((s) => <option key={s.id} value={s.id}>{s.name}{s.closure === "artificial" ? ` · ${tr("closed artificially")}` : ""}</option>)}</select></label>
          {solid && <label style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("Count")}
            <select value={insideMode} onChange={(e) => setInsideMode(e.target.value)} style={inp} aria-label={tr("How a block is counted inside")}><option value="centre">{tr("whole blocks by their centre")}</option><option value="share">{tr("the share of each block inside")}</option></select></label>}
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={byBench} onChange={(e) => setByBench(e.target.checked)} />{tr("By bench")}</label>
          {byBench && <label style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("Bench height (m)")}<input type="number" min={0} step="any" value={benchH} onChange={(e) => setBenchH(e.target.value)} style={{ ...inp, width: 70 }} aria-label={tr("Bench height")} /></label>}
          {byBench && <label style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("Datum (m)")}<input type="number" step="any" value={benchDatum} onChange={(e) => setBenchDatum(e.target.value)} placeholder="0" style={{ ...inp, width: 80 }} aria-label={tr("Bench datum")} /></label>}
          {byBench && cutoffs.length > 1 && <label style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("at cutoff")}<select value={benchCut ?? ""} onChange={(e) => setBenchCutoff(e.target.value)} style={inp} aria-label={tr("Cutoff of the bench table")}>{cutoffs.map((c) => <option key={c} value={c}>{sig(c)}</option>)}</select></label>}
        </div>
        {solid && inside && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6, lineHeight: 1.5 }}>{insideMode === "share"
          ? tr("Inside \"{name}\": {a} block(s) wholly inside, {b} partly (counted by the share of each inside, from 2 × 2 × 2 sample points), {c} outside.", { name: solid.name, a: inside.inside, b: inside.partial, c: inside.outside })
          : tr("Inside \"{name}\": {a} block(s) counted whole by their centre, {c} outside; a block the surface cuts is wholly in or wholly out here.", { name: solid.name, a: inside.inside, c: inside.outside })}{closureNote(solid)}</div>}
        {byBench && !(Number(benchH) > 0) && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6 }}>{tr("Enter the bench height: the floors sit at the datum plus whole benches.")}</div>}
        {byBench && benchRows.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
            <thead><tr>
              <th style={th}>{tr("Bench floor (m)")}</th><th style={th}>{tr("Blocks")}</th><th style={th}>{tr("Volume (m³)")}</th><th style={th}>{unitL ? tr("Mean grade ({unit})", { unit: unitL }) : tr("Mean grade")}</th>
              {tonnesOn && <th style={th}>{tr("Tonnes")}</th>}{tonnesOn && mcols.map((c) => <th key={c.key} style={th}>{tr(c.label, c.args)}</th>)}
              {hasSupport && <th style={th}>{tr("Interpolated")}</th>}
              {noDensBench && <th style={th} title={tr("Blocks at this cutoff with no density: left out of the row (its blocks, volume, grade and tonnes)")}>{tr("No density")}</th>}{/* #3270 */}
            </tr></thead>
            <tbody>{benchRows.map((r) => (
              <tr key={r.floorRL}>
                <td style={td}>{fmt(r.floorRL, 1)}</td><td style={td}>{fmt(r.blocks, 1)}</td><td style={td}>{fmt(r.volumeM3)}</td><td style={td}>{sig(r.meanGrade)}</td>
                {tonnesOn && <td style={td} title={exactTitle(r.tonnes)}>{sig(r.tonnes)}</td>}{tonnesOn && mcols.map((c) => <td key={c.key} style={td} title={r.metal == null ? undefined : exactTitle(r.metal * c.factor)}>{r.metal == null ? "—" : sig(r.metal * c.factor) /* #2404 — millions of pounds; #3284 — every tonnage and metal: 3 significant figures */}</td>)}
                {hasSupport && <td style={td}>{r.interpolatedShare == null ? "—" : `${Math.round(r.interpolatedShare * 100)} %`}</td>}
                {noDensBench && <td style={td}>{fmt(r.noDensityBlocks || 0, 1)}</td>}{/* #3270 */}
              </tr>))}</tbody>
          </table>
        )}
        {byBench && benchRows.length > 0 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6, lineHeight: 1.5 }}>{tr("Benches of {h} m from a datum of {d} m, at the {c} {unit} cutoff; a block spanning two benches is split by its vertical overlap, so the block counts carry fractions.", { h: benchH, d: Number(benchDatum) || 0, c: sig(benchCut), unit: unit || "" })}</div>}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
          <thead><tr>
            <th style={th}>{unitL ? tr("Cutoff ({unit})", { unit: unitL }) : tr("Cutoff")}</th><th style={th}>{tr("Blocks")}</th><th style={th}>{tr("Volume (m³)")}</th><th style={th}>{unitL ? tr("Mean grade ({unit})", { unit: unitL }) : tr("Mean grade")}</th>
            {tonnesOn && <th style={th}>{tr("Tonnes")}</th>}{tonnesOn && mcols.map((c) => <th key={c.key} style={th}>{tr(c.label, c.args)}</th>)}
            {hasSupport && <th style={th} title={tr("Share of the volume in blocks the estimate classed interpolated (between holes, from at least two)")}>{tr("Interpolated")}</th>}
            {beyondKnown && <th style={th} title={tr("Share of the metal in blocks lying wholly above or below every sample that informs them: grade carried up or down the holes into metres their samples do not reach")}>{tr("Beyond the samples")}</th>}
            {logKnown && <th style={th} title={tr("About the share of the metal from the readings of the log that filled the unsampled metres: neither a sample nor a typed barren value")}>{tr("From the log")}</th>}{/* #2721 */}
            {members.map((m) => <th key={m.element} style={th} title={tr("{el}'s mean over the blocks counted at this cutoff, weighted as the mean grade is", { el: m.element })}>{m.unit ? tr("Mean {el} ({unit})", { el: m.element, unit: gradeUnitLabel(m.element, m.unit) }) : tr("Mean {el}", { el: m.element })}</th>)}{/* #3014 part b */}
            {memberMetalOn && members.map((m, i) => memberMcols[i].map((c) => <th key={`${m.element}_${c.key}`} style={th} title={tr("{el} contained in the counted blocks that have a value of it: its mean times their tonnes. No price, recovery or equivalent grade.", { el: m.element })}>{memberMetalLabel(c, m.element)}</th>))}{/* #3274 */}
          {noDensCol && <th style={th} title={tr("Blocks at this cutoff with no density: left out of the row (its blocks, volume, grade and tonnes)")}>{tr("No density")}</th>}{/* #3270 */}
          </tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.cutoff}>
              <td style={td}>{sig4(r.cutoff)}{cutoffPct(r.cutoff, element, unit) != null ? ` (${sig4(cutoffPct(r.cutoff, element, unit))} %)` : ""}</td>{/* #1747 — a base metal in ppm: its cut-off in % too */}<td style={td}>{fmt(r.blocks)}</td><td style={td}>{fmt(r.volumeM3)}</td><td style={td}>{sig(r.meanGrade)}</td>
              {tonnesOn && <td style={td} title={exactTitle(r.tonnes)}>{sig(r.tonnes)}</td>}{tonnesOn && mcols.map((c) => <td key={c.key} style={td} title={r.metal == null ? undefined : exactTitle(r.metal * c.factor)}>{r.metal == null ? "—" : sig(r.metal * c.factor) /* #2404 — millions of pounds; #3284 — every tonnage and metal: 3 significant figures */}</td>)}
              {hasSupport && <td style={td}>{r.interpolatedShare == null ? "—" : `${Math.round(r.interpolatedShare * 100)} %`}</td>}
              {beyondKnown && <td style={td}>{r.beyondShare == null ? "—" : `${Math.round(r.beyondShare * 100)} %`}</td>}
              {logKnown && <td style={td}>{r.logShare == null ? "—" : `${Math.round(r.logShare * 100)} %`}</td>}{/* #2721 */}
              {means && means.find((x) => x.cutoff === r.cutoff)?.means.map((x, m) => <td key={members[m].element} style={td} title={x.covered != null && x.covered < 0.9995 ? tr("{el} has a value in {p} % of this volume", { el: members[m].element, p: Math.round(x.covered * 100) }) : undefined}>{sig(x.mean)}{x.covered != null && x.covered < 0.9995 ? "*" : ""}</td>)}{/* #3014 part b */}
              {memberMetalOn && members.map((m, i) => { const x = means.find((q) => q.cutoff === r.cutoff)?.means[i]; const vals = memberMetal(x, { perBlock, rho, unit: m.unit, element: m.element }); return memberMcols[i].map((c, j) => <td key={`${m.element}_${c.key}`} style={td} title={exactTitle(vals[j]?.value)}>{vals[j]?.value == null ? "—" : sig(vals[j].value) /* #3284 */}</td>); })}{/* #3274 */}
              {noDensCol && <td style={td}>{fmt(r.noDensityBlocks || 0)}</td>}{/* #3270 */}
            </tr>))}</tbody>
        </table>
        {modelUse && <div style={{ fontSize: "var(--font-size-sm)", color: modelUse.f && !rho ? "var(--color-warn-text)" : "var(--color-text-secondary)", marginBottom: 6, lineHeight: 1.5 }}>{/* #3012 */}{tr("Density from the block model \"{name}\" on the same blocks: {k} block(s) take its value (a mean of {m} t/m³), {f} take {d} (no block of it there, or a value outside {lo}-{hi} t/m³).", { name: densityModel.name, k: modelUse.k.toLocaleString(), m: modelUse.mean == null ? "—" : modelUse.mean.toFixed(2), f: modelUse.f.toLocaleString(), d: rho ? tr("the Density field ({rho} t/m³)", { rho }) : tr("no density and are counted apart, in the No density column") /* #3270 */, lo: DENSITY_RANGE[0], hi: DENSITY_RANGE[1] })}</div>}
        {untypedCodes.length > 0 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", marginBottom: 6, lineHeight: 1.5 }}>{/* #3013 */}{(() => { const list = untypedCodes.slice(0, 12).map(([c, n]) => tr("{code} ({n} blocks)", { code: c, n: n.toLocaleString() })).join(", ") + (untypedCodes.length > 12 ? ", …" : ""); return rho ? tr("No density typed for {list}: their blocks take the default ({rho} t/m³).", { list, rho }) : tr("No density typed for {list}: with no default density typed, their blocks have a volume but no tonnes.", { list }); })()}</div>}
        {densityUse && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6, lineHeight: 1.5 }}>{/* #2550 */}{tr("Density by {layer}, the nearest logged interval within {r} m: {list}.", { layer: densityLayer === "weath" ? tr("Weathering") : densityLayer === "litho" ? tr("Lithology") : tr("Alteration"), r: Math.round(reachM), list: densityUse.map((d) => tr("{code} {rho} t/m³ ({n} blocks)", { code: d.code ?? tr("the default"), rho: d.rho ?? "—", n: d.n })).join("; ") })}{!tonnesOn ? " " + tr("Enter the default density to show the tonnes.") : ""}</div>}
        {beyondKnown && shown?.beyondShare > 0.1 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", marginBottom: 6, lineHeight: 1.5 }}>{tr("{p} % of the metal at the {c} cutoff is in blocks above or below every sample that informs them: the estimate carried grade up or down the holes past their samples (unsampled core reads as not known unless the estimate filled it).", { p: Math.round(shown.beyondShare * 100), c: sig(shown.cutoff) })}</div>}
        {hasSupport && <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", marginBottom: 6 }}><input type="checkbox" checked={interpOnly} onChange={(e) => setInterpOnly(e.target.checked)} />{tr("Only blocks classed interpolated")}</label>}
        {hasSupport && !interpOnly && lowSupport && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", marginBottom: 6, lineHeight: 1.5 }}>{tr("Most of this volume is in blocks the estimate carried outward from the holes (extrapolated or unsupported), not between them: the tonnage rests on grades the drilling does not surround.")}</div>}
        {rows.length > 1 && (
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={tr("Grade-tonnage curve")} style={{ display: "block", marginBottom: 8 }} dir="ltr">
            <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="#94a1b0" /><line x1={L} y1={T} x2={L} y2={H - B} stroke="#94a1b0" /><line x1={W - R} y1={T} x2={W - R} y2={H - B} stroke="#94a1b0" />
            <polyline fill="none" stroke="#2f6fe0" strokeWidth="2" points={rows.map((r, i) => `${sx(xs[i])},${sq(qty[i])}`).join(" ")} />
            <polyline fill="none" stroke="#c0392b" strokeWidth="2" strokeDasharray="5 3" points={rows.map((r, i) => `${sx(xs[i])},${sg(gr[i])}`).join(" ")} />
            <text x={L - 4} y={T + 8} fontSize="10" textAnchor="end" fill="#2f6fe0">{compact(q1)}</text>
            <text x={L - 4} y={H - B} fontSize="10" textAnchor="end" fill="#2f6fe0">0</text>
            <text x={W - R + 4} y={T + 8} fontSize="10" fill="#c0392b">{compact(g1)}</text>
            <text x={L} y={H - 10} fontSize="10" fill="#55606e">{sig(x0)}</text>
            <text x={W - R} y={H - 10} fontSize="10" textAnchor="end" fill="#55606e">{sig(x1)}</text>
            <text x={(L + W - R) / 2} y={H - 4} fontSize="10" textAnchor="middle" fill="#55606e">{tr("cutoff ({unit})", { unit: unitL || "?" })}</text>
            <text x={L + 6} y={T + 10} fontSize="10" fill="#2f6fe0">{tonnesOn ? tr("tonnes") : tr("volume (m³)")}</text>
            <text x={W - R - 6} y={T + 10} fontSize="10" textAnchor="end" fill="#c0392b">{tr("mean grade")}</text>
          </svg>
        )}
        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5, marginBottom: 6 }}>
          {tonnesOn && <>{tr("Tonnes and metal are shown to three significant figures (hover a figure for the exact sum; the CSV keeps it whole): they are conceptual.")}{" "}</>}{/* #3284 */}
          {perBlock && rows.some((r) => r.tonnes != null) ? tr("Mean grade is tonnage-weighted (each block's volume times its density) over the blocks with a density at or above each cutoff; blocks with none are left out of the row.") : tr("Mean grade is volume-weighted over the blocks at or above each cutoff.")}{/* #3270 */}{means && means.some((r) => r.means.some((x) => x.covered != null && x.covered < 0.9995)) ? ` ${tr("* the element has no value in part of that volume (its own estimate did not reach every block); the mean is over the blocks it has.")}` : ""}{merged ? ` ${tr("Blocks merged on import count only the share of the block the model filled (COVERAGE).")}` : ""}{!rho && !perBlock ? ` ${tr("Enter a density to get tonnes: no default is assumed.")}` : !rho && (noDensCol || noDensBench) ? ` ${tr("Enter a Density to give the blocks with none a value: no default is assumed.")}` : ""}{/* #3270 */}
        </div>
        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 6, padding: "7px 9px", lineHeight: 1.5, marginBottom: 10 }}>
          {tr(EXPLORATION_TARGET_CAUTION)} {tr(NOT_A_RESOURCE)}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={exportCsv} disabled={!rows.length} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", cursor: "pointer" }}>
            <Download size={14} />{" "}{tr("Export CSV")}</button>
        </div>
      </div>
    </div>
  );
}
