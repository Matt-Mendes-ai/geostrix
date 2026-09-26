// TASKS.csv #448 — every field the project file saves must also be loaded, reset by New, autosaved and
// tracked as unsaved when it changes. The lists live in ~9 hand-copied places in store.jsx; fields fell
// out of some of them before (#343 New kept 7 fields of the old project; #462 edits outside undo were never
// marked unsaved). This reads store.jsx itself and checks the lists against the save bundle, so adding a
// field in one place and not the others fails CI instead of losing someone's work.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
const body = (startRe, endRe) => { const i = src.search(startRe); assert.ok(i >= 0, `not found: ${startRe}`); const rest = src.slice(i); const j = rest.slice(1).search(endRe); return rest.slice(0, j < 0 ? undefined : j + 1); };
const keysOf = (objText) => [...objText.replace(/\/\/[^\n]*/g, "").matchAll(/(?:^|[,{\s])([A-Za-z_]\w*)(?=\s*(?:[:,}\n]))/g)].map((m) => m[1]);

const bundle = body(/const snapshotCurrentPayload = \(\) => \(\{/, /\n\s*\}\);/);
const saved = [...new Set(keysOf(bundle.slice(bundle.indexOf("({") + 2)))].filter((k) => !["version", "compactVoxelModels"].includes(k) && !/^[A-Z]/.test(k));
const load = body(/const loadProjectPayload = useCallback\(/, /\n  \}, \[/);
const reset = body(/const newProject = useCallback\(/, /\n  \}, \[/);
const autosave = body(/autosaveRef\.current = \{/, /\};/);
const undo = body(/const undoSnapshot = \(\) => \(\{/, /\}\);/);
const dirty = body(/const extraDirtyFields = \[/, /\];/);
const setter = (k) => `set${k[0].toUpperCase()}${k.slice(1)}`;
// `needle` present as a whole identifier (not as part of a longer one)
const isIdent = (ch) => ch !== undefined && /\w/.test(ch);
const word = (text, needle) => { let i = text.indexOf(needle); while (i >= 0) { if (!isIdent(text[i - 1]) && !isIdent(text[i + needle.length])) return true; i = text.indexOf(needle, i + 1); } return false; };

// Deliberate exceptions, each with its reason (keep this list short and honest).
const NOT_RESET_BY_NEW = {};
const NOT_DIRTY_TRACKED = {
  viewerUiState: "camera / panel state: saved for convenience, changing the view is not an unsaved edit",
  geophysPtsStops: "legend styling of the point cloud (display preference)", geophysPtsColorMode: "display preference",
  geophysPtsMin: "display preference", geophysPtsMax: "display preference",
  activeLayoutPageId: "which layout page is showing (navigation, not an edit)",
  dbConnections: "saved connection list (host/db/user only, never passwords): managed in its own dialog",
};

test("#448 the save bundle has the fields it should (sanity for the parser below)", () => {
  for (const k of ["project", "collars", "layers", "voxelModels", "geophysSurveys", "crmCertificates", "generatedSurfaces"]) assert.ok(saved.includes(k), k);
  assert.ok(saved.length > 30, `only ${saved.length} keys parsed`);
});

test("#448 every saved field is loaded, reset by New, autosaved and dirty-tracked", () => {
  const problems = [];
  for (const k of saved) {
    if (!word(load, `data.${k}`)) problems.push(`${k}: not read in loadProjectPayload`);
    if (!NOT_RESET_BY_NEW[k] && !reset.includes(`${setter(k)}(`)) problems.push(`${k}: not reset in newProject`);
    if (!word(autosave, k)) problems.push(`${k}: not in autosaveRef`);
    if (!NOT_DIRTY_TRACKED[k] && k !== "project" && !word(undo, k) && !word(dirty, k)) problems.push(`${k}: changes never mark the project unsaved (not in undoSnapshot or extraDirtyFields)`);
  }
  assert.deepEqual(problems, []);
});
