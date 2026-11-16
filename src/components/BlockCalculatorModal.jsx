// TASKS.csv #3164 (part 2) — the block calculator dialog: pick block models on one lattice (the first fixes it), name each in the formula,
// write the formula (calcExpr's language, no eval), state the new value's name and unit, calculate, add. The maths is lib/blockCalc.js.
// No default formula, price, factor or penalty (#264): the formula field starts empty and the help's examples are letters, not numbers.
// Lazy-loaded from BlockCalculatorLauncher, so the startup JavaScript does not grow.
import React, { useMemo, useRef, useState } from "react";
import { X, Calculator } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps, panel, header as headerStyle, sel } from "../lib/modalStyles.js";
import { useStore } from "../lib/store.jsx";
import { openHelp } from "../lib/help.js"; // TASKS.csv #3597
import { blockModelLattice } from "../lib/estimationMeta.js";
import { visibleOnLattice } from "../lib/viewer/modelLegendOnAdd.js"; // TASKS.csv #3596
import { sameLattice } from "../lib/densityFromModel.js"; // TASKS.csv #3596
import { blockCalc, calcModelRecord, calcVarFor, isCalcVar, joinRefusal, MAX_CALC_INPUTS } from "../lib/blockCalc.js";
import { setMembersOf } from "../lib/estimateSet.js";
import { budgetPause } from "../lib/compactTable.js";
import { gradeStops } from "../lib/inversion.js";
import { t as tr } from "../lib/i18n.js";

const keyOf = (m) => String(m.id ?? m.name);
const fmt = (v) => (Number.isFinite(v) ? (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : String(+v.toPrecision(4))) : "—");
const rampOf = (cells) => {
  let lo = Infinity, hi = -Infinity;
  for (const c of cells) { if (c.value < lo) lo = c.value; if (c.value > hi) hi = c.value; }
  return lo <= hi ? { min: lo, max: hi, colorMode: "continuous", stops: gradeStops(lo, hi) } : {};
};

