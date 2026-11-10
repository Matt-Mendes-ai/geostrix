// TASKS.csv #2417 / #2542 — "Unsampled metres inside a sampled hole: not known / barren at a value I type", shared by Estimation,
// Grade shell and Variogram (lib/unsampledFill.js). The choice lives in a small store per tool and element, so it survives the pane
// closing (the Grade shell's settings are rendered by ModellingPanes and read by modellingRuns, with no ViewerModule state).
import React, { useMemo, useSyncExternalStore } from "react";
import { t as tr } from "../lib/i18n.js";
import { sampledShare, fillUnsampled, unsampledReady, defaultUnsampledMode, ASK_BELOW_SHARE } from "../lib/unsampledFill.js";
import { restrictRowsToHoles } from "../lib/modelArea.js";
import { excludeQAQC } from "../lib/qaqc.js";

const choices = new Map(); // "tool|symbol" -> { mode, value }
const listeners = new Set();
let version = 0;
const subscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };
const getVersion = () => version;
export function getUnsampledChoice(tool, symbol) { return choices.get(`${tool}|${symbol}`) || null; }
export function setUnsampledChoice(tool, symbol, patch) {
  const k = `${tool}|${symbol}`;
  choices.set(k, { ...(choices.get(k) || { mode: null, value: "" }), ...patch });
  version++; listeners.forEach((f) => f());
}

// the run-time side, also used outside React (modellingRuns): -> { info, mode, value, ready, apply(assays) -> { assays, filledM, holesFilled }, params }
export function resolveUnsampled(tool, { assays, collars, symbol, unit, elementUnits, info = null }) {
  const inf = info || sampledShare(assays, collars, symbol, unit, elementUnits);
  const saved = getUnsampledChoice(tool, symbol);
  const mode = saved?.mode ?? defaultUnsampledMode(inf.share), value = saved?.value ?? "";
  const ready = unsampledReady(mode, value);
  const apply = (rows) => (ready && mode === "barren" ? fillUnsampled(rows, collars, symbol, unit, elementUnits, Number(value)) : { assays: rows, filledM: 0, holesFilled: 0 });
  // what travels with the result (project data: English)
  const params = (filled) => ({
    unsampledMetres: mode === "barren" ? `barren at ${Number(value)} ${unit} (typed by the user)` : "not known (left out)",
    sampledShareOfHoles: Math.round(inf.share * 1000) / 10,
    ...(mode === "barren" ? { unsampledValue: Number(value), unsampledUnit: unit, unsampledFilledM: Math.round((filled?.filledM || 0) * 10) / 10, unsampledHolesFilled: filled?.holesFilled || 0 } : { unsampledLeftOutM: Math.round(Math.max(0, inf.drilledM - inf.sampledM) * 10) / 10 }),
  });
  return { info: inf, mode, value, ready, apply, params };
}

export function useUnsampled(tool, { assays, collars, symbol, unit, elementUnits }) {
  useSyncExternalStore(subscribe, getVersion);
  const info = useMemo(() => sampledShare(assays, collars, symbol, unit, elementUnits), [assays, collars, symbol, unit, elementUnits]);
  return { ...resolveUnsampled(tool, { assays, collars, symbol, unit, elementUnits, info }), set: (patch) => setUnsampledChoice(tool, symbol, patch), symbol, unit };
}

// one line under a result: what was filled, or what was left out
export function unsampledResultLine(p, symbol) {
  if (!p || !p.unsampledMetres) return null;
  if (p.unsampledFilledM != null) return tr("Unsampled metres read as barren: {m} m in {n} hole(s) filled at the value typed ({v}).", { m: p.unsampledFilledM.toLocaleString(), n: p.unsampledHolesFilled, v: `${p.unsampledValue} ${p.unsampledUnit}` });
  return p.unsampledLeftOutM > 0 ? tr("Unsampled metres read as not known: {m} m of the holes that carry {symbol} have no sample, and the estimate can carry grade into them.", { m: p.unsampledLeftOutM.toLocaleString(), symbol }) : null;
}

export default function UnsampledChoice({ u, style = null, selStyle = null }) {
  const { info, mode, value, set, symbol, unit } = u;
  if (!info.holes) return null;
  const pct = Math.round(info.share * 100), low = info.share < ASK_BELOW_SHARE;
  const sel = selStyle || { fontSize: "var(--font-size-sm)" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", ...(style || {}) }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }} title={tr("A geologist often leaves core unsampled because it looked barren. Read as not known, those metres are left out and the estimate carries the grade of the samples around them into that core. Holes with no sample of the element are never filled.")}>
        {tr("Unsampled metres inside a sampled hole")}
        <select aria-label={tr("Unsampled metres inside a sampled hole")} value={mode} onChange={(e) => set({ mode: e.target.value })} style={sel}>
          {mode === "" && <option value="">{tr("— choose —")}</option>}
          <option value="unknown">{tr("not known: left out")}</option>
          <option value="barren">{tr("barren: a value I type")}</option>
        </select>
        {mode === "barren" && <input type="number" min="0" step="any" aria-label={tr("Value of the unsampled metres ({unit})", { unit })} placeholder={unit} value={value} onChange={(e) => set({ value: e.target.value })} style={{ ...sel, width: 80 }} />}
      </label>
      <div style={{ color: low ? "var(--color-warn-text)" : "var(--color-text-muted)", lineHeight: 1.5 }}>
        {tr("{s} of the {d} m drilled in the {n} hole(s) that carry {symbol} are sampled ({p} %).", { s: Math.round(info.sampledM).toLocaleString(), d: Math.round(info.drilledM).toLocaleString(), n: info.holes, symbol, p: pct })}
        {low && mode === "" && " " + tr("Under 60 % are sampled: choose how the unsampled metres are read before running.")}
        {mode === "barren" && !unsampledReady(mode, value) && " " + tr("Type the value they take (a detection limit, a background or 0): none is chosen for you.")}
      </div>
    </div>
  );
}

// the Grade shell's rows, as modellingRuns builds them (Model area, QC inserts), so the panel and the run read the same share
export const gradeShellRows = (assays, inArea, visibleHoles, includeQAQC) => { const r = inArea ? restrictRowsToHoles(assays, visibleHoles) : assays || []; return includeQAQC ? r : excludeQAQC(r); };
export function GradeShellUnsampled({ assays, collars, symbol, assayElements, inArea, visibleHoles, includeQAQC, selStyle = null }) {
  const rows = useMemo(() => gradeShellRows(assays, inArea, visibleHoles, includeQAQC), [assays, inArea, visibleHoles, includeQAQC]);
  const elementUnits = useMemo(() => Object.fromEntries((assayElements || []).map((e) => [e.symbol, e.unit])), [assayElements]);
  const u = useUnsampled("gradeShell", { assays: rows, collars, symbol, unit: elementUnits[symbol] || "ppm", elementUnits });
  return <UnsampledChoice u={u} selStyle={selStyle} style={{ marginBottom: 6 }} />;
}
