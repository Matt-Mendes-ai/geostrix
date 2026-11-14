// TASKS.csv #3205 (Matt's decision 2026-11-13) — in the import dialog, for a mineralization log logged as an amount per mineral: the mineral
// columns to import. TASKS.csv #3307 (Matt, 2026-11-13) — by default ONE Mineralization layer: each interval coloured by its dominant mineral (or a
// chosen one), its value Total min (the sum of the ticked minerals), every mineral kept as a field; #3205's one numeric layer per mineral (with an
// opt-in sulphide total) stays a choice. Built like the log channels box (#2160). The rules are in lib/perMineralColumns.js.
import React, { useMemo } from "react";
import { perMineralOffer, perMineralChoice, sumLayerName, mineralCode, componentCode } from "../lib/perMineralColumns.js"; // componentCode: #3052
import { LAYER_META } from "../lib/layers.js";
import { t as tr } from "../lib/i18n.js";

const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };

export default function MineralPercentBox({ modal, onChange, sel = {} }) {
  const rows = modal.allRows || modal.sampleRows || [];
  const cols = useMemo(() => perMineralOffer(modal.target, modal.headers, rows, modal.mapping || {}), [modal.target, modal.headers, rows, modal.mapping]);
  if (!cols) return null;
  const { cols: ticked, sum, mode, colourBy, composition: comp, mixedBelow } = perMineralChoice(modal, cols); // composition: #3052
  const single = mode === "single";
  const withValues = cols.filter((c) => c.n > 0), blank = cols.filter((c) => !c.n);
  const toggle = (col) => onChange({ ...modal, mineralCols: ticked.includes(col) ? ticked.filter((c) => c !== col) : withValues.map((c) => c.col).filter((c) => c === col || ticked.includes(c)) });
  const toggleSum = (col) => onChange({ ...modal, mineralSum: sum.includes(col) ? sum.filter((c) => c !== col) : withValues.map((c) => c.col).filter((c) => c === col || sum.includes(c)) });
  const base = String(modal.fileName || "").replace(/\.(csv|txt|xlsx?)$/i, "");
  return (
    <div style={{ marginBottom: 14, border: "1px solid var(--color-border)", borderRadius: 6, padding: "8px 10px" }}>
      <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text)", fontWeight: 600 }}>{comp ? tr("Components in this file (a composition)") : tr("Minerals in this file")}</div>
      {/* TASKS.csv #3052 — a composition: its components' shares sum to 100 on each row */}
      <div style={note}>{comp ? tr("A composition of {n} components: each row's shares sum to 100 (median {median}). Tick the components to import.", { n: comp.n, median: comp.median }) : tr("These columns are an amount of one mineral per interval. Tick the minerals to import.")}</div>
      {comp?.off > 0 && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("{n} interval(s) sum to more than 5 away from 100 ({holes}): check them in the file.", { n: comp.off.toLocaleString(), holes: comp.offHoles.join(", ") + (comp.offHoles.length >= 8 ? ", …" : "") })}</div>}
      <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6, fontSize: "var(--font-size-sm)" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "flex-start" }}><input type="radio" name="mineralMode" checked={single} onChange={() => onChange({ ...modal, mineralMode: "single" })} style={{ marginTop: 2 }} />
          <span>{comp ? tr("One {layer} layer: each interval coded by its dominant component (MIXED where none reaches the threshold below), its share kept as Dominant share (%), every component kept as a field", { layer: tr(LAYER_META[modal.target]?.label || "Custom layer") }) : tr("One Mineralization layer: each interval coloured by mineral, its value Total min (the sum of the ticked minerals), every mineral kept as a field")}</span></label>
        <label style={{ display: "flex", gap: 6, alignItems: "flex-start" }}><input type="radio" name="mineralMode" checked={!single} onChange={() => onChange({ ...modal, mineralMode: "layers" })} style={{ marginTop: 2 }} />
          <span>{comp ? (modal.mapping?.value ? tr("One numeric layer per ticked component, in %, beside the {layer} layer of {col}", { layer: tr(LAYER_META[modal.target]?.label || "Custom layer"), col: modal.mapping.value }) : tr("One numeric layer per ticked component, in %")) : tr("One numeric layer per mineral, in % visual")}</span></label>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6 }}>
        {withValues.map((c) => (
          <label key={c.col} style={{ fontSize: "var(--font-size-sm)", display: "flex", gap: 5, alignItems: "center" }}>
            <input type="checkbox" checked={ticked.includes(c.col)} onChange={() => toggle(c.col)} aria-label={tr("Import {col}", { col: c.col })} />
            <span>{c.col}</span>
            {single && <span style={{ color: "var(--color-text-secondary)" }}>{comp ? componentCode(c.col, comp.prefix) : mineralCode(c.col)}</span>}
            <span style={{ color: "var(--color-text-muted)" }}>{tr("{n} interval(s), up to {max}", { n: c.n.toLocaleString(), max: c.max.toLocaleString() })}{c.companions?.length ? " · " + tr("with {style}", { style: c.companions.join(", ") }) : ""}</span>
          </label>
        ))}
      </div>
      {blank.length > 0 && <div style={{ ...note, marginTop: 4 }}>{tr("Left out, with no value in any row: {cols}.", { cols: blank.map((c) => c.col).join(", ") })}</div>}
      {comp ? (single && ( /* #3052 — the purity threshold: under it an interval is MIXED */
        <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, fontSize: "var(--font-size-sm)" }}>
          {tr("MIXED where the largest share is under")}
          <input type="number" min={0} max={100} step="any" value={modal.mixedBelow ?? mixedBelow} onChange={(e) => onChange({ ...modal, mixedBelow: e.target.value })} style={{ ...sel, width: 60 }} aria-label={tr("Share under which an interval is MIXED, %")} />%
        </label>
      )) : single ? (
        <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, fontSize: "var(--font-size-sm)" }}>
          {tr("Colour by")}
          <select value={colourBy} onChange={(e) => onChange({ ...modal, mineralColourBy: e.target.value })} style={{ ...sel, width: "auto" }} aria-label={tr("Colour the intervals by")}>
            <option value="dominant">{tr("the dominant mineral of each interval")}</option>
            {ticked.map((c) => <option key={c} value={c}>{tr("{code}: where it is logged", { code: mineralCode(c) })}</option>)}
          </select>
        </label>
      ) : (
        <>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)", fontWeight: 600, marginTop: 10 }}>{tr("Total sulphides (optional)")}</div>
          <div style={note}>{tr("Tick the columns that are sulphides to add a layer of their total per interval (a blank column counts as none logged). Nothing is assumed: which minerals count is your choice.")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px", marginTop: 4 }}>
            {withValues.map((c) => (
              <label key={c.col} style={{ fontSize: "var(--font-size-sm)", display: "flex", gap: 5, alignItems: "center" }}>
                <input type="checkbox" checked={sum.includes(c.col)} onChange={() => toggleSum(c.col)} aria-label={tr("Count {col} as a sulphide", { col: c.col })} />{c.col}
              </label>
            ))}
          </div>
          {sum.length === 1 && <div style={{ ...note, color: "var(--color-warn-text)", marginTop: 4 }}>{tr("Tick at least two columns for a total.")}</div>}
          {sum.length >= 2 && <div style={{ ...note, marginTop: 4 }}>{tr("Adds the layer \"{name}\".", { name: sumLayerName(base, sum) })}</div>}
        </>
      )}
    </div>
  );
}
