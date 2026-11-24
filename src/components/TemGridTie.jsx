// TASKS.csv #4058 — a ground TEM file whose coordinates are a local grid asks for its tie to the map (two or more control points) instead of being plotted
// where its eastings fall on the map. Shown by TemPane while the file is untied, and after the tie to say how well it fitted.
import React, { useState } from "react";
import { tieTemToMap } from "../lib/temGridTie.js";
import { smallSel, pBtn } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", lineHeight: 1.45 };

export default function TemGridTie({ data, onTied }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState(null);
  const lg = data?.localGrid;
  if (!lg) return null;
  if (data.placed === "project") return <div style={{ ...note, marginBottom: 6 }}>{tr("Placed on the project's local grid as the file gives it.")}</div>;
  const f = (v) => Math.round(v).toLocaleString();
  const tie = () => { try { tieTemToMap(data, text); setErr(null); onTied(); } catch (e) { setErr(e?.message || String(e)); } };
  return (
    <div style={{ marginBottom: 8 }}>
      {data.placed === "tie" && data.tie
        ? <div role="status" style={note}>{tr("Tied to the map with {n} control points: scale {scale}, rotation {rot}°, fit {rms} m.", { n: data.tie.n, scale: data.tie.scale.toFixed(4), rot: data.tie.rotationDeg.toFixed(2), rms: data.tie.rmsM.toFixed(1) })}</div>
        : <div role="alert" style={{ ...note, color: "var(--color-warn-text)" }}>{tr("This file's coordinates are on a local grid (eastings {x0} to {x1}, northings {y0} to {y1}), not on a map coordinate system. Tie the grid to the map before mapping or inverting it: enter two or more control points, one per line, as grid east, grid north, map east, map north (the map coordinates in the project's coordinate system).", { x0: f(lg.x[0]), x1: f(lg.x[1]), y0: f(lg.y[0]), y1: f(lg.y[1]) })}</div>}
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} spellCheck={false} placeholder={"50000 3000 452000 7544000" + String.fromCharCode(10) + "52600 3000 454600 7544000"} style={{ ...smallSel, width: "100%", fontFamily: "monospace", resize: "vertical", marginTop: 4 }} aria-label={tr("Control points of the file's local grid")} />
      {err && <div role="alert" style={{ ...note, color: "var(--color-warn-text)" }}>{err}</div>}
      <button type="button" onClick={tie} style={{ ...pBtn, justifyContent: "center", marginTop: 4 }}>{data.placed === "tie" ? tr("Tie again with these points") : tr("Tie the file to the map")}</button>
    </div>
  );
}
