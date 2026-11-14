// TASKS.csv #3071 (#2899) — a multi-file drop ended with no summary of what became of each file, and the assay hand-off moved the user to the
// Geochem tab with nothing saying so. Each file's outcome is logged as the queue drains (imported unseen, a dialog's Import or Cancel, a map
// layer, handed to Geochem, unread) and one notice sums them up; the tab change is said.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const impl = rd("../src/modules/viewer/importPipelineImpl.js"), hook = rd("../src/modules/viewer/useImportPipeline.js");

test("every way a queued file can go is logged", () => {
  assert.match(impl, /if \(meta\?\.layerOptions\) \{ logQueue\(file\.name, "asked"\);/);
  assert.match(impl, /if \(err \|\| !data \|\| !data\.length\) \{ logQueue\(file\.name, "unread"\);/);
  assert.match(impl, /if \(isMapGeometry\(meta\)\) \{ logQueue\(file\.name, "map"\);/);
  assert.match(impl, /logQueue\(file\.name, "geochem"\); \/\/ #3071/);
  assert.match(impl, /askCrsForCollars\(modalData\)\.then\(\(\) => \{\n\s*logQueue\(file\.name, "imported"\);/);
  assert.match(impl, /logQueue\(file\.name, "asked"\); \/\/ #3071 — the dialog's Import or Cancel says which\n\s*setImportModal\(/);
  // the dialog's Import marks it imported, its Cancel (the hook's own, #2660) cancelled
  assert.match(impl, /commitImportData\(modalData\);\n\s*const asked = \(queueLogRef\?\.current \|\| \[\]\)\.filter\(\(e\) => e\.outcome === "asked"\)\.pop\(\); if \(asked\) asked\.outcome = "imported";/);
  assert.match(hook, /const asked = \(queueLogRef\.current \|\| \[\]\)\.filter\(\(e\) => e\.outcome === "asked"\)\.pop\(\); if \(asked\) asked\.outcome = "cancelled";/);
});

test("a drop starts the log, the queue's end sums it up before the assays go on to Geochem, and says the tab", () => {
  assert.match(impl, /if \(queueLogRef\) queueLogRef\.current = \[\]; \/\/ #3071/);
  assert.match(impl, /importQueueTotalRef\.current = 0; queueSummary\(\); \/\* #3071 \*\/ handOverAssays\(\); return; \}/);
  assert.match(impl, /notice\("\{n\} files dropped: \{parts\}\.", \{ n: log\.length, parts: parts\.join\("; "\) \}\)/);
  assert.match(impl, /of\("geochem"\)\.length \? \[notice\("The Geochem tab opens next, for the assay file\(s\)\."\)\] : \[\]/);
  assert.match(impl, /if \(!log \|\| log\.length < 2\) return;/, "a single file says its own notices");
  assert.match(hook, /const queueLogRef = useRef\(null\);/);
});
