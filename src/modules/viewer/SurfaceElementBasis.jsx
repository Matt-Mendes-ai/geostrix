// TASKS.csv #2627 (follow-up; #2641 needs it) — a surface-sample element's reported-as basis (Li % <-> % Li2O) can be changed in an existing
// project, as Geochem's drill element chips can: the surface samples' elements that have an oxide, each with ElementBasisSelect (surface),
// in a closed box under the samples' row in the 3D View sidebar. Nothing is shown when no surface element has an oxide choice.
import React from "react";
import ElementBasisSelect from "../../components/ElementBasisSelect.jsx";
import { basisChoices } from "../../lib/oxideBasisChange.js";
import { t as tr } from "../../lib/i18n.js";

const chip = { display: "inline-flex", alignItems: "center", gap: 2, border: "1px solid var(--color-border)", borderRadius: 4, padding: "1px 2px 1px 6px" };

export default function SurfaceElementBasis({ elements, onNotice }) {
  const withOxide = (elements || []).filter((e) => basisChoices(e).length > 1);
  if (!withOxide.length) return null;
  return (
    <details style={{ fontSize: "var(--font-size-sm)", padding: "0 2px 6px" }}>
      <summary style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} title={tr("Report a surface element as the element or as its oxide (Li or Li2O): every stored value is converted, in one undoable step.")}>
        {tr("Elements: reported as element or oxide ({n})", { n: withOxide.length })}
      </summary>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingTop: 4 }}>
        {withOxide.map((e) => <span key={e.symbol} style={chip}>{e.symbol}<ElementBasisSelect element={e} surface onNotice={onNotice} /></span>)}
      </div>
    </details>
  );
}
