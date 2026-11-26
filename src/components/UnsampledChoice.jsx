// TASKS.csv #2417 / #2542 — "Unsampled metres inside a sampled hole: not known / barren at a value I type", shared by Estimation,
// Grade shell and Variogram (lib/unsampledFill.js). The choice lives in a small store per tool and element, so it survives the pane
// closing (the Grade shell's settings are rendered by ModellingPanes and read by modellingRuns, with no ViewerModule state).
import React, { useMemo, useSyncExternalStore } from "react";
import { gradeUnitLabel } from "../lib/geochemColumns.js"; // TASKS.csv #3749
import { t as tr } from "../lib/i18n.js";
import { coverageSummary, sampledShare, fillUnsampled, fillFromLog, logFactorOffer, unsampledReady, defaultUnsampledMode, barrenDefault, ASK_BELOW_SHARE, loggedEndsOf } from "../lib/unsampledFill.js"; // loggedEndsOf: #2736 (unassayedHoles: through coverageSummary, #3007) // fillFromLog / logFactorOffer: #2721
import { numericSourceChoices, findNumericSource, sourceAssays } from "../lib/numericSources.js"; // TASKS.csv #2721 — the logs a user may pick
import { restrictRowsToHoles } from "../lib/modelArea.js";
import { useStore } from "../lib/store.jsx"; // TASKS.csv #3116 — the built-in logs' range / despike
import { excludeQAQC } from "../lib/qaqc.js";

import { getUnsampledChoice, setUnsampledChoice, subscribe, getVersion, lastUnknown } from "../lib/unsampledChoices.js"; // TASKS.csv #3920 — moved to a lib
import NumberInput from "./NumberInput.jsx"; // TASKS.csv #3926
export { getUnsampledChoice, setUnsampledChoice };

// the run-time side, also used outside React (modellingRuns): -> { info, mode, value, ready, apply(assays) -> { assays, filledM, holesFilled }, params }
// TASKS.csv #2721 — logCtx { layers, customLayers }: the numeric downhole logs one may pick to fill the gaps (mode "log", never automatic)
export function resolveUnsampled(tool, { assays, collars, symbol, unit, elementUnits, info = null, logCtx = null }) {
  const inf = info || sampledShare(assays, collars, symbol, unit, elementUnits);
  const saved = getUnsampledChoice(tool, symbol);
  const mode = saved?.mode ?? (lastUnknown.get(tool) ? "unknown" : defaultUnsampledMode(inf.share));
  // TASKS.csv #3920 — barren with no value typed: half the lowest grade (said as the default; a saved value is the user's and wins)
  const byDefault = mode === "barren" && (saved?.value == null || saved?.value === undefined), dflt = byDefault ? barrenDefault(assays, symbol) : null;
  const value = byDefault ? String(dflt.value) : saved?.value ?? "";
  const logSource = mode === "log" && saved?.logKey && logCtx ? findNumericSource(saved.logKey, logCtx) : null, logFactor = saved?.factor ?? "";
  const ready = unsampledReady(mode, value, { source: logSource, factor: logFactor });
  const apply = (rows) => (!ready ? { assays: rows, filledM: 0, holesFilled: 0 }
    : mode === "barren" ? fillUnsampled(rows, collars, symbol, unit, elementUnits, Number(value), { alsoUnassayed: !!saved?.alsoUnassayed, loggedEnds: saved?.alsoUnassayed && logCtx?.layers ? loggedEndsOf(logCtx.layers) : null }) // #2736
    : mode === "log" ? fillFromLog(rows, collars, symbol, unit, elementUnits, sourceAssays(logSource, logCtx).assays, logSource.symbol, Number(logFactor))
    : { assays: rows, filledM: 0, holesFilled: 0 });
  // what travels with the result (project data: English)
  const params = (filled) => ({
    unsampledMetres: mode === "barren" ? `barren at ${Number(value)} ${unit} (${byDefault ? (dflt.lowest != null ? `the default: half the lowest grade, ${dflt.lowest} ${unit}` : "the default: no positive grade, 0") : "typed by the user"})` : mode === "log" && logSource ? `from the log "${logSource.label}" x ${Number(logFactor)} (picked by the user)` : "not known (left out)",
    sampledShareOfHoles: Math.round(inf.share * 1000) / 10,
    ...(mode === "barren" ? { unsampledValue: Number(value), unsampledUnit: unit, ...(byDefault ? { unsampledValueByDefault: true } : {}), unsampledFilledM: Math.round((filled?.filledM || 0) * 10) / 10, unsampledHolesFilled: filled?.holesFilled || 0, ...(filled?.unassayedHoles ? { unsampledUnassayedHoles: filled.unassayedHoles, unsampledUnassayedM: Math.round(filled.unassayedM * 10) / 10 } : {}) /* #2736 */ }
      : mode === "log" && logSource ? { unsampledLog: logSource.label, unsampledLogUnit: logSource.unit, unsampledLogFactor: Number(logFactor), unsampledUnit: unit, unsampledLogFilledM: Math.round((filled?.filledM || 0) * 10) / 10, unsampledLogNoReadingM: Math.round((filled?.noReadingM || 0) * 10) / 10, unsampledHolesFilled: filled?.holesFilled || 0 } // #2721
      : { unsampledLeftOutM: Math.round(Math.max(0, inf.drilledM - inf.sampledM) * 10) / 10 }),
  });
  return { info: inf, mode, value, byDefault, lowest: dflt?.lowest ?? null, ready, apply, params, logSource, logFactor, logKey: saved?.logKey || "", alsoUnassayed: !!saved?.alsoUnassayed };
}

