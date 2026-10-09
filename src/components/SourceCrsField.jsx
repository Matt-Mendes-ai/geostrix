// TASKS.csv #488 — the "Source CRS" of a file being imported, shown BY NAME and chosen with the same searchable
// picker as Cartography's project CRS (was a bare "EPSG" number box in each importer). Blank value = the
// importer's own default, spelled out in `defaultText` (e.g. "Same as project — NAD83(CSRS) / UTM zone 9N", or
// "From the file's own CRS tag"). Warns for NAD27 (approximate datum shift, #299) and for codes GeoStrix can't
// convert (#489: any approximate datum shift, via datumNote). value: "" | number | numeric string; onChange(code | "").
import React, { useState } from "react";
import CrsPicker from "./CrsPicker.jsx";
import { crsName, datumNote } from "../lib/reproject.js";

const linkBtn = { background: "none", border: "none", padding: 0, color: "var(--color-accent)", cursor: "pointer", fontSize: "var(--font-size-sm)", fontFamily: "inherit", flexShrink: 0 };

export default function SourceCrsField({ value, onChange, defaultText, label = "Source CRS", title }) {
  const [open, setOpen] = useState(false);
  const set = value !== "" && value != null;
  const name = set ? crsName(value) : null;
  return (
    <div style={{ marginBottom: 10 }} title={title}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: "var(--font-size-sm)" }}>
        <span style={{ color: "var(--color-text-faint)", flexShrink: 0 }}>{label}</span>
        <span style={{ flex: 1, minWidth: 0, color: set ? "var(--color-text)" : "var(--color-text-secondary)" }}>
          {set ? <>{name || "Unrecognized CRS"} <span style={{ color: "var(--color-text-muted)" }}>· EPSG:{value}</span></> : defaultText}
        </span>
        {set && <button type="button" style={linkBtn} onClick={() => { onChange(""); setOpen(false); }} title="Back to the default">Reset</button>}
        <button type="button" style={linkBtn} onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? "Close" : "Change"}</button>
      </div>
      {open && (
        <div style={{ marginTop: 6 }}>
          <CrsPicker value={set ? value : null} onChange={(c) => { onChange(c); setOpen(false); }} height={150} />
        </div>
      )}
      {set && !name && (
        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-danger-text)", marginTop: 4, lineHeight: 1.4 }}>
          GeoStrix can't convert from EPSG:{value}, so the coordinates would be used as they are. Pick a CRS from the list.
        </div>
      )}
      {set && datumNote(value) && (
        <div style={{ fontSize: "var(--font-size-sm)", color: "#e0a030", marginTop: 4, lineHeight: 1.4 }}>
          ⚠ {datumNote(value)}
        </div>
      )}
    </div>
  );
}
