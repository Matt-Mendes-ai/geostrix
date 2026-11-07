// TASKS.csv #1487 (review #1352, Layout) — Layout templates kept on this computer, for every project: a company title block
// had to be rebuilt (or exported and imported, #1868) in each project, because templates were a project field. These live in
// userData/layout-templates.json (electron/main.js), never in a project file. Each entry is the same shape as a template
// file (layoutTitleBlock.templateFile) and is read back through parseTemplateFile, so only the Layout's own element types
// and embedded images come in. Data snapshots are left out on the way in (templateElements).
import { parseTemplateFile, templateElements } from "./layoutTitleBlock.js";
import { computerTemplatesRead, computerTemplatesWrite } from "./desktop.js";

// stored text -> [{ id, name, format, elements }]; an entry that is not a template is skipped
export function parseComputerTemplates(content) {
  let list;
  try { list = JSON.parse(content || "[]"); } catch { return []; }
  if (!Array.isArray(list)) return [];
  const out = [];
  list.forEach((entry, i) => {
    try {
      const t = parseTemplateFile(JSON.stringify(entry));
      out.push({ id: typeof entry.id === "string" ? entry.id : `computer_${i}`, name: t.name, format: t.format, elements: t.elements });
    } catch { /* not a template: skipped */ }
  });
  return out;
}

const entryOf = (t) => ({ geostrixLayoutTemplate: 1, id: t.id, name: t.name, format: t.format || null, elements: t.elements });

// the list with this template added; one of the same name is replaced (a new title block version keeps its name)
export function withComputerTemplate(list, tpl, stamp = Date.now()) {
  const { elements, dropped } = templateElements(tpl.elements);
  const same = list.find((t) => t.name === tpl.name);
  const entry = { id: same?.id || `computer_${stamp}_${Math.random().toString(36).slice(2, 7)}`, name: tpl.name, format: tpl.format || null, elements };
  return { list: same ? list.map((t) => (t === same ? entry : t)) : [...list, entry], replaced: !!same, dropped };
}
export const withoutComputerTemplate = (list, id) => list.filter((t) => t.id !== id);
export const computerTemplatesText = (list) => JSON.stringify(list.map(entryOf));

export async function readComputerTemplates() {
  const res = await computerTemplatesRead();
  return res.ok ? { ok: true, list: parseComputerTemplates(res.content) } : { ok: false, error: res.error, list: [] };
}
export async function keepTemplateOnComputer(tpl) {
  const cur = await readComputerTemplates();
  if (!cur.ok) return cur;
  const next = withComputerTemplate(cur.list, tpl);
  const res = await computerTemplatesWrite(computerTemplatesText(next.list));
  return res.ok ? { ok: true, replaced: next.replaced, dropped: next.dropped } : res;
}
export async function removeComputerTemplate(id) {
  const cur = await readComputerTemplates();
  if (!cur.ok) return cur;
  return computerTemplatesWrite(computerTemplatesText(withoutComputerTemplate(cur.list, id)));
}
