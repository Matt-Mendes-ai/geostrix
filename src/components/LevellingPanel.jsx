// TASKS.csv #1001 — levelling one survey's surface samples to another, written as a new element column that Thresholds and
// the anomaly maps can use. Tie samples first; quantile matching only as a labelled fallback. Maths and sources in
// lib/levelling.js.
// TASKS.csv #4073 (side 4, Main's list) — a StepDialog with the house rules: Surveys (which two), Ties (the evidence, one gold Next), Result (the numbers and
// the one gold primary, Write). The method choices and the distance are in Fine-tune; the long explanations that sat in the window are in the "?" card.
import React, { useMemo, useState } from "react";
import { gradeUnitLabel } from "../lib/geochemColumns.js"; // TASKS.csv #3749 — g/t for a precious metal stored in ppm, in the labels
import { preferredElement } from "../lib/preferredElement.js"; // TASKS.csv #1523
import { useLeadCommodity } from "../lib/useLeadCommodity.js"; // #1523 — Au on an Au-Ag project
import { useStore } from "../lib/store.jsx";
import { surveysOf, fitLevelling, levellingPreview, writeLevelled, levelledSymbol, MIN_TIES, MIN_STAT, tieScatter } from "../lib/levelling.js"; // tieScatter: #2981
import TieScatterPlot from "./TieScatterPlot.jsx"; // TASKS.csv #2981
import { PROJECT_SOURCE } from "../lib/thresholds.js";
import { sel } from "../lib/modalStyles.js";
import { t as tr } from "../lib/i18n.js";
import { DOMAIN_ATTR } from "../lib/geochemDomains.js"; // TASKS.csv #1390
import NumberInput from "./NumberInput.jsx"; // TASKS.csv #3926 G4 — '0,05' and '0.05' both read
import StepDialog from "./StepDialog.jsx";
import { StepNumbers } from "./StepPane.jsx";
import MoreFold from "./MoreFold.jsx";
import DialogHelpCard from "./DialogHelpCard.jsx";

const ctl = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 };
const warn = { ...note, color: "var(--color-danger-fg)" };
const num = (v) => (Number.isFinite(v) ? +v.toPrecision(4) : "—");

