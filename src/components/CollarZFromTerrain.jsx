// TASKS.csv #3955 (Matt, 2026-11-21: "We should give the user the option to calculate the z from DEM.") — mounted once in App.jsx:
//  (b) the action "Collar elevations from the terrain…" (opened by requestCollarZFromTerrain(), from Data QC): which holes (the ones with no elevation in
//      their file, placed at the median or 0 m by #2169: the default; or all), a preview (count, largest and median change, holes outside the terrain named),
//      Apply; Ctrl+Z undoes it (the collars are in the store's history), and each hole keeps its old elevation in z_before_snap;
//  (c) the one-click offer: a terrain arrives (a fetch, an import, not a project coming forward) while collars at an assumed elevation exist.
// The rules are in lib/collarFromTerrain.js.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { X } from "./icons.js";
import { useStore } from "../lib/store.jsx";
import { assumedForTerrain, planCollarsFromTerrain, applyCollarsFromTerrain, planBrief } from "../lib/collarFromTerrain.js";
import { onCollarZRequest } from "../lib/collarTerrainRequests.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, panel, header, rowBtn, backdropProps } from "../lib/modalStyles.js";
import { t as tr } from "../lib/i18n.js";

const small = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };
const idList = (ids) => ids.slice(0, 8).join(", ") + (ids.length > 8 ? ", …" : "");
const terrainKey = (t) => (t ? `${t.name || ""}|${(t.bbox || []).join(",")}|${t.gridW || ""}x${t.gridH || ""}` : "");

// the result line: what moved, by how much, and what was left
const resultLine = (plan, terrain) => {
  const b = planBrief(plan);
  return tr("{n} collar(s) placed on the terrain \"{name}\" (largest change {max} m, median {median} m).", { n: b.n, name: terrain?.name || "DEM", max: b.max ?? 0, median: b.median ?? 0 })
    + (b.off ? " " + tr("{n} outside the terrain stay as they are: {ids}.", { n: b.off, ids: idList(plan.off) }) : "") + " " + tr("Ctrl+Z undoes it.");
};

function Dialog({ onClose, onDone }) {
  const { collars, terrain, setCollars } = useStore();
  const [which, setWhich] = useState("assumed");
  useEscapeKey(onClose);
  useFocusTrap();
  const nAssumed = useMemo(() => assumedForTerrain(collars).length, [collars]);
  const plan = useMemo(() => (terrain ? planCollarsFromTerrain(collars, terrain, { which }) : null), [collars, terrain, which]);
  const apply = () => {
    if (!plan?.count) return;
    setCollars((prev) => applyCollarsFromTerrain(prev, plan, terrain));
    onDone(resultLine(plan, terrain));
  };
  const b = plan ? planBrief(plan) : null;
  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panel({ width: "min(520px, calc(100vw - 32px))" })} role="dialog" aria-modal="true" aria-label={tr("Collar elevations from the terrain")} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <span style={{ fontWeight: 600 }}>{tr("Collar elevations from the terrain")}</span>
          <button type="button" onClick={onClose} aria-label={tr("Close")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><X size={16} /></button>
        </div>
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {!terrain ? <div style={small}>{tr("No terrain yet: add one (Maps > Terrain), then come back.")}</div> : (
            <>
              <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "var(--font-size-base)" }}>
                <label style={{ display: "flex", gap: 6, alignItems: "flex-start" }}><input type="radio" name="collarZWhich" checked={which === "assumed"} onChange={() => setWhich("assumed")} style={{ marginTop: 3 }} />
                  <span>{tr("Collars with no elevation in their file ({n}): now at the median or 0 m", { n: nAssumed })}</span></label>
                <label style={{ display: "flex", gap: 6, alignItems: "flex-start" }}><input type="radio" name="collarZWhich" checked={which === "all"} onChange={() => setWhich("all")} style={{ marginTop: 3 }} />
                  <span>{tr("All collars ({n}): replaces the elevations in the file", { n: (collars || []).length })}</span></label>
              </div>
              <div role="status" style={{ fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>
                {b.n ? tr("{n} collar(s) would move to the terrain \"{name}\": largest change {max} m, median {median} m.", { n: b.n, name: terrain.name || "DEM", max: b.max ?? 0, median: b.median ?? 0 }) : tr("No collar to move.")}
                {b.off > 0 && <div style={{ ...small, marginTop: 4 }}>{tr("{n} outside the terrain stay as they are: {ids}.", { n: b.off, ids: idList(plan.off) })}</div>}
                {which === "all" && b.n > 0 && <div style={{ ...small, marginTop: 4, color: "var(--color-warn-text)" }}>{tr("Elevations from the file are replaced; each hole keeps its old one.")}</div>}
              </div>
            </>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button type="button" style={rowBtn(false)} onClick={onClose}>{tr("Cancel")}</button>
          <button type="button" style={rowBtn(true)} onClick={apply} disabled={!plan?.count}>{tr("Apply")}</button>
        </div>
      </div>
    </div>
  );
}

export default function CollarZFromTerrain() {
  const { collars, terrain, setCollars, projectLoading } = useStore();
  const [open, setOpen] = useState(false);
  const [offer, setOffer] = useState(null); // { text, n, result } — the card
  useEffect(() => onCollarZRequest(() => setOpen(true)), []);
  // (c) a terrain arrives while assumed-elevation collars exist: offered once per terrain; a project coming forward (a file opened, a tab switched) is not "arriving"
  const key = terrainKey(terrain), seen = useRef(key);
  const assumed = useMemo(() => assumedForTerrain(collars), [collars]);
  useEffect(() => {
    if (projectLoading) { seen.current = key; setOffer(null); return; }
    if (!key || key === seen.current) return;
    seen.current = key;
    if (assumed.length) setOffer({ n: assumed.length, name: terrain?.name || "DEM" });
  }, [key, projectLoading, assumed.length]);
  const placeThem = () => {
    const plan = planCollarsFromTerrain(collars, terrain, { which: "assumed" });
    if (!plan.count) { setOffer(null); return; }
    setCollars((prev) => applyCollarsFromTerrain(prev, plan, terrain));
    setOffer({ result: resultLine(plan, terrain) });
  };
  return (
    <>
      {open && <Dialog onClose={() => setOpen(false)} onDone={(text) => { setOpen(false); setOffer({ result: text }); }} />}
      {offer && (
        <div data-collar-z-offer="" role="status" style={{ ...panel({ width: "min(400px, calc(100vw - 32px))" }), position: "fixed", right: 16, bottom: 40, zIndex: 56, padding: "12px 14px", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text)", lineHeight: 1.45 }}>
              {offer.result || tr("The terrain \"{name}\" is added, and {n} collar(s) have no elevation (placed at the median or 0 m). Place them on it?", { name: offer.name, n: offer.n })}
            </div>
            <button type="button" onClick={() => setOffer(null)} aria-label={tr("Close")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><X size={14} /></button>
          </div>
          {!offer.result && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={rowBtn(true)} onClick={placeThem}>{tr("Place them")}</button>
              <button type="button" style={rowBtn(false)} onClick={() => { setOffer(null); setOpen(true); }}>{tr("Preview…")}</button>
              <button type="button" style={rowBtn(false)} onClick={() => setOffer(null)}>{tr("Not now")}</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
