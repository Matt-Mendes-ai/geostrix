// TASKS.csv #3955 (Matt: "I worked in projects where they wouldn't have a z for drill holes. We should give the user the option to calculate the z from DEM.") —
// the collar import dialog, when no elevation column is mapped: where the elevation comes from. With a terrain loaded: the terrain (the default; #2169 did this
// without saying so) or the median of the other collars; with none: said, and GeoStrix offers to place them when one is added (CollarZFromTerrain.jsx).
import React from "react";
import { useStore } from "../lib/store.jsx";
import { t as tr } from "../lib/i18n.js";
import NumberInput from "./NumberInput.jsx"; // TASKS.csv #4085 — a fixed elevation

const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };

export default function CollarElevationChoice({ modal, onChange }) {
  const { terrain } = useStore();
  if (modal.target !== "collars" || modal.mapping?.z) return null;
  const fromTerrain = modal.zFromTerrain !== false;
  const fixedOn = !terrain && !!modal.zFixedOn; // #4085
  return (
    <div style={{ marginBottom: 14, border: "1px solid var(--color-border)", borderRadius: 6, padding: "8px 10px" }} data-collar-elevation-choice="">
      <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text)", fontWeight: 600 }}>{tr("Elevation")}</div>
      {terrain ? (
        <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4, fontSize: "var(--font-size-sm)" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "flex-start" }}><input type="radio" name="collarZFrom" checked={fromTerrain} onChange={() => onChange({ ...modal, zFromTerrain: true })} style={{ marginTop: 2 }} />
            <span>{tr("From the terrain \"{name}\"", { name: terrain.name || "DEM" })}</span></label>
          <label style={{ display: "flex", gap: 6, alignItems: "flex-start" }}><input type="radio" name="collarZFrom" checked={!fromTerrain} onChange={() => onChange({ ...modal, zFromTerrain: false })} style={{ marginTop: 2 }} />
            <span>{tr("The median of the other collars (flagged ASSUMED)")}</span></label>
        </div>
      ) : (
        // TASKS.csv #4085 — with no terrain, asked once: the median of the other collars, or an elevation typed here (both flagged ASSUMED; the terrain is offered when one is added)
        <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4, fontSize: "var(--font-size-sm)" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "flex-start" }}><input type="radio" name="collarZFrom" checked={!fixedOn} onChange={() => onChange({ ...modal, zFixedOn: false, zFixed: null })} style={{ marginTop: 2 }} />
            <span>{tr("The median of the other collars")}</span></label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="radio" name="collarZFrom" checked={fixedOn} onChange={() => onChange({ ...modal, zFixedOn: true })} />
            <span>{tr("A fixed elevation (m)")}</span>
            <NumberInput allowEmpty value={modal.zFixed ?? null} onChange={(n) => onChange({ ...modal, zFixedOn: true, zFixed: n })} style={{ width: 80, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "2px 6px", color: "var(--color-text)" }} /></label>
          <div style={note}>{tr("Both flagged ASSUMED; the terrain is offered later.")}</div>
        </div>
      )}
    </div>
  );
}
