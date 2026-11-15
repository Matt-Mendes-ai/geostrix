// TASKS.csv #3614 (Fireweed rehearsal) — the '# ' provenance lines above a CSV's header (tool, CRS, parameters, the not-a-resource line) make a file open badly in an import wizard: its first row is
// a disclaimer, not the column names. They are now OFF by default for a plain table and a user's choice (kept on this computer: a personal preference, not project data) for the reports that carry
// parameters (composites, best intercepts). A zip of drillhole tables keeps its conventions in a provenance.txt beside the CSVs instead (lib/drillholeTables.js).
import { withStamp } from "./provenance.js";

const KEY = "geostrix.export.csvStamp";
export function csvStampOn() { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } }
export function setCsvStamp(on) { try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* storage unavailable: off */ } }
// the CSV as it will be written: with the '# ' lines when the user turned them on, else clean
export const stampedCsv = (csvText, lines) => (csvStampOn() ? withStamp(csvText, lines) : csvText);