export default function LevellingPanel({ onClose }) {
  const { surfaceSamples, surfaceElements, setSurfaceSamples, setSurfaceElements } = useStore();
  const elements = useMemo(() => surfaceElements.filter((e) => !e.symbol.endsWith("_lev")), [surfaceElements]);
  const media = useMemo(() => [...new Set(surfaceSamples.map((s) => s.medium))], [surfaceSamples]);
  // TASKS.csv #1390 (review #1352, Silvertip) — the Domains tool's column is a population of the samples, not a survey: it is not offered here, one
  // k-means cluster of a soil program was 'levelled' against another (neighbouring samples taken as shared sites). Columns GeoStrix
  // writes itself are left out.
  const columns = useMemo(() => { const c = new Set(["source"]); surfaceSamples.forEach((s) => Object.keys(s.attrs || {}).forEach((k) => { if (!k.endsWith("_lev_basis") && k !== DOMAIN_ATTR) c.add(k); })); return [...c]; }, [surfaceSamples]);
  const [at, setAt] = useState(0);
  const [column, setColumn] = useState("source");
  const [medium, setMedium] = useState(media[0] || "");
  const lead = useLeadCommodity();
  const [symbol, setSymbol] = useState(() => preferredElement(elements.map((e) => e.symbol), null, lead)); // #1523 — the project's lead commodity, not the first stored (S)
  const inMedium = useMemo(() => surfaceSamples.filter((s) => s.medium === medium), [surfaceSamples, medium]);
  const surveys = useMemo(() => surveysOf(inMedium, column), [inMedium, column]);
  const [refPick, setRefPick] = useState("");
  const [surPick, setSurPick] = useState("");
  const reference = surveys.some((s) => s.key === refPick) ? refPick : surveys.find((s) => s.key === PROJECT_SOURCE)?.key || surveys[0]?.key || ""; // public data levels to the project's own samples
  const survey = surveys.some((s) => s.key === surPick) && surPick !== reference ? surPick : surveys.find((s) => s.key !== reference)?.key || "";
  const [radiusM, setRadiusM] = useState(25);
  const [methodPick, setMethodPick] = useState(null);
  const [msg, setMsg] = useState(null);
  const opts = { symbol, medium, column, reference, survey, radiusM };
  const fit = useMemo(() => (reference && survey && symbol ? fitLevelling(surfaceSamples, opts) : null), [surfaceSamples, symbol, medium, column, reference, survey, radiusM]);
  const canTies = !!fit?.ties?.ok, canStat = !!fit?.stats.ok;
  const canHuber = !!fit?.ties?.huber; // #2000
  const method = methodPick === "quantile" && canStat ? "quantile" : methodPick === "huber" && canHuber ? "huber" : canTies ? "ties" : null;
  const preview = useMemo(() => (fit && method ? levellingPreview(surfaceSamples, fit, method, opts) : null), [fit, method, surfaceSamples]);
  const unit = surfaceElements.find((e) => e.symbol === symbol)?.unit || "ppm";
  const two = surveys.length >= 2;

  const write = () => {
    const r = writeLevelled(surfaceSamples, surfaceElements, fit, method, opts);
    setSurfaceSamples(r.samples);
    setSurfaceElements(r.elements);
    setMsg(tr("\"{col}\" written: {levelled} levelled and {reference} reference samples in {medium}.", { col: levelledSymbol(symbol), levelled: r.written.levelled, reference: r.written.reference, medium }));
  };
  const pick = (set) => (e) => { set(e.target.value); setMsg(null); };
  const sel2 = { ...sel, display: "block", marginTop: 4 };
  const surveyOption = (s) => <option key={s.key} value={s.key}>{s.key} ({s.count})</option>;

  const surveysStep = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={ctl}>{tr("Sample type")}<select value={medium} onChange={pick(setMedium)} style={sel2}>{media.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
        <label style={ctl}>{tr("Element")}<select value={symbol} onChange={pick(setSymbol)} style={sel2}>{elements.map((e) => <option key={e.symbol} value={e.symbol}>{e.symbol} ({gradeUnitLabel(e.symbol, e.unit)})</option>)}</select></label>
        <label style={ctl}>{tr("Told apart by")}<select value={column} onChange={pick(setColumn)} style={sel2}>{columns.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
      </div>
      {two ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={ctl}>{tr("Reference")}<select value={reference} onChange={pick(setRefPick)} style={{ ...sel2, maxWidth: 280 }}>{surveys.map(surveyOption)}</select></label>
          <label style={ctl}>{tr("Adjust")}<select value={survey} onChange={pick(setSurPick)} style={{ ...sel2, maxWidth: 280 }}>{surveys.filter((s) => s.key !== reference).map(surveyOption)}</select></label>
        </div>
      ) : <div style={note}>{tr("One survey under this column: choose another, such as year or lab.")}</div>}
    </div>
  );

  const tiesStep = () => fit && (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={note}>
        {fit.ties?.ok
          ? tr("{n} shared sites: median x{f}, most between x{lo} and x{hi}.", { n: fit.ties.n, f: num(fit.ties.factor), lo: num(fit.ties.low), hi: num(fit.ties.high) })
          : tr("{n} shared sites; {min} needed. A larger distance finds more.", { n: fit.ties?.n || 0, min: MIN_TIES })}
      </div>
      {fit.ties?.ok && <TieScatterPlot data={tieScatter(fit, symbol)} reference={reference} survey={survey} unit={unit} />}{/* TASKS.csv #2981 */}
      <MoreFold summary={tr("Fine-tune…")} data-fine-tune="levelling">
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 6 }}>
          <label style={ctl}>{tr("Same site (m)")}<NumberInput min={1} step={5} value={radiusM} onChange={(v) => setRadiusM(v)} style={{ ...sel, marginTop: 4, width: 70 }} wrapStyle={{ display: "flex" }} /></label>
          {canHuber && ( /* TASKS.csv #2000 — regression levelling on the same ties */
            <label style={{ ...note, display: "flex", gap: 6, alignItems: "flex-start", cursor: "pointer" }}>
              <input type="checkbox" checked={method === "huber"} onChange={(e) => setMethodPick(e.target.checked ? "huber" : null)} />
              <span>{tr("Fit a line (Huber)")} <span style={{ color: "var(--color-text-muted)" }}>{tr("log {ref} = {a} + {b} × log value; {d} of {n} down-weighted", { ref: reference, a: num(fit.ties.huber.a), b: num(fit.ties.huber.b), d: fit.ties.huber.downweighted, n: fit.ties.huber.n })}</span></span>
            </label>
          )}
          <label style={{ ...note, display: "flex", gap: 6, alignItems: "flex-start", cursor: canStat ? "pointer" : "default", opacity: canStat ? 1 : 0.6 }}
            title={canStat ? undefined : tr("Needs {min} measured samples in each survey (here {a} and {b}).", { min: MIN_STAT, a: fit.nReference, b: fit.nSurvey })}>
            <input type="checkbox" disabled={!canStat} checked={method === "quantile"} onChange={(e) => setMethodPick(e.target.checked ? "quantile" : null)} />
            <span>{tr("Quantile matching")}</span>
          </label>
        </div>
      </MoreFold>
    </div>
  );

  const resultStep = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {preview && (
        <StepNumbers rows={[
          { label: tr("Reference survey"), value: `${tr("Median")} ${num(preview.reference.median)} · ${tr("Maximum")} ${num(preview.reference.max)}` },
          { label: tr("Survey before"), value: `${tr("Median")} ${num(preview.before.median)} · ${tr("Maximum")} ${num(preview.before.max)}` },
          { label: tr("Survey after"), value: `${tr("Median")} ${num(preview.after.median)} · ${tr("Maximum")} ${num(preview.after.max)}` },
        ]} />
      )}
      {method === "quantile" && <div style={warn}>{tr("Estimated, not tied: each sample records it in its basis column.")}</div>}
      {msg && <div role="status" style={note}>{msg}</div>}
    </div>
  );

  const steps = [
    { key: "surveys", label: tr("Surveys"), render: surveysStep, primary: { label: tr("Next"), disabled: !two || !fit } },
    { key: "ties", label: tr("Ties"), render: tiesStep, primary: { label: tr("Next"), disabled: !method } },
    { key: "result", label: tr("Result"), render: resultStep, primary: { label: tr("Write {col}", { col: levelledSymbol(symbol) }), onClick: write, disabled: !method } },
  ];
  return (
    <StepDialog title={tr("Level surveys")} onClose={onClose} steps={steps} at={at} onAt={setAt} width="min(720px, 96vw)"
      help={<DialogHelpCard lines={[tr("Writes a new column; the source values stay as they are."), tr("Quantile matching assumes one population: it can erase real differences. Use it only without ties.")]} />} />
  );
}
