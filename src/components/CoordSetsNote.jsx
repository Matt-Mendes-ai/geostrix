// TASKS.csv #2492 (review #2486, WA lithium) — in the collar import dialog: a file with more than one set of coordinate columns says which
// set is used and that the other is kept with each hole; X / Y / Z taken from different sets, and mine-grid-sized eastings mapped into a
// UTM / MGA project, are questioned before Import.
import React, { useMemo } from "react";
import { judgeCoordMapping, setText, isUtmLikeEpsg } from "../lib/coordSets.js";
import { smallGridCoordinates } from "../lib/crsFromColumns.js";
import { crsName } from "../lib/reproject.js";
import { t as tr } from "../lib/i18n.js";

const note = { fontSize: "var(--font-size-sm)", lineHeight: 1.4, margin: "-2px 0 10px" };

export default function CoordSetsNote({ modal, project }) {
  const rows = modal.allRows || modal.sampleRows || [];
  const judged = useMemo(() => judgeCoordMapping(modal.headers, modal.mapping), [modal.headers, modal.mapping]);
  const small = useMemo(() => {
    const { x, y } = modal.mapping || {};
    if (!x || !y || !project?.crsSet || !isUtmLikeEpsg(project.epsg) || modal.localGridOn || modal.sourceEpsg || modal.perRowEpsgCol) return null;
    const num = (v) => parseFloat(String(v ?? "").replace(",", "."));
    return smallGridCoordinates(rows.map((r) => ({ x: num(r[x]), y: num(r[y]) })));
  }, [rows, modal.mapping, project?.crsSet, project?.epsg, modal.localGridOn, modal.sourceEpsg, modal.perRowEpsgCol]);
  if (modal.target !== "collars") return null;
  const { used, others, mixed } = judged;
  if (!others.length && !mixed && !small) return null;
  return (
    <div>
      {used && others.length > 0 && (
        <div role="note" style={{ ...note, color: "var(--color-text-secondary)" }}>
          {tr("This file has more than one set of coordinates: {used} (used here) and {others} (kept with each hole; Identify shows them).", { used: setText(used), others: others.map(setText).join("; ") })}
        </div>
      )}
      {mixed && (
        <div role="alert" style={{ ...note, color: "var(--color-warn-text)" }}>
          {mixed.whole
            ? tr("Easting, Northing and Elevation come from different coordinate sets ({cols}), so each collar would mix two grids. {whole} is one whole set.", { cols: mixed.cols.join(", "), whole: setText(mixed.whole) })
            : tr("Easting, Northing and Elevation come from different coordinate sets ({cols}), so each collar would mix two grids.", { cols: mixed.cols.join(", ") })}
        </div>
      )}
      {small && (
        <div role="alert" style={{ ...note, color: "var(--color-warn-text)" }}>
          {tr("{n} of {of} collars have eastings {x0}–{x1} and northings {y0}–{y1}, which no UTM / MGA zone has, though the project is in {crs}: they look like local mine-grid numbers. Map Easting and Northing to the file's map-grid columns, or tick \"X/Y are on a local mine grid\" below.", { n: small.n.toLocaleString(), of: small.of.toLocaleString(), x0: Math.round(small.x[0]).toLocaleString(), x1: Math.round(small.x[1]).toLocaleString(), y0: Math.round(small.y[0]).toLocaleString(), y1: Math.round(small.y[1]).toLocaleString(), crs: crsName(project.epsg) || `EPSG:${project.epsg}` })}
        </div>
      )}
    </div>
  );
}
