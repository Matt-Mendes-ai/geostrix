// TASKS.csv #3990 — the slices' drawing loads on use (startup size); the scene build is synchronous, so it asks here: the module once loaded,
// else null and the build draws the plain tubes and asks for one rebuild when the module is in (a project saved with slices, opened).
let mod = null, loading = null;
export const slicesModule = () => mod;
export function loadSlices() {
  if (mod) return Promise.resolve(mod);
  return (loading ||= import("./mineralSlices3d.js").then((m) => (mod = m)).catch((e) => { loading = null; throw e; }));
}
