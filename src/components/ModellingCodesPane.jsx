// TASKS.csv #599 — the Modelling codes pane (3D Modeling tab). The code list (colour, role, pile order),
// optional auto-numbering of alternating flows, and the interval picked in the 3D view: its code can be
// changed, or it can be connected to an interval in another hole (both get the same code; a tie line is
// drawn). The picking itself lives in ViewerModule (the 3D scene); this pane only edits `modellingCodes`.
// Logic is in lib/modellingCodes.js (tested); nothing here decides a contact.
import React, { useMemo, useState } from "react";
import { Crosshair, Waypoints, X, RotateCcw } from "./icons.js";
import { CODE_ROLES, codesInUse, autoNumber, effectiveCode, rowKey, codedRuns } from "../lib/modellingCodes.js";
import { colorForLithology } from "../lib/layers.js";

const ROLE_HELP = {
  stratigraphic: "a layer in the pile: its top is a contact where it sits below a younger layer",
  intrusion: "intrudes the pile: what sits directly below it is not given a top there",
  "cross-cutting": "fault / dyke / breccia: kept out of the stratigraphic stack",
  overburden: "casing / overburden: the rock below it is not given a top there",
  ignore: "not modelled; the rock below it is not given a top there",
};

export default function ModellingCodesPane({ litho, modellingCodes, setModellingCodes, groupOf, defaultRole, pickMode, setPickMode, selected, setSelected, connectFrom, setConnectFrom, askPrompt, pBtn, inputStyle }) {
  const mc = modellingCodes || { codes: [], assign: {}, ties: [] };
  const codes = useMemo(() => codesInUse(litho, mc, groupOf, defaultRole), [litho, mc, groupOf, defaultRole]);
  const counts = useMemo(() => {
    const m = new Map();
    codedRuns(litho, mc, groupOf).forEach((run) => m.set(run.code, (m.get(run.code) || 0) + 1));
    return m;
  }, [litho, mc, groupOf]);
  const loggedCodes = useMemo(() => [...new Set((litho || []).map((r) => String(r.value ?? "").trim()).filter(Boolean))].sort(), [litho]);
  const [numberCodes, setNumberCodes] = useState([]);
  const overrides = Object.keys(mc.assign || {}).length;

  const setCode = (name, patch) => setModellingCodes((p) => {
    const list = [...(p?.codes || [])];
    const i = list.findIndex((c) => c.name === name);
    if (i < 0) list.push({ name, ...patch }); else list[i] = { ...list[i], ...patch };
    return { ...(p || mc), codes: list };
  });
  const moveCode = (name, dir) => { // pile order: place every listed code, then swap two neighbours
    const names = codes.map((c) => c.name);
    const i = names.indexOf(name), j = i + dir;
    if (i < 0 || j < 0 || j >= names.length) return;
    [names[i], names[j]] = [names[j], names[i]];
    setModellingCodes((p) => {
      const list = [...(p?.codes || [])];
      names.forEach((n, k) => { const at = list.findIndex((c) => c.name === n); if (at < 0) list.push({ name: n, order: k + 1 }); else list[at] = { ...list[at], order: k + 1 }; });
      return { ...(p || mc), codes: list };
    });
  };
  const assignSelected = (code) => {
    if (!selected) return;
    const run = codedRuns(litho.filter((r) => r.hole_id === selected.hole_id), mc, groupOf).find((x) => x.rows.some((r) => rowKey(r) === rowKey(selected)));
    setModellingCodes((p) => {
      const assign = { ...(p?.assign || {}) };
      (run ? run.rows : [selected]).forEach((r) => { if (code == null) delete assign[rowKey(r)]; else assign[rowKey(r)] = code; });
      const list = p?.codes || [];
      return { ...(p || mc), assign, codes: code == null || list.some((c) => c.name === code) ? list : [...list, { name: code }] };
    });
  };
  const small = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
  const selCode = selected ? effectiveCode(selected, mc, groupOf) : null;

  return (
    <div style={{ fontSize: "var(--font-size-sm)" }}>
      <div style={{ ...small, marginBottom: 8 }}>
        Each logged interval has a <b>modelling code</b>: its logged code (or lithology group) unless you change it. Give
        alternating flows their own codes (DAC1, AND1, DAC2…) and connect them between holes. Contacts are taken where the
        code changes down-hole, and only below a younger stratigraphic unit — never below casing, an intrusion, a gap or at
        a hole start. Codes you create appear in the Implicit surface and Strat. stack pickers.
      </div>

      <div className="ge-section-label">Pick intervals in the 3D view</div>
      <button onClick={() => { setPickMode(!pickMode); setConnectFrom(null); }} aria-pressed={pickMode} style={{ ...pBtn, marginTop: 4, background: pickMode ? "var(--color-selected-bg)" : undefined }}>
        <Crosshair size={13} /> {pickMode ? "Picking: click an interval on a hole (click again to stop)" : "Pick an interval"}
      </button>
      {selected && (
        <div style={{ marginTop: 6, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <b>{selected.hole_id} · {Number(selected.from).toFixed(1)}–{Number(selected.to).toFixed(1)} m</b>
            <X size={13} style={{ cursor: "pointer" }} aria-label="Clear selection" onClick={() => { setSelected(null); setConnectFrom(null); }} />
          </div>
          <div style={small}>Logged as <b>{selected.value}</b> · modelling code <b>{selCode}</b>{mc.assign?.[rowKey(selected)] ? " (set by you)" : " (default)"}</div>
          <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
            <select value={selCode} onChange={(e) => (e.target.value === "__new" ? askPrompt("New modelling code:", `${selected.value}1`, (n) => { if (n && n.trim()) assignSelected(n.trim()); }) : assignSelected(e.target.value))} style={{ ...inputStyle, flex: 1, minWidth: 0 }} aria-label="Modelling code of the selected interval">
              {codes.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              <option value="__new">New code…</option>
            </select>
            <button onClick={() => assignSelected(null)} title="Back to the logged code (or its group)" aria-label="Reset to the logged code" style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 6px" }}><RotateCcw size={12} /></button>
          </div>
          <button onClick={() => { setConnectFrom(connectFrom ? null : selected); setPickMode(true); }} style={{ ...pBtn, marginTop: 5, marginBottom: 0, background: connectFrom ? "var(--color-selected-bg)" : undefined }}>
            <Waypoints size={13} /> {connectFrom ? `Click the matching interval in another hole (gets ${selCode})…` : "Connect to an interval in another hole"}
          </button>
        </div>
      )}

      <div className="ge-section-label" style={{ marginTop: 12 }}>Codes (youngest at the top)</div>
      <div style={small}>Order sets which unit is younger where two meet; a code you haven't placed keeps the order of the stack you run.</div>
      {codes.map((c, i) => (
        <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
          <input type="color" value={c.color || colorForLithology(c.name)} onChange={(e) => setCode(c.name, { color: e.target.value })} aria-label={`Colour of ${c.name}`} style={{ width: 22, height: 20, padding: 0, border: "none", background: "none" }} />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }} title={`${counts.get(c.name) || 0} interval run(s)`}>{c.name} <span style={small}>({counts.get(c.name) || 0})</span></span>
          <select value={c.role} onChange={(e) => setCode(c.name, { role: e.target.value })} title={ROLE_HELP[c.role]} aria-label={`Role of ${c.name}`} style={{ ...inputStyle, width: 104, flex: "none" }}>
            {CODE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={() => moveCode(c.name, -1)} disabled={i === 0} aria-label={`Move ${c.name} up (younger)`} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "1px 5px" }}>▲</button>
          <button onClick={() => moveCode(c.name, 1)} disabled={i === codes.length - 1} aria-label={`Move ${c.name} down (older)`} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "1px 5px" }}>▼</button>
        </div>
      ))}

      <div className="ge-section-label" style={{ marginTop: 12 }}>Auto-number alternations (optional)</div>
      <div style={small}>Numbers each repeated logged unit top-down in every hole (DAC → DAC1, DAC2…) as a starting point. The numbers are per hole, so a flow that pinches out needs fixing by connecting intervals.</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
        {loggedCodes.map((c) => (
          <label key={c} style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}>
            <input type="checkbox" checked={numberCodes.includes(c)} onChange={(e) => setNumberCodes((p) => (e.target.checked ? [...p, c] : p.filter((x) => x !== c)))} />{c}
          </label>
        ))}
      </div>
      <button disabled={!numberCodes.length} onClick={() => {
        const go = () => setModellingCodes((p) => ({ ...(p || mc), assign: autoNumber(litho, numberCodes, { ...(p || mc), assign: Object.fromEntries(Object.entries(p?.assign || {}).filter(([k]) => !litho.some((r) => rowKey(r) === k && numberCodes.includes(String(r.value))))) }, groupOf) }));
        const touched = litho.filter((r) => numberCodes.includes(String(r.value)) && mc.assign?.[rowKey(r)]).length;
        if (touched && !window.confirm(`${touched} of these intervals already have a code you set. Auto-numbering replaces them. Continue?`)) return;
        go();
      }} style={{ ...pBtn, marginTop: 6, opacity: numberCodes.length ? 1 : 0.5 }}>Auto-number {numberCodes.join(", ") || "…"}</button>

      <div style={{ ...small, marginTop: 10 }}>
        {overrides} interval(s) with a code you set · {(mc.ties || []).length} connection(s) drawn.
        {overrides > 0 && <> <span role="button" tabIndex={0} style={{ textDecoration: "underline", cursor: "pointer" }} onClick={() => { if (window.confirm(`Reset all ${overrides} interval code(s) to their logged codes and remove the connections? (Undo can bring them back.)`)) setModellingCodes((p) => ({ ...(p || mc), assign: {}, ties: [] })); }}>Reset all</span></>}
      </div>
    </div>
  );
}
