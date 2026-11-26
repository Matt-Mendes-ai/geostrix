import React, { useMemo, useState } from "react";
import { useLeadCommodity } from "../lib/useLeadCommodity.js"; // TASKS.csv #2351
import { preferredElement } from "../lib/preferredElement.js"; // TASKS.csv #2351
import QcPairReview from "./QcPairReview.jsx"; // TASKS.csv #3549
import OxideTotalsTab from "./OxideTotalsTab.jsx"; // TASKS.csv #2506
import MethodPairsTab from "./MethodPairsTab.jsx"; // TASKS.csv #2629
import { majorOxides, MIN_MAJORS } from "../lib/oxideTotals.js"; // TASKS.csv #2506
import StepDialog from "./StepDialog.jsx";
import { StepNumbers } from "./StepPane.jsx";
import DialogHelpCard from "./DialogHelpCard.jsx";
import { saveFile } from "../lib/desktop.js";
import { methodPairs, labAssays } from "../lib/qaqc.js"; // TASKS.csv #2629; labAssays: #2354
import { classifyQAQCRow, excludedQAQCIds, standardGroups, standardSeries, blankRows, duplicatePairs, duplicateSummary, DUP_RPD_LIMITS, DUP_KIND_LABELS, suggestDetectionLimit, methodDetectionLimits /* #2732 */, methodBlankLimits /* #2772 */, orderForControlChart, DEFAULT_QAQC_PATTERNS } from "../lib/qaqc.js"; import { formatLimit, limitLooksConverted } from "../lib/qaqc.js";
import { stampLines, withStamp, stampEpsg } from "../lib/provenance.js"; // TASKS.csv #534 — stamped exports
import { version as APP_VERSION } from "../../package.json";
import { useStore } from "../lib/store.jsx"; // TASKS.csv #400 — certified values live in the project

// TASKS.csv #134 — lab QAQC dashboard (standards/blanks/duplicates), distinct from dataQC.js's
// geometric QC. See qaqc.js's header comment for the identification approach (hole_id naming
// convention, no external CRM certificate database) and its accepted first-pass limitations.
const TABS = ["standards", "blanks", "duplicates"];
const STEP_LABEL = { data: () => tr("Data"), standards: () => tr("Standards"), blanks: () => tr("Blanks"), duplicates: () => tr("Duplicates"), methods: () => tr("Method pairs"), pxrf: () => tr("pXRF vs lab"), totals: () => tr("Totals") };
import { arrMin, arrMax } from "../lib/arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)
import { fontSizes } from "../lib/theme.js"; // TASKS.csv #385 — SVG font-size attributes on the type scale
import { t as tr, fmtNum } from "../lib/i18n.js"; // TASKS.csv #786
import MoreFold from "./MoreFold.jsx"; // TASKS.csv #3939 — detail behind a closed More
import { gradeUnitLabel, elementOptionLabel } from "../lib/geochem.js"; // elementOptionLabel: #2914 — // TASKS.csv #2192 — g/t for a precious metal stored in ppm (#1680)
import { toExportCsv } from "../lib/tabular.js"; // TASKS.csv #1022 — every exported CSV: all columns, formula cells escaped
import { qaqcStandardRows, qaqcBlankRows, qaqcDuplicateRows } from "../lib/analysisExports.js"; // TASKS.csv #1083
import { pxrfVsLab, sampleTypesSeen } from "../lib/pxrfVsLab.js"; // TASKS.csv #1675
import NumberInput from "./NumberInput.jsx"; // TASKS.csv #3926

