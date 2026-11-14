// TASKS.csv #2449 (review #2325, WA uranium) — "Line / grid of holes…" in the planned-hole form: from the form's E / N, a bearing, a spacing
// and a count (and lines to the right of it), every hole with the form's azimuth, dip and length, its Elev from the ground under it (the
// terrain, else the surface between the collars) or the form's typed Elev. Pattern maths in lib/plannedPattern.js.
import React, { useMemo, useState } from "react";
import { t as tr } from "../lib/i18n.js";
import { useStore } from "../lib/store.jsx";
import { holePattern, nextPatternNumber, MAX_PATTERN_HOLES } from "../lib/plannedPattern.js";

const small = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const inp = { width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 5px", fontSize: "var(--font-size-sm)", color: "var(--color-text)" };
const Field = ({ label, value, onChange, type = "number", placeholder }) => (
  <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--font-size-xs)", color: "var(--color-text-faint)", minWidth: 0 }}>
    {label}<input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={inp} />
  </label>
);

// start: { x, y, z } as typed in the form (strings or numbers); orient: { azimuth (grid), dip, length } or null when not valid;
// ground(x, y) -> z | NaN or null; groundLabel: the z_source words for it; onAdd(hole) as the form's; btn: the form's button style
export default function PlannedHolePattern({ start, orient, ground, groundLabel, onAdd, btn }) {
  const { plannedHoles = [] } = useStore();
  const [open, setOpen] = useState(false);
  const [p, setP] = useState({ bearing: "", spacing: "", count: "", lines: "", lineSpacing: "", prefix: "PLAN-", type: "" /* #2978 (3) */ });
  const [done, setDone] = useState(null);
  const set = (k) => (v) => { setP((q) => ({ ...q, [k]: v })); setDone(null); };
  const num = (v) => (v === "" || v == null ? NaN : Number(v));
  const prefix = p.prefix.trim() || "PLAN-";
  const first = useMemo(() => nextPatternNumber(plannedHoles, prefix), [plannedHoles, prefix]);
  const pat = useMemo(() => holePattern({ x: num(start.x), y: num(start.y), bearingDeg: num(p.bearing), spacing: num(p.spacing), count: num(p.count), lineCount: p.lines === "" ? 1 : num(p.lines), lineSpacing: num(p.lineSpacing), prefix, firstNumber: first }), [start.x, start.y, p, prefix, first]);
  const typedZ = num(start.z);
  // each hole's Elev: the ground under it, else the typed Elev; a hole with neither is not added
  const placed = useMemo(() => pat.holes.map((h) => { const g = ground ? ground(h.x, h.y) : NaN; return Number.isFinite(g) ? { ...h, z: Math.round(g * 10) / 10, zSource: typeof groundLabel === "function" ? groundLabel(h.x, h.y) : groundLabel /* #3335 — each hole's own words */ } : Number.isFinite(typedZ) ? { ...h, z: typedZ, zSource: "typed (the pattern's start Elev)" } : { ...h, z: null }; }), [pat, ground, groundLabel, typedZ]);
  const noZ = placed.filter((h) => h.z == null).length;
  const ready = !pat.error && placed.length > 0 && !noZ && !!orient;
  const add = () => {
    if (!ready) return;
    placed.forEach((h) => onAdd({ name: h.name, x: h.x, y: h.y, z: h.z, azimuth: orient.azimuth, dip: orient.dip, length: orient.length, zSource: h.zSource, notes: `pattern: line ${h.line}, hole ${h.station}`, ...(p.type.trim() ? { type: p.type.trim() } : {}) /* #2978 (3) */ }));
    setDone(tr("{n} planned hole(s) added: {first} to {last}.", { n: placed.length, first: placed[0].name, last: placed[placed.length - 1].name }));
  };
  if (!open) return <button type="button" onClick={() => setOpen(true)} style={{ ...btn, width: "100%", marginTop: 5 }} aria-expanded={false}>{tr("Line / grid of holes…")}</button>;
  return (
    <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--color-border)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--color-text)" }}>{tr("Line / grid of holes")}</span>
        <button type="button" onClick={() => setOpen(false)} style={{ ...btn, padding: "1px 7px" }} aria-expanded>{tr("Close")}</button>
      </div>
      <div style={small}>{tr("From the E / N above, every hole with the Az / Dip / Length above. Lines step to the right of the bearing.")}</div>
      <div style={{ display: "flex", gap: 4, margin: "5px 0" }}>
        <Field label={tr("Bearing° (grid)")} value={p.bearing} onChange={set("bearing")} />
        <Field label={tr("Spacing m")} value={p.spacing} onChange={set("spacing")} />
        <Field label={tr("Holes")} value={p.count} onChange={set("count")} />
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
        <Field label={tr("Lines")} value={p.lines} onChange={set("lines")} placeholder="1" />
        <Field label={tr("Line spacing m")} value={p.lineSpacing} onChange={set("lineSpacing")} />
        <Field label={tr("Name prefix")} value={p.prefix} onChange={set("prefix")} type="text" />
        <Field label={tr("Hole type")} value={p.type} onChange={set("type")} type="text" placeholder={tr("e.g. RC")} />{/* #2978 (3) — every hole of the pattern */}
      </div>
      {pat.error === "too-many" && <div style={{ ...small, color: "var(--color-warn-text)" }}>{tr("At most {n} holes in one pattern.", { n: MAX_PATTERN_HOLES })}</div>}
      {!pat.error && placed.length > 0 && <div style={small}>{tr("{n} hole(s), {first} to {last}; Elev from {src}.", { n: placed.length, first: placed[0].name, last: placed[placed.length - 1].name, src: ground ? (noZ || placed.some((h) => h.zSource !== groundLabel) ? tr("the ground where it is known, else the Elev above") : groundLabel === "the terrain under the hole" ? tr("the terrain") : tr("the ground interpolated between the nearest collars")) : tr("the Elev above") })}</div>}
      {noZ > 0 && <div style={{ ...small, color: "var(--color-warn-text)" }}>{tr("{n} hole(s) have no Elev: no ground is known there. Type an Elev above for them.", { n: noZ })}</div>}
      {!orient && <div style={{ ...small, color: "var(--color-warn-text)" }}>{tr("Enter the Az, Dip and Length above (a length above 0).")}</div>}
      {pat.error === "inputs" && <div style={small}>{tr("Enter the E / N above, a bearing, a spacing and a number of holes; for more than one line, a line spacing.")}</div>}
      <button type="button" onClick={add} disabled={!ready} style={{ ...btn, width: "100%", marginTop: 5, opacity: ready ? 1 : 0.5 }}>{ready ? tr("+ Add {n} hole(s)", { n: placed.length }) : tr("+ Add the holes")}</button>
      {done && <div role="status" style={{ ...small, marginTop: 4 }}>{done}</div>}
    </div>
  );
}
