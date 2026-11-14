// The density and tonnage block under a closed surface's volume (moved out of ViewerModule.jsx for TASKS.csv #1690).
// TASKS.csv #264 — no silent 2.7 prefill: a bold tonnage the user never authorized a density for is the number that gets quoted.
// TASKS.csv #1690 (review #1645, Copley) — the box said "there is no default" while the project held 256 measured SG values. With a
// Specific gravity layer it now offers, one click each, the mean of the SG intervals inside this solid and #1216's mean of the whole
// layer; the choice is stamped on the surface (densityFrom) and named beside the tonnage. Typing a value clears the stamp.
import React, { useMemo } from "react";
import { t as tr } from "../../lib/i18n.js";
import { computeTonnage } from "../../lib/volumetrics.js";
import { sgSummary } from "../../lib/gradeTonnage.js";
import { sgInsideSolid } from "../../lib/sgInSolid.js";

// TASKS.csv #2068 (review #2013, Woodjam) — sgSummary's min / max are the raw logged values (1.766666666666667): two decimals here
const r2 = (v) => String(+Number(v).toFixed(2));
const range = (s) => `${r2(s.min)}–${r2(s.max)}`;

export default function SurfaceTonnage({ s, volumeM3, sgRows, traces, geometry, onDensity, smallSel }) {
  const whole = useMemo(() => sgSummary(sgRows), [sgRows]);
  const inside = useMemo(() => (whole ? sgInsideSolid(sgRows, traces, geometry?.attributes?.position?.array, geometry?.index?.array) : null), [whole, sgRows, traces, geometry]);
  const tonnage = computeTonnage(volumeM3, Number(s.density));
  const from = s.densityFrom && Number(s.density) === s.densityFrom.mean ? s.densityFrom : null;
  const btn = { ...smallSel, cursor: "pointer", width: "auto" };
  const muted = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
  return (
    <>
      <label style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ flexShrink: 0 }}>{tr("Density (t/m³ or g/cm³)")}</span>
        <input type="number" min={0} step={0.01} placeholder={tr("required")} value={s.density ?? ""}
          onChange={(e) => onDensity(e.target.value === "" ? "" : Number(e.target.value), null)} style={{ ...smallSel, width: 70 }} />
      </label>
      {whole && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {inside && <button type="button" style={btn} onClick={() => onDensity(inside.mean, { kind: "inside", ...inside })}
            title={tr("The length-weighted mean of the {n} Specific gravity intervals whose midpoints fall inside this solid ({range}).", { n: inside.n, range: range(inside) })}>{tr("Use the SG inside this solid ({v}, {n} intervals)", { v: inside.mean, n: inside.n })}</button>}
          <button type="button" style={btn} onClick={() => onDensity(whole.mean, { kind: "layer", ...whole })}
            title={tr("The length-weighted mean of the Specific gravity layer: {n} rows, {min} to {max}. One value for every block.", { n: whole.n, min: r2(whole.min), max: r2(whole.max) })}>{tr("Use the SG layer's mean ({v})", { v: whole.mean })}</button>
          {!inside && <span style={muted}>{tr("No Specific gravity interval has its midpoint inside this solid.")}</span>}
        </div>
      )}
      {tonnage != null ? (
        <>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)" }}>{tr("Tonnage:")}{" "}<strong title={`${Math.round(tonnage).toLocaleString()} t`}>{Number(tonnage.toPrecision(3)).toLocaleString()} t</strong>{/* TASKS.csv #3284 — 3 significant figures, exact on hover (as Grade-tonnage) */}</div>
          {from && <div style={muted}>{from.kind === "inside"
            ? tr("Density: the length-weighted mean of {n} measured SG intervals inside this solid ({range}).", { n: from.n, range: range(from) })
            : tr("Density: the length-weighted mean of the whole Specific gravity layer, {n} intervals ({range}), not only those inside this solid.", { n: from.n, range: range(from) })}</div>}
          {/* TASKS.csv #269 — permanent, beside the figure, not buried in helper text. */}
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 5, padding: "6px 7px", marginTop: 5, lineHeight: 1.45 }}>
            <strong>{tr("Exploration target volume only — not a Mineral Resource.")}</strong>{" "}{tr("Public disclosure of a tonnage requires an estimate prepared by a Qualified Person.")}
            {" "}{from
              ? tr("In-situ, dry, undiluted tonnes. No mining dilution, mining recovery, metallurgical recovery or moisture is applied. The density is one mean for the whole body: a real estimate models measured SG by domain.")
              : tr("In-situ, dry, undiluted tonnes at the density you entered. No mining dilution, mining recovery, metallurgical recovery or moisture is applied. Bulk density here is a single assumed value, not a measured one — a real estimate uses measured SG by domain.")}</div>
        </>
      ) : (
        <div style={muted}>{whole
          ? tr("Enter a bulk density, or use the measured SG above, to compute tonnage — there is no default, because the tonnage is only as real as the density behind it.")
          : tr("Enter a bulk density to compute tonnage — there is no default, because the tonnage is only as real as the density behind it.")}</div>
      )}
    </>
  );
}
