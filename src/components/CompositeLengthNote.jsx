// TASKS.csv #2549 — under a composite-length field (Variogram, Estimation): when a quarter or more of the sampled metres are in samples longer than the composite,
// say what it does to the pairs and offer the length the samples suggest. Maths in lib/compositeSupport.js.
import React, { useMemo } from "react";
import { t as tr } from "../lib/i18n.js";
import { compositeVsSamples, COMPOSITE_SHORT_SHARE } from "../lib/compositeSupport.js";

export default function CompositeLengthNote({ assays, symbol, length, onUse, variogram = false }) {
  const c = useMemo(() => compositeVsSamples(assays, symbol, length), [assays, symbol, length]);
  if (!c || c.longer < COMPOSITE_SHORT_SHARE) return null;
  const med = Number(c.medianM.toPrecision(3));
  return (
    <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", lineHeight: 1.4, marginTop: 2 }}>
      {tr("{pct}% of the sampled metres of {el} are in samples longer than {len} m (length-weighted median {med} m): a composite shorter than its sample repeats the sample's grade, so the pairs inside one sample are identical{v}.", { pct: Math.round(100 * c.longer), el: symbol, len: length, med, v: variogram ? tr(" and the nugget is understated") : tr(" and the estimate looks smoother than the data") })}{" "}
      {onUse && c.proposalM !== Number(length) && <button type="button" onClick={() => onUse(c.proposalM)} style={{ padding: "0 6px", fontSize: "var(--font-size-xs)", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)", color: "var(--color-text)", cursor: "pointer" }}>{tr("Use {m} m", { m: c.proposalM })}</button>}
    </div>
  );
}
