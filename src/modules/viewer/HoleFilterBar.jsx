// TASKS.csv #1316 — Matt: "a filter on the hole list so I can uncheck or check them quickly". The filter box could only narrow the list: 398 holes meant 398 clicks.
import { t as tr } from "../../lib/i18n.js";
import { holesForFilter, collarAttrChoices, visibilityPatch } from "../../lib/holeFilter.js"; // collars / attrs: #1504; collar-field text: #1703
import { useMemo } from "react";
import { useStore } from "../../lib/store.jsx"; // TASKS.csv #3742
import { collarTwinGroups, mergeCollarTwins, twinGroupText } from "../../lib/attrTwins.js"; // TASKS.csv #3742
import { LAYER_META } from "../../lib/layers.js"; // TASKS.csv #3690
import { holeFieldPicks, holesWithoutField, noValuePick } from "../../lib/viewer/holeFieldPicks.js"; // TASKS.csv #3074

const btn = { flex: 1, minWidth: 0, padding: "3px 4px", fontSize: "var(--font-size-xs)", background: "var(--color-bg)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer" };

export default function HoleFilterBar({ collars, filter, setFilter, visibleHoles, setVisibleHoles, colourBy = "", setColourBy = null, holeSets = null, onApplied = null }) { // colourBy: #1504; holeSets: #3554
  const ids = collars.map((c) => c.hole_id);
  const none = holesWithoutField(collars, filter), found = none ? { holes: none, byField: false } : holesForFilter(collars, filter, { holeSets }); // #1504; none: #3074 — "drill_type=RC" picks by a collar field; #1703 — or text in one
  const shown = found.holes.map((c) => c.hole_id);
  const choices = useMemo(() => collarAttrChoices(collars), [collars]);
  const picks = useMemo(() => holeFieldPicks(collars, choices), [collars, choices]); // #3074 — one field per split, with its (no value)
  const { setCollars } = useStore();
  const twins = useMemo(() => collarTwinGroups(collars), [collars]); // TASKS.csv #3742 — values that are one value spelled two ways (D Zone / D zone)
  const ticked = ids.filter((id) => visibleHoles[id] !== false).length;
  const apply = (mode) => { setVisibleHoles((p) => visibilityPatch(p, ids, shown, mode)); onApplied?.(mode); }; // onApplied: #3695 — the view follows 'Only these' / 'Uncheck'
  const termOf = (key, v) => `${key.replace(/\s+/g, "_")}=${v.replace(/\s+/g, "_")}`; // key too: #2488 ("hole type=…" split into two terms)
  // TASKS.csv #3356 — terms on one field join by OR, across fields by AND (#3278): with a field pick in the box, a second menu adds one to it
  const terms = filter.trim().split(/\s+/).filter(Boolean), adding = terms.some((t) => /^[^=]+=./.test(t)) && !holesWithoutField(collars, filter);
  const fieldOptions = (more) => picks.map((ch) => <optgroup key={ch.key} label={ch.also.length ? tr("{field} (also {others})", { field: ch.key, others: ch.also.join(", ") }) : ch.key}>{ch.values.map((v) => <option key={v} value={termOf(ch.key, v)} disabled={more && terms.includes(termOf(ch.key, v))}>{`${ch.key} = ${v}`}</option>)}{!more && ch.missing > 0 && <option value={noValuePick(ch.key)}>{tr("{field} = (no value): {n} hole(s)", { field: ch.key, n: ch.missing })}</option>}</optgroup>);
  const selStyle = { width: "100%", boxSizing: "border-box", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 6px", fontSize: "var(--font-size-sm)", color: "var(--color-text)", marginBottom: 4 };
  return (
    <div style={{ marginBottom: 6 }}>
      <input placeholder={ids.length >= 2 ? tr("Filter holes… ({examples})", { examples: `${ids[0]}, ${ids[1]}` }) /* #2941 — this project's own ids */ : tr("Filter holes…")} aria-label={tr("Filter holes")} value={filter} onChange={(e) => setFilter(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "4px 6px", fontSize: "var(--font-size-sm)", color: "var(--color-text)", marginBottom: 4 }} />
      {choices.length > 0 && ( /* TASKS.csv #1504 — pick holes by a field of the collar file (year, drill type, prospect...) */
        <select value="" aria-label={tr("Filter holes by a collar field")} onChange={(e) => { if (e.target.value) setFilter(e.target.value); }} style={selStyle}>
          <option value="">{tr("By a collar field…")}</option>
          {fieldOptions(false)}
        </select>
      )}
      {choices.length > 0 && adding && ( /* #3356 */
        <select value="" aria-label={tr("Add a collar field pick to the filter")} title={tr("Values of one field: holes with either. Different fields: holes with both.")} onChange={(e) => { if (e.target.value) setFilter(`${filter.trim()} ${e.target.value}`); }} style={selStyle}>
          <option value="">{tr("+ Add another…")}</option>
          {fieldOptions(true)}
        </select>
      )}
      {holeSets && Object.keys(holeSets).length > 0 && ( /* TASKS.csv #3554 — holes with / without data: the typed 'has:assays' / 'no:assays' as picks */
        <select value="" aria-label={tr("Filter holes by what they have")} onChange={(e) => { if (e.target.value) setFilter(e.target.value); }} style={selStyle}>
          <option value="">{tr("By what holes have…")}</option>
          {Object.keys(holeSets).flatMap((k) => { const what = k === "assays" ? k : LAYER_META[k.replace(/ /g, "_")]?.label || k; /* #3690 — the layer's own name (Specific gravity), not its key (sg) */ return [<option key={`has:${k}`} value={`has:${k.replace(/\s+/g, "_")}`}>{tr("Holes with {what}", { what })}</option>, <option key={`no:${k}`} value={`no:${k.replace(/\s+/g, "_")}`}>{tr("Holes with no {what}", { what })}</option>]; })}
        </select>
      )}
      {choices.length > 0 && setColourBy && ( /* TASKS.csv #1504 — colour the collars and traces by a collar field; the legend lists the values */
        <select value={colourBy} aria-label={tr("Colour holes by a collar field")} onChange={(e) => setColourBy(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 6px", fontSize: "var(--font-size-sm)", color: "var(--color-text)", marginBottom: 4 }}>
          <option value="">{tr("Colour holes: one colour")}</option>
          {picks.map((p) => { const key = p.also.includes("hole type") ? "hole type" : p.key; /* TASKS.csv #3538 — one entry per split (hole_type and 'hole type' split the holes alike); the app's own normalized field wins */ return <option key={key} value={key}>{tr("Colour holes by {field}", { field: key })}</option>; })}
        </select>
      )}
      {twins.length > 0 && setCollars && ( /* TASKS.csv #3742 — the import notice named them (#3733); here one click makes each group one value, in the filter, the colours and Grade statistics */
        <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 4, lineHeight: 1.4 }}>
          {tr("These collar values look like one value spelled two ways: {list}.", { list: twins.slice(0, 3).map((g) => `${g.col}: ${twinGroupText(g)}`).join("; ") + (twins.length > 3 ? "; …" : "") })}{" "}
          <button type="button" style={{ ...btn, flex: "none", padding: "1px 6px" }} onClick={() => setCollars((p) => mergeCollarTwins(p).collars)} title={tr("Rewrites the less common spelling of each group to the commoner one, on every collar. Undo brings them back.")}>{tr("Make them one")}</button>
        </div>
      )}
      <div style={{ display: "flex", gap: 4 }}>
        <button type="button" style={btn} onClick={() => apply("show")} title={tr("Show every hole listed below")}>{tr("Check {n}", { n: shown.length })}</button>
        <button type="button" style={btn} onClick={() => apply("hide")} title={tr("Hide every hole listed below")}>{tr("Uncheck {n}", { n: shown.length })}</button>
        <button type="button" style={btn} onClick={() => apply("only")} title={tr("Show the holes listed below and hide all the others")}>{tr("Only these")}</button>
      </div>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 3 }}>{tr("{ticked} of {total} checked", { ticked, total: ids.length })}</div>
      {!shown.length && filter.trim() && ( /* TASKS.csv #3554 — nothing listed: say what the box reads (it said nothing for 'year>=2017') */
        <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginTop: 2, lineHeight: 1.4 }}>{found.hint?.kind === "set" ? tr("No data called {name} here: has:assays, no:assays, or the name of a layer of this project.", { name: found.hint.names.join(", ") }) : tr("No hole matches. The box reads part of a hole id, field=value, a number test such as year>=2017, length>300 or year=2017..2023, and has:assays or no:assays.")}</div>
      )}
      {found.byField && <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("No hole id contains this text: listing the {n} hole(s) with it in a collar field.", { n: shown.length })}</div>}{/* #1703 */}
    </div>
  );
}
