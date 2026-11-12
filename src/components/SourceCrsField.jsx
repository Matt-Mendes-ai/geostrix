// TASKS.csv #488 — the "Source CRS" of a file being imported, shown BY NAME and chosen with the same searchable
// picker as Cartography's project CRS (was a bare "EPSG" number box in each importer). Blank value = the
// importer's own default, spelled out in `defaultText` (e.g. "Same as project — NAD83(CSRS) / UTM zone 9N", or
// "From the file's own CRS tag"). Warns for NAD27 (approximate datum shift, #299) and for codes GeoStrix can't
// convert (#489: any approximate datum shift, via datumNote). value: "" | number | numeric string; onChange(code | "").
// TASKS.csv #2684 (#2275 / #2586) — mineGrid (opt-in): lib/mineGrid.js mineSourceOf(project). When given, the picker also offers 'Local mine
// grid (no CRS)', value "mine" (MINE_SOURCE): on a CRS project the file is read on the mine grid and brought in through its tie; on a project
// with no CRS its numbers are the project's own. A CRS project with no mine grid shows the answer disabled, saying where to set one up.
import React, { useState } from "react";
import CrsPicker from "./CrsPicker.jsx";
import { crsName, datumNote } from "../lib/reproject.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { MINE_SOURCE, isMineSource } from "../lib/mineGrid.js"; // TASKS.csv #2684

const linkBtn = { background: "none", border: "none", padding: 0, color: "var(--color-accent)", cursor: "pointer", fontSize: "var(--font-size-sm)", fontFamily: "inherit", flexShrink: 0 };

export default function SourceCrsField({ value, onChange, defaultText, label = "Source CRS", title, mineGrid = null }) {
  const [open, setOpen] = useState(false);
  const mine = !!mineGrid && isMineSource(value); // #2684
  const set = value !== "" && value != null && !mine;
  const name = set ? crsName(value) : null;
  const mineText = mine ? mineChoiceText(mineGrid) : null;
  return (
    <div style={{ marginBottom: 10 }} title={title}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: "var(--font-size-sm)" }}>
        <span style={{ color: "var(--color-text-faint)", flexShrink: 0 }}>{tr(label)}</span>
        <span style={{ flex: 1, minWidth: 0, color: set || mine ? "var(--color-text)" : "var(--color-text-secondary)", ...(set || mine ? null : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }) }} title={set || mine ? undefined : defaultText /* #1301 — one line; the whole sentence on hover */}>
          {mine ? mineText : set ? <>{name || tr("Unrecognized CRS")} <span style={{ color: "var(--color-text-muted)" }}>{tr("· EPSG:{value}", { value })}</span></> : defaultText}
        </span>
        {(set || mine) && <button type="button" style={linkBtn} onClick={() => { onChange(""); setOpen(false); }} title={tr("Back to the default")}>{tr("Reset")}</button>}
        <button type="button" style={linkBtn} onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? tr("Close") : tr("Change")}</button>
      </div>
      {open && (
        <div style={{ marginTop: 6 }}>
          {mineGrid && ( /* #2684 */
            <button type="button" style={{ ...linkBtn, display: "block", marginBottom: 6, ...(mineGrid.kind === "none" ? { color: "var(--color-text-faint)", cursor: "default" } : null) }}
              disabled={mineGrid.kind === "none"} aria-pressed={mine}
              title={mineGrid.kind === "none" ? tr("This project has no mine grid beside its CRS: set one up under Maps > Project CRS first.") : mineGrid.kind === "local" ? tr("The file's x / y are the project's own local-grid numbers: they are kept as they are.") : tr("The file's x / y are on the project's mine grid: they are brought into the project CRS through the grid's tie.")}
              onClick={() => { onChange(MINE_SOURCE); setOpen(false); }}>
              {mineGrid.name ? tr("Local mine grid \"{name}\" (no CRS)", { name: mineGrid.name }) : tr("Local mine grid (no CRS)")}
            </button>
          )}
          <CrsPicker value={set ? value : null} onChange={(c) => { onChange(c); setOpen(false); }} height={150} />
        </div>
      )}
      {set && !name && (
        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-danger-fg)", marginTop: 4, lineHeight: 1.4 }}>{tr("GeoStrix can't convert from EPSG:{value}, so the coordinates would be used as they are. Pick a CRS from the list.", { value })}</div>
      )}
      {set && datumNote(value) && (
        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", marginTop: 4, lineHeight: 1.4 }}>
          ⚠ {datumNote(value)}
        </div>
      )}
    </div>
  );
}

// TASKS.csv #2684 — the chosen answer, spelled out
function mineChoiceText(m) {
  if (m.kind === "local") return m.name ? tr("Local mine grid \"{name}\" (no CRS): the project's own numbers", { name: m.name }) : tr("Local mine grid (no CRS): the project's own numbers");
  if (m.kind === "tie") return m.name ? tr("Local mine grid \"{name}\" (no CRS), brought into the project CRS through its tie", { name: m.name }) : tr("Local mine grid (no CRS), brought into the project CRS through its tie");
  return tr("Local mine grid (no CRS): this project has none set up, so the coordinates would be kept as they are");
}
