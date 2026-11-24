// TASKS.csv #4058 — Maxwell (EMIT) ground TEM files, the .tem a SMARTem24 / DigiAtlantis survey is processed to: a "TEM File Created by MAXWELL"
// header of KEY:VALUE words (CONFIG:INLOOP | SLINGRAM, LINE:, BFIELD:, a LOOP: block ...), "/TIMES(ms)=" gate times, one column-header line (EAST NORTH
// LEVEL ELEV STATION COMPONENT UNITS ... CH1 ... CHn) and ONE ROW PER COMPONENT: a station's Z, X and Y rows repeat its EAST / NORTH / STATION.
// A multi-line file puts "LINE:<n>" separator rows before each line's block (and a "/"-commented copy of the header mid-file). "*" is a missing gate.
// Pure. Read by temLines.readTemText.
export const isMaxwellTem = (text) => /^\s*TEM File Created by MAXWELL/i.test(String(text || "").slice(0, 400)) || (/\bDATATYPE:TEM\b/.test(String(text || "").slice(0, 2000)) && /\bCONFIG:/.test(String(text || "").slice(0, 2000)));

const num = (t) => { if (t == null || t === "*" || t === "") return NaN; const v = Number(t); return Number.isFinite(v) ? v : NaN; };
const GATE = /^CH(\d+)$/i;

// -> { header: {KEY: value}, config, times (ms) | null, gates: ['CH1', …], components: ['Z', 'X', 'Y'] (Z first), stations: [{ line, x, y, elev, station, comps: { Z: Float64Array, … } }], units, rows }
export function parseMaxwellTem(text) {
  const lines = String(text || "").split(/\r\n|\r|\n/);
  const header = {};
  let times = null, cols = null, line = null, rows = 0;
  const by = new Map(), stations = [], compOrder = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    if (l.startsWith("/")) {
      const m = l.match(/^\/\s*TIMES\s*\(ms\)\s*=\s*(.*)$/i);
      if (m && !times) { const t = m[1].split(/[,\s]+/).map(Number).filter(Number.isFinite); if (t.length) times = t; }
      continue;
    }
    if (!cols) {
      const toks = l.split(/\s+/);
      if (toks.length >= 6 && toks.some((t) => /^EAST$/i.test(t)) && toks.some((t) => /^COMPONENT$/i.test(t))) { cols = toks.map((t) => t.toUpperCase()); continue; }
      for (const m of l.matchAll(/([A-Za-z][A-Za-z0-9_]*):(\S*)/g)) if (!(m[1].toUpperCase() in header)) header[m[1].toUpperCase()] = m[2];
      continue;
    }
    const sep = l.match(/^LINE\s*:\s*(\S+)/i);
    if (sep) { line = sep[1]; continue; }
    const t = l.split(/\s+/);
    if (t.length !== cols.length) continue;
    const at = (name) => t[cols.indexOf(name)];
    const comp = String(at("COMPONENT") || "").toUpperCase();
    if (!comp) continue;
    const key = `${line ?? header.LINE ?? ""}|${at("EAST")}|${at("NORTH")}|${at("STATION")}`;
    let s = by.get(key);
    if (!s) {
      s = { line: String(line ?? header.LINE ?? "1"), x: num(at("EAST")), y: num(at("NORTH")), elev: num(at("ELEV")), station: num(at("STATION")), comps: {} };
      by.set(key, s); stations.push(s);
    }
    if (!compOrder.includes(comp)) compOrder.push(comp);
    s.comps[comp] = Float64Array.from(cols.flatMap((c, i) => (GATE.test(c) ? [num(t[i])] : [])));
    rows++;
  }
  if (!cols) throw new Error("No column header line (EAST NORTH … COMPONENT … CH1 …) found in this Maxwell .tem file.");
  if (!stations.length) throw new Error("No data rows found in this Maxwell .tem file.");
  const gates = cols.filter((c) => GATE.test(c));
  const unitCol = cols.indexOf("UNITS");
  let units = null;
  if (unitCol >= 0) for (const raw of lines) { const t = raw.trim().split(/\s+/); if (t.length === cols.length && /^[XYZ]$/i.test(t[cols.indexOf("COMPONENT")])) { units = t[unitCol]; break; } }
  const components = [...compOrder].sort((a, b) => "ZXY".indexOf(a) - "ZXY".indexOf(b) || compOrder.indexOf(a) - compOrder.indexOf(b)); // Z first: the decay and the 1D inversion read it
  return { header, columns: cols, config: header.CONFIG || null, times: times && times.length === gates.length ? times : null, gates, components, stations, units, rows };
}
