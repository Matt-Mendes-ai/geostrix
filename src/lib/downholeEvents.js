// TASKS.csv #2317 (split from #2162; WA drillhole review #2148) — regolith boundary EVENTS logged as hole-level depths (one depth per code
// per hole, not an interval): BOCO (base of complete oxidation), TOFR (top of fresh rock), TOSA (top of saprolite), WT (water table),
// BOA (base of alluvium). An event table (hole id, an event / boundary code column, one depth column, no from / to) is read as a custom
// point layer (code + depth): drawn as markers on the trace, listed in Identify and on sections, and offered to the Explicit surface tool as
// picks, one per hole, for a surface such as the base of oxidation. Pure: no UI, no imports (layers.js imports it).

// the codes this file can describe; any other code is kept as it is, undescribed
export const REGOLITH_EVENTS = {
  BOCO: "base of complete oxidation",
  TOFR: "top of fresh rock",
  TOSA: "top of saprolite",
  WT: "water table",
  BOA: "base of alluvium",
};

const norm = (h) => String(h ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const HOLE = /^(hole|holeid|hole_id|hole_no|hole_name|bhid|dhid|ddh|ddh_id|site_id)$/;
const CODE = /^(event|event_code|eventcode|event_type|event_name|boundary|boundary_code|boundary_type|regolith_event|regolith_boundary|horizon_code|marker_code|pick_code)$/;
const DEPTH = /^(depth|event_depth|depth_m|depth_metres|depth_meters|md|at)$/;
const FROMTO = /^(from|to|from_m|to_m|depth_from|depth_to|mfrom|mto|from_depth|to_depth|interval_from|interval_to)$/;

// -> true for a table of depth picks by code
export function looksLikeEventTable(headers) {
  const n = (headers || []).map(norm);
  return n.some((h) => HOLE.test(h)) && n.some((h) => CODE.test(h)) && n.some((h) => DEPTH.test(h)) && !n.some((h) => FROMTO.test(h));
}

// -> { hole_id, depth, value } header names for an event table, or null
export function eventMapping(headers) {
  if (!looksLikeEventTable(headers)) return null;
  const find = (re) => (headers || []).find((h) => re.test(norm(h))) || "";
  return { hole_id: find(HOLE), depth: find(DEPTH), value: find(CODE) };
}

// the layer's note: what the known codes in it stand for (project text: English) -> string | null
export function eventNotes(rows) {
  const seen = [...new Set((rows || []).map((r) => String(r.value ?? "").trim().toUpperCase()).filter((c) => REGOLITH_EVENTS[c]))];
  if (!seen.length) return null;
  return `Downhole events (one depth per code per hole): ${seen.map((c) => `${c} = ${REGOLITH_EVENTS[c]}`).join("; ")}.`;
}

// the depth-pick codes of the custom layers, for the Explicit surface tool: a layer counts when most of its rows carry a depth and no
// from / to. -> [{ key, layerId, layerName, code, tops: [{ hole_id, md }] (the shallowest per hole), holes }]
export function eventPickOptions(customLayers) {
  const out = [];
  for (const l of customLayers || []) {
    const rows = (l.rows || []).filter((r) => r && r.hole_id && Number.isFinite(Number(r.depth)) && r.from == null && r.to == null && r.value != null && String(r.value).trim() !== "");
    if (!rows.length || rows.length < 0.5 * (l.rows || []).length) continue;
    if (rows.some((r) => Number.isFinite(Number(r.value)) && String(r.value).trim() !== "") && rows.every((r) => Number.isFinite(Number(r.value)))) continue; // a numeric point log, not codes
    const byCode = new Map();
    for (const r of rows) {
      const code = String(r.value).trim(), md = Number(r.depth);
      let m = byCode.get(code); if (!m) byCode.set(code, (m = new Map()));
      const prev = m.get(r.hole_id);
      if (prev == null || md < prev) m.set(r.hole_id, md);
    }
    for (const [code, m] of byCode) {
      const tops = [...m].map(([hole_id, md]) => ({ hole_id, md })).sort((a, b) => (a.hole_id < b.hole_id ? -1 : a.hole_id > b.hole_id ? 1 : 0));
      out.push({ key: `${l.id}\u0001${code}`, layerId: l.id, layerName: l.name, code, tops, holes: tops.length });
    }
  }
  return out.sort((a, b) => b.holes - a.holes);
}

// the option to pre-select for a surface: one whose code is the surface's name or unit (BOCO for "BOCO", or "base of complete oxidation"),
// else the most-picked one -> option | null
export function defaultEventOption(options, surfaceName) {
  if (!options?.length) return null;
  const s = String(surfaceName ?? "").trim().toLowerCase();
  return options.find((o) => o.code.toLowerCase() === s)
    || options.find((o) => REGOLITH_EVENTS[o.code.toUpperCase()] && s.includes(REGOLITH_EVENTS[o.code.toUpperCase()]))
    || options[0];
}
