// TASKS.csv #1316 — Matt: "a filter on the hole list so I can uncheck or check them quickly". The filter box could only narrow the list: 398 holes meant 398 clicks.
import { t as tr } from "../../lib/i18n.js";
import { holesMatching, visibilityPatch } from "../../lib/holeFilter.js";

const btn = { flex: 1, minWidth: 0, padding: "3px 4px", fontSize: "var(--font-size-xs)", background: "var(--color-bg)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer" };

export default function HoleFilterBar({ collars, filter, setFilter, visibleHoles, setVisibleHoles }) {
  const ids = collars.map((c) => c.hole_id);
  const shown = holesMatching(ids, filter);
  const ticked = ids.filter((id) => visibleHoles[id] !== false).length;
  const apply = (mode) => setVisibleHoles((p) => visibilityPatch(p, ids, shown, mode));
  return (
    <div style={{ marginBottom: 6 }}>
      <input placeholder={tr("Filter holes… (PS-26, GS-21)")} aria-label={tr("Filter holes")} value={filter} onChange={(e) => setFilter(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "4px 6px", fontSize: "var(--font-size-sm)", color: "var(--color-text)", marginBottom: 4 }} />
      <div style={{ display: "flex", gap: 4 }}>
        <button type="button" style={btn} onClick={() => apply("show")} title={tr("Show every hole listed below")}>{tr("Check {n}", { n: shown.length })}</button>
        <button type="button" style={btn} onClick={() => apply("hide")} title={tr("Hide every hole listed below")}>{tr("Uncheck {n}", { n: shown.length })}</button>
        <button type="button" style={btn} onClick={() => apply("only")} title={tr("Show the holes listed below and hide all the others")}>{tr("Only these")}</button>
      </div>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 3 }}>{tr("{ticked} of {total} checked", { ticked, total: ids.length })}</div>
    </div>
  );
}
