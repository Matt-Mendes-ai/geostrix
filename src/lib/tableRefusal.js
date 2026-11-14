// TASKS.csv #3320 (Galore Creek review: the contractor's 64-column DC / IP reading file .DAT was read by Point survey's 'Import survey .xyz' as
// points, the geometric factor k at the transmitter electrode imported as 'Radiometrics: K' in per cent; 'Import CSV' and DC / IP 'Import line'
// opened a column picker over ONE nonsense column) — a parsed table a picker cannot use is refused with a sentence: what it is not and what this
// button reads. The drop already said so (#2854); the buttons now do.
import { t as tr } from "./i18n.js";

// electrode position columns of a DC / IP reading file: Tx1East, Rx2North, Tx1Elev, T1X, R2Y (contractor) or C1_E, P2_N (a 3D array file)
const ELECTRODE = /^((tx|rx)\d*[_ ]?(east(ing)?|north(ing)?|elev(ation)?|[xyzen])|[tr]\d[xyz]|[cp]\d[_ ]?[enz])$/i;
const ARRAY_3D = /^[cp]\d[_ ]?[enz]$/i;
const LINE_2D = /^[tr]\d[xyz]$/i; // T1X R2X: a contractor TDIP line file, which DC / IP Import line reads (#600)
export const electrodeColumns = (columns) => (columns || []).filter((c) => ELECTRODE.test(String(c).trim()));

// what each button reads, for the sentence
const READS = {
  point: () => tr("Point survey reads CSV and Geosoft .xyz tables with X, Y and a value column for each point."),
  dcipLine: () => tr("Import line reads a CSV, a contractor TDIP .dat / .ipg or a Res2DInv .dat with A / M electrode positions and an apparent-resistivity column."),
};

// name, columns, rows, button ("point" | "dcipLine") -> one sentence when this button cannot use the table, else null
export function tableRefusal(name, columns, rows, button = "point") {
  const cols = (columns || []).filter((c) => String(c ?? "").trim() !== "");
  const reads = (READS[button] || READS.point)();
  if (cols.length <= 1) {
    const first = String(cols[0] ?? "").trim().slice(0, 60);
    return tr("\"{name}\" does not split into columns here (one column{first}), so it is not a table this button can read. {reads}", { name, first: first ? `: "${first}…"` : "", reads });
  }
  // Import line: a 3D reading file (electrode columns in east / north) that no line reader placed: its columns are map coordinates, not
  // distances along a line, so mapping them as A / M would be wrong
  if (button === "dcipLine") {
    const el3 = electrodeColumns(cols).filter((c) => /east|north/i.test(String(c)));
    if (el3.length >= 4) return tr("\"{name}\" is a 3D DC / IP reading file (electrode positions in east / north: {cols}), not a line along a profile. GeoStrix has no reader for this electrode layout yet. {reads}", { name, cols: el3.slice(0, 4).join(", ") + (el3.length > 4 ? ", …" : ""), reads });
  }
  if (button === "point") {
    const el = electrodeColumns(cols);
    if (el.length >= 4) {
      const how = el.some((c) => ARRAY_3D.test(String(c).trim())) ? tr("Read it with DC / IP › Read a 3D array file.")
        : el.some((c) => LINE_2D.test(String(c).trim())) ? tr("Read it with DC / IP › Import line (CSV / .dat).") // a contractor TDIP line file (#600)
        : tr("GeoStrix has no reader for this electrode layout yet.");
      return tr("\"{name}\" is a DC / IP reading file (electrode position columns: {cols}), not a table of points: each reading belongs between its electrodes, not at one of them. {how} {reads}", { name, cols: el.slice(0, 4).join(", ") + (el.length > 4 ? ", …" : ""), how, reads });
    }
  }
  return null;
}
