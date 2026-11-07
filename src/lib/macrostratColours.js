// TASKS.csv #2005 — Macrostrat's colour lookups (data CC BY 4.0): its 214 lithologies' colours for logged lithology codes, and the
// international time scale's colours for map units named by age ('Late Jurassic'). Matched on whole words, the most specific name
// winning; whatever matches nothing keeps its colour. Pure; the lists are fetched by lib/macrostratFetch.js when asked.

// common logging abbreviations -> a Macrostrat lithology name (the code itself only, never words inside a description)
const ABBREV = {
  lmst: "limestone", ls: "limestone", lst: "limestone", sst: "sandstone", sndst: "sandstone", ss: "sandstone", slst: "siltstone", sltst: "siltstone",
  sh: "shale", shl: "shale", mdst: "mudstone", cgl: "conglomerate", cong: "conglomerate", bx: "breccia", brx: "breccia", dol: "dolomite",
  dlst: "dolomite", dolo: "dolomite", cht: "chert", qtzt: "quartzite", and: "andesite", ands: "andesite", bsl: "basalt", bas: "basalt",
  rhy: "rhyolite", dac: "dacite", dact: "dacite", tf: "tuff", tuf: "tuff", tff: "tuff", grn: "granite", gdio: "granodiorite", gd: "granodiorite",
  dio: "diorite", gab: "gabbro", mnz: "monzonite", syn: "syenite", arg: "argillite", phyl: "phyllite", sch: "schist", gns: "gneiss",
  mbl: "marble", grw: "greywacke", gwke: "greywacke", sltn: "siltstone",
};
const HEX = /^#[0-9a-f]{6}$/i;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// the longest name in `list` found in text as whole words -> its entry, or null
function longestIn(text, list) {
  const t = ` ${String(text || "").toLowerCase().replace(/[_/,;()]+/g, " ")} `;
  let best = null;
  for (const e of list) if ((!best || e.name.length > best.name.length) && new RegExp(`[^a-z]${esc(e.name.toLowerCase())}[^a-z]`).test(t)) best = e;
  return best;
}

export function parseLithologies(json) {
  return (json?.success?.data || []).filter((l) => l?.name && HEX.test(l.color || "")).map((l) => ({ name: String(l.name), color: l.color.toUpperCase() }));
}
// codes: [{ value, name, description }] (name: the legend's label; description: the code's most frequent logged one)
// -> [{ value, lith, color, by: "code" | "name" | "description" }] for the codes that match
export function macrostratLithColours(codes, liths) {
  const byName = new Map(liths.map((l) => [l.name.toLowerCase(), l]));
  const out = [];
  for (const c of codes) {
    const ab = ABBREV[String(c.value ?? "").trim().toLowerCase()];
    let hit = ab && byName.get(ab) ? { l: byName.get(ab), by: "code" } : null;
    if (!hit) { const l = longestIn(c.value, liths); if (l) hit = { l, by: "code" }; }
    if (!hit && c.name && c.name !== c.value) { const l = longestIn(c.name, liths); if (l) hit = { l, by: "name" }; }
    if (!hit && c.description) { const l = longestIn(c.description, liths); if (l) hit = { l, by: "description" }; }
    if (hit) out.push({ value: c.value, lith: hit.l.name, color: hit.l.color, by: hit.by });
  }
  return out;
}

export function parseIntervals(json) {
  return (json?.success?.data || []).filter((i) => i?.name && HEX.test(i.color || "")).map((i) => ({ name: String(i.name), color: i.color.toUpperCase(), ma: [i.b_age, i.t_age], type: i.int_type || "" }));
}
// categories: [{ value, label? }] -> [{ value, interval, color }] for those whose value or label names an interval ('Late Jurassic' before
// 'Jurassic': the longest name wins)
export function timeScaleColours(categories, intervals) {
  const out = [];
  for (const c of categories) {
    const i = longestIn(c.value, intervals) || (c.label ? longestIn(c.label, intervals) : null);
    if (i) out.push({ value: c.value, interval: i.name, color: i.color });
  }
  return out;
}
