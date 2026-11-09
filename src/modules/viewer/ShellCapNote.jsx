// TASKS.csv #2222 (review #2174, WA gold) — the grade shell ran uncapped by default on a 585 %-CV gold population (700 g/t assays) while
// Estimation on the same data starts capped at P99 (#1573). The same decision here: a lab assay element whose coefficient of variation is
// over 150 % starts capped at its length-weighted P99, said under the field; emptying the field runs uncapped for that element (not refilled
// until another element is chosen, which clears the cap, #1736), and that is said too. Logs and numeric layer fields are not capped here.
import React, { useEffect, useMemo, useRef } from "react";
import { lengthWeightedPercentile, elementCvPct, CAP_CV_PCT } from "../../lib/geochem.js"; // elementCvPct / CAP_CV_PCT: #2222
import { excludeQAQC } from "../../lib/qaqc.js";
import { t as tr } from "../../lib/i18n.js";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", lineHeight: 1.45, marginTop: -2, marginBottom: 6 };

export default function ShellCapNote({ assays, symbol, unit, assayElements, includeQAQC, isAssay, capValue, setCapValue }) {
  const src = useMemo(() => (!isAssay ? [] : includeQAQC ? (assays || []).filter((a) => a.source !== "pXRF") : excludeQAQC(assays || [])), [assays, includeQAQC, isAssay]);
  const cv = useMemo(() => (isAssay && symbol ? elementCvPct(src, symbol) : null), [src, symbol, isAssay]);
  const auto = useRef({ symbol: null, value: null }); // the cap this note set, for which element
  useEffect(() => {
    if (!isAssay || !(cv > CAP_CV_PCT) || !symbol) return;
    if (Number.isFinite(capValue) && capValue > 0) return;
    if (auto.current.symbol === symbol) return; // set once for this element: an emptied field stays empty
    const units = Object.fromEntries((assayElements || []).map((e) => [e.symbol, e.unit]));
    const p99 = lengthWeightedPercentile(src, symbol, unit, units, 99);
    if (Number.isFinite(p99) && p99 > 0) { const v = Number(p99.toPrecision(4)); auto.current = { symbol, value: v }; setCapValue(v); }
  }, [symbol, cv]); // the cap and the assays are read when the element or its CV changes, as in the Estimation dialog
  if (!isAssay || !(cv > CAP_CV_PCT)) return null;
  const cvText = Math.round(cv);
  if (Number.isFinite(capValue) && capValue > 0) {
    return auto.current.symbol === symbol && auto.current.value === capValue
      ? <div style={note}>{tr("Capped at P99 = {cap} by default: this element's coefficient of variation is {cv}%. Clear the cap to run uncapped; the result says which.", { cap: capValue, cv: cvText })}</div>
      : null;
  }
  return <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("Running uncapped: this element's coefficient of variation is {cv}%, so a few high assays can drive the shell. Estimation caps it at P99 by default.", { cv: cvText })}</div>;
}
