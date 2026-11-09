// TASKS.csv #1990 — ASEG-GDF2 airborne survey import (.dfn + .dat), written from the public ASEG standard (clean room; aseg_gdf2 was read as
// a description of the format only). The .dfn defines the data record's fields in order, each 'NAME:FORMAT[:ATTRIBUTES]':
//   DEFN   ST=RECD,RT=COMM;RT:A4;COMMENTS:A76            a comment record (skipped)
//   DEFN 1 ST=RECD,RT=;LINE:I10:NULL=-99999,NAME=Line   a data-record field
//   DEFN 7 ST=RECD,RT=;EM_X:10F12.4:UNIT=fT              an array field: 10 values, 12 characters each
//   DEFN 99 ST=RECD,RT=;END DEFN
// FORMAT is [repeat]{I|F|E|D|A}width[.decimals]. The .dat holds one fixed-width record per line, fields in .dfn order; a line that does
// not fill the widths (some writers pad with single spaces) is read by whitespace when it has exactly the right number of values.
// Array fields become NAME[1]..NAME[n]. A value equal to the field's NULL, or '*', is missing.

const FMT = /^(\d+)?([IFEDA])(\d+)(?:\.(\d+))?$/i;

// .dfn text -> { fields: [{ name, type, width, count, nullValue, unit, longName }], columns, width, rtPrefix } (only the data record)
export function parseDfn(text) {
  const fields = [];
  let rtPrefix = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!/^DEFN\b/i.test(line)) continue;
    const semi = line.indexOf(";");
    if (semi < 0) continue;
    const head = line.slice(0, semi), body = line.slice(semi + 1).trim();
    const rt = (/RT=([^,;\s]*)/i.exec(head) || [])[1] ?? "";
    if (rt && rt.toUpperCase() !== "DATA") continue; // comment / header records
    if (/^END\s+DEFN/i.test(body)) break;
    // a data record can itself start with its record type ('RT:A4' as its first field)
    const parts = body.split(";").map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const [name, fmt, ...attrText] = part.split(":");
      const m = FMT.exec((fmt || "").trim());
      if (!name || !m) continue;
      const width = Number(m[3]), count = Number(m[1] || 1), type = m[2].toUpperCase();
      if (name.trim().toUpperCase() === "RT" && type === "A") { rtPrefix += width * count; continue; }
      const attrs = attrText.join(":");
      const nullM = /NULL\s*=\s*([^,]+)/i.exec(attrs), unitM = /UNITS?\s*=\s*([^,]+)/i.exec(attrs), nameM = /NAME\s*=\s*([^,]+)/i.exec(attrs);
      fields.push({ name: name.trim(), type, width, count, nullValue: nullM ? Number(nullM[1]) : null, unit: unitM ? unitM[1].trim() : "", longName: nameM ? nameM[1].trim() : "" });
    }
  }
  const columns = fields.flatMap((f) => (f.count > 1 ? Array.from({ length: f.count }, (_, i) => `${f.name}[${i + 1}]`) : [f.name]));
  const width = rtPrefix + fields.reduce((s, f) => s + f.width * f.count, 0);
  return { fields, columns, width, rtPrefix };
}

const isNull = (v, f) => v == null || !Number.isFinite(v) || (f.nullValue != null && Math.abs(v - f.nullValue) <= Math.abs(f.nullValue) * 1e-9 + 1e-9);

// one .dat line -> { column: value } for the kept columns (numbers, or text for A fields), or null for a blank / comment line
export function parseGdfLine(line, layout, keep = null) {
  const t = line.replace(/\r$/, "");
  if (!t.trim() || /^\s*COMM/i.test(t)) return null;
  const keepSet = keep ? new Set(keep) : null;
  const out = {};
  const tokens = t.length + 1 < layout.width ? t.trim().split(/\s+/) : null; // free-format writer
  if (tokens && tokens.length !== layout.columns.length + (layout.rtPrefix ? 1 : 0)) return null;
  let pos = layout.rtPrefix, k = layout.rtPrefix && tokens ? 1 : 0;
  for (const f of layout.fields) {
    for (let i = 0; i < f.count; i++) {
      const col = f.count > 1 ? `${f.name}[${i + 1}]` : f.name;
      const s = tokens ? tokens[k++] : t.slice(pos, pos + f.width);
      pos += f.width;
      if (keepSet && !keepSet.has(col)) continue;
      if (f.type === "A") { out[col] = (s || "").trim(); continue; }
      const v = s == null || s.trim() === "*" ? NaN : Number(s.trim().replace(/[dD]/, "e"));
      out[col] = isNull(v, f) ? null : v;
    }
  }
  return out;
}

// a whole (small) .dat -> rows
export function parseGdfText(text, layout, { keep = null, every = 1 } = {}) {
  const rows = [];
  let seen = 0;
  for (const line of String(text || "").split("\n")) {
    const r = parseGdfLine(line, layout, keep);
    if (!r) continue;
    if (seen++ % every === 0) rows.push(r);
  }
  return { rows, seen };
}

// a big .dat read in pieces (#1351's way), thinned to one record in `every`
export async function streamGdfRows(blob, { layout, keep = null, every = 1, onProgress = null, signal = null, chunkBytes = 4 << 20 } = {}) {
  const decoder = new TextDecoder("utf-8");
  const rows = [];
  let seen = 0, rest = "";
  const take = (line) => { const r = parseGdfLine(line, layout, keep); if (!r) return; if (seen++ % every === 0) rows.push(r); };
  for (let pos = 0; pos < blob.size; pos += chunkBytes) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const buf = await blob.slice(pos, Math.min(blob.size, pos + chunkBytes)).arrayBuffer();
    const text = rest + decoder.decode(buf, { stream: pos + chunkBytes < blob.size });
    let st = 0, e;
    while ((e = text.indexOf("\n", st)) >= 0) { take(text.slice(st, e)); st = e + 1; }
    rest = text.slice(st);
    onProgress?.(Math.min(blob.size, pos + chunkBytes) / blob.size);
  }
  if (rest) take(rest);
  return { rows, seen, kept: rows.length };
}

// the .dfn and .dat of one survey in a list of files: the pair with the same base name, else the only ones
export function gdfPair(files) {
  const base = (f) => String(f.name).replace(/\.[^.]+$/, "").toLowerCase();
  const dfns = files.filter((f) => /\.dfn$/i.test(f.name)), dats = files.filter((f) => /\.dat$/i.test(f.name));
  for (const d of dfns) { const dat = dats.find((x) => base(x) === base(d)); if (dat) return { dfn: d, dat }; }
  return dfns.length === 1 && dats.length === 1 ? { dfn: dfns[0], dat: dats[0] } : null;
}
