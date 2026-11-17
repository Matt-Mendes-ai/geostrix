// TASKS.csv #2829 / #2006 — the samples that are a point survey plus a grid and nothing else: which folder each is in, and the one entry point the 3D View calls (the loaders are loaded on demand).
export const POINT_GRID_DIRS = { blake: "blake_river", osborne: "osborne" };
export async function loadPointGridSample(which, readFile, store, project = null) {
  if (which === "osborne") return (await import("./sampleOsborne.js")).loadOsborne(readFile, store, project);
  return (await import("./sampleBlakeRiver.js")).loadBlakeRiver(readFile, store, project);
}
