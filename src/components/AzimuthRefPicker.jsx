import React from "react";

// TASKS.csv #547 — which north a set of azimuths (dip directions, strikes) was measured from: the compact form of
// the import dialog's #396 choice, for the outcrop-structure import and the field reference library.
// value: { ref: "grid" | "true" | "magnetic", date: "YYYY-MM-DD" }
export default function AzimuthRefPicker({ value, onChange, selectStyle, labelStyle, rowStyle }) {
  const v = value || { ref: "grid", date: "" };
  return (
    <>
      <div style={rowStyle}>
        <span style={labelStyle}>North</span>
        <select value={v.ref} onChange={(e) => onChange({ ...v, ref: e.target.value })} style={selectStyle} aria-label="North reference of the azimuths"
          title="Which north the dip directions / strikes were measured from. GeoStrix draws against the project grid; a compass reads magnetic north (~17° off grid in northern BC).">
          <option value="grid">Grid north (project grid)</option>
          <option value="true">True north</option>
          <option value="magnetic">Magnetic north (compass)</option>
        </select>
      </div>
      {v.ref === "magnetic" && (
        <div style={rowStyle}>
          <span style={labelStyle}>Measured on</span>
          <input type="date" value={v.date || ""} onChange={(e) => onChange({ ...v, date: e.target.value })} style={selectStyle} aria-label="Measurement date (for the declination)" title="The declination (IGRF-14) depends on the date." />
        </div>
      )}
    </>
  );
}
