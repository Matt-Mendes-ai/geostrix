// TASKS.csv #485 — pick a coordinate reference system by name or code (QGIS-style), from the CRSs GeoStrix can
// actually build (reproject.js listSupportedCrs). Type "9N", "albers", "wgs 84 utm 22S" or "3156"; the list
// filters on every word. Reused by the Cartography tab's project CRS, layer and file tools.
import React, { useMemo, useState } from "react";
import { listSupportedCrs, crsName } from "../lib/reproject.js";

const ALL = listSupportedCrs();
const MAX_SHOWN = 60;

export default function CrsPicker({ value, onChange, label, height = 190 }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = words.length ? ALL.filter((c) => { const hay = `${c.name} epsg:${c.code} ${c.code}`.toLowerCase(); return words.every((w) => hay.includes(w)); }) : ALL;
    return hits.slice(0, MAX_SHOWN);
  }, [q]);
  const current = value ? crsName(value) : null;
  return (
    <div>
      {label && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-caption)", marginBottom: 4 }}>{label}</div>}
      <div style={{ fontSize: "var(--font-size-base)", color: current ? "var(--color-text)" : "var(--color-text-muted)", marginBottom: 6 }}>
        {value ? <>{current || "Unrecognised CRS"} <span style={{ color: "var(--color-text-muted)" }}>· EPSG:{value}</span></> : "No CRS chosen"}
      </div>
      <input
        value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: name, zone or EPSG code (e.g. 9N, Albers, 32722)"
        aria-label="Search coordinate reference systems"
        style={{ width: "100%", boxSizing: "border-box", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 7px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" }}
      />
      <div role="listbox" aria-label="Coordinate reference systems" style={{ marginTop: 4, maxHeight: height, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg)" }}>
        {shown.map((c) => {
          const sel = Number(value) === c.code;
          return (
            <div
              key={c.code} role="option" aria-selected={sel} tabIndex={0}
              onClick={() => onChange(c.code)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(c.code); } }}
              style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 8px", cursor: "pointer", fontSize: "var(--font-size-sm)", background: sel ? "var(--color-selected-bg)" : "transparent", color: sel ? "var(--color-text)" : "var(--color-text-secondary)" }}
            >
              <span>{c.name}</span><span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>{c.code}</span>
            </div>
          );
        })}
        {!shown.length && <div style={{ padding: "6px 8px", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>No CRS matches. GeoStrix builds only the CRSs it has verified definitions for (TASKS.csv #489 adds more).</div>}
      </div>
    </div>
  );
}
