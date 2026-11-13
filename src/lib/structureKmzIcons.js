// TASKS.csv #3066 / #3068 — the KMZ icons of outcrop structures, shared by the outcrop set's own KMZ (SurfaceMappingPanel) and the project
// KMZ (#3068): each distinct USGS (FGDC) symbol rasterised once, in WHITE (the KML <color> tints it to the class colour), and per reading the
// icon's href and the heading Google Earth turns it by (the true right-hand-rule strike, as #2681's strike icon). Pure: no DOM.
import { projectSymbolChoices, symbolForReading, lineScaleOf } from "./structureSymbols.js";
import { symbolPng } from "./structureSymbolPng.js";
import { azimuthToGridOffset, wrap360 } from "./azimuthRef.js";

const num = (v) => (v === "" || v == null ? NaN : Number(v));
export { lineScaleOf }; // TASKS.csv #3091 — kept in lib/structureSymbols.js
const fileName = (symbol, scale) => `files/sym_${String(symbol.fgdc).replace(/[^0-9a-z]+/gi, "_")}${scale === 1 ? "" : `_w${Math.round(scale * 100)}`}.png`;
// a reading has an attitude when it has a dip and a dip direction, or is horizontal (dip 0 / flagged, #2958: no direction needed)
const hasAttitude = (r) => Number.isFinite(num(r?.dip)) && (Number.isFinite(num(r?.dipDir)) || r?.horizontal || num(r?.dip) === 0);

// -> { files: [{ name, data }], iconOf(row, set) -> { href, heading } | null }. epsg: the project CRS, so a grid dip direction (#547) turns to
// true north; without one (or where the CRS cannot give the convergence) the grid bearing is used.
export async function structureIconSet(surfaceStructures, { px = 64, epsg = null } = {}) {
  const sets = surfaceStructures || [], choices = projectSymbolChoices(sets), files = new Map();
  const iconFor = (row, set) => {
    if (!hasAttitude(row)) return null;
    const { symbol } = symbolForReading({ ...row, dip: num(row.dip) }, choices), scale = lineScaleOf(set), name = fileName(symbol, scale);
    if (!files.has(name)) files.set(name, { name, symbol, scale });
    return name;
  };
  for (const set of sets) for (const r of set?.rows || []) iconFor(r, set);
  const out = [...files.values()].map((f) => ({ name: f.name, data: symbolPng(f.symbol, px, { strokeScale: f.scale }) }));
  const known = new Set(files.keys());
  return {
    files: out,
    iconOf(row, set) {
      const href = iconFor(row, set);
      if (!href || !known.has(href)) return null; // a reading of a set not given here: no icon packed for it, the caller falls back
      const dd = num(row.dipDir);
      if (!Number.isFinite(dd)) return { href, heading: 0 }; // horizontal with no direction: the symbol has no strike to turn by
      let ddTrue = dd;
      if (epsg && Number.isFinite(row.x) && Number.isFinite(row.y)) { const off = azimuthToGridOffset("true", row.x, row.y, epsg); if (off) ddTrue = wrap360(dd - off.offset); }
      return { href, heading: Math.round(wrap360(ddTrue - 90) * 10) / 10 };
    },
  };
}
