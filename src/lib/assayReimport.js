// TASKS.csv #3217 (#3195, Galore Creek) — a second assay import into a project whose units were set by hand at the first one (seven *_pct columns
// read as ppm) opened as on a blank project: the menus read % again, the over-limit box was ticked again and the hand-added columns were not offered.
// With the defaults kept, "converted to the project's unit" multiplied the seven elements by 10,000 (mean Cu 2,222 ppm -> 22,222,900 ppm).
// Pure: the dialog's elements seeded from the project's assayElements, the import choices the project kept, and a conversion that would put
// values over 100 %.
import { parseAssayValue, oxideOfHeader, convertUnit, isAllNinesCode, LOI } from "./geochem.js";

// elements: the dialog's ({ symbol, header, unit, checked, … }); project: the project's assayElements; headers: the file's
// -> { elements, seeded: [{ symbol, header, unit }] } — `seeded` are the elements given last time's header / unit (marked asLastTime)
export function seedFromProject(elements, project, headers) {
  const inFile = new Set(headers || []);
  const bySym = new Map((project || []).filter((p) => p?.symbol && p.header && !p.calculated).map((p) => [p.symbol, p]));
  const seeded = [];
  const usable = (p) => p && inFile.has(p.header) && !oxideOfHeader(p.header) && p.symbol !== LOI; // an oxide's stored unit is its basis, not the column's
  const out = (elements || []).map((e) => {
    const p = bySym.get(e.symbol);
    if (!usable(p) || oxideOfHeader(e.header)) return e;
    const sameHeader = p.header === e.header;
    if (sameHeader && !p.unitChosen) return p.join !== undefined && e.methodCols?.length ? { ...e, join: p.join } : e; // nothing chosen by hand
    const next = { ...e, header: p.header, unit: p.unit, asLastTime: true, ...(p.unitChosen ? { unitChosen: true } : {}) };
    if (p.join !== undefined && e.methodCols?.length) next.join = p.join;
    seeded.push({ symbol: e.symbol, header: p.header, unit: p.unit });
    return next;
  });
  // the columns added by hand last time (no auto-detected row of their own): offered again, ticked
  const have = new Set(out.map((e) => e.symbol));
  for (const p of bySym.values()) {
    if (have.has(p.symbol) || !usable(p)) continue;
    out.push({ symbol: p.symbol, header: p.header, mainHeader: p.header, unit: p.unit, checked: true, asLastTime: true, ...(p.unitChosen ? { unitChosen: true } : {}) });
    seeded.push({ symbol: p.symbol, header: p.header, unit: p.unit });
  }
  return { elements: out, seeded };
}

// the import choices kept on the project's elements (commit writes them as lastImport), when every element of this file that has one agrees
// -> { overLimitCodes?, negativeMode?, blankMode? }
export const IMPORT_CHOICE_KEYS = ["overLimitCodes", "negativeMode", "blankMode"];
export function projectImportChoices(project, symbols) {
  const want = new Set(symbols || []), out = {};
  for (const k of IMPORT_CHOICE_KEYS) {
    const vals = new Set((project || []).filter((p) => want.has(p?.symbol) && p.lastImport && p.lastImport[k] !== undefined).map((p) => p.lastImport[k]));
    if (vals.size === 1) out[k] = [...vals][0];
  }
  return out;
}
export const importChoicesOf = (modal) => ({ overLimitCodes: modal.overLimitCodes !== false, negativeMode: modal.negativeMode || "bdl", blankMode: modal.blankMode || "missing" });

// a conversion to the project's unit that would put readings over 100 % (1,000,000 ppm): the file's column is not in the unit the dialog says
// rows: the file's rows; clashes: the elements being converted ({ symbol, header, unit }) -> [{ symbol, header, unit, n, max }] (max in the dialog's unit)
export function conversionsOver100(rows, clashes, { sample = 50000 } = {}) {
  const out = [];
  const list = (clashes || []).filter((e) => e?.header && e.symbol !== LOI && !oxideOfHeader(e.header));
  if (!list.length || !(rows || []).length) return out;
  const step = Math.max(1, Math.floor(rows.length / sample));
  for (const e of list) {
    let n = 0, max = -Infinity;
    for (let i = 0; i < rows.length; i += step) {
      const v = parseAssayValue(rows[i]?.[e.header]);
      if (v == null || !Number.isFinite(v) || v <= 0 || isAllNinesCode(-v)) continue; // a 9999 is a code, not a reading
      if (convertUnit(v, e.unit, "ppm") > 1e6) { n++; if (v > max) max = v; }
    }
    if (n) out.push({ symbol: e.symbol, header: e.header, unit: e.unit, n: step > 1 ? n * step : n, max });
  }
  return out;
}
