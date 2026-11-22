// TASKS.csv #3973 — a page opened from a search: the folds (details) that hold the most of the searched words open, nested ones too, and the first is
// scrolled into view. A word every fold holds ("closed", "search") does not open them all: only the best-matching folds open. -> the folds opened
export function openFoldsFor(root, query) {
  const words = String(query || "").toLowerCase().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}./%+-]/gu, "")).filter((w) => w.length > 1);
  if (!words.length) return [];
  const scored = [...root.querySelectorAll("details")].map((d) => { const t = (d.textContent || "").toLowerCase(); return { d, n: words.filter((w) => t.includes(w)).length }; });
  const best = Math.max(0, ...scored.map((s) => s.n));
  if (!best) return [];
  const opened = scored.filter((s) => s.n === best).map((s) => s.d);
  opened.forEach((d) => { d.open = true; });
  opened[0]?.scrollIntoView?.({ block: "nearest" });
  return opened;
}
