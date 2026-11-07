// TASKS.csv #1316 — Matt: "a filter on the hole list so I can uncheck or check them quickly". The filter box could only narrow the list: 398 holes meant 398 clicks.
import { t as tr } from "../../lib/i18n.js";
import { collarsMatching, collarAttrChoices, visibilityPatch } from "../../lib/holeFilter.js"; // collars / attrs: #1504
import { useMemo } from "react";

const btn = { flex: 1, minWidth: 0, padding: "3px 4px", fontSize: "var(--font-size-xs)", background: "var(--color-bg)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer" };

export default function HoleFilterBar({ collars, filter, setFilter, visibleHoles, setVisibleHoles, colourBy = "", setColourBy = null }) { // colourBy: #1504
  const ids = collars.map((c) => c.hole_id);
  const shown = collarsMatching(collars, filter).map((c) => c.hole_id); // #1504 — "drill_type=RC" picks by a collar field
  const choices = useMemo(() => collarAttrChoices(collars), [collars]);
  const ticked = ids.filter((id) => visibleHoles[id] !== false).length;
  const apply = (mode) => setVisibleHoles((p) => visibilityPatch(p, ids, shown, mode));
  return (
    <div style={{ marginBottom: 6 }}>
      <input placeholder={tr("Filter holes… (PS-26, GS-21)")} aria-label={tr("Filter holes")} value={filter} onChange={(e) => setFilter(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "4px 6px", fontSize: "var(--font-size-sm)", color: "var(--color-text)", marginBottom: 4 }} />
      {choices.length > 0 && ( /* TASKS.csv #1504 — pick holes by a field of the collar file (year, drill type, prospect...) */
        <select value="" aria-label={tr("Filter holes by a collar field")} onChange={(e) => { if (e.target.value) setFilter(e.target.value); }}
          style={{ width: "100%", boxSizing: "border-box", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 6px", fontSize: "var(--font-size-sm)", color: "var(--color-text)", marginBottom: 4 }}>
          <option value="">{tr("By a collar field…")}</option>
          {choices.map((ch) => <optgroup key={ch.key} label={ch.key}>{ch.values.map((v) => <option key={v} value={`${ch.key}=${v.replace(/\s+/g, "_")}`}>{`${ch.key} = ${v}`}</option>)}</optgroup>)}
        </select>
      )}
      {choices.length > 0 && setColourBy && ( /* TASKS.csv #1504 — colour the collars and traces by a collar field; the legend lists the values */
        <select value={colourBy} aria-label={tr("Colour holes by a collar field")} onChange={(e) => setColourBy(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 6px", fontSize: "var(--font-size-sm)", color: "var(--color-text)", marginBottom: 4 }}>
          <option value="">{tr("Colour holes: one colour")}</option>
          {choices.map((ch) => <option key={ch.key} value={ch.key}>{tr("Colour holes by {field}", { field: ch.key })}</option>)}
        </select>
      )}
      <div style={{ display: "flex", gap: 4 }}>
        <button type="button" style={btn} onClick={() => apply("show")} title={tr("Show every hole listed below")}>{tr("Check {n}", { n: shown.length })}</button>
        <button type="button" style={btn} onClick={() => apply("hide")} title={tr("Hide every hole listed below")}>{tr("Uncheck {n}", { n: shown.length })}</button>
        <button type="button" style={btn} onClick={() => apply("only")} title={tr("Show the holes listed below and hide all the others")}>{tr("Only these")}</button>
      </div>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 3 }}>{tr("{ticked} of {total} checked", { ticked, total: ids.length })}</div>
    </div>
  );
}
