// TASKS.csv #3431 (side session 2's note, from #3324) — the 3D slice's slab placed by a hole or a typed coordinate, beside the 0-1 slider (which
// spans the whole extent: one step is metres on a big property). Lazy: loaded when the 3D slice pane opens.
import React, { useState } from "react";
import { t as tr } from "../lib/i18n.js";
import { slabPosThrough } from "../lib/viewer/slicePlace.js";
import { sortHoleIds } from "../lib/holeIdList.js";
import { useHoleVisibility } from "../lib/holeVisibilityShare.js"; // TASKS.csv #3775 (9) — the checked holes (#3605)
import NumberInput from "./NumberInput.jsx"; // TASKS.csv #3926 — '0,05' and '0.05' both read

const inp = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 5px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" };

export default function SlicePlaceRow({ slice3d, setSlice3d, ext, origin, collars }) {
  const [e, setE] = useState(""), [n, setN] = useState(""), [rl, setRl] = useState(""), [msg, setMsg] = useState(null);
  const horizontal = slice3d.mode === "horizontal";
  const place = (pe, pn, prl, what) => {
    const r = slabPosThrough(ext, slice3d, origin, pe, pn, prl);
    if (!r) { setMsg(tr("Nothing to place the slice by here: load drillholes first, or type a number.")); return; }
    setSlice3d((s) => ({ ...s, pos: r.pos }));
    setMsg(r.outside ? tr("{what} is beyond the slice range: the slab is at its edge.", { what }) : null);
  };
  // TASKS.csv #3775 (9) — the holes listed are the checked ones, as every other tool follows the hole list (84 listed when 33 were checked); a note says how many are left out
  const shown = useHoleVisibility();
  const all = sortHoleIds((collars || []).map((c) => c.hole_id)), ids = all.filter((id) => shown?.[id] !== false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
      <select value="" onChange={(ev) => { const c = (collars || []).find((q) => q.hole_id === ev.target.value); if (c) place(c.x, c.y, c.z, c.hole_id); }} style={inp} aria-label={tr("Place the slice through a hole")}>
        <option value="">{horizontal ? tr("Place at a hole's collar elevation…") : tr("Place through a hole's collar…")}</option>
        {ids.map((id) => <option key={id} value={id}>{id}</option>)}
      </select>
      {ids.length < all.length && <div>{tr("The {n} checked holes of {all}.", { n: ids.length, all: all.length })}</div>}
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        {horizontal ? (
          <NumberInput allowEmpty value={rl === "" ? null : rl} placeholder={tr("RL (m)")} onChange={(v) => setRl(v == null ? "" : String(v))} style={{ ...inp, width: 90 }} aria-label={tr("Slice elevation (m RL)")} />
        ) : (<>
          <NumberInput allowEmpty value={e === "" ? null : e} placeholder="E" onChange={(v) => setE(v == null ? "" : String(v))} style={{ ...inp, width: 90 }} aria-label={tr("Slice through E")} />
          <NumberInput allowEmpty value={n === "" ? null : n} placeholder="N" onChange={(v) => setN(v == null ? "" : String(v))} style={{ ...inp, width: 90 }} aria-label={tr("Slice through N")} />
        </>)}
        <button type="button" disabled={horizontal ? rl === "" : e === "" || n === ""} onClick={() => (horizontal ? place(NaN, NaN, Number(rl), tr("That elevation")) : place(Number(e), Number(n), NaN, tr("That point")))} style={{ ...inp, cursor: "pointer" }}>{tr("Place")}</button>
      </div>
      {msg && <div role="status" style={{ color: "var(--color-warn-text)" }}>{msg}</div>}
    </div>
  );
}
