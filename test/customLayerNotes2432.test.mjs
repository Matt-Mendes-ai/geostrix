// TASKS.csv #2432 (review #2325, WA uranium) — a custom layer's notes (what the import left out as no-data, readings placed at interval
// middles, downhole event codes) were written to the project and shown nowhere: the sidebar row now carries them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("#2432 the custom layer's sidebar row shows its notes (tooltip and an info mark)", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(v.includes("title={l.notes ? `${l.name}\\n${l.notes}` : l.name}>{l.name}</span>"));
  assert.match(v, /\{l\.notes && <span title=\{l\.notes\}[^>]*><Info size=\{12\} aria-label=\{tr\("Layer notes: \{v\}", \{ v: l\.notes \}\)\} \/><\/span>\}/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))["Layer notes: {v}"], l);
});
