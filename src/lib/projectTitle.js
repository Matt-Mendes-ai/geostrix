// TASKS.csv #3611 / #3612 (Fireweed rehearsal round 3; Matt's decision 2026-11-16: "yes with a title field") — the project's TITLE, apart from its name.
// The project's name is its file's name (#199: the tab and the window read the file, which can be renamed on disk). A sheet printed from a project must
// not change its title when the file is saved or renamed: the bundled sample 'Macpass zinc-lead-silver (sample)' printed the file's name after a Save and
// reopen. So the project carries an optional `title`, set ONCE on the first save of a project that already has a name (a sample's, one typed), never
// overwritten by a rename or a later save, and editable (Layout's 'Project title'). {project} on a sheet, the sheet's title and the PDF's document title
// read it first; a project with none (an older file, or one named by its file from the start) reads its name, as before. Pure.

export const UNTITLED = "Untitled project";

// the title a sheet prints: the project's title when it has one, else its name (the file's)
export const projectTitleOf = (project) => String(project?.title ?? "").trim() || String(project?.name ?? "").trim();

// The title to keep at a save: null when the project already has one (it is never overwritten), or when its name is the file's own (the tab was opened
// from or already saved to a file: `hadFile`) or the blank default; else the name it has now (a sample's, one typed) -> string | null
export function titleToKeep(project, { hadFile = false } = {}) {
  if (String(project?.title ?? "").trim()) return null;
  if (hadFile) return null;
  const name = String(project?.name ?? "").trim();
  return name && name !== UNTITLED ? name : null;
}

// the project with a title set, as typed (a space between two words is kept while it is typed: it is trimmed where it is read); blank removes it, the sheets then read the name again; the same object when nothing changes
export function withProjectTitle(project, title) {
  const t = String(title ?? ""), blank = !t.trim();
  if (blank ? project?.title == null : project?.title === t) return project;
  const { title: _old, ...rest } = project || {};
  return blank ? rest : { ...rest, title: t };
}
