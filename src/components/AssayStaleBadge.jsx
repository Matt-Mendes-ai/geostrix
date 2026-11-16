// TASKS.csv #3686 — 'assays changed since': a grade shell or an estimate that kept the stamp of the assays it read (params.assayStamp) and the assays are not those now (re-imported, corrected, edited). One small tag,
// shown on a generated surface's row, a block model's row and Grade-tonnage; nothing for a result made before stamps existed.
import React from "react";
import { useStore } from "../lib/store.jsx";
import { assayStamp } from "../lib/assayStamp.js";
import { isStaleStamp } from "../lib/layerStamp.js";
import { t as tr } from "../lib/i18n.js";

export function useAssaysChangedSince(params) {
  const { assays } = useStore() || {};
  return isStaleStamp(params?.assayStamp, assayStamp(assays));
}
export default function AssayStaleBadge({ params, text = false }) {
  const stale = useAssaysChangedSince(params);
  if (!stale) return null;
  const tip = tr("Made from assays that have changed since (re-imported, corrected or edited): its values may differ from the assays now. Run it again to use the assays as they are.");
  return text
    ? <div role="status" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", marginBottom: 6, lineHeight: 1.45 }}>{tip}</div>
    : <span style={{ flexShrink: 0, fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "1px 4px" }} title={tip}>{tr("assays changed")}</span>;
}
