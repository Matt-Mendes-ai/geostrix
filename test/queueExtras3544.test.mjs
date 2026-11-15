// TASKS.csv #3544 (C2) — a queued file's extra fields from one scan, not two: the commit's list is the dialog's preset less the excluded columns
// (queueExtraFields), and autoExtraFields trims each cell once. Checked against the code before #3544 on every sample CSV (4,536 cases, 0
// different); pinned here: the queue's list equals a second scan's on the bundled samples, and Macpass sg.csv's three extras.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { autoExtraFields, dialogExtraFields, queueExtraFields } from "../src/lib/viewer/autoExtras.js";
import { parseTableText } from "../src/lib/tabular.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sample_data");
const csvs = (d, o = []) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) csvs(p, o); else if (/\.csv$/i.test(n) && statSync(p).size < 3e6) o.push(p); } return o; };

test("the queue's extras equal a second scan's, for every target and exclusion, on the bundled samples", () => {
  let n = 0;
  for (const f of csvs(root).slice(0, 40)) {
    const { headers, rows } = parseTableText(readFileSync(f, "utf8"));
    if (!rows?.length) continue;
    for (const target of ["assays", "litho", "geotech", "magsusc", "sg"]) for (const comp of [undefined, headers[3]]) {
      const mapping = { hole_id: headers[0], from: headers[1], to: headers[2] }, exclude = [headers[4], comp].filter(Boolean);
      const dlg = dialogExtraFields(target, headers, rows, mapping, [headers[4]]);
      assert.deepEqual(queueExtraFields(target, headers, rows, mapping, dlg, exclude), autoExtraFields(headers, rows, mapping, { exclude }), `${path.basename(f)} ${target} ${comp}`);
      n++;
    }
  }
  assert.ok(n > 100, `${n} cases`);
});

test("Macpass sg.csv: method, low_recovery and comment kept as categories; wiring", () => {
  const { headers, rows } = parseTableText(readFileSync(path.join(root, "yk_macpass", "sg.csv"), "utf8"));
  const mapping = { hole_id: "hole_id", from: "from", to: "to", value: "sg" };
  assert.deepEqual(queueExtraFields("sg", headers, rows, mapping, dialogExtraFields("sg", headers, rows, mapping, [])).map((f) => [f.column, f.type]), [["method", "category"], ["low_recovery", "category"], ["comment", "category"]]);
  const imp = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(imp, /queueExtraFields\(target, headers, data, mapping, modalData, \[modalData\.perRowEpsgCol, comp\?\.column\]\.filter\(Boolean\)\)/);
  assert.ok(!/autoExtraFields\(/.test(imp), "no second scan left in the queue");
});
