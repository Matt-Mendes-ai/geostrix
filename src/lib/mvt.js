// TASKS.csv #2011 — a minimal Mapbox Vector Tile reader: the layers, each feature's properties and geometry type, no geometry
// decoding (the legend for the Macrostrat drape needs to know WHICH map units a tile holds, not where). Pure, no dependency:
// protobuf varints and length-delimited fields only, per the MVT 2.1 spec (layer 3; layer: version 15, name 1, features 2,
// keys 3, values 4, extent 5; feature: id 1, tags 2, type 3, geometry 4; value: string 1, float 2, double 3, int 4, uint 5,
// sint 6, bool 7). Unknown fields are skipped. ~1-2 kB per Macrostrat carto tile at zoom 11.
const GEOM = { 1: "point", 2: "line", 3: "polygon" };

function reader(bytes, start = 0, end = bytes.length) {
  let pos = start;
  const varint = () => { let r = 0, s = 0, b; do { b = bytes[pos++]; r += s < 28 ? (b & 0x7f) << s : (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80); return r; };
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    get pos() { return pos; }, done: () => pos >= end,
    tag: () => { const k = varint(); return [k >>> 3, k & 7]; },
    varint,
    sint: () => { const v = varint(); return v % 2 ? -(v + 1) / 2 : v / 2; },
    bytes: () => { const n = varint(), s = pos; pos += n; return bytes.subarray(s, s + n); },
    string: function () { return new TextDecoder().decode(this.bytes()); },
    f32: () => { const v = dv.getFloat32(pos, true); pos += 4; return v; },
    f64: () => { const v = dv.getFloat64(pos, true); pos += 8; return v; },
    // (not `pos += varint()`: that reads pos before the varint moves it, and lands short by the length's own bytes)
    skip: (wire) => { if (wire === 0) varint(); else if (wire === 1) pos += 8; else if (wire === 2) { const n = varint(); pos += n; } else if (wire === 5) pos += 4; else throw new Error(`MVT: wire type ${wire}`); },
  };
}

function readValue(buf) {
  const r = reader(buf);
  let v = null;
  while (!r.done()) {
    const [f, w] = r.tag();
    if (f === 1) v = r.string(); else if (f === 2) v = r.f32(); else if (f === 3) v = r.f64(); else if (f === 4 || f === 5) v = r.varint(); else if (f === 6) v = r.sint(); else if (f === 7) v = !!r.varint(); else r.skip(w);
  }
  return v;
}

function readFeature(buf, keys, values) {
  const r = reader(buf);
  const out = { id: null, type: null, properties: {} }, tags = [];
  while (!r.done()) {
    const [f, w] = r.tag();
    if (f === 1 && w === 0) out.id = r.varint();
    else if (f === 2 && w === 0) tags.push(r.varint()); // a repeated field may come packed or one at a time
    else if (f === 2 && w === 2) { const t = reader(r.bytes()); while (!t.done()) tags.push(t.varint()); }
    else if (f === 3 && w === 0) out.type = GEOM[r.varint()] || "unknown";
    else r.skip(w);
  }
  for (let i = 0; i + 1 < tags.length; i += 2) { const k = tags[i], v = tags[i + 1]; if (k < keys.length && v < values.length) out.properties[keys[k]] = values[v]; }
  return out;
}

function readLayer(buf) {
  const r = reader(buf);
  const layer = { name: "", extent: 4096, features: [] }, keys = [], values = [], raw = [];
  while (!r.done()) {
    const [f, w] = r.tag();
    if (f === 1) layer.name = r.string(); else if (f === 2) raw.push(r.bytes()); else if (f === 3) keys.push(r.string()); else if (f === 4) values.push(readValue(r.bytes())); else if (f === 5) layer.extent = r.varint(); else r.skip(w);
  }
  layer.features = raw.map((b) => readFeature(b, keys, values)); // the keys / values tables may come after the features
  return layer;
}

// bytes (Uint8Array) -> [{ name, extent, features: [{ id, type, properties }] }]
export function readVectorTile(bytes) {
  const r = reader(bytes);
  const layers = [];
  while (!r.done()) { const [f, w] = r.tag(); if (f === 3) layers.push(readLayer(r.bytes())); else r.skip(w); }
  return layers;
}
