// TASKS.csv #2536 (review #2486, WA lithium) — on 2,248 holes the only ways to check the holes of an area were to type their ids or pick one
// collar field: a 500 x 500 m block took 357 ids pasted into the filter. A typed E / N range checks the holes whose collars fall in it (and
// unchecks the rest), with the block's size and hole count shown before it is applied. Maths in lib/holeFilter.js holesInRange.
import React, { useMemo, useState } from "react";
import { t as tr } from "../lib/i18n.js";
import { holesInRange, visibilityPatch } from "../lib/holeFilter.js";

export default function ModelAreaRange({ collars = [], visibleHoles = {}, setVisibleHoles, small, inp }) {
  const [r, setR] = useState({ e0: "", e1: "", n0: "", n1: "" });
  const box = useMemo(() => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (const k of collars) { if (Number.isFinite(k.x)) { a = Math.min(a, k.x); b = Math.max(b, k.x); } if (Number.isFinite(k.y)) { c = Math.min(c, k.y); d = Math.max(d, k.y); } } return Number.isFinite(a) ? { e0: Math.floor(a), e1: Math.ceil(b), n0: Math.floor(c), n1: Math.ceil(d) } : null; }, [collars]);
  const typed = ["e0", "e1", "n0", "n1"].every((k) => r[k] !== "" && Number.isFinite(Number(r[k])));
  const hit = useMemo(() => (typed ? holesInRange(collars, { e0: Number(r.e0), e1: Number(r.e1), n0: Number(r.n0), n1: Number(r.n1) }) : null), [collars, r, typed]);
  const field = (k, label) => <label style={{ display: "flex", alignItems: "center", gap: 3 }}>{label}<input type="number" step="any" value={r[k]} placeholder={box ? String(box[k]) : ""} onChange={(e) => setR((p) => ({ ...p, [k]: e.target.value }))} aria-label={tr("Model area range: {v}", { v: label })} style={{ ...inp, width: 86 }} /></label>;
  if (!collars.length || !setVisibleHoles) return null;
  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={small}>{tr("Or check the holes whose collars lie in an E / N range (the grey numbers are the collars' extent):")}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{field("e0", tr("E from"))}{field("e1", tr("to"))}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{field("n0", tr("N from"))}{field("n1", tr("to"))}</div>
      {hit && <div style={small}>{tr("{n} of {m} holes in {w} × {h} m.", { n: hit.ids.length.toLocaleString(), m: collars.length.toLocaleString(), w: Math.round(hit.width).toLocaleString(), h: Math.round(hit.height).toLocaleString() })}</div>}
      <button type="button" disabled={!hit || !hit.ids.length} onClick={() => setVisibleHoles((v) => visibilityPatch(v, collars.map((c) => c.hole_id), hit.ids, "only"))} style={{ alignSelf: "flex-start", fontSize: "var(--font-size-sm)", padding: "4px 10px", borderRadius: 5, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", cursor: hit?.ids.length ? "pointer" : "default", opacity: hit?.ids.length ? 1 : 0.5 }}>{tr("Check only these holes")}</button>
    </div>
  );
}
