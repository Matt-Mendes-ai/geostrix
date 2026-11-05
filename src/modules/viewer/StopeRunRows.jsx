// TASKS.csv #1968 — in 3D Modelling's Generated surfaces list, the stopes show as one row per Stope outlines run (not one row per
// stope, which flooded the list on Treaty Creek), with show / hide and a link to the pane that manages them.
import React, { useMemo } from "react";
import { Eye, EyeOff } from "../../components/icons.js";
import { activateOnKey } from "../../lib/a11y.js";
import { t as tr } from "../../lib/i18n.js";
import { stopeRuns } from "../../lib/stopeRuns.js";

export default function StopeRunRows({ stopes, onShow, onOpen }) {
  const runs = useMemo(() => stopeRuns(stopes), [stopes]);
  if (!runs.length) return null;
  return runs.map((r) => {
    const shown = r.visible > 0;
    return (
      <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => onShow(r.ids, !shown)} style={{ cursor: "pointer", color: shown ? "var(--color-accent)" : "var(--color-text-disabled)" }}
          aria-label={shown ? tr("Hide these stopes") : tr("Show these stopes")}>{shown ? <Eye size={14} /> : <EyeOff size={14} />}</div>
        <div style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          title={tr("{n} stope solids from one Stope outlines run; manage them in Mine Design > Stope outlines", { n: r.count })}>
          {tr("Stopes: {model} ≥ {c} ({n} on {l} level(s))", { model: r.model, c: `${r.cutoff ?? "?"} ${r.unit}`.trim(), n: r.count, l: r.levels.length })}
        </div>
        <button type="button" onClick={onOpen} style={{ border: "1px solid var(--color-border)", background: "var(--color-bg)", borderRadius: 4, padding: "1px 6px", fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", cursor: "pointer", flexShrink: 0 }}>{tr("Manage")}</button>
      </div>
    );
  });
}
