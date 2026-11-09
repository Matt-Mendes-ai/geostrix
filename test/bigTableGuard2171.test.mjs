// TASKS.csv #2171 — a table too large for memory is not opened unasked, and a big file whose worker failed is not re-read on the window's thread
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateTableMemory, confirmTableSize, TABLE_MEMORY_BUDGET } from "../src/lib/tabular.js";

function csvFile(rows, cols, name = "assays.csv", sep = ",") {
  const head = ["HoleID", "From", "To", ...Array.from({ length: cols - 3 }, (_, i) => `El${i}_ppm`)].join(sep);
  const lines = [head];
  for (let r = 0; r < rows; r++) lines.push([`H${r % 97}`, r, r + 1, ...Array.from({ length: cols - 3 }, (_, i) => ((r * 7 + i) % 5 === 0 ? "" : ((r * 13 + i * 3) % 1000) / 10))].join(sep));
  return new File([lines.join("\n") + "\n"], name, { type: "text/csv" });
}

test("rows and columns are estimated from the first 1 MB", async () => {
  const f = csvFile(30000, 85); // about 7 MB: the estimate reads only the first 1 MB
  assert.ok(f.size > 2 * (1 << 20));
  const e = await estimateTableMemory(f);
  assert.equal(e.cols, 85);
  assert.ok(Math.abs(e.rows - 30000) / 30000 < 0.05, `rows ${e.rows}`);
  assert.ok(e.bytes > 30000 * 85 * 9, "at least the column arrays");
  const t = await estimateTableMemory(csvFile(500, 12, "x.txt", "\t"));
  assert.equal(t.cols, 12);
});

test("over the budget the user is asked; under it, or with no window, the table is read", async () => {
  const f = csvFile(3000, 85);
  const asked = [];
  assert.equal(await confirmTableSize(f, { budget: 1e6, confirm: (m) => { asked.push(m); return false; } }), false);
  assert.match(asked[0], /^assays\.csv is a very large table: about 3,0\d\d rows × 85 columns\. Opening it needs roughly \d+\.\d GB of memory/);
  assert.match(asked[0], /Cancel — don't open it/);
  assert.equal(await confirmTableSize(f, { budget: 1e6, confirm: () => true }), true);
  assert.equal(await confirmTableSize(f, { confirm: () => { throw new Error("asked under the budget"); } }), true);
  assert.equal(await confirmTableSize(f, { budget: 1e6, confirm: null }), true);
  assert.equal(TABLE_MEMORY_BUDGET, 2e9);
});

test("the WA composite assays (380 MB, 3.1 M rows x 85) would be asked about", async () => {
  // the estimate's arithmetic on the reported size: 3.1 M x 85 cells at 9 bytes, grown by doubling, plus 3 x the file
  const bytes = 3.1e6 * 85 * 9 * 1.5 + 380e6 * 3;
  assert.ok(bytes > TABLE_MEMORY_BUDGET * 2);
  // and #2164's 110 MB / 590,000 x 34 file is not
  assert.ok(590040 * 34 * 9 * 1.5 + 110e6 * 3 < TABLE_MEMORY_BUDGET);
});

test("parseTableFile asks first, and a failed worker on a big file is reported, not retried on the window's thread", () => {
  const src = readFileSync(new URL("../src/lib/tabular.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const body = src.slice(src.indexOf("export async function parseTableFile("), src.indexOf("// Rows (objects, or { fields, data }) -> CSV text"));
  assert.ok(body.includes("if (!(opts?.sizeChecked)) {") && body.includes("const ok = await confirmTableSize(file);") && body.includes("if (!ok) throw new Error(")); // a chosen column subset comes back too since #2177
  assert.ok(body.includes("if (file.size >= MAIN_THREAD_RETRY_MAX) throw new Error("));
});