export function useUnsampled(tool, { assays, collars, symbol, unit, elementUnits, layers = null, customLayers = null }) {
  useSyncExternalStore(subscribe, getVersion);
  // TASKS.csv #3007 — the share and the never-assayed holes from one coverage pass (was two over every assay)
  const cov = useMemo(() => coverageSummary(assays, collars, symbol, unit, elementUnits, { loggedEnds: layers ? loggedEndsOf(layers) : null }), [assays, collars, symbol, unit, elementUnits, layers]);
  const info = cov.info;
  const logValidRange = useStore().project?.logValidRange; // #3116
  const logCtx = useMemo(() => (layers || customLayers ? { layers, customLayers, logValidRange } : null), [layers, customLayers, logValidRange]); // #2721
  const logChoices = useMemo(() => (logCtx ? numericSourceChoices({ ...logCtx, models: false }) : []), [logCtx]);
  const unassayed = cov.unassayed; // #2736; one pass with the share: #3007
  return { ...resolveUnsampled(tool, { assays, collars, symbol, unit, elementUnits, info, logCtx }), set: (patch) => setUnsampledChoice(tool, symbol, patch), symbol, unit, logChoices, unassayed };
}

// one line under a result: what was filled, or what was left out
export function unsampledResultLine(p, symbol) {
  if (!p || !p.unsampledMetres) return null;
  if (p.unsampledLogFilledM != null) return tr("Unsampled metres read from the log \"{log}\" × {f} ({lu} to {u}, the factor you gave): {m} m in {n} hole(s) filled from its readings; {r} m had no reading and stay not known.", { log: p.unsampledLog, f: p.unsampledLogFactor, lu: p.unsampledLogUnit, u: p.unsampledUnit, m: p.unsampledLogFilledM.toLocaleString(), n: p.unsampledHolesFilled, r: p.unsampledLogNoReadingM.toLocaleString() }); // #2721
  if (p.unsampledFilledM != null) return (p.unsampledValueByDefault
    ? tr("Unsampled metres read as barren by default: {m} m in {n} hole(s) filled at {v}, half the lowest grade.", { m: p.unsampledFilledM.toLocaleString(), n: p.unsampledHolesFilled, v: `${p.unsampledValue} ${p.unsampledUnit}` }) // #3920
    : tr("Unsampled metres read as barren: {m} m in {n} hole(s) filled at the value typed ({v}).", { m: p.unsampledFilledM.toLocaleString(), n: p.unsampledHolesFilled, v: `${p.unsampledValue} ${p.unsampledUnit}` }))
    + (p.unsampledUnassayedHoles ? " " + tr("Also {k} hole(s) never assayed for {symbol}, over their whole length ({m} m).", { k: p.unsampledUnassayedHoles, symbol, m: p.unsampledUnassayedM.toLocaleString() }) : ""); // #2736
  return p.unsampledLeftOutM > 0 ? tr("Unsampled metres read as not known: {m} m of the holes that carry {symbol} have no sample, and the estimate can carry grade into them.", { m: p.unsampledLeftOutM.toLocaleString(), symbol }) : null;
}

