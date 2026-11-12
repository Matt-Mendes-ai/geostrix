// TASKS.csv #2224 — under Estimation's and the grade shell's compositing settings: the composites are made here, with Geochem >
// Compositing's routine, and that tool's last settings in this window (same project, same element) can be taken in one click.
import React from "react";
import { useStore } from "../lib/store.jsx";
import { lastCompositing, sameCompositing } from "../lib/lastCompositing.js";
import { t as tr } from "../lib/i18n.js";

// symbol; length / minCoverage (0-1) / cap: this tool's settings; onUse({ length, minCoverage, cap }) takes Geochem's; unitLabel: the cap's unit
export default function GeochemCompositingNote({ symbol, length, minCoverage, cap, onUse, unitLabel = "", style }) {
  const { isSameProject } = useStore() || {};
  const g = lastCompositing(isSameProject, symbol);
  const box = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, ...style };
  const capText = g && g.cap != null ? tr("cap {v} {u}", { v: Number(g.cap.toPrecision(4)).toLocaleString(), u: unitLabel }).trim() : tr("no cap");
  return (
    <div style={box}>
      {tr("Composited here from the raw assays, with the same routine as Geochem > Compositing; composites made there are not reused.")}
      {g && <>{" "}{tr("Geochem > Compositing in this session: {len} m, min coverage {cov}%, {cap}{dom}.", { len: g.length, cov: Math.round(g.minCoverage * 100), cap: capText, dom: g.domain ? tr(", broken at {d} (choose a domain here yourself)", { d: g.domain }) : "" })}{" "}
        {sameCompositing(g, { length, minCoverage, cap })
          ? <span>{tr("The same as here.")}</span>
          : <button type="button" onClick={() => onUse?.({ length: g.length, minCoverage: g.minCoverage, cap: g.cap })} style={{ fontSize: "var(--font-size-xs)", padding: "1px 6px", cursor: "pointer", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, color: "var(--color-text)" }}
            title={tr("Sets the composite length, minimum coverage and cap here to Geochem > Compositing's. The composites are recomputed here, not copied.")}>{tr("Use these settings")}</button>}</>}
    </div>
  );
}
