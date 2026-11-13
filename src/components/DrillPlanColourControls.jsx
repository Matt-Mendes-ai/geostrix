// TASKS.csv #2473 (review #2325, WA uranium) — the drill plan's "Colour by" in the Layout sidebar: one colour, the series (the old
// tick), a collar field (hole type, year, program...: lib/holeFilter collarAttrChoices) or a grade per hole (the highest result, or
// grade x length over the hole), with the classes drawn from the holes' own values (lib/drillPlan drillPlanColouring).
import React, { useMemo } from "react";
import { t as tr } from "../lib/i18n.js";
import { collarAttrChoices } from "../lib/holeFilter.js";
import { drillPlanColourBy, colourByKind } from "../lib/drillPlan.js";
import { useLeadCommodity } from "../lib/useLeadCommodity.js"; // TASKS.csv #3026 — the grade colourings open on the project's commodity
import { preferredElement } from "../lib/preferredElement.js";
import { elementOptionLabel } from "../lib/geochem.js"; // TASKS.csv #3026 — 'Al as Al2O3', as the key's unit reads it (#2914)

const lab = { fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", display: "block", marginBottom: 6 };

export default function DrillPlanColourControls({ sel, updateSelected, collars, assayElements, colouring, inp }) {
  const fields = useMemo(() => collarAttrChoices(collars), [collars]);
  const elements = (assayElements || []).map((e) => e.symbol).filter(Boolean);
  const lead = useLeadCommodity();
  const unitOf = Object.fromEntries((assayElements || []).map((e) => [e.symbol, e.unit]));
  const { kind, key } = colourByKind(drillPlanColourBy(sel));
  const set = (by) => updateSelected({ colourBy: by, bySeries: by === "series" });
  const onKind = (k) => {
    if (k === "none" || k === "series") return set(k);
    if (k === "attr") return set(`attr:${fields.some((f) => f.key === key) ? key : fields[0]?.key || ""}`);
    return set(`${k}:${elements.includes(key) ? key : preferredElement(elements, null, lead) || ""}`); // #3026 — not the first alphabetically (Al on an iron ore)
  };
  const isGrade = kind === "max" || kind === "gt" || kind === "bi"; // bi: #2685
  const blank = colouring?.key?.find((k) => k.hollow);
  return (
    <>
      <label style={lab}>{tr("Colour the holes by")}
        <select value={kind} onChange={(e) => onKind(e.target.value)} style={{ ...inp, marginTop: 4 }}>
          <option value="none">{tr("One colour")}</option>
          <option value="series">{tr("Series (the hole id without its number)")}</option>
          {fields.length > 0 && <option value="attr">{tr("A collar field (hole type, year...)")}</option>}
          {elements.length > 0 && <option value="max">{tr("Highest grade in the hole")}</option>}
          {elements.length > 0 && <option value="gt">{tr("Grade × length over the hole")}</option>}
          {elements.length > 0 && <option value="bi">{tr("Best intercept, grade × length (cut-off)")}</option>}{/* #2685 */}
        </select>
      </label>
      {kind === "attr" && (
        <label style={lab}>{tr("Collar field")}
          <select value={key} onChange={(e) => set(`attr:${e.target.value}`)} style={{ ...inp, marginTop: 4 }}>
            {fields.map((f) => <option key={f.key} value={f.key}>{tr("{field} ({n} values)", { field: f.key, n: f.values.length })}</option>)}
          </select>
        </label>
      )}
      {isGrade && (
        <label style={lab}>{tr("Element")}
          <select value={key} onChange={(e) => set(`${kind}:${e.target.value}`)} style={{ ...inp, marginTop: 4 }}>
            {elements.map((s) => <option key={s} value={s}>{elementOptionLabel(s, unitOf[s])}</option>)}
          </select>
        </label>
      )}
      {kind === "bi" && ( /* TASKS.csv #2685 — Best intercepts' rule, set on the plan */
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          {[["biCutoff", tr("Cut-off"), tr("P90")], ["biDilution", tr("Internal dilution (m)"), "2"], ["biMinLength", tr("Min. length (m)"), "0"]].map(([k, label, ph]) => (
            <label key={k} style={{ ...lab, flex: 1, marginBottom: 0 }}>{label}<input type="number" min="0" step="any" value={sel[k] ?? ""} placeholder={ph} onChange={(e) => updateSelected({ [k]: e.target.value === "" ? null : Number(e.target.value) })} style={{ ...inp, marginTop: 4 }} /></label>
          ))}
        </div>
      )}
      {isGrade && (
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
          {kind === "bi"
            ? tr("Each hole's best intercept (Best intercepts' rule: the cut-off, at most this much internal dilution, at least this length) as grade × length. With no cut-off typed, the plan uses the element's 90th percentile, as Best intercepts suggests. The key's classes break at the 50th, 75th and 90th percentile of the plan's holes.")
            : kind === "gt"
            ? tr("Each hole's grade × length is summed over its assayed metres, with no cut-off. The key's classes break at the 50th, 75th and 90th percentile of the plan's holes, so they follow this project's own values.")
            : tr("The key's classes break at the 50th, 75th and 90th percentile of the plan's holes, so they follow this project's own values.")}
          {blank ? " " + tr("Holes with no result for this element are hollow rings.") : ""}
        </div>
      )}
      {fields.length > 0 && ( /* TASKS.csv #2686 — a symbol shape by a collar field, beside the colour */
        <label style={lab}>{tr("Symbol shape by")}
          <select value={sel.shapeBy || ""} onChange={(e) => updateSelected({ shapeBy: e.target.value || null })} style={{ ...inp, marginTop: 4 }} title={tr("The field's three commonest values get a square, a triangle and a diamond; every other value keeps the circle.")}>
            <option value="">{tr("Circles only")}</option>
            {fields.map((f) => <option key={f.key} value={f.key}>{tr("{field} ({n} values)", { field: f.key, n: f.values.length })}</option>)}
          </select>
        </label>
      )}
    </>
  );
}
