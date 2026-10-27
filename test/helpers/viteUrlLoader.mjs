// TASKS.csv #1017 — Node loader hook for tests: Vite's "file?url" imports (src/lib/gpkg.js imports sql.js's .wasm that way)
// resolve to a module whose default export is the file's real path, which is what the code passes to locateFile.
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  if (specifier.endsWith("?url")) {
    const r = await next(specifier.slice(0, -4), context);
    return { url: `data:text/javascript,export default ${encodeURIComponent(JSON.stringify(fileURLToPath(r.url)))}`, shortCircuit: true };
  }
  return next(specifier, context);
}
