// TASKS.csv #615 — choose the project CRS, anywhere on Earth: type roughly where the project is and pick from the
// UTM / national grids for that spot (regional datum first), or search every CRS GeoStrix can build. With collars
// loaded, the choice is checked by showing where on Earth they would land: a wrong UTM zone puts them hundreds of
// kilometres away, which the user sees at once (Matt's zone 10 data sat in zone 9, #614).
import React, { useMemo, useState } from "react";
import { X } from "./icons.js";
import CrsPicker from "./CrsPicker.jsx";
import { useStore } from "../lib/store.jsx";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";
import { crsName, datumNote } from "../lib/reproject.js";
import { crsCandidatesAt, parseLatLon, collarCentreLonLat, formatLonLat } from "../lib/projectCrs.js";

export default function ProjectCrsModal({ reason, points, onDone }) {
  const { project, collars: storeCollars, setEpsg, projectIsEmpty } = useStore();
  const collars = points?.length ? points : storeCollars; // the file being imported, when there is one
  const [where, setWhere] = useState("");
  const [choice, setChoice] = useState(project.crsSet ? Number(project.epsg) : null);
  const [searchAll, setSearchAll] = useState(false);
  const cancel = () => onDone(null);
  useEscapeKey(cancel);
  useFocusTrap();

  const at = parseLatLon(where);
  const candidates = useMemo(() => (at ? crsCandidatesAt(at.lon, at.lat) : []), [at?.lat, at?.lon]);
  const landing = choice ? collarCentreLonLat(collars, choice) : null;
  const relabel = project.crsSet && !projectIsEmpty && choice && choice !== Number(project.epsg);
  const kmFromStated = landing && at ? Math.round(Math.hypot((landing.lat - at.lat) * 111, (landing.lon - at.lon) * 111 * Math.cos((at.lat * Math.PI) / 180))) : null;

  const use = () => { if (!choice) return; setEpsg(choice); onDone(choice); };

  return (
    <div style={overlay}>
      <div style={panel} role="dialog" aria-modal="true" aria-label="Project coordinate system" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>Project coordinate system</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>
              {project.crsSet ? <>Now: {crsName(project.epsg) || "Unrecognised CRS"} · EPSG:{project.epsg}</> : "Not set yet. Choose the CRS your collar coordinates are in."}
            </div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label="Close" size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={cancel} />
        </div>
        <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {reason && <div style={{ ...note, color: "var(--color-text)" }}>{reason}</div>}
          <div style={note}>GeoStrix places every file, terrain and online map with this CRS. A collar CSV doesn&apos;t say which CRS it is in, and the numbers alone can&apos;t tell one UTM zone from the next.</div>

          <div>
            <div style={label}>Where is the project? (latitude, longitude — roughly is enough)</div>
            <input value={where} onChange={(e) => setWhere(e.target.value)} placeholder="e.g. 52.2, -121.3   or   23.5 S 46.6 W" aria-label="Project latitude and longitude" style={inp} />
            {where && !at && <div style={{ ...note, marginTop: 4 }}>Type latitude then longitude in decimal degrees (south and west negative, or add S / W).</div>}
            {candidates.length > 0 && (
              <div role="listbox" aria-label="Suggested CRSs" style={{ marginTop: 6, border: "1px solid var(--color-border)", borderRadius: 5 }}>
                {candidates.slice(0, 8).map((c, i) => (
                  <div key={c.code} role="option" aria-selected={choice === c.code} tabIndex={0} onClick={() => setChoice(c.code)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setChoice(c.code); } }}
                    style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 8px", cursor: "pointer", fontSize: "var(--font-size-sm)", background: choice === c.code ? "var(--color-selected-bg)" : "transparent", color: "var(--color-text)" }}>
                    <span>{c.name}{i === 0 ? <span style={{ color: "var(--color-text-muted)" }}> — most used here</span> : null}</span><span style={{ color: "var(--color-text-muted)" }}>{c.code}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <button type="button" onClick={() => setSearchAll((s) => !s)} style={linkBtn} aria-expanded={searchAll}>{searchAll ? "Hide the full list" : "Or search every CRS (name, zone or EPSG code)"}</button>
            {searchAll && <div style={{ marginTop: 6 }}><CrsPicker value={choice} onChange={setChoice} height={170} /></div>}
          </div>

          {choice && (
            <div style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: "8px 10px", fontSize: "var(--font-size-sm)", lineHeight: 1.45 }}>
              <div><b>{crsName(choice) || `EPSG:${choice}`}</b> <span style={{ color: "var(--color-text-muted)" }}>· EPSG:{choice}</span></div>
              {collars.length > 0 && (landing
                ? <div>Your {collars.length} collar{collars.length === 1 ? "" : "s"} would be at <b>{formatLonLat(landing)}</b>{kmFromStated != null && kmFromStated <= 50 ? ` — ${kmFromStated.toLocaleString()} km from where you said` : ""}.{kmFromStated > 50
                    ? <span style={{ color: "var(--color-danger-text)", fontWeight: 600 }}> That is {kmFromStated.toLocaleString()} km from where you said: almost certainly the wrong CRS or UTM zone.</span>
                    : " If that isn't the project, this is the wrong CRS or zone."}</div>
                : <div style={{ color: "var(--color-danger-text)" }}>The collar coordinates don&apos;t fit this CRS (they land off the globe), so it is the wrong one.</div>)}
              {datumNote(choice) && <div style={{ color: "#e0a030" }}>⚠ {datumNote(choice)}</div>}
              {relabel && <div style={{ color: "var(--color-text-secondary)" }}>This relabels the project: no coordinates change. To convert data into another CRS, use &quot;Reproject all data&quot; in the Cartography tab.</div>}
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button type="button" style={btn(false)} onClick={cancel}>{project.crsSet ? "Cancel" : "Decide later"}</button>
          <button type="button" style={btn(true)} disabled={!choice} onClick={use}>{choice ? `Use ${crsName(choice) || `EPSG:${choice}`}` : "Choose a CRS"}</button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(620px, 96vw)", maxHeight: "90vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--color-border)" };
const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };
const label = { fontSize: "var(--font-size-sm)", color: "var(--color-text-caption)", marginBottom: 4 };
const inp = { width: "100%", boxSizing: "border-box", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 7px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const linkBtn = { background: "none", border: "none", padding: 0, color: "var(--color-accent)", cursor: "pointer", fontSize: "var(--font-size-sm)", fontFamily: "inherit" };
const btn = (primary) => ({ padding: "7px 14px", borderRadius: 6, fontSize: "var(--font-size-base)", fontFamily: "inherit", cursor: "pointer", border: primary ? "1px solid var(--color-accent)" : "1px solid var(--color-border)", background: primary ? "var(--color-accent)" : "var(--color-bg)", color: primary ? "var(--color-bg)" : "var(--color-text)" });
