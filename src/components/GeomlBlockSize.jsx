// TASKS.csv #4054 — the geoML panel's "Block size": one number for rock units and one for grade (metres), starting at the Quality's size (halved for
// closed solids) and saying so; what is typed wins; Reset goes back. Under it, the blocks the add-on will make, the extra time after training, a warning
// over a block count a modest computer handles badly, and a note when the add-on's own cap grows the block. The size rules are lib/geomlBlockSize.js.
import React, { useEffect, useState } from "react";
import { t as tr } from "../lib/i18n.js";
import { BLOCK_MIN_M, BLOCK_MAX_M, BLOCK_WARN, BLOCK_CAP } from "../lib/geomlBlockSize.js";

const note = { color: "var(--color-text-muted)", marginTop: 2 };
const warn = { color: "var(--color-warn-text)", marginTop: 2 };

// size: resolveBlockM's answer; plan: blockSizePlan's (or null with no holes); typed: the value set by the person (null: none); extra: the time text for the finer blocks
// the box commits on leaving it or Enter, so "25" is not read as 2 and held to the minimum on the way
export default function GeomlBlockSize({ size, plan, typed, onChange, extra, smallSel }) {
  const [text, setText] = useState(typed == null ? "" : String(typed));
  useEffect(() => setText(typed == null ? "" : String(typed)), [typed]); // a fix fills it, Reset clears it
  const commit = () => onChange(text.trim() === "" ? null : text);
  return (
    <div style={{ marginTop: 4, fontSize: "var(--font-size-xs)", lineHeight: 1.4 }}>
      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span>{tr("Block size (m)")}</span>
        <input type="number" min={BLOCK_MIN_M} max={BLOCK_MAX_M} step={5} value={text} placeholder={String(size.defaultM)} aria-label={tr("Block size (m)")}
          onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} style={{ ...smallSel, width: 64 }} />
        {typed != null && <button type="button" style={{ fontSize: "var(--font-size-xs)" }} onClick={() => onChange(null)}>{tr("Reset")}</button>}
      </label>
      <div style={note}>{size.source === "user" ? tr("Yours; the default is {m} m.", { m: size.defaultM }) : size.source === "halved" ? tr("Default: {m} m, half the quality's {q} m (closed solids).", { m: size.defaultM, q: size.qualityM }) : tr("Default: {m} m, from the quality.", { m: size.defaultM })}</div>
      {plan && (plan.more > 0
        ? <div style={note}>{tr("{c} m blocks (about {n}, not {n0}): about {t} more after training.", { c: plan.cell, n: plan.blocks.toLocaleString(), c0: plan.baseCell, n0: plan.baseBlocks.toLocaleString(), t: extra })}</div>
        : <div style={note}>{tr("{c} m blocks, about {n}.", { c: plan.cell, n: plan.blocks.toLocaleString() })}</div>)}
      {plan?.over && <div role="status" style={warn}>{tr("Over {w} blocks: slow on a modest computer.", { w: BLOCK_WARN.toLocaleString() })}</div>}
      {plan?.capped && <div role="status" style={warn}>{tr("The add-on keeps at most {max} blocks, so it grows them to {c} m.", { max: BLOCK_CAP.toLocaleString(), c: plan.cell })}</div>}
    </div>
  );
}
