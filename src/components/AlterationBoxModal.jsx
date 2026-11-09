// TASKS.csv #503 — set up the AI / CCPI alteration classification: where each sample's protolith comes from
import { iconAction } from "../lib/a11y.js"; // TASKS.csv #687
// (its logged lithology, mapped code by code, or one protolith for every sample) and the least-altered box of
// each protolith. The box limits ship as PROVISIONAL defaults (not yet checked against Large et al. 2001
// fig. 6) and are edited here; they are saved with the project. The classification itself is
// lib/geochem.js classifyAlterationBox (tested).
import React, { useMemo, useState } from "react";
import { PROTOLITHS, PROVISIONAL_ALTERATION_BOXES, guessProtolith, FITTED_PROTOLITH, guessTrendRole } from "../lib/geochemDiagrams.js"; // fitted: #2028; trend: #2145
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function AlterationBoxModal({ saved, lithoCodes, altCodes = [], onCancel, onRun }) { // altCodes: #2028
  useEscapeKey(onCancel);
  const [boxes, setBoxes] = useState(() => saved?.boxes || PROVISIONAL_ALTERATION_BOXES);
  const [source, setSource] = useState(saved?.source || "logged");
  const [map, setMap] = useState(() => Object.fromEntries(lithoCodes.map((c) => [c, saved?.map && c in saved.map ? saved.map[c] : guessProtolith(c)])));
  const provisional = useMemo(() => same(boxes, PROVISIONAL_ALTERATION_BOXES), [boxes]);
  // TASKS.csv #2028 — the codes of the project's own least-altered rock (Unalt, Propy…): the box is fitted to those samples
  const [fitCodes, setFitCodes] = useState(() => (saved?.fitCodes || altCodes.filter((c) => /^(unalt|fresh|least|lalt|none|na)$/i.test(c))).filter((c) => altCodes.includes(c)));
  const fittedMode = source === FITTED_PROTOLITH;
  // TASKS.csv #2145 — which logged alteration codes are potassic / phyllic: suggested from the code names, the user's to confirm
  const [trendRoles, setTrendRoles] = useState(() => Object.fromEntries(altCodes.map((c) => [c, saved?.trendRoles && c in saved.trendRoles ? saved.trendRoles[c] : guessTrendRole(c)])));
  const setLimit = (p, axis, i, v) => setBoxes((b) => ({ ...b, [p]: { ...b[p], [axis]: b[p][axis].map((x, k) => (k === i ? Number(v) : x)) } }));
  const valid = PROTOLITHS.every((p) => boxes[p] && boxes[p].ai[0] < boxes[p].ai[1] && boxes[p].ccpi[0] < boxes[p].ccpi[1]);
  const num = { width: 52, padding: "2px 4px", border: "1px solid var(--color-border)", borderRadius: 4, fontSize: "var(--font-size-sm)", background: "var(--color-bg)", color: "var(--color-text)" };
  const small = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label={tr("Alteration box plot classification")} onClick={(e) => e.stopPropagation()} style={{ background: "var(--color-bg)", borderRadius: 8, padding: 16, width: 520, maxHeight: "85vh", overflow: "auto", fontSize: "var(--font-size-sm)" }}>
        <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-accent-dark)" }}>{tr("Alteration from AI / CCPI (box plot)")}</div>
        <div style={{ ...small, marginTop: 4 }}>{tr("Each sample is compared with the least-altered box of its protolith. Inside: least altered. Outside: named by the direction it lies in — sericite (AI up), chlorite-pyrite (up-right), chlorite-carbonate (right), epidote-calcite (down-right), albite (down). Screening level: the protolith is assumed, not measured. Samples with no protolith are not classified.")}</div>
        {provisional && (
          <div role="note" style={{ marginTop: 8, padding: "6px 8px", borderRadius: 5, background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", color: "var(--color-warn-text)", fontSize: "var(--font-size-sm)" }}>{tr("These box limits are")}{" "}<b>{tr("provisional")}</b>{" "}{tr("— inside the published least-altered range (AI 10–65, CCPI 15–85) but not yet checked against Large et al. (2001) fig. 6. Edit them below; your values are saved with the project.")}</div>
        )}

        <div className="ge-section-label" style={{ marginTop: 12 }}>{tr("Protolith of each sample")}</div>
        <select value={source} onChange={(e) => setSource(e.target.value)} aria-label={tr("Protolith source")} style={{ ...num, width: "100%", marginTop: 4 }}>
          <option value="logged">{tr("From the logged lithology at the sample (map the codes below)")}</option>
          {PROTOLITHS.map((p) => <option key={p} value={p}>{tr("Every sample is {p}", { p })}</option>)}
          <option value={FITTED_PROTOLITH} disabled={!altCodes.length}>{tr("One box fitted to my least-altered samples (by their logged alteration)")}</option>{/* #2028 */}
        </select>
        {fittedMode && (
          <div style={{ marginTop: 6 }}>
            <div style={small}>{tr("Tick the logged alteration codes of the least-altered rock. Their samples' AI and CCPI (5th to 95th percentile) make the box every sample is compared with: for intrusive or other hosts that the volcanic boxes do not describe.")}</div>
            <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: "2px 12px" }}>
              {altCodes.map((c) => (
                <label key={c} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="checkbox" checked={fitCodes.includes(c)} onChange={(e) => setFitCodes((f) => (e.target.checked ? [...f, c] : f.filter((x) => x !== c)))} />{c}
                </label>
              ))}
            </div>
          </div>
        )}
        {source === "logged" && ( /* the code-by-code protolith map */
          <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 12px" }}>
            {lithoCodes.length === 0 && <div style={small}>{tr("No lithology logged on the assayed holes — choose one protolith above.")}</div>}
            {lithoCodes.map((c) => (
              <label key={c} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 60, overflow: "hidden", textOverflow: "ellipsis" }}>{c}</span>
                <select value={map[c] || ""} onChange={(e) => setMap((m) => ({ ...m, [c]: e.target.value || null }))} aria-label={tr("Protolith of {c}", { c })} style={{ ...num, width: 110 }}>
                  <option value="">{tr("— not classified")}</option>
                  {PROTOLITHS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}

        {altCodes.length > 0 && (<>{/* #2145 */}
          <div className="ge-section-label" style={{ marginTop: 12 }}>{tr("Naming the AI-up trend from the log")}</div>
          <div style={small}>{tr("The AI-up trend is potassic (K-feldspar, biotite) or phyllic (sericite), and whole-rock chemistry cannot tell them apart reliably. Where a sample on it lies in a logged alteration code marked below, it is named from the log; elsewhere it keeps the joint name and the Molar K/Al vs Na/Al diagram is the place to look. The marks are suggested from the code names: check them.")}</div>
          <div style={{ marginTop: 4, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 12px" }}>
            {altCodes.map((c) => (
              <label key={c} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 70, overflow: "hidden", textOverflow: "ellipsis" }} title={c}>{c}</span>
                <select value={trendRoles[c] || ""} onChange={(e) => setTrendRoles((m) => ({ ...m, [c]: e.target.value || null }))} aria-label={tr("AI-up trend name for {c}", { c })} style={{ ...num, width: 110 }}>
                  <option value="">{tr("— neither")}</option>
                  <option value="potassic">{tr("potassic")}</option>
                  <option value="phyllic">{tr("phyllic")}</option>
                </select>
              </label>
            ))}
          </div>
        </>)}

        <div className="ge-section-label" style={{ marginTop: 12, display: "flex", justifyContent: "space-between" }}>
          <span>{tr("Least-altered boxes")}</span>
          {!provisional && <span style={{ cursor: "pointer", textTransform: "none", letterSpacing: 0 }} {...iconAction(() => setBoxes(PROVISIONAL_ALTERATION_BOXES), tr("Reset to provisional boxes"))}>{tr("Reset to provisional")}</span>}
        </div>
        <table style={{ marginTop: 4, borderCollapse: "collapse" }}>
          <thead><tr style={small}><th style={{ textAlign: "start", paddingRight: 10 }}>{tr("Protolith")}</th><th>{tr("AI min")}</th><th>{tr("AI max")}</th><th>{tr("CCPI min")}</th><th>{tr("CCPI max")}</th></tr></thead>
          <tbody>
            {PROTOLITHS.map((p) => (
              <tr key={p}>
                <td style={{ paddingRight: 10 }}>{p}</td>
                {[["ai", 0], ["ai", 1], ["ccpi", 0], ["ccpi", 1]].map(([axis, i]) => (
                  <td key={`${axis}${i}`} style={{ padding: "2px 3px" }}>
                    <input type="number" min={0} max={100} value={boxes[p][axis][i]} onChange={(e) => setLimit(p, axis, i, e.target.value)} aria-label={`${p} ${axis.toUpperCase()} ${i ? "max" : "min"}`} style={num} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!valid && <div style={{ ...small, color: "var(--color-danger-fg)" }}>{tr("Each box needs min below max.")}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button onClick={onCancel} style={{ padding: "5px 12px" }}>{tr("Cancel")}</button>
          <button disabled={!valid || (fittedMode && !fitCodes.length)} onClick={() => onRun({ boxes, map, source, fitCodes, trendRoles })} style={{ padding: "5px 12px", fontWeight: 600, opacity: valid && !(fittedMode && !fitCodes.length) ? 1 : 0.5 }}>{tr("Classify")}</button>
        </div>
      </div>
    </div>
  );
}
