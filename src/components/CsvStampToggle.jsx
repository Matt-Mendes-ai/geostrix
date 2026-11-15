// TASKS.csv #3614 — the one checkbox for the '# ' header lines of the report CSVs (lib/csvStampPref.js): off unless the user wants the parameters in the file.
import React, { useState } from "react";
import { csvStampOn, setCsvStamp } from "../lib/csvStampPref.js";
import { t as tr } from "../lib/i18n.js";

export default function CsvStampToggle() {
  const [on, setOn] = useState(csvStampOn);
  return (
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", cursor: "pointer" }} title={tr("Lines starting with # above the column names say which tool, CRS and parameters made the file. Leave off for a file an import wizard opens at its first row.")}>
      <input type="checkbox" checked={on} onChange={(e) => { setCsvStamp(e.target.checked); setOn(e.target.checked); }} />{tr("Add the # header lines (tool, CRS, parameters) to the CSV")}
    </label>
  );
}