export default function QAQCPanel({ assays, assayElements, onClose }) {
  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const lead = useLeadCommodity(); // TASKS.csv #2351 — open on the lead commodity, not the first element in import order (Co on a uranium project)
  const [symbol, setSymbol] = useState(() => preferredElement(assayElements.map((e) => e.symbol), null, lead));
  const [at, setAt] = useState(0);
  const [blankThreshold, setBlankThreshold] = useState(null); // TASKS.csv #2733 — no 0.1 pre-fill: a number in no unit that read as a rule; blanks are listed, not judged, until one is set
  const [selectedStdId, setSelectedStdId] = useState(null);
  const { crmCertificates = {}, setCrmCertificate, setAssayElements, project, setAssays } = useStore() || {}; // #400; setAssays: #2506
  const majors = useMemo(() => majorOxides(assayElements), [assayElements]); // #2506 — the oxide-total check needs six majors
  const [dupMin, setDupMin] = useState(""); // #400 — ignore pairs whose mean is below this (~10x detection limit)
  const [reviewOpen, setReviewOpen] = useState(false), [reviewNote, setReviewNote] = useState(""); // #3549
  const [repeatedAsDup, setRepeatedAsDup] = useState(false); // #579 — same-interval second rows as duplicate pairs
  // TASKS.csv #534 — a detection limit PER ELEMENT, saved with the element list (assayElements[].detectionLimit, so the
  // project format does not change). The blank limit becomes a multiple of it (default 5x DL) and the duplicate pair
  // floor defaults to 10x DL; without a DL the old manual threshold applies. Units: the element's own.
  const unit = elementUnits[symbol] || "ppm";
  const unitL = gradeUnitLabel(symbol, unit); // #2192 — the label on screen (g/t for a precious metal in ppm, #1680); exports keep unit
  const dl = assayElements.find((e) => e.symbol === symbol)?.detectionLimit ?? null;
  const dlSuggestion = useMemo(() => suggestDetectionLimit(labAssays(assays), symbol), [assays, symbol]); // labAssays: #2354 — a pXRF reading is not the lab's limit
  const methodLimitsRead = useMemo(() => methodDetectionLimits(labAssays(assays), symbol), [assays, symbol]); // #2732 — one limit per joined method column
  // TASKS.csv #2881 (split from #2772) — a limit typed per method column (saved with the element, assayElements[].methodLimits = { [column]:
  // limit }, '' for the element's main column) wins over the one read from its '<' results, as the element's own typed limit does
  const typedByMethod = assayElements.find((e) => e.symbol === symbol)?.methodLimits || null;
  const methodLimits = useMemo(() => methodLimitsRead.map((m) => { const t = typedByMethod?.[m.method ?? ""]; return t > 0 ? { ...m, limit: t, typed: true, read: m.limit } : m; }), [methodLimitsRead, typedByMethod]);
  const setMethodLimit = (method, v) => setAssayElements?.((prev) => prev.map((e) => { if (e.symbol !== symbol) return e; const ml = { ...(e.methodLimits || {}) }; if (v > 0) ml[method ?? ""] = v; else delete ml[method ?? ""]; return { ...e, methodLimits: Object.keys(ml).length ? ml : undefined }; }));
  const setDetectionLimit = (v) => setAssayElements?.((prev) => prev.map((e) => (e.symbol === symbol ? { ...e, detectionLimit: v > 0 ? v : null } : e)));
  const [blankMult, setBlankMult] = useState(5);
  const blankLimit = dl ? blankMult * dl : blankThreshold;
  const pairFloor = dupMin !== "" ? Number(dupMin) || 0 : dl ? 10 * dl : 0;

  const counts = useMemo(() => {
    const c = { standard: 0, blank: 0, duplicate: 0, regular: 0 };
    assays.forEach((a) => { c[classifyQAQCRow(a)]++; }); // #400: the row (sample_type), not just the name
    return c;
  }, [assays]);

  const groups = useMemo(() => standardGroups(assays), [assays]);
  const excludedIds = useMemo(() => excludedQAQCIds(assays), [assays]); // TASKS.csv #400
  const activeGroup = groups.find((g) => g.id === selectedStdId) || groups[0] || null;
  const cert = activeGroup ? crmCertificates[activeGroup.id]?.[symbol] : null;
  // #534 — chart in sample-id order (the order the lab received them) when every insertion has an id
  const ordered = useMemo(() => orderForControlChart(activeGroup?.rows || []), [activeGroup]);
  const series = useMemo(() => (activeGroup ? standardSeries(ordered.rows, symbol, elementUnits, cert) : { points: [], limits: null }), [activeGroup, ordered, symbol, elementUnits, cert]);

  // TASKS.csv #2772 — an element joined from method columns whose limits differ: each blank judged against blankMult x its own method's limit
  const methodsDiffer = methodLimitsRead.length > 1 && (new Set(methodLimitsRead.map((m) => m.limit)).size > 1 || !!typedByMethod); // #2881 — the read limits differ, or some are typed (the row stays while they are edited)
  const [perMethod, setPerMethod] = useState(false);
  const blankByMethod = useMemo(() => (methodsDiffer && perMethod ? methodBlankLimits(methodLimits, blankMult) : null), [methodsDiffer, perMethod, methodLimits, blankMult]);
  const blanks = useMemo(() => blankRows(assays, symbol, elementUnits, blankLimit, undefined, { methodLimits: blankByMethod }), [assays, symbol, elementUnits, blankLimit, blankByMethod]);
  const dups = useMemo(() => duplicatePairs(assays, symbol, elementUnits, undefined, { minMean: pairFloor, repeatedIntervals: repeatedAsDup }), [assays, symbol, elementUnits, pairFloor, repeatedAsDup]);
  const dupSummary = useMemo(() => duplicateSummary(dups, DUP_RPD_LIMITS), [dups]); // #534 — per duplicate type
  const dupLimit = (d) => DUP_RPD_LIMITS[d.kind] ?? DUP_RPD_LIMITS.unknown;

  // TASKS.csv #1675 — what sample types the file carries, and pXRF against the lab interval holding each reading
  const typesSeen = useMemo(() => sampleTypesSeen(assays), [assays]);
  const pxrf = useMemo(() => pxrfVsLab(assays, assayElements, elementUnits), [assays, assayElements, elementUnits]);
  const hasMethodValues = useMemo(() => assays.some((a) => a.methodValues), [assays]); // #2629 — a file with an element by two methods
  const methods = useMemo(() => (hasMethodValues ? methodPairs(assays, symbol) : []), [assays, symbol, hasMethodValues]);
  const tabs = [...TABS, ...(hasMethodValues ? ["methods"] : []), ...(pxrf.readings ? ["pxrf"] : []), ...(majors.length >= MIN_MAJORS ? ["totals"] : [])]; // totals: #2506; methods: #2629
  const stepKeys = ["data", ...tabs];
  const tab = stepKeys[Math.min(at, stepKeys.length - 1)];
  const exportCount = tab === "totals" ? 0 : tab === "methods" ? methods.reduce((t, m) => t + m.n, 0) : tab === "pxrf" ? pxrf.rows.length : tab === "standards" ? (activeGroup ? series.points.length : 0) : tab === "blanks" ? blanks.length : dups.length; // #617
  const exportCSV = () => {
    let rows, name;
    if (tab === "methods") { // #2629
      rows = methods.flatMap((m) => m.pairs.map((p) => ({ element: symbol, unit, method_column: m.header, against: m.base || symbol, hole_id: p.hole_id, from: p.from, to: p.to, sample_id: p.sample_id ?? "", element_value: p.v1, method_value: p.v2, rpd_pct: +p.rpd.toFixed(2) })));
      name = `qaqc_method_pairs_${symbol}.csv`;
    } else if (tab === "pxrf") { // #1675
      rows = pxrf.rows.map((r) => ({ element: r.symbol, unit: r.unit, lab_intervals: r.n, pxrf_readings_averaged: r.readings, pxrf_readings_below_lod: r.belowLod /* #2355 */, pearson_r: r.r == null ? "" : +r.r.toFixed(3), spearman_rho: r.rho == null ? "" : +r.rho.toFixed(3), median_pxrf_over_lab: r.medianRatio == null ? "" : +r.medianRatio.toFixed(3), mean_pxrf: +r.meanPxrf.toPrecision(4), mean_lab: +r.meanLab.toPrecision(4) }));
      name = "qaqc_pxrf_vs_lab.csv";
    } else if (tab === "standards" && activeGroup) {
      rows = qaqcStandardRows(series.points, activeGroup.id, symbol); // #1083 — rows in lib, tested
      name = `qaqc_standard_${activeGroup.id}_${symbol}.csv`;
    } else if (tab === "blanks") {
      rows = qaqcBlankRows(blanks, symbol, blankLimit);
      name = `qaqc_blanks_${symbol}.csv`;
    } else {
      rows = qaqcDuplicateRows(dups, DUP_KIND_LABELS, dupLimit);
      name = `qaqc_duplicates_${symbol}.csv`;
    }
    if (!rows || !rows.length) return;
    // TASKS.csv #534 — what these figures were judged against travels with them
    const stamp = stampLines({ tool: "QAQC", version: APP_VERSION, epsg: stampEpsg(project) /* #2195 */, params: [
      `Element: ${symbol} (${unit}) | detection limit: ${dl ? `${dl} ${unit}` : "not set"}`,
      tab === "standards" && activeGroup ? `Standard ${activeGroup.id}: ${series.limits?.certified ? `certified mean ${series.limits.mean} ± ${series.limits.sd} (1 SD, from the certificate)` : "no certificate values: self-referencing mean ± 2SD/3SD"} | order: ${ordered.bySampleId ? "sample id" : "import order (no sample ids)"}` : "",
      tab === "blanks" ? (blankByMethod ? `Blank limit per method column: ${blankMult} x each method's detection limit (${methodLimits.map((m) => `${m.method ?? "main column"} ${m.limit == null ? `none, ${blankLimit ?? "not judged"}` : `${m.limit} -> ${Number((blankMult * m.limit).toPrecision(6))}`} ${unit}`).join("; ")})` /* #2772 */ : `Blank limit: ${dl ? `${blankMult} x DL = ${blankLimit} ${unit}` : (blankThreshold == null ? "none set (no detection limit, no manual threshold): blanks not judged" : `${blankThreshold} ${unit} (manual; no detection limit set)`)}`) : "",
      tab === "duplicates" ? `RPD limits by duplicate type: field ${DUP_RPD_LIMITS.field}%, coarse reject ${DUP_RPD_LIMITS.coarse}%, pulp ${DUP_RPD_LIMITS.pulp}%, type not stated ${DUP_RPD_LIMITS.unknown}% | pairs with a mean below ${pairFloor} ${unit} not counted` : "",
      `QC recognized from a sample-type column when present, else hole_id patterns: ${Object.entries(DEFAULT_QAQC_PATTERNS || {}).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join("/") : v}`).join("; ")}`,
    ] });
    saveFile({ suggestedName: name, filters: [{ name: "CSV", extensions: ["csv"] }], content: withStamp(toExportCsv(rows), stamp) });
  };

  // TASKS.csv #4088 (side 4, Main's list) — a StepDialog: Data (what was found, the element and its detection limit), then one step per check (Standards, Blanks, Duplicates, and
  // Method pairs / pXRF vs lab / Totals when the file has them); each check's step has Export as its one gold primary. Each step shows the blocks of its own key, as the tabs did.
  const elementPick = (
            <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Element")}<select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={{ ...sel, display: "block", marginTop: 4 }}>
                {assayElements.map((e) => <option key={e.symbol} value={e.symbol}>{elementOptionLabel(e.symbol, e.unit) /* #2914 */}</option>)}
              </select>
            </label>
  );
  const body = (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {tab === "data" && (<>
            <StepNumbers rows={[{ label: tr("Intervals"), value: assays.length.toLocaleString() }, { label: tr("Standards"), value: counts.standard }, { label: tr("Blanks"), value: counts.blank }, { label: tr("Duplicates"), value: counts.duplicate }]} />
              {typesSeen.length > 0 && <div style={{ marginTop: 2 }}>{tr("Sample types in the file: {list}.", { list: typesSeen.map(([t, n]) => `${t} ${n.toLocaleString()}`).join(", ") })}</div>}{/* #1675 — 'no QC here' told from 'QC not recognised' */}
              {(counts.standard + counts.blank + counts.duplicate) > 0 && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ cursor: "pointer" }}>{tr("Left out of the grade tools: list the ids")}</summary>
                  {["standard", "blank", "duplicate"].map((c) => excludedIds[c].length > 0 && (
                    <div key={c} style={{ marginTop: 3 }}><b>{c}s:</b> {excludedIds[c].map((e) => `${e.id} (${e.rows}${e.why === "name" ? ", by name" : ""})`).join(", ")}</div>
                  ))}
                  <div style={{ marginTop: 3 }}>{tr("A hole in the collars is never QC.")}</div>
                </details>
              )}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              {elementPick}
            {/* TASKS.csv #534 — the element's detection limit, saved with the project */}
            <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }} title={tr("The lab's lower limit; saved with the project.")}>{tr("Detection limit ({unit})", { unit: unitL })}<NumberInput allowEmpty min={0} onChange={(v) => setDetectionLimit(v ?? 0)} value={dl ?? null} placeholder={tr("not set")} style={{ ...sel, display: "block", marginTop: 4, width: 100 }} aria-label={tr("Detection limit")} />
            </label>
            {dlSuggestion.limit != null && dlSuggestion.limit !== dl && (
              <button type="button" onClick={() => setDetectionLimit(dlSuggestion.limit)} className="gs-btn gs-btn--sm" style={{ alignSelf: "flex-end" }} title={dlSuggestion.basis === "lt" ? (limitLooksConverted(dlSuggestion.limit) /* #2503 */ ? tr("{n} result(s) are '<' at {limit}, converted at import (from another unit or an oxide); the lab's limit is the round figure in the source file", { n: dlSuggestion.n, limit: formatLimit(dlSuggestion.limit) }) : tr("The lab reported {n} result(s) as '<{limit}'", { n: dlSuggestion.n, limit: formatLimit(dlSuggestion.limit) })) : tr("No '<x' results: the lowest reported value (an upper bound on the limit)")}>
                {dlSuggestion.basis === "lt" ? (limitLooksConverted(dlSuggestion.limit) ? tr("Use <{limit} (the '<' results, converted at import)", { limit: formatLimit(dlSuggestion.limit) }) : tr("Use the lab's <{limit}", { limit: formatLimit(dlSuggestion.limit) })) : dlSuggestion.basis === "floor" ? (dlSuggestion.gap /* #3222 — a reading of the data, not a fact of the file */ ? tr("Use {limit}: {pct} % sit on {floor}, the lowest value; the next, {next}, is over twice it.", { limit: formatLimit(dlSuggestion.limit), floor: formatLimit(dlSuggestion.floor), next: formatLimit(dlSuggestion.next), pct: Math.round(dlSuggestion.share * 100) }) : tr("Use {limit}: {pct} % sit on {floor}, the lowest value, read as half a limit; next value {next}.", { limit: formatLimit(dlSuggestion.limit), floor: formatLimit(dlSuggestion.floor), next: dlSuggestion.next == null ? "—" : formatLimit(dlSuggestion.next), pct: Math.round(dlSuggestion.share * 100) })) : tr("Use the lowest value {limit}", { limit: formatLimit(dlSuggestion.limit) })}
              </button>
            )}
            </div>
            {(dlSuggestion.basis === "step" || dlSuggestion.basis === "low") && ( /* TASKS.csv #2913 */
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, maxWidth: 420, alignSelf: "flex-end" }}>
                {dlSuggestion.basis === "step"
                  ? tr("{symbol} is reported to {step} {unit}, {n} zeros below it: a reporting step, not a limit.", { symbol, step: formatLimit(dlSuggestion.step), unit: unitL, n: dlSuggestion.zeros.toLocaleString() })
                  : tr("The lowest {symbol}, {min} {unit}, is far above the {step} reporting step: a low sample, not a limit.", { symbol, min: formatLimit(dlSuggestion.min), unit: unitL, step: formatLimit(dlSuggestion.step) })}
              </div>
            )}
            {methodLimits.length > 1 && new Set(methodLimits.map((m) => m.limit)).size > 1 && ( /* TASKS.csv #2732 */
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", lineHeight: 1.4, maxWidth: 520 }}>
                {tr("{symbol} joins {n} method columns with different limits: {list}.", { symbol, n: methodLimits.length, list: methodLimits.map((m) => `${m.method ?? tr("main column")} (${m.n.toLocaleString()}): ${m.limit == null ? "—" : formatLimit(m.limit)}`).join("; ") })}
              </div>
            )}
          <MoreFold summary={tr("How QC samples are found")} style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.5, borderTop: "1px solid var(--color-border)", paddingTop: 8 }}>{tr("QC samples are read from a sample-type column (standards grouped by a CRM / standard-name column if present), else from the hole_id (\"std\"/\"crm\"/\"oreas\"…, \"blank\"/\"blk\", \"dup\"); a collar-table hole is never QC. Duplicates pair by parent sample id, else hole and interval, else name. Certified limits are those you enter from each CRM's certificate.")}</MoreFold>{/* #3939 — the rules, behind their heading */}
          </>)}
          {["standards", "blanks", "duplicates", "methods"].includes(tab) && elementPick}
          {tab === "methods" && <MethodPairsTab methods={methods} symbol={symbol} unit={unitL} assays={assays} setAssays={setAssays || null} />}{/* #2629; swap: #2687 */}
          {tab === "totals" && <OxideTotalsTab assays={assays} majors={majors} setAssays={setAssays || null} sel={sel} tabBtn={tabBtn} />}{/* #2506 */}
          {tab === "pxrf" && ( /* TASKS.csv #1675 */
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              <div style={{ marginBottom: 6 }}>{tr("{p} of {n} pXRF reading(s) fall in a lab interval of their hole and are paired.", { p: pxrf.pairs, n: pxrf.readings })} {tr("Each lab interval counts once; readings below the detection limit are counted apart.")}</div>{/* #2355 */}
              {pxrf.rows.length ? (
                <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)" }}>
                  <thead><tr>{[tr("Element"), tr("Lab intervals"), tr("Readings"), tr("Below LOD"), tr("Spearman rank r"), tr("Pearson r"), tr("Median pXRF / lab"), tr("Mean pXRF"), tr("Mean lab")].map((h) => <th key={h} style={{ textAlign: "right", padding: "3px 8px", borderBottom: "1px solid var(--color-border)" }}>{h}</th>)}</tr></thead>
                  <tbody>{pxrf.rows.map((r) => <tr key={r.symbol}>{[`${r.symbol} (${gradeUnitLabel(r.symbol, r.unit)})`, r.n, r.readings, r.belowLod, r.rho == null ? "—" : r.rho.toFixed(2), r.r == null ? "—" : r.r.toFixed(2), r.medianRatio == null ? "—" : r.medianRatio.toFixed(2), +r.meanPxrf.toPrecision(3), +r.meanLab.toPrecision(3)].map((v, i) => <td key={i} style={{ textAlign: "right", padding: "2px 8px", color: i === 4 /* the rank r, after the #2355 columns */ && r.rho != null && r.rho < 0.5 ? "var(--color-warn-text-strong)" : undefined }}>{v}</td>)}</tr>)}</tbody>
                </table>
              ) : <div>{tr("No element has 10 pairs with both values.")}</div>}
            </div>
          )}
          {tab === "standards" && (
            groups.length === 0 ? (
              <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>{tr("No standard is inserted more than once.")}</div>
            ) : (
              <>
                <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr(groups.length === 1 ? "Standard (1 CRM)" : "Standard ({groups} CRMs)", { groups: groups.length }) /* #2033 */}<select value={activeGroup?.id || ""} onChange={(e) => setSelectedStdId(e.target.value)} style={{ ...sel, display: "block", marginTop: 4 }}>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.id} ({g.rows.length})</option>)}
                  </select>
                </label>
                {!series.limits ? (
                  <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>{tr("No {symbol} values found for this standard.", { symbol })}</div>
                ) : (
                  <>
                    <div style={label}>{tr("Control chart — {symbol} ({v}), {v2}", { symbol, v: gradeUnitLabel(symbol, elementUnits[symbol]) /* #3586 */, v2: series.limits.certified ? tr("certified mean ± 2SD/3SD") : tr("own mean ± 2SD/3SD") })}
                    </div>
                    {/* TASKS.csv #400 — certificate values, saved with the project */}
                    <CertInputs key={`${activeGroup.id}|${symbol}`} cert={cert} unit={unitL} onSave={(c) => setCrmCertificate?.(activeGroup.id, symbol, c)} />
                    <ControlChart points={series.points} limits={series.limits} />
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Plotted in {v}.", { v: ordered.bySampleId ? tr("sample-id order") : tr("import order") })}</div>
                    <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                      {series.limits.certified
                        ? <>{tr("Certified {mean} ± {sd} · observed mean {mean2} (SD {sd2}, n={n}) ·", { mean: series.limits.mean, sd: series.limits.sd, mean2: series.observed.mean.toFixed(3), sd2: series.observed.sd.toFixed(3), n: series.observed.n })}{" "}<b style={{ color: Math.abs(series.biasPct) > 5 ? "var(--color-danger-fg)" : "inherit" }}>{tr("bias {v}{biasPct}%", { v: series.biasPct >= 0 ? "+" : "", biasPct: series.biasPct.toFixed(1) })}</b>{Math.abs(series.biasPct) > 5 ? tr(" (over ±5%)") : ""}</>
                        : <>{tr("Mean {mean} · SD {sd} · n={n}", { mean: series.limits.mean.toFixed(3), sd: series.limits.sd.toFixed(3), n: series.limits.n })}</>}
                      {series.points.some((p) => p.outside2sd) && <span style={{ color: "var(--color-danger-alt)", marginLeft: 8 }}>{tr("{n} point(s) outside 2SD", { n: series.points.filter((p) => p.outside2sd).length })}</span>}
                    </div>
                  </>
                )}
              </>
            )
          )}

          {tab === "blanks" && (
            <>
              {dl ? (
                <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Contamination limit: multiple of the detection limit ({dl} {unit})", { dl: formatLimit(dl), unit: unitL }) /* #2503 */}<span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <NumberInput min={1} value={blankMult} onChange={(v) => setBlankMult(Math.max(1, v ?? 5))} style={{ ...sel, width: 70 }} aria-label={tr("Blank limit as a multiple of the detection limit")} />{tr("× DL =")}{" "}<b>{Number((blankMult * dl).toPrecision(4))} {unit}</b>
                  </span>
                </label>
              ) : (
                <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Contamination threshold ({unit})", { unit: unitL })}<NumberInput allowEmpty value={blankThreshold ?? null} placeholder={tr("none")} onChange={(v) => setBlankThreshold(v)} style={{ ...sel, display: "block", marginTop: 4, width: 100 }} />
                </label>
              )}
              {methodsDiffer && ( /* TASKS.csv #2772 */
                <label style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", margin: "6px 0" }}>
                  <input type="checkbox" checked={perMethod} onChange={(e) => setPerMethod(e.target.checked)} style={{ marginTop: 2 }} />
                  <span>{tr("Judge each blank against its own method's limit: {mult} × {list}", { mult: blankMult, list: methodLimits.map((m) => `${m.method ?? tr("main column")} ${m.limit == null ? "—" : formatLimit(m.limit)}`).join(", ") })}</span>
                  {perMethod && !dl && <NumberInput min={1} value={blankMult} onChange={(v) => setBlankMult(Math.max(1, v ?? 5))} style={{ ...sel, width: 60 }} aria-label={tr("Blank limit as a multiple of the detection limit")} />}
                </label>
              )}
              {methodsDiffer && perMethod && ( /* TASKS.csv #2881 — each method column's limit, typed (saved with the element) or read from its '<' results */
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", margin: "0 0 6px 22px" }}>
                  {methodLimits.map((m) => (
                    <label key={m.method ?? ""} style={{ display: "flex", alignItems: "center", gap: 4 }} title={m.typed ? tr("Typed; read from the '<' results: {v}", { v: m.read == null ? "—" : formatLimit(m.read) }) : tr("Read from the '<' results; type the lab's limit for this method to replace it")}>
                      {m.method ?? tr("main column")}
                      <NumberInput allowEmpty min={0} onChange={(v) => setMethodLimit(m.method, v ?? 0)} value={m.typed ? m.limit : null} placeholder={m.limit == null ? tr("not set") : formatLimit(m.limit)} style={{ ...sel, width: 80 }} aria-label={tr("Detection limit of {method}", { method: m.method ?? tr("main column") })} />
                    </label>
                  ))}
                </div>
              )}
              {!dl && blankThreshold == null && !blankByMethod && blanks.length > 0 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", margin: "6px 0" }}>{tr("No threshold: {n} blank(s) listed, not judged.", { n: blanks.length, unit: unitL, symbol })}</div>}{/* #2733 */}
              {blanks.length === 0 ? (
                <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>{tr("No blanks with a {symbol} value.", { symbol })}</div>
              ) : (
                <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" }}>
                  <thead><tr><th style={th}>{tr("Hole ID")}</th><th style={th}>{tr("From")}</th><th style={th}>{tr("To")}</th><th style={th}>{symbol}</th>{blankByMethod && <th style={th}>{tr("Method")}</th>}{blankByMethod && <th style={th}>{tr("Limit")}</th>}<th style={th}>{tr("Flag")}</th></tr></thead>
                  <tbody>
                    {blanks.map((b, i) => (
                      <tr key={i} style={b.flagged ? { background: "var(--color-danger-bg-soft)" } : undefined}>
                        <td style={td}>{b.hole_id}</td><td style={td}>{b.from}</td><td style={td}>{b.to}</td>
                        <td style={{ ...td, color: b.flagged ? "var(--color-danger-fg)" : "var(--color-text)" }}>{b.value.toFixed(4)}</td>
                        {blankByMethod && <td style={td}>{b.method ?? tr("main column")}</td>}{blankByMethod && <td style={td}>{b.limit == null ? "—" : formatLimit(b.limit)}</td>}{/* #2772 */}
                        <td style={td}>{(blankByMethod ? b.limit : blankLimit) == null ? "—" /* #2733 — not judged */ : b.flagged ? tr("⚠ contaminated") : tr("ok")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* TASKS.csv #579 */}
          {tab === "duplicates" && (
            <label style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}
              title={tr("The first row is the original; identical rows are skipped.")}>
              <input type="checkbox" checked={repeatedAsDup} onChange={(e) => setRepeatedAsDup(e.target.checked)} style={{ marginTop: 2 }} />
              <span>{!repeatedAsDup && dups.repeatedRows > 0 ? tr("{n} repeated same-interval row(s): tick to read them as duplicate pairs", { n: dups.repeatedRows.toLocaleString() }) /* #3230 */ : tr("Repeated same-interval rows as duplicate pairs{v}", { v: repeatedAsDup ? tr(" — {n} pair(s) found{v}", { n: dups.filter((p) => p.how === "repeated interval").length, v: dups.identicalRepeats ? tr(", {identicalRepeats} identical repeat(s) skipped as double imports", { identicalRepeats: dups.identicalRepeats }) : "" }) : "" })}</span>
            </label>
          )}
          {tab === "duplicates" && dups.repeatedRows > 0 && ( /* TASKS.csv #3549 — QC links step 2: the repeated intervals of assays with no sample ids, suggested as duplicate pairs and marked only as the user confirms them */
            <div style={{ margin: "4px 0" }}>
              {!reviewOpen && <button type="button" className="gs-btn gs-btn--sm" onClick={() => setReviewOpen(true)} title={tr("Writes a sample type and a parent id on the second row of each pair you tick.")}>{tr("Review {n} repeated interval(s) and mark duplicates…", { n: fmtNum(dups.repeatedRows) })}</button>}
              {reviewOpen && <QcPairReview assays={assays} symbol={symbol} unit={unit} elementUnits={elementUnits} unitLabel={unitL} onClose={() => setReviewOpen(false)}
                onApply={(rows, marked) => { setAssays?.(rows); setReviewNote(tr("{n} pair(s) marked: the second row of each is now a field duplicate of the first.", { n: fmtNum(marked) })); setReviewOpen(false); }} />}
              {reviewNote && <div role="status" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-success-text)", marginTop: 4 }}>{reviewNote}</div>}
            </div>
          )}
          {tab === "duplicates" && (
            dups.length === 0 ? (
              <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>{tr("No duplicate pairs: a duplicate needs an original at the same hole and interval.")}</div>
            ) : (
              <>
                <div style={label}>{tr("Relative % difference (RPD) — {symbol}, {dups} {v}", { symbol, dups: dups.length, v: tr(dups.length === 1 ? "pair" : "pairs") })}</div>
                <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }} title={tr("RPD near the detection limit is meaningless. Pairs below this mean are greyed and not counted.")}>{tr("Ignore pairs below ({unit}){v}", { unit: unitL, v: dl ? tr(" — default 10 × DL = {v}", { v: Number((10 * dl).toPrecision(4)) }) : tr(", e.g. 10× detection limit") })}
                  <NumberInput allowEmpty min={0} value={dupMin} placeholder={dl ? String(Number((10 * dl).toPrecision(4))) : "0"} onChange={(v) => setDupMin(v == null ? "" : String(v))} style={{ ...sel, display: "block", marginTop: 4, width: 100 }} aria-label={tr("Minimum pair mean")} />
                </label>
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)" }}>
                  {dupSummary.used ? tr("{within} of {used} counted pairs ({pctWithin}%) within their limit", { within: dupSummary.within, used: dupSummary.used, pctWithin: dupSummary.pctWithin.toFixed(0) }) : tr("No pairs above the limit")}{dupSummary.below ? tr(" · {below} below the limit, not counted", { below: dupSummary.below }) : ""}.
                  {Object.entries(dupSummary.byKind || {}).map(([k, b]) => <span key={k} style={{ marginLeft: 8, color: "var(--color-text-secondary)" }}>{DUP_KIND_LABELS[k]} (≤{b.limit}%): {b.within}/{b.used}</span>)}
                </div>
                <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" }}>
                  <thead><tr><th style={th}>{tr("Original")}</th><th style={th}>{tr("Duplicate")}</th><th style={th}>{tr("Type")}</th><th style={th}>{tr("Interval")}</th><th style={th}>V1</th><th style={th}>V2</th><th style={th}>{tr("RPD %")}</th></tr></thead>
                  <tbody>
                    {dups.map((d, i) => (
                      <tr key={i} style={d.belowLimit ? { opacity: 0.45 } : d.rpd > dupLimit(d) ? { background: "var(--color-danger-bg-soft)" } : undefined} title={tr("paired by {how}{v}", { how: d.how, v: d.belowLimit ? tr("; below the limit, not counted") : "" })}>
                        <td style={td}>{d.original_hole}</td><td style={td}>{d.duplicate_hole}</td><td style={td}>{DUP_KIND_LABELS[d.kind]} (≤{dupLimit(d)}%)</td>
                        <td style={td}>{d.from}–{d.to}</td>
                        <td style={td}>{d.v1.toFixed(4)}</td><td style={td}>{d.v2.toFixed(4)}</td>
                        <td style={{ ...td, color: d.rpd > dupLimit(d) ? "var(--color-danger-fg)" : "var(--color-text)" }}>{d.rpd.toFixed(1)}{d.rpd > dupLimit(d) ? " ⚠" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("Limits: field {field}%, coarse reject {coarse}%, pulp {pulp}% ({unknown}% if not stated).", { field: DUP_RPD_LIMITS.field, coarse: DUP_RPD_LIMITS.coarse, pulp: DUP_RPD_LIMITS.pulp, unknown: DUP_RPD_LIMITS.unknown })}</div>
              </>
            )
          )}
    </div>
  );
  const steps = stepKeys.map((key, i) => ({ key, label: STEP_LABEL[key](), render: () => body,
    primary: i === 0 ? { label: tr("Next") } : { label: tr("Export current view (CSV)"), onClick: exportCSV, disabled: !exportCount } }));
  return <StepDialog title={tr("QAQC — lab quality control")} onClose={onClose} steps={steps} at={at} onAt={setAt} width="min(900px, 96vw)" help={<DialogHelpCard page="qaqc" lines={[]} />} />;
}

// TASKS.csv #400 — the certificate's mean and 1 SD for this standard + element
function CertInputs({ cert, unit, onSave }) {
  const [mean, setMean] = useState(cert?.mean ?? "");
  const [sd, setSd] = useState(cert?.sd ?? "");
  const ok = mean !== "" && Number.isFinite(Number(mean)) && Number(sd) > 0;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
      <label>{tr("Certified mean ({unit})", { unit })}<NumberInput allowEmpty value={mean} onChange={(v) => setMean(v == null ? "" : String(v))} style={{ ...sel, display: "block", marginTop: 4, width: 100 }} aria-label={tr("Certified mean")} /></label>
      <label>{tr("Certified 1 SD")}<NumberInput allowEmpty min={0} value={sd} onChange={(v) => setSd(v == null ? "" : String(v))} style={{ ...sel, display: "block", marginTop: 4, width: 100 }} aria-label={tr("Certified standard deviation")} /></label>
      <button type="button" disabled={!ok} onClick={() => onSave({ mean: Number(mean), sd: Number(sd) })} className="gs-btn gs-btn--sm" style={{ opacity: ok ? 1 : 0.5 }}>{tr("Use certificate")}</button>
      {cert && <button type="button" onClick={() => { setMean(""); setSd(""); onSave(null); }} className="gs-btn gs-btn--sm">{tr("Clear")}</button>}
    </div>
  );
}

function ControlChart({ points, limits }) {
  const w = 640, h = 200, padL = 50, padR = 10, padT = 14, padB = 24;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const vMin = Math.min(limits.lcl3, arrMin(points.map((p) => p.value)));
  const vMax = Math.max(limits.ucl3, arrMax(points.map((p) => p.value)));
  const range = (vMax - vMin) || 1;
  const y = (v) => padT + plotH - ((v - vMin) / range) * plotH;
  const x = (i) => points.length > 1 ? padL + (i / (points.length - 1)) * plotW : padL + plotW / 2;
  const band = (lo, hi, fill) => <rect x={padL} y={y(hi)} width={plotW} height={Math.max(0, y(lo) - y(hi))} fill={fill} />;
  return (
    <svg width={w} height={h} style={{ maxWidth: "100%" }}>
      {band(limits.lcl3, limits.ucl3, "rgba(217,83,79,0.08)")}
      {band(limits.lcl2, limits.ucl2, "rgba(226,166,60,0.12)")}
      <line x1={padL} y1={y(limits.mean)} x2={w - padR} y2={y(limits.mean)} stroke="#1e5a9c" strokeWidth="1.5" />
      <line x1={padL} y1={y(limits.ucl2)} x2={w - padR} y2={y(limits.ucl2)} stroke="#e2a63c" strokeWidth="1" strokeDasharray="4,3" />
      <line x1={padL} y1={y(limits.lcl2)} x2={w - padR} y2={y(limits.lcl2)} stroke="#e2a63c" strokeWidth="1" strokeDasharray="4,3" />
      <line x1={padL} y1={y(limits.ucl3)} x2={w - padR} y2={y(limits.ucl3)} stroke="#d9534f" strokeWidth="1" strokeDasharray="2,3" />
      <line x1={padL} y1={y(limits.lcl3)} x2={w - padR} y2={y(limits.lcl3)} stroke="#d9534f" strokeWidth="1" strokeDasharray="2,3" />
      {points.length > 1 && (
        <polyline fill="none" stroke="#55606e" strokeWidth="1" points={points.map((p) => `${x(p.i)},${y(p.value)}`).join(" ")} />
      )}
      {points.map((p) => (
        <circle key={p.i} cx={x(p.i)} cy={y(p.value)} r={4} fill={p.outside3sd ? "#d9534f" : p.outside2sd ? "#e2a63c" : "#4a9be0"} stroke="#ffffff" strokeWidth="1" />
      ))}
      <text x={padL - 6} y={y(limits.mean) + 4} fontSize={fontSizes.xs} fill="#1e5a9c" textAnchor="end">{tr("mean")}</text>
    </svg>
  );
}

const label = { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 8 };
const sel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const tabBtn = { padding: "6px 10px", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-secondary)" };
const th = { padding: "4px 8px", color: "var(--color-text-secondary)", fontWeight: 500, textAlign: "right", borderBottom: "1px solid var(--color-border)" };
const td = { padding: "4px 8px", color: "var(--color-text)", textAlign: "right", fontFamily: "'Exo 2', system-ui, sans-serif" };
