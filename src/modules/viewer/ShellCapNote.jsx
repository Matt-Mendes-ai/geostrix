// TASKS.csv #2222 (review #2174, WA gold) — the grade shell ran uncapped by default on a 585 %-CV gold population (700 g/t assays) while
// Estimation on the same data starts capped at P99 (#1573). The same decision here: a lab assay element whose coefficient of variation is
// over 150 % starts capped at its length-weighted P99, said under the field; emptying the field runs uncapped for that element (not refilled
// until another element is chosen, which clears the cap, #1736), and that is said too. Logs and numeric layer fields are not capped here.
import React, { useEffect, useMemo, useRef } from "react";
import { lengthWeightedPercentile, elementCvPct, CAP_CV_PCT, valueIn } from "../../lib/geochem.js"; // elementCvPct / CAP_CV_PCT: #2222; valueIn: #3781
import { excludeQAQC } from "../../lib/qaqc.js";
import { shellCapAction, defaultShellCap } from "../../lib/viewer/shellCapRule.js"; // TASKS.csv #3650; defaultShellCap: #3781
import { t as tr } from "../../lib/i18n.js";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", lineHeight: 1.45, marginTop: -2, marginBottom: 6 };

export default function ShellCapNote({ assays, symbol, unit, assayElements, includeQAQC, isAssay, capValue, setCapValue, autoRef = null, cutoff = null /* #3781 */ }) {
  const src = useMemo(() => (!isAssay ? [] : includeQAQC ? (assays || []).filter((a) => a.source !== "pXRF") : excludeQAQC(assays || [])), [assays, includeQAQC, isAssay]);
  const cv = useMemo(() => (isAssay && symbol ? elementCvPct(src, symbol) : null), [src, symbol, isAssay]);
  const ownRef = useRef({ symbol: null, value: null });
  const auto = autoRef || ownRef; // the cap this note set, for which element; #3272 — kept by the pane (autoRef), so a reopened pane still knows it
  // TASKS.csv #3272 (Galore Creek review) — `assays` are the holes the run uses (Model area): P99 22,900 / CV 209 % was the whole project's, the
  // 14 checked holes' are 25,600 / 154 %. A cap this note set follows them when they change (the area, the checks); a typed or emptied cap stays.
  useEffect(() => {
    if (!isAssay || !symbol) return;
    // #3272 / #3650 — keep a typed or emptied cap; refill or clear one this note set (for this element, or for another: lib/viewer/shellCapRule.js)
    const act = shellCapAction({ symbol, auto: auto.current, capValue, over: cv > CAP_CV_PCT });
    if (act === "clear") { auto.current = { symbol: null, value: null }; setCapValue(NaN); return; }
    if (act === "keep") return;
    const units = Object.fromEntries((assayElements || []).map((e) => [e.symbol, e.unit]));
    const p99 = lengthWeightedPercentile(src, symbol, unit, units, 99);
    // TASKS.csv #3781 — never a default cap at or below the cut-off: then the P99 of the samples at or above it
    const above = cutoff > 0 && p99 <= cutoff ? src.filter((a) => { const v = valueIn(a, symbol, unit, units); return v != null && v >= cutoff; }) : null;
    const d = defaultShellCap(p99, above ? lengthWeightedPercentile(above, symbol, unit, units, 99) : null, cutoff);
    if (d) { const v = Number(d.value.toPrecision(4)); auto.current = { symbol, value: v, lifted: d.lifted ? Number(p99.toPrecision(4)) : null }; if (v !== capValue) setCapValue(v); }
    else if (auto.current?.symbol === symbol && capValue === auto.current.value) { auto.current = { symbol: null, value: null }; setCapValue(NaN); }
  }, [symbol, cv, src, cutoff]); // the element, its CV, or the holes (#3272), as in the Estimation dialog; the cut-off: #3781
  if (!isAssay || !(cv > CAP_CV_PCT)) return null;
  const cvText = Math.round(cv);
  if (Number.isFinite(capValue) && capValue > 0) {
    if (auto.current.symbol === symbol && auto.current.value === capValue && auto.current.lifted != null) // #3781
      return <div style={note}>{tr("Capped at {cap} by default: the P99 of the samples at or above the {cutoff} cut-off. The whole column's P99 ({p99}) is not above the cut-off and would cap every sample under it. Clear the cap to run uncapped; the result says which.", { cap: capValue, cutoff, p99: auto.current.lifted })}</div>;
    return auto.current.symbol === symbol && auto.current.value === capValue
      ? <div style={note}>{tr("Capped at P99 = {cap} by default: this element's coefficient of variation is {cv}%. Clear the cap to run uncapped; the result says which.", { cap: capValue, cv: cvText })}</div>
      : Number.isFinite(cutoff) && cutoff > 0 && capValue <= cutoff ? <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("The cap ({cap}) is not above the {cutoff} cut-off: every sample is capped under it and the shell has nothing to enclose. Raise or clear the cap.", { cap: capValue, cutoff })}</div> : null; // #3781 — a typed cap under the cut-off, said before Run
  }
  return <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("Running uncapped: this element's coefficient of variation is {cv}%, so a few high assays can drive the shell. Estimation caps it at P99 by default.", { cv: cvText })}</div>;
}
