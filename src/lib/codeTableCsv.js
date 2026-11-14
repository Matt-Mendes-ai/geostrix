// TASKS.csv #3289 — the Downhole logs code table ('Figures per code') leaves as a CSV as well as 'Copy table' (tab-separated text). Export text is English.
// rows: the table's rows ({ key, n, readings?, mean, median, p10, p90 }); notLogged: the label of the 'not logged' key; unit: the log's unit
const fig = (v) => (Number.isFinite(v) ? String(Number(v.toPrecision(4))) : "");
export function codeTableCells(rows, { binned = false, unit = "", notLogged = "(not logged)" } = {}) {
  const u = unit ? ` (${unit})` : "";
  const head = ["Code", binned ? "Bins" : "Readings", ...(binned ? ["Readings"] : []), `Mean${u}`, `Median${u}`, `P10${u}`, `P90${u}`];
  const body = (rows || []).map((r) => [r.key === notLogged ? notLogged : String(r.key ?? "").trim() === "" ? "(blank)" : String(r.key), r.n, ...(binned ? [r.readings] : []), fig(r.mean), fig(r.median), fig(r.p10), fig(r.p90)]);
  return { head, body };
}
const cell = (v) => { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const codeTableCsv = (cells) => [cells.head, ...cells.body].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
export const codeTableText = (cells) => [cells.head, ...cells.body].map((r) => r.join("\t")).join("\n");
