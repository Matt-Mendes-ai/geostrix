import React, { useMemo, useState } from "react";
import { X, Download } from "./icons.js";
import { saveFile } from "../lib/desktop.js";
import { classifyQAQCRow, excludedQAQCIds, standardGroups, standardSeries, blankRows, duplicatePairs, duplicateSummary, DUP_RPD_LIMITS, DUP_KIND_LABELS, suggestDetectionLimit, orderForControlChart, DEFAULT_QAQC_PATTERNS } from "../lib/qaqc.js";
import { stampLines, withStamp } from "../lib/provenance.js"; // TASKS.csv #534 — stamped exports
import { version as APP_VERSION } from "../../package.json";
import { useStore } from "../lib/store.jsx"; // TASKS.csv #400 — certified values live in the project
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements

// TASKS.csv #134 — lab QAQC dashboard (standards/blanks/duplicates), distinct from dataQC.js's
// geometric QC. See qaqc.js's header comment for the identification approach (hole_id naming
// convention, no external CRM certificate database) and its accepted first-pass limitations.
const TABS = ["standards", "blanks", "duplicates"];
import { arrMin, arrMax } from "../lib/arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)
import { fontSizes } from "../lib/theme.js"; // TASKS.csv #385 — SVG font-size attributes on the type scale
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { toExportCsv } from "../lib/tabular.js"; // TASKS.csv #1022 — every exported CSV: all columns, formula cells escaped
import { qaqcStandardRows, qaqcBlankRows, qaqcDuplicateRows } from "../lib/analysisExports.js"; // TASKS.csv #1083

