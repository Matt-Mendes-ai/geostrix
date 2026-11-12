// TASKS.csv #3047 — the crash-recovery banner named every recovered tab, one by one: 35 tabs filled five lines of the window.
// The names are grouped (a repeated name once, with its count) and only the first few groups are listed.
export function recoveryTabNames(names, max = 3) {
  const counts = new Map();
  for (const n of names || []) { const k = String(n || ""); counts.set(k, (counts.get(k) || 0) + 1); }
  const groups = [...counts].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name));
  return groups.length > max ? `${groups.slice(0, max).join(", ")}, …` : groups.join(", ");
}