export default function BlockCalculatorModal({ onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const { voxelModels = [], addVoxelModel, updateVoxelModel } = useStore(); // updateVoxelModel: #3596
  const models = useMemo(() => voxelModels.filter((m) => m.cells?.length), [voxelModels]);
  const [inputs, setInputs] = useState([]); // [{ key, var }]
  const [formula, setFormula] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null); // TASKS.csv #3521 — the share done, 0-1
  const [likeFirst, setLikeFirst] = useState(false); // TASKS.csv #3522
  const [added, setAdded] = useState(null);
  const acRef = useRef(null);
  const picked = inputs.map((x) => ({ ...x, model: models.find((m) => keyOf(m) === x.key) })).filter((x) => x.model);
  const lattice = picked.length ? blockModelLattice(picked[0].model) : null;
  const choices = models.filter((m) => !picked.some((x) => x.model === m)).map((m) => ({ m, why: joinRefusal(lattice, m) }));
  const set = picked.length ? setMembersOf(picked[0].model, models).filter((m) => !picked.some((x) => x.model === m)) : [];
  const changed = () => { setResult(null); setAdded(null); setError(null); };
  const add = (list) => { setInputs((cur) => { const out = [...cur]; for (const m of list) { if (out.length >= MAX_CALC_INPUTS || out.some((x) => x.key === keyOf(m))) continue; out.push({ key: keyOf(m), var: calcVarFor(m, out.map((x) => x.var)) }); } return out; }); changed(); };
  const varError = (x, i) => (!isCalcVar(x.var) ? tr("Letters, digits and _, starting with a letter") : picked.some((y, j) => j !== i && y.var.toLowerCase() === x.var.toLowerCase()) ? tr("Used twice") : null);
  const namesOk = picked.length > 0 && picked.every((x, i) => !varError(x, i));
  const ready = namesOk && formula.trim() && !running;
  const run = async () => {
    setError(null); setResult(null); setAdded(null); setRunning(true); setProgress(null);
    const ac = new AbortController(); acRef.current = ac;
    try { setResult(await blockCalc(picked.map((x) => ({ var: x.var, model: x.model })), formula, { pause: budgetPause(), signal: ac.signal, onProgress: setProgress /* #3521 */ })); }
    catch (err) { if (!err.cancelled) setError(err.message); }
    finally { setRunning(false); acRef.current = null; }
  };
  const mean = result?.cells.length ? result.cells.reduce((a, c) => a + c.value, 0) / result.cells.length : NaN;
  const canAdd = result && result.cells.length && name.trim() && unit.trim() && !added;
  // TASKS.csv #3522 — colour the new model as its first input (its ramp, range and stops) when the new value is in the same unit: a calcined Fe
  // in % beside the Fe estimate in %. Offered only then; otherwise the grade ramp over its own values
  const first = picked[0]?.model, sameUnit = !!(first?.stops?.length && first.params?.unit && unit.trim() && first.params.unit === unit.trim());
  const rampLike = sameUnit && likeFirst ? { min: first.min, max: first.max, colorMode: first.colorMode, stops: first.stops } : null;
  const unitSuffix = unit.trim() ? ` ${unit.trim()}` : ""; // TASKS.csv #3607 (7) — the summary's numbers in the new model's unit
  const addModel = () => {
    try {
      const rec = calcModelRecord({ name, unit, formula, inputs: picked, result });
      for (const m of visibleOnLattice(voxelModels, rec.cells, { latticeOf: blockModelLattice, sameLattice })) updateVoxelModel?.(m.id, { visible: false }); // #3596: one model of a grid shown
      addVoxelModel({ ...rec, ...(rampLike || rampOf(rec.cells)) }); // #3522: the first input's colours when asked
      setAdded(rec.name);
    } catch (err) { setError(err.message); }
  };
  const small = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
  return (
    <div style={overlay} {...backdropProps(null)}>
      <div role="dialog" aria-modal="true" aria-label={tr("Block calculator")} style={{ ...panel(), width: 620, maxHeight: "88vh" }}>
        <div style={headerStyle}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}><Calculator size={18} />{" "}{tr("Block calculator")}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}><button type="button" className="ge-pane-close ge-pane-help" onClick={() => openHelp("block-calculator")} aria-label={tr("Help: {name}", { name: tr("Block calculator") })} title={tr("Help for this tool (F1, works offline)")}>?</button><button type="button" onClick={onClose} aria-label={tr("Close")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}><X size={18} /></button></span>
        </div>
        <div style={{ padding: 16, overflowY: "auto", fontSize: "var(--font-size-base)" }}>
          <div style={{ ...small, marginBottom: 12, lineHeight: 1.45 }}>{tr("A new block model whose value is a formula over block models on the same blocks. A block gets a value only where every model the formula reads has one; elsewhere it is left out, never set to zero.")}</div>
          <div style={{ ...small, marginBottom: 6 }}>{tr("Block models in the formula")}</div>
          {picked.length > 0 && (
            <table style={{ borderCollapse: "collapse", marginBottom: 8, width: "100%" }}>
              <tbody>
                {picked.map((x, i) => (
                  <tr key={x.key}>
                    <td style={{ padding: "3px 8px 3px 0", width: 130 }}>
                      <input value={x.var} onChange={(e) => { const v = e.target.value; setInputs((cur) => cur.map((y) => (y.key === x.key ? { ...y, var: v } : y))); changed(); }} aria-label={tr("Name in the formula for {model}", { model: x.model.name })} style={{ ...sel, width: 120, fontFamily: "monospace" }} />
                      {varError(x, i) && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger-text)" }}>{varError(x, i)}</div>}
                    </td>
                    <td style={{ padding: "3px 8px", color: "var(--color-text)" }}>{x.model.name}{x.model.params?.unit ? ` (${x.model.params.unit})` : ""}{i === 0 && <span style={{ ...small, marginInlineStart: 6 }}>{tr("(sets the blocks)")}</span>}</td>
                    <td style={{ padding: "3px 0", textAlign: "end" }}><button type="button" onClick={() => { setInputs((cur) => cur.filter((y) => y.key !== x.key)); changed(); }} aria-label={tr("Remove {model}", { model: x.model.name })} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}><X size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
            <select value="" onChange={(e) => { const m = models.find((q) => keyOf(q) === e.target.value); if (m) add([m]); }} aria-label={tr("Add a block model")} style={{ ...sel, flex: 1, minWidth: 220 }} disabled={picked.length >= MAX_CALC_INPUTS}>
              <option value="">{picked.length ? tr("Add a block model on the same blocks…") : tr("Pick the first block model…")}</option>
              {choices.filter((c) => !c.why).map(({ m }) => <option key={keyOf(m)} value={keyOf(m)}>{m.name}</option>)}
            </select>
            {set.length > 0 && <button type="button" onClick={() => add(set)} style={{ ...sel, cursor: "pointer" }}>{tr("Add the rest of its set ({n})", { n: set.length })}</button>}
          </div>
          {choices.some((c) => c.why) && ( /* TASKS.csv #3809 — said before the first pick too: four models in the project and an empty list, with no word why (a UBC mesh with two cell heights) */
            <details style={{ ...small, marginBottom: 10 }}>
              <summary style={{ cursor: "pointer" }}>{tr(choices.filter((c) => c.why).length === 1 ? "1 block model can't be added" : "{n} block models can't be added", { n: choices.filter((c) => c.why).length })}</summary>
              <ul style={{ margin: "4px 0 0", paddingInlineStart: 18 }}>{choices.filter((c) => c.why).map(({ m, why }) => <li key={keyOf(m)}>{m.name}: {why}</li>)}</ul>
            </details>
          )}
          <label style={{ display: "block", ...small, margin: "10px 0 4px" }} htmlFor="blockcalc-formula">{tr("Formula")}</label>
          <textarea id="blockcalc-formula" value={formula} onChange={(e) => { setFormula(e.target.value); changed(); }} rows={3} spellCheck={false} style={{ ...sel, width: "100%", boxSizing: "border-box", fontFamily: "monospace", resize: "vertical" }} />
          <details style={{ ...small, margin: "4px 0 12px", lineHeight: 1.5 }}>
            <summary style={{ cursor: "pointer" }}>{tr("How to write a formula")}</summary>
            <div>{tr("Use the names above, numbers, + - * / ^ ( ), comparisons (< <= > >= = !=), and / or / not, if(condition, value if true, value if false), and min, max, abs, sqrt, log, log10, exp, round, floor, ceil.")}</div>
            <div style={{ marginTop: 4 }}>{tr("Examples, with letters where your own numbers go:")}</div>
            <ul style={{ margin: "2px 0 0", paddingInlineStart: 18, fontFamily: "monospace" }}>
              <li>Fe / (1 - LOI / 100)</li>
              <li>Cu + Au * k</li>
              <li>Fe * p - max(0, SiO2 - s) * q</li>
            </ul>
            <div style={{ marginTop: 4 }}>{tr("Replace k, p, q and s with your own factor, price, penalty and threshold: GeoStrix proposes no price, recovery or penalty.")}</div>
          </details>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "6px 12px", marginBottom: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 3, ...small }}>{tr("Name of the new block model")} *
              <input value={name} onChange={(e) => { setName(e.target.value); setAdded(null); }} style={sel} /></label>
            <label style={{ display: "flex", flexDirection: "column", gap: 3, ...small }}>{tr("Unit of the new value")} *
              <input value={unit} onChange={(e) => { setUnit(e.target.value); setAdded(null); }} placeholder={tr("e.g. %, g/t, $/t")} style={sel} /></label>
          </div>
          {sameUnit && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, ...small, marginBottom: 12 }}>{/* TASKS.csv #3522 */}
              <input type="checkbox" checked={likeFirst} onChange={(e) => { setLikeFirst(e.target.checked); setAdded(null); }} />
              {tr("Colour it as {model} (the same ramp and range)", { model: first.name })}
            </label>
          )}
          {error && <div role="alert" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-danger-text)", background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", borderRadius: 6, padding: "7px 9px", marginBottom: 10 }}>{error}</div>}
          {result && (
            <div style={{ fontSize: "var(--font-size-sm)", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "7px 9px", marginBottom: 10, lineHeight: 1.5 }}>
              <div>{result.cells.length ? tr(result.blocks === 1 ? "1 block calculated; value {mean}." : "{blocks} blocks calculated; mean {mean}, from {min} to {max}.", { blocks: result.blocks.toLocaleString(), mean: fmt(mean) + unitSuffix, min: fmt(rampOf(result.cells).min) + unitSuffix, max: fmt(rampOf(result.cells).max) + unitSuffix } /* #3607 (7): with its unit */) : tr("No block got a value.")}</div>
              {result.missing > 0 && <div>{tr(result.missing === 1 ? "1 block left out: a model the formula reads has no value there." : "{n} blocks left out: a model the formula reads has no value there.", { n: result.missing.toLocaleString() })}</div>}
              {result.blank > 0 && <div>{tr(result.blank === 1 ? "1 block left out: the formula gives no number there (e.g. a division by zero)." : "{n} blocks left out: the formula gives no number there (e.g. a division by zero).", { n: result.blank.toLocaleString() })}</div>}
              {added && <div style={{ color: "var(--color-success-text)" }}>{tr("Added \"{name}\". It is a snapshot: it does not change when its inputs do.", { name: added })}</div>}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            {running && <button type="button" onClick={() => acRef.current?.abort()} style={{ ...sel, cursor: "pointer" }}>{tr("Cancel")}</button>}
            <button type="button" disabled={!ready} onClick={run} style={{ ...sel, cursor: ready ? "pointer" : "default", opacity: ready ? 1 : 0.5 }}>{running ? (progress != null ? tr("Calculating… {p} %", { p: Math.round(progress * 100) }) : tr("Calculating…")) : tr("Calculate")}</button>
            <button type="button" disabled={!canAdd} onClick={addModel} title={!unit.trim() ? tr("State the unit of the new value first") : undefined} style={{ ...sel, cursor: canAdd ? "pointer" : "default", opacity: canAdd ? 1 : 0.5, background: "var(--color-success-bg)", color: "var(--color-success-text)", border: "1px solid var(--color-success-border)" }}>{tr("Add block model")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
