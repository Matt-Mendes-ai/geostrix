// TASKS.csv #2222 (review #2174, WA gold) — the grade shell ran uncapped by default on a 585 %-CV gold population (700 g/t assays) while
// Estimation on the same data starts capped at P99 (#1573). The same decision here: a lab assay element whose coefficient of variation is
// over 150 % starts capped at its length-weighted P99, said under the field; emptying the field runs uncapped for that element (not refilled
// until another element is chosen, which clears the cap, #1736), and that is said too. Logs and numeric layer fields are not capped here.
import React, { useEffect, useMemo, useRef } from "react";
import { lengthWeightedPercentile, elementCvPct, CAP_CV_PCT } from "../../lib/geochem.js"; // elementCvPct / CAP_CV_PCT: #2222
import { excludeQAQC } from "../../lib/qaqc.js";
import { t as tr } from "../../lib/i18n.js";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", lineHeight: 1.45, marginTop: -2, marginBottom: 6 };

export default function ShellCapNote({ assays, symbol, unit, assayElements, includeQAQC, isAssay, capValue, setCapValue, autoRef = null }) {
  const src = useMemo(() => (!isAssay ? [] : includeQAQC ? (assays || []).filter((a) => a.source !== "pXRF") : excludeQAQC(assays || [])), [assays, includeQAQC, isAssay]);
  const cv = useMemo(() => (isAssay && symbol ? elementCvPct(src, symbol) : null), [src, symbol, isAssay]);
  const ownRef = useRef({ symbol: null, value: null });
  const auto = autoRef || ownRef; // the cap this note set, for which element; #3272 — kept by the pane (autoRef), so a reopened pane still knows it
  // TASKS.csv #3272 (Galore Creek review) — `assays` are the holes the run uses (Model area): P99 22,900 / CV 209 % was the whole project's, the
  // 14 checked holes' are 25,600 / 154 %. A cap this note set follows them when they change (the area, the checks); a typed or emptied cap stays.
  useEffect(() => {
    if (!isAssay || !symbol) return;
    const own = auto.current.symbol === symbol, has = Number.isFinite(capValue) && capValue > 0, mine = own && has && capValue === auto.current.value;
    if (!(cv > CAP_CV_PCT)) { if (mine) { auto.current = { symbol: null, value: null }; setCapValue(NaN); } return; } // #3272 — the rule no longer holds there
    if (has && !mine) return; // a typed cap
    if (own && !has) return; // set once for this element: an emptied field stays empty
    const units = Object.fromEntries((assayElements || []).map((e) => [e.symbol, e.unit]));
    const p99 = lengthWeightedPercentile(src, symbol, unit, units, 99);
    if (Number.isFinite(p99) && p99 > 0) { const v = Number(p99.toPrecision(4)); if (v !== capValue) { auto.current = { symbol, value: v }; setCapValue(v); } }
  }, [symbol, cv, src]); // the element, its CV, or the holes (#3272), as in the Estimation dialog
  if (!isAssay || !(cv > CAP_CV_PCT)) return null;
  const cvText = Math.round(cv);
  if (Number.isFinite(capValue) && capValue > 0) {
    return auto.current.symbol === symbol && auto.current.value === capValue
      ? <div style={note}>{tr("Capped at P99 = {cap} by default: this element's coefficient of variation is {cv}%. Clear the cap to run uncapped; the result says which.", { cap: capValue, cv: cvText })}</div>
      : null;
  }
  return <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("Running uncapped: this element's coefficient of variation is {cv}%, so a few high assays can drive the shell. Estimation caps it at P99 by default.", { cv: cvText })}</div>;
}
