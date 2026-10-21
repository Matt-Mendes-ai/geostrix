import React from "react";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

// TASKS.csv #547 — which north a set of azimuths (dip directions, strikes) was measured from: the compact form of
// the import dialog's #396 choice, for the outcrop-structure import and the field reference library.
// value: { ref: "grid" | "true" | "magnetic", date: "YYYY-MM-DD" }
export default function AzimuthRefPicker({ value, onChange, selectStyle, labelStyle, rowStyle }) {
  const v = value || { ref: "grid", date: "" };
  return (
    <>
      <div style={rowStyle}>
        <span style={labelStyle}>{tr("North")}</span>
        <select value={v.ref} onChange={(e) => onChange({ ...v, ref: e.target.value })} style={selectStyle} aria-label={tr("North reference of the azimuths")}
          title={tr("Which north the dip directions / strikes were measured from. GeoStrix draws against the project grid; a compass reads magnetic north (~17° off grid in northern BC).")}>
          <option value="grid">{tr("Grid north (project grid)")}</option>
          <option value="true">{tr("True north")}</option>
          <option value="magnetic">{tr("Magnetic north (compass)")}</option>
        </select>
      </div>
      {v.ref === "magnetic" && (
        <div style={rowStyle}>
          <span style={labelStyle}>{tr("Measured on")}</span>
          <input type="date" value={v.date || ""} onChange={(e) => onChange({ ...v, date: e.target.value })} style={selectStyle} aria-label={tr("Measurement date (for the declination)")} title={tr("The declination (IGRF-14) depends on the date.")} />
        </div>
      )}
    </>
  );
}
