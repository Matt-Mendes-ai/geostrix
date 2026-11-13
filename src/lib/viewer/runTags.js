// TASKS.csv #2783 (split from #2551, WA lithium) — what bounded a run, read back from its saved params: the structural trend, the restricting
// solid, the code domain and the holes it drew on (Model area). A grade shell records anisotropy.trend, domain (the restricting solid) and
// modelArea (#2059); a block estimate records searchTrend.name, domain (a code domain), samplesFrom (#2544) and gridFrom (a restricting
// solid's box). The generated-surface 'Parameters used' line named the trend only (#2423) and the block-model rows nothing.
import { t as tr } from "../i18n.js";

const ALL_AREAS = new Set(["whole property", "every hole"]);

// -> { trend, solid, domain, area }, each a string or null
export function runTags(p) {
  if (!p || typeof p !== "object") return { trend: null, solid: null, domain: null, area: null };
  const estimate = p.tool === "Grade estimation";
  const trend = p.anisotropy?.trend || p.searchTrend?.name || null;
  const solid = !estimate ? p.domain || null : (/restricting solid "([^"]+)"/.exec(String(p.gridFrom || "")) || [])[1] || null;
  const domain = estimate ? p.domain || null : null;
  const areaText = p.modelArea || p.samplesFrom || null;
  return { trend, solid, domain, area: areaText && !ALL_AREAS.has(areaText) ? areaText : null };
}

// the grade shell's line: what follows its trend clause (' · inside "Pegmatite" · holes checked in the Holes list (18 of 40)')
export function shellTagText(p) {
  const t = runTags(p);
  return `${t.solid ? tr(" · inside \"{solid}\"", { solid: t.solid }) : ""}${t.area ? ` · ${t.area}` : ""}`; // the area is the run's own (English) record
}

// a block model row's tooltip: its name, then a line for each bound the run had
export function modelTip(name, p) {
  const t = runTags(p), lines = [name];
  if (t.trend) lines.push(tr("Trend: {trend}", { trend: t.trend }));
  if (t.solid) lines.push(tr("Inside the solid \"{solid}\"", { solid: t.solid }));
  if (t.domain) lines.push(tr("Domain: {domain}", { domain: t.domain }));
  if (t.area) lines.push(tr("Samples from: {area}", { area: t.area }));
  return lines.join("\n");
}