export default function QAQCPanel({ assays, assayElements, onClose }) {
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const [symbol, setSymbol] = useState(assayElements[0]?.symbol || "");
  const [tab, setTab] = useState("standards");
  const [blankThreshold, setBlankThreshold] = useState(0.1);
  const [selectedStdId, setSelectedStdId] = useState(null);
  const { crmCertificates = {}, setCrmCertificate, setAssayElements, project } = useStore() || {}; // #400
  const [dupMin, setDupMin] = useState(""); // #400 — ignore pairs whose mean is below this (~10x detection limit)
  const [repeatedAsDup, setRepeatedAsDup] = useState(false); // #579 — same-interval second rows as duplicate pairs
  // TASKS.csv #534 — a detection limit PER ELEMENT, saved with the element list (assayElements[].detectionLimit, so the
  // project format does not change). The blank limit becomes a multiple of it (default 5x DL) and the duplicate pair
  // floor defaults to 10x DL; without a DL the old manual threshold applies. Units: the element's own.
  const unit = elementUnits[symbol] || "ppm";
  const dl = assayElements.find((e) => e.symbol === symbol)?.detectionLimit ?? null;
  const dlSuggestion = useMemo(() => suggestDetectionLimit(assays, symbol), [assays, symbol]);
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

  const blanks = useMemo(() => blankRows(assays, symbol, elementUnits, blankLimit), [assays, symbol, elementUnits, blankLimit]);
  const dups = useMemo(() => duplicatePairs(assays, symbol, elementUnits, undefined, { minMean: pairFloor, repeatedIntervals: repeatedAsDup }), [assays, symbol, elementUnits, pairFloor, repeatedAsDup]);
  const dupSummary = useMemo(() => duplicateSummary(dups, DUP_RPD_LIMITS), [dups]); // #534 — per duplicate type
  const dupLimit = (d) => DUP_RPD_LIMITS[d.kind] ?? DUP_RPD_LIMITS.unknown;

  const exportCount = tab === "standards" ? (activeGroup ? series.points.length : 0) : tab === "blanks" ? blanks.length : dups.length; // #617
  const exportCSV = () => {
    let rows, name;
    if (tab === "standards" && activeGroup) {
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
    const stamp = stampLines({ tool: "QAQC", version: APP_VERSION, epsg: project?.epsg, params: [
      `Element: ${symbol} (${unit}) | detection limit: ${dl ? `${dl} ${unit}` : "not set"}`,
      tab === "standards" && activeGroup ? `Standard ${activeGroup.id}: ${series.limits?.certified ? `certified mean ${series.limits.mean} ± ${series.limits.sd} (1 SD, from the certificate)` : "no certificate values: self-referencing mean ± 2SD/3SD"} | order: ${ordered.bySampleId ? "sample id" : "import order (no sample ids)"}` : "",
      tab === "blanks" ? `Blank limit: ${dl ? `${blankMult} x DL = ${blankLimit} ${unit}` : `${blankThreshold} ${unit} (manual; no detection limit set)`}` : "",
      tab === "duplicates" ? `RPD limits by duplicate type: field ${DUP_RPD_LIMITS.field}%, coarse reject ${DUP_RPD_LIMITS.coarse}%, pulp ${DUP_RPD_LIMITS.pulp}%, type not stated ${DUP_RPD_LIMITS.unknown}% | pairs with a mean below ${pairFloor} ${unit} not counted` : "",
      `QC recognized from a sample-type column when present, else hole_id patterns: ${Object.entries(DEFAULT_QAQC_PATTERNS || {}).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join("/") : v}`).join("; ")}`,
    ] });
    saveFile({ suggestedName: name, filters: [{ name: "CSV", extensions: ["csv"] }], content: withStamp(toExportCsv(rows), stamp) });
  };

  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("QAQC — lab quality control")}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("Detected (a sample-type column if the assays have one, else the ID; never a hole that is in the collars): {s} standard(s), {b} blank(s), {d} duplicate(s), of {n} intervals in all.", { s: counts.standard, b: counts.blank, d: counts.duplicate, n: assays.length })}{/* #1119 — one sentence (it was glued from fragments, wrong word order in French / Arabic) */}{/* TASKS.csv #400 — exactly which ids are left out of the reports, and why */}
              {(counts.standard + counts.blank + counts.duplicate) > 0 && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ cursor: "pointer" }}>{tr("Excluded from intercepts, compositing, estimation and statistics — list the ids")}</summary>
                  {["standard", "blank", "duplicate"].map((c) => excludedIds[c].length > 0 && (
                    <div key={c} style={{ marginTop: 3 }}><b>{c}s:</b> {excludedIds[c].map((e) => `${e.id} (${e.rows}${e.why === "name" ? ", by name" : ""})`).join(", ")}</div>
                  ))}
                  <div style={{ marginTop: 3 }}>{tr("If a real hole is listed \"by name\", import its collar: holes in the collar table are never treated as QC.")}</div>
                </details>
              )}
            </div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Element")}<select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={{ ...sel, display: "block", marginTop: 4 }}>
                {assayElements.map((e) => <option key={e.symbol} value={e.symbol}>{e.symbol}</option>)}
              </select>
            </label>
            {/* TASKS.csv #534 — the element's detection limit, saved with the project */}
            <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }} title={tr("The lab's lower detection limit for this element. Blanks are judged against a multiple of it and duplicate pairs near it are not counted. Saved with the project.")}>{tr("Detection limit ({unit})", { unit })}<input key={`${symbol}|${dl}`} type="number" min={0} step="any" defaultValue={dl ?? ""} placeholder={tr("not set")} onBlur={(e) => setDetectionLimit(Number(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} style={{ ...sel, display: "block", marginTop: 4, width: 100 }} aria-label={tr("Detection limit")} />
            </label>
            {dlSuggestion.limit != null && dlSuggestion.limit !== dl && (
              <button type="button" onClick={() => setDetectionLimit(dlSuggestion.limit)} style={{ ...tabBtn, alignSelf: "flex-end" }} title={dlSuggestion.basis === "lt" ? tr("The lab reported {n} result(s) as '<{limit}'", { n: dlSuggestion.n, limit: dlSuggestion.limit }) : tr("No '<x' results: the lowest reported value (an upper bound on the limit)")}>
                {dlSuggestion.basis === "lt" ? tr("Use the lab's <{limit}", { limit: dlSuggestion.limit }) : tr("Use the lowest value {limit}", { limit: dlSuggestion.limit })}
              </button>
            )}
            <div style={{ display: "flex", gap: 4 }}>
              {TABS.map((t) => (
                <button key={t} onClick={() => setTab(t)} style={t === tab ? tabBtnActive : tabBtn}>
                  {t === "standards" ? tr("Standards ({groups})", { groups: groups.length }) : t === "blanks" ? tr("Blanks ({blank})", { blank: counts.blank }) : tr("Duplicates ({dups})", { dups: dups.length })}
                </button>
              ))}
            </div>
          </div>

          {tab === "standards" && (
            groups.length === 0 ? (
              <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>{tr("No repeated standard insertions found. Standards are detected by hole_id containing \"std\", \"crm\", \"oreas\", etc. — a standard inserted only once has nothing to compare it against.")}</div>
            ) : (
              <>
                <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Standard")}<select value={activeGroup?.id || ""} onChange={(e) => setSelectedStdId(e.target.value)} style={{ ...sel, display: "block", marginTop: 4 }}>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.id} ({g.rows.length})</option>)}
                  </select>
                </label>
                {!series.limits ? (
                  <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>{tr("No {symbol} values found for this standard.", { symbol })}</div>
                ) : (
                  <>
                    <div style={label}>{tr("Control chart — {symbol} ({v}), {v2}", { symbol, v: elementUnits[symbol] || tr("ppm"), v2: series.limits.certified ? tr("CERTIFIED mean ± 2SD/3SD (from the certificate)") : tr("self-referencing mean ± 2SD/3SD (enter the certificate values below for certified limits)") })}
                    </div>
                    {/* TASKS.csv #400 — certificate values, saved with the project */}
                    <CertInputs key={`${activeGroup.id}|${symbol}`} cert={cert} unit={elementUnits[symbol] || "ppm"} onSave={(c) => setCrmCertificate?.(activeGroup.id, symbol, c)} />
                    <ControlChart points={series.points} limits={series.limits} />
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Plotted in {v}.", { v: ordered.bySampleId ? tr("sample-id order") : tr("the order the rows were imported (no sample ids: re-imports and merges can reorder them)") })}</div>
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
                <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Contamination limit: multiple of the detection limit ({dl} {unit})", { dl, unit })}<span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <input type="number" min={1} step="any" value={blankMult} onChange={(e) => setBlankMult(Math.max(1, Number(e.target.value) || 5))} style={{ ...sel, width: 70 }} aria-label={tr("Blank limit as a multiple of the detection limit")} />{tr("× DL =")}{" "}<b>{Number((blankMult * dl).toPrecision(4))} {unit}</b>
                  </span>
                </label>
              ) : (
                <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Contamination threshold ({unit}) — set the element's detection limit above to judge blanks against a multiple of it (5x DL)", { unit })}<input type="number" step="any" value={blankThreshold} onChange={(e) => setBlankThreshold(Number(e.target.value))} style={{ ...sel, display: "block", marginTop: 4, width: 100 }} />
                </label>
              )}
              {blanks.length === 0 ? (
                <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>{tr("No blanks found (hole_id containing \"blank\"/\"blk\"), or none have a {symbol} value.", { symbol })}</div>
              ) : (
                <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" }}>
                  <thead><tr><th style={th}>{tr("Hole ID")}</th><th style={th}>{tr("From")}</th><th style={th}>{tr("To")}</th><th style={th}>{symbol}</th><th style={th}>{tr("Flag")}</th></tr></thead>
                  <tbody>
                    {blanks.map((b, i) => (
                      <tr key={i} style={b.flagged ? { background: "var(--color-danger-bg-soft)" } : undefined}>
                        <td style={td}>{b.hole_id}</td><td style={td}>{b.from}</td><td style={td}>{b.to}</td>
                        <td style={{ ...td, color: b.flagged ? "var(--color-danger-fg)" : "var(--color-text)" }}>{b.value.toFixed(4)}</td>
                        <td style={td}>{b.flagged ? "⚠ contaminated" : "ok"}</td>
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
              title={tr("Older and government (ARIS) exports often store a duplicate as a second row for the same hole and interval, with no sample-type column. Tick this to measure those as duplicate pairs: the first row is the original, a later row with a different result is the duplicate. Identical rows are double imports and are skipped.")}>
              <input type="checkbox" checked={repeatedAsDup} onChange={(e) => setRepeatedAsDup(e.target.checked)} style={{ marginTop: 2 }} />
              <span>{tr("Treat repeated same-interval rows as duplicate pairs (1st = original, 2nd = duplicate){v}", { v: repeatedAsDup ? tr(" — {n} pair(s) found{v}", { n: dups.filter((p) => p.how === "repeated interval").length, v: dups.identicalRepeats ? tr(", {identicalRepeats} identical repeat(s) skipped as double imports", { identicalRepeats: dups.identicalRepeats }) : "" }) : "" })}</span>
            </label>
          )}
          {tab === "duplicates" && (
            dups.length === 0 ? (
              <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>{tr("No duplicate pairs found — a duplicate row (hole_id containing \"dup\") needs a matching original row at the exact same hole_id/from/to (see info).")}</div>
            ) : (
              <>
                <div style={label}>{tr("Relative % difference (RPD) — {symbol}, {dups} {v}", { symbol, dups: dups.length, v: tr(dups.length === 1 ? "pair" : "pairs") })}</div>
                <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }} title={tr("RPD near the detection limit is meaningless. Pairs below this mean are greyed and not counted.")}>{tr("Ignore pairs with a mean below ({unit}){v}", { unit, v: dl ? tr(" — default 10 × DL = {v}", { v: Number((10 * dl).toPrecision(4)) }) : tr(", e.g. 10× detection limit") })}
                  <input type="number" min={0} step="any" value={dupMin} placeholder={dl ? String(Number((10 * dl).toPrecision(4))) : "0"} onChange={(e) => setDupMin(e.target.value)} style={{ ...sel, display: "block", marginTop: 4, width: 100 }} aria-label={tr("Minimum pair mean")} />
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
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("Flagged above the usual precision limit for the duplicate's type, read from its sample type: field {field}%, coarse reject {coarse}%, pulp {pulp}% ({unknown}% when the type isn't stated) — industry rules of thumb, not certified or regulatory limits.", { field: DUP_RPD_LIMITS.field, coarse: DUP_RPD_LIMITS.coarse, pulp: DUP_RPD_LIMITS.pulp, unknown: DUP_RPD_LIMITS.unknown })}</div>
              </>
            )
          )}

          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.5, borderTop: "1px solid var(--color-border)", paddingTop: 8 }}>{tr("QC samples are recognized from a sample-type column when the assay file has one (standards grouped by a CRM / standard-name column if present), otherwise from the hole_id (standards \"std\"/\"crm\"/\"oreas\"…, blanks \"blank\"/\"blk\", duplicates \"dup\"); a hole in the collar table is never QC. Duplicates pair by parent sample id, else the same hole and interval, else the name. Certified limits come from the values you enter from each CRM's certificate.")}</div>

          {/* TASKS.csv #617 — with nothing in the current view, Export used to do nothing at all when clicked */}
          <button onClick={exportCSV} disabled={!exportCount} title={exportCount ? tr("Export the {exportCount} row(s) in this view", { exportCount }) : tr("Nothing to export: this view has no {v}", { v: tab === "standards" ? tr("standard results") : tab })} style={{ ...btn(true), alignSelf: "flex-start", padding: "7px 14px", display: "flex", alignItems: "center", gap: 6, opacity: exportCount ? 1 : 0.5, cursor: exportCount ? "pointer" : "not-allowed" }}>
            <Download size={14} />{" "}{tr("Export current view (CSV)")}</button>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>{tr("Close")}</button>
        </div>
      </div>
    </div>
  );
}

// TASKS.csv #400 — the certificate's mean and 1 SD for this standard + element
function CertInputs({ cert, unit, onSave }) {
  const [mean, setMean] = useState(cert?.mean ?? "");
  const [sd, setSd] = useState(cert?.sd ?? "");
  const ok = mean !== "" && Number.isFinite(Number(mean)) && Number(sd) > 0;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
      <label>{tr("Certified mean ({unit})", { unit })}<input type="number" step="any" value={mean} onChange={(e) => setMean(e.target.value)} style={{ ...sel, display: "block", marginTop: 4, width: 100 }} aria-label={tr("Certified mean")} /></label>
      <label>{tr("Certified 1 SD")}<input type="number" step="any" min={0} value={sd} onChange={(e) => setSd(e.target.value)} style={{ ...sel, display: "block", marginTop: 4, width: 100 }} aria-label={tr("Certified standard deviation")} /></label>
      <button type="button" disabled={!ok} onClick={() => onSave({ mean: Number(mean), sd: Number(sd) })} style={{ ...tabBtn, opacity: ok ? 1 : 0.5 }}>{tr("Use certificate")}</button>
      {cert && <button type="button" onClick={() => { setMean(""); setSd(""); onSave(null); }} style={tabBtn}>{tr("Clear")}</button>}
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

const panel = { width: "min(820px, 95vw)", maxHeight: "88vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const label = { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 8 };
const sel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: primary ? "1px solid var(--color-success-border)" : "1px solid var(--color-border-light)", background: primary ? "var(--color-success-bg)" : "transparent", color: primary ? "var(--color-success-text)" : "var(--color-text-secondary)" });
const tabBtn = { padding: "6px 10px", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-secondary)" };
const tabBtnActive = { ...tabBtn, background: "var(--color-text)", color: "var(--color-bg)", border: "1px solid var(--color-text)" };
const th = { padding: "4px 8px", color: "var(--color-text-secondary)", fontWeight: 500, textAlign: "right", borderBottom: "1px solid var(--color-border)" };
const td = { padding: "4px 8px", color: "var(--color-text)", textAlign: "right", fontFamily: "'Exo 2', system-ui, sans-serif" };
