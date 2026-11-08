// TASKS.csv #1689 (review #1645, Copley) — the note under an artificially closed body's volume. A grade shell's boundary is where the
// search radius ran out of samples; a unit body (#1340) or an alteration envelope is lithology, not grade, and was told 'it is not a grade
// boundary ... where grades might extend'. Worded per kind of body, as #1340 did for the notices. (Moved out of ViewerModule.jsx.)
import React from "react";
import { t as tr } from "../../lib/i18n.js";

export default function ClosureNote({ type }) {
  const [head, body] = type === "unit_body"
    ? [tr("This body was closed artificially."), tr("Part of its boundary is not a logged contact with another code — it is where the search radius ran out of intervals. Its volume therefore depends on the search radius, not only on the logs. Treat it as a picture of where the unit might extend, not a measured volume.")]
    : type === "alteration_envelope"
      ? [tr("This envelope was closed artificially."), tr("Part of its boundary is not a logged alteration boundary — it is where the search radius ran out of intervals. Its volume therefore depends on the search radius, not only on the logs. Treat it as a picture of where the alteration might extend, not a measured volume.")]
      : [tr("This shell was closed artificially."), tr("Part of its boundary is not a grade boundary — it is where the search radius ran out of samples. The volume therefore depends on your search radius, not only on the data: doubling the search radius roughly multiplies the volume by eight. Treat it as a visualization of where grades might extend, not a measured volume.")];
  return (
    <div style={{ fontSize: "var(--font-size-xs)", color: "#a5691f", marginBottom: 6, lineHeight: 1.45 }}>
      <strong>{head}</strong>{" "}{body}
    </div>
  );
}