export default function UnsampledChoice({ u, style = null, selStyle = null }) {
  const { info, mode, value, byDefault = false, lowest = null, set, symbol, unit, logChoices = [], logKey = "", logFactor = "", logSource = null, unassayed = [], alsoUnassayed = false } = u;
  const offer = mode === "log" && logSource ? logFactorOffer(logSource.label, symbol, unit) : null; // #2721 (b): offered, stated, never applied by itself
  if (!info.holes) return null;
  const pct = Math.round(info.share * 100), low = info.share < ASK_BELOW_SHARE;
  const sel = selStyle || { fontSize: "var(--font-size-sm)" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", ...(style || {}) }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }} title={tr("Core is often left unsampled because it looked barren. Read as not known, those metres are left out and nearby grades carry into them. Holes with no sample of the element are filled only if ticked under \"barren\".")}>
        {tr("Unsampled metres inside a sampled hole")}
        <select aria-label={tr("Unsampled metres inside a sampled hole")} value={mode} onChange={(e) => set({ mode: e.target.value })} style={sel}>
          {mode === "" && <option value="">{tr("— choose —")}</option>}
          <option value="unknown">{tr("not known: left out")}</option>
          <option value="barren">{tr("barren: a value I type")}</option>
          {logChoices.length > 0 && <option value="log">{tr("from a downhole log I pick")}</option>}{/* #2721 */}
        </select>
        {mode === "barren" && <NumberInput allowEmpty min="0" aria-label={tr("Value of the unsampled metres ({unit})", { unit })} placeholder={unit} value={value} onChange={(v) => set({ value: v == null ? "" : String(v) })} style={{ ...sel, width: 80 }} />}
      </label>
      {mode === "barren" && unassayed.length > 0 && <label style={{ display: "flex", alignItems: "center", gap: 6 }} title={tr("Holes with no sample of the element, to their collar length or else their deepest logged interval: off by default, since a hole may be unassayed for reasons other than looking barren.")}><input type="checkbox" checked={alsoUnassayed} onChange={(e) => set({ alsoUnassayed: e.target.checked })} />{tr("Also the {n} hole(s) never assayed for {symbol}", { n: unassayed.length, symbol })}{/* #4090: the rest in the tooltip */}</label>}{/* #2736 */}
      {mode === "log" && (<div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>{/* TASKS.csv #2721 */}
        <select aria-label={tr("Downhole log that fills the unsampled metres")} value={logKey} onChange={(e) => set({ logKey: e.target.value, factor: "" })} style={sel}>
          <option value="">{tr("— pick a log —")}</option>
          {logChoices.map((c) => <option key={c.key} value={c.key}>{String(c.label).endsWith(`(${c.unit})`) ? c.label : `${c.label} (${c.unitLabel || c.unit})`}</option>)}
        </select>
        {logSource && <label style={{ display: "flex", alignItems: "center", gap: 4 }}>{tr("{symbol} ({unit}) = reading ×", { symbol, unit: gradeUnitLabel(symbol, unit) })}<NumberInput allowEmpty min="0" aria-label={tr("Factor from the log to {symbol}", { symbol })} value={logFactor} onChange={(v) => set({ factor: v == null ? "" : String(v) })} style={{ ...sel, width: 70 }} /></label>}
        {offer && Number(logFactor) !== offer.factor && <button className="gs-btn gs-btn--sm" type="button" onClick={() => set({ factor: String(offer.factor) })}>{offer.ratio ? tr("Use × {f} ({from} to {to}: U3O8 = U × {r})", { f: offer.factor, from: offer.from, to: offer.to, r: offer.ratio }) : tr("Use × {f} ({from} read as {to})", { f: offer.factor, from: offer.from, to: offer.to })}</button>}
      </div>)}
      <div style={{ color: low ? "var(--color-warn-text)" : "var(--color-text-muted)", lineHeight: 1.5 }}>
        {tr("{s} of the {d} m drilled in the {n} hole(s) that carry {symbol} are sampled ({p} %).", { s: Math.round(info.sampledM).toLocaleString(), d: Math.round(info.drilledM).toLocaleString(), n: info.holes, symbol, p: pct })}
        {/* TASKS.csv #3920 — barren is the default, at half the lowest grade: said with its reason, changed by typing or by choosing 'not known' */}
        {mode === "barren" && byDefault && " " + (lowest != null ? tr("Read as barren by default, at half the lowest {symbol} grade ({low} {unit}): {v} {unit}. Type another value, or choose not known.", { symbol, low: lowest, unit: gradeUnitLabel(symbol, unit), v: value }) : tr("Read as barren by default, at 0: no sample carries a positive {symbol} grade. Type another value, or choose not known.", { symbol }))}
        {mode === "barren" && !unsampledReady(mode, value) && " " + tr("Type the value they take (a detection limit, a background or 0).")}
        {mode === "log" && !logSource && " " + tr("Pick the log that reads the same metal; none is matched for you.")}
        {mode === "log" && logSource && !(Number(logFactor) > 0) && " " + tr("Give the factor from the log's unit to {symbol} ({unit}): 1 when it already reads {symbol}.", { symbol, unit: gradeUnitLabel(symbol, unit) })}
      </div>
    </div>
  );
}

// the Grade shell's rows, as modellingRuns builds them (Model area, QC inserts), so the panel and the run read the same share
export const gradeShellRows = (assays, inArea, visibleHoles, includeQAQC) => { const r = inArea ? restrictRowsToHoles(assays, visibleHoles) : assays || []; return includeQAQC ? r : excludeQAQC(r); };
export function GradeShellUnsampled({ assays, collars, symbol, assayElements, inArea, visibleHoles, includeQAQC, selStyle = null, layers = null, customLayers = null /* #2721 */ }) {
  const rows = useMemo(() => gradeShellRows(assays, inArea, visibleHoles, includeQAQC), [assays, inArea, visibleHoles, includeQAQC]);
  const elementUnits = useMemo(() => Object.fromEntries((assayElements || []).map((e) => [e.symbol, e.unit])), [assayElements]);
  const runCollars = useMemo(() => (inArea ? restrictRowsToHoles(collars, visibleHoles) : collars || []), [collars, inArea, visibleHoles]); // #3006 — the holes the run uses
  const u = useUnsampled("gradeShell", { assays: rows, collars: runCollars, symbol, unit: elementUnits[symbol] || "ppm", elementUnits, layers, customLayers });
  return <UnsampledChoice u={u} selStyle={selStyle} style={{ marginBottom: 6 }} />;
}
