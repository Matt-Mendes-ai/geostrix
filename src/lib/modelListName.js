// TASKS.csv #1839 (review #1646, Kodiak) — two block models with one name (both UBC models came in as '3dmesh_utm') could not be told apart in
// the Targeting lists: the property joins the name wherever another model shares it. Pure.
export function modelListName(m, all = []) {
  const name = String(m?.name ?? "");
  const twin = (all || []).some((o) => o && o !== m && (o.id == null || o.id !== m.id) && String(o.name ?? "") === name);
  return twin && m?.property && !name.includes(String(m.property)) ? `${name} — ${m.property}` : name;
}
