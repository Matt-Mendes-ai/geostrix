// TASKS.csv #2235 (side 5's hand-off) — the 3D Modelling 'Link into a solid' picker. It listed only the outline names already on two or more
// sections (#860), so an outline drawn on one section showed 'No section outlines yet' and the button gave no reason. Now every name is
// listed with its count; a name on one section (or one level plan) is there but disabled, saying what links it. Moved out of ViewerModule.
import { t as tr } from "../i18n.js";

// sections: the saved sections (contacts with kind "outline", a unit name and >= 3 points); boundaries: level-plan outlines saved as flat
// boundaries at an elevation (#894). -> [{ name, sections, plans?, single? }]: sections = how many sections (or distinct elevations for
// plans) carry it; single when that is under 2 (not linkable yet). A name on sections is never also counted from plans.
export function outlineLinkCandidates(sections, boundaries) {
  const m = new Map();
  // TASKS.csv #860 — count SECTIONS (two outlines on one section read "2 sections" and enabled the button)
  for (const s of sections || []) for (const c of s.contacts || []) if (c.kind === "outline" && c.unit && c.points?.length >= 3) m.set(c.unit, (m.get(c.unit) || new Set()).add(s.id ?? s.name));
  // TASKS.csv #894 — outlines saved from level plans (flat boundaries at an elevation) with one name at two or more elevations link too
  const pm = new Map();
  for (const b of boundaries || []) if (b.drapeMode === "flat" && Number.isFinite(b.elevation) && b.polylines?.[0]?.length >= 3 && !m.has(b.name)) pm.set(b.name, (pm.get(b.name) || new Set()).add(Math.round(b.elevation * 10) / 10));
  const row = (name, k, plans) => ({ name, sections: k.size, ...(plans ? { plans: true } : {}), ...(k.size < 2 ? { single: true } : {}) });
  const byName = (a, b) => String(a.name).localeCompare(String(b.name));
  // linkable first, then the single ones; each by name
  const all = [...[...m].map(([n, k]) => row(n, k, false)), ...[...pm].map(([n, k]) => row(n, k, true))];
  return [...all.filter((o) => !o.single).sort(byName), ...all.filter((o) => o.single).sort(byName)];
}

export const linkableOutline = (candidates, name) => (candidates || []).some((o) => o.name === name && !o.single);

// the picker's text for one candidate
export function outlineOptionText(o) {
  if (o.single) return o.plans ? tr("{name}: on 1 level plan, draw it on a second to link", { name: o.name }) : tr("{name}: on 1 section, draw it on a second section to link", { name: o.name });
  return o.plans ? tr("{name} ({n} level plans)", { name: o.name, n: o.sections }) : tr("{name} ({n} sections)", { name: o.name, n: o.sections });
}

// why 'Link into a solid' is disabled, or "" when it is not
export function linkDisabledReason(candidates, name) {
  if (linkableOutline(candidates, name)) return "";
  if (!(candidates || []).length) return tr("Draw an outline (closed, for a solid) with the same name on two or more cross-sections first.");
  const o = candidates.find((c) => c.name === name);
  return o?.single ? tr("\"{name}\" is on one section only: draw it on a second section to link.", { name }) : tr("Choose an outline on two or more sections to link.");
}
