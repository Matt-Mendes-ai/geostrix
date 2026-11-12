// TASKS.csv #1689 (review #1645, Copley) — the note under an artificially closed body's volume. A grade shell's boundary is where the
// search radius ran out of samples; a unit body (#1340) or an alteration envelope is lithology, not grade, and was told 'it is not a grade
// boundary ... where grades might extend'. Worded per kind of body, as #1340 did for the notices. (Moved out of ViewerModule.jsx.)
import React from "react";
import { t as tr } from "../../lib/i18n.js";

// TASKS.csv #2693 — a grade shell run along a FLAT search (its trend's ellipsoid, params.searchEllipsoidM, thinnest axis a third of the
// longest or less) says what that implies: its top and base are likely real grade boundaries, so doubling the radius grows it in two
// directions (about four times), not three (up to eight). -> [a, b, c] (m, longest first) or null
export function flatSearchAxes(params) {
  const ax = (params?.searchEllipsoidM || []).map(Number).filter((v) => Number.isFinite(v) && v > 0).sort((x, y) => y - x);
  return ax.length === 3 && ax[2] <= ax[0] / 3 && ax[1] > ax[2] * 1.5 ? ax : null;
}

export default function ClosureNote({ type, params = null }) {
  const [head, body] = type === "unit_body"
    ? [tr("This body was closed artificially."), tr("Part of its boundary is not a logged contact with another code — it is where the search radius ran out of intervals. Its volume therefore depends on the search radius, not only on the logs. Treat it as a picture of where the unit might extend, not a measured volume.")]
    : type === "alteration_envelope"
      ? [tr("This envelope was closed artificially."), tr("Part of its boundary is not a logged alteration boundary — it is where the search radius ran out of intervals. Its volume therefore depends on the search radius, not only on the logs. Treat it as a picture of where the alteration might extend, not a measured volume.")]
      : [tr("This shell was closed artificially."), tr("Part of its boundary is not a grade boundary — it is where the search radius ran out of samples. The volume therefore depends on your search radius, not only on the data: doubling the search radius can multiply the volume by up to eight (less where the shell's top and base are real grade boundaries, as in a flat body). Treat it as a visualization of where grades might extend, not a measured volume.")];
  return (
    <div style={{ fontSize: "var(--font-size-xs)", color: "#a5691f", marginBottom: 6, lineHeight: 1.45 }}>
      <strong>{head}</strong>{" "}{body}
      {(() => { const f = type === "unit_body" || type === "alteration_envelope" ? null : flatSearchAxes(params); return f ? <>{" "}{tr("With this shell's flat search ({a} × {b} × {c} m along its trend), doubling the radius multiplies the volume by about four where its top and base are grade boundaries, and by up to eight where it closes on every side.", { a: f[0], b: f[1], c: f[2] })}</> : null; })()}
    </div>
  );
}
