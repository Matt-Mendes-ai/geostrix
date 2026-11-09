// TASKS.csv #485 — pick a coordinate reference system by name or code (QGIS-style), from the CRSs GeoStrix can
// actually build (reproject.js listSupportedCrs). Type "9N", "albers", "wgs 84 utm 22S" or "3156"; the list
// filters on every word. Reused by the Cartography tab's project CRS, layer and file tools.
import React, { Suspense, useEffect, useMemo, useState } from "react";
import { listSupportedCrs, crsName, loadEpsgRegistry } from "../lib/reproject.js";
import { crsCandidatesAt, collarCentreLonLat } from "../lib/projectCrs.js"; // TASKS.csv #2243
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { useStore } from "../lib/store.jsx"; // #1469 — the project CRS first
import { rankCrs } from "../lib/crsSearch.js"; // #1469

const MAX_SHOWN = 60;
const CrsWorldMap = React.lazy(() => import("./CrsWorldMap.jsx")); // #1330

export default function CrsPicker({ value, onChange, label, height = 190, hideMap = false }) {
  const [q, setQ] = useState("");
  // TASKS.csv #834 — the verified list at once, the whole EPSG registry as soon as it has loaded
  const [all, setAll] = useState(listSupportedCrs);
  useEffect(() => { let alive = true; loadEpsgRegistry().then(() => { if (alive) setAll(listSupportedCrs()); }).catch(() => {}); return () => { alive = false; }; }, []);
  const store = useStore();
  const projectEpsg = store?.project?.epsg, crsSet = store?.project?.crsSet !== false, collars = store?.collars;
  // TASKS.csv #2243 (review #2174, WA gold) — the first 60 of an empty search were all Canadian and South American systems, so a WA user
  // read "no MGA zones" although typing found them. The zones that cover the project's own location come first, and the count says
  // the list goes on.
  const nearby = useMemo(() => { if (!crsSet || !projectEpsg) return []; const c = collarCentreLonLat(collars || [], projectEpsg); return c ? crsCandidatesAt(c.lon, c.lat).map((x) => x.code) : []; }, [crsSet, projectEpsg, collars]);
  const ranked = useMemo(() => rankCrs(all, q, [projectEpsg, value, ...nearby]), [q, all, projectEpsg, value, nearby]);
  const shown = useMemo(() => ranked.slice(0, MAX_SHOWN), [ranked]); // #1469
  const current = value ? crsName(value) : null;
  return (
    <div>
      {label && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-caption)", marginBottom: 4 }}>{label}</div>}
      <div style={{ fontSize: "var(--font-size-base)", color: current ? "var(--color-text)" : "var(--color-text-muted)", marginBottom: 6 }}>
        {value ? <>{current || tr("Unrecognized CRS")} <span style={{ color: "var(--color-text-muted)" }}>{tr("· EPSG:{value}", { value })}</span></> : tr("No CRS chosen")}
      </div>
      <input
        value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search: name, zone or EPSG code (e.g. 9N, MGA 51, Albers, 32722)")}
        aria-label={tr("Search coordinate reference systems")}
        style={{ width: "100%", boxSizing: "border-box", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 7px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" }}
      />
      {value && !hideMap && <div style={{ marginTop: 6 }}><Suspense fallback={null}><CrsWorldMap epsg={value} /></Suspense></div>}
      <div role="listbox" aria-label={tr("Coordinate reference systems")} style={{ marginTop: 4, maxHeight: height, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg)" }}>
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
        {ranked.length > shown.length && <div style={{ padding: "4px 8px", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("{shown} of {total} shown: type a name, zone or EPSG code to find the others.", { shown: shown.length, total: ranked.length.toLocaleString() })}</div>}{/* #2243 */}
        {!shown.length && <div style={{ padding: "6px 8px", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("No CRS matches. GeoStrix builds only the CRSs it has verified definitions for.")}</div>}{/* TASKS.csv #489 adds more */}
      </div>
    </div>
  );
}
