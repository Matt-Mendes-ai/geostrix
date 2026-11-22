// TASKS.csv #3990 — the Mineralization layer's 'Slices by mineral' in its Style dialog: each interval's tube cut into one wedge per mineral logged on
// it, each wedge's angle its share of the interval's per cent (lib/mineralSlices.js). The drawing's code loads before the style is set, so the
// rebuild that follows draws the slices at once.
import React, { useMemo, useState } from "react";
import { mineralAsTubes } from "../lib/viewer/mineralDraw.js";
import { loadSlices } from "../lib/viewer/slicesRegistry.js";
import { slicesOf } from "../lib/mineralSlices.js";
import { t as tr } from "../lib/i18n.js";

export default function MineralSlicesRow({ rows, style, onChange, row, lbl }) {
  const [failed, setFailed] = useState(null);
  const on = !!style?.slices;
  const noPct = useMemo(() => (on && rows?.length ? slicesOf(rows).noPct : 0), [on, rows]);
  if (!mineralAsTubes(rows)) return null; // points only: nothing to cut
  const set = (v) => { setFailed(null); if (!v) { onChange({ slices: null }); return; } loadSlices().then(() => onChange({ slices: true })).catch((e) => setFailed(e?.message || String(e))); };
  const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "-6px 0 10px 82px", lineHeight: 1.4 };
  return (
    <>
      <div style={row}>
        <span style={lbl}>{tr("Slices")}</span>
        <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: "var(--font-size-sm)" }}>
          <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />{tr("One slice per mineral, sized by its per cent")}
        </label>
      </div>
      {noPct > 0 && <div style={note}>{tr("{n} interval(s) have minerals with no per cent: their slices are equal.", { n: noPct.toLocaleString() })}</div>}
      {failed && <div role="alert" style={{ ...note, color: "var(--color-danger-text)" }}>{tr("The slices could not be loaded: {v}", { v: failed })}</div>}
    </>
  );
}
