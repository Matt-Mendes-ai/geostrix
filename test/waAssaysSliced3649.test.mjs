// TASKS.csv #3649 — waAssaysSliced (the sample load's assay parse in slices, so no single task is the whole table) gives the same
// rows and elements as waAssays, including a quoted cell with a comma and a newline, a '<' qualifier, blank cells, and skipped bad rows.
import test from "node:test";
import assert from "node:assert/strict";
import { waAssays, waAssaysSliced, PARSE_CHUNK, ROW_SLICE } from "../src/lib/sampleWa.js";

function csv(n) {
  const lines = ["hole_id,from,to,sample_id,Zn_pct,Ag_ppm,Pb_pct,comment"];
  for (let i = 0; i < n; i++) {
    const h = "H" + (i % 17), f = (i % 50) * 2;
    lines.push(`${h},${f},${f + 2},S${i},${i % 7 === 0 ? "<0.001" : (i * 0.013).toFixed(3)},${i % 5 === 0 ? "" : (i % 90) + 0.5},${(i % 11) * 0.1},"${i % 13 === 0 ? "a, b\nnew line" : "ok"}"`);
    if (i % 301 === 0) lines.push(`,${f},${f + 2},BAD${i},1,1,1,x`); // no hole: skipped
    if (i % 401 === 0) lines.push(`${h},5,3,BAD${i},1,1,1,x`);     // to <= from: skipped
  }
  return lines.join("\n");
}

test("the sliced parse equals the one-go parse", async () => {
  const text = csv(ROW_SLICE * 6 + 211);
  assert.ok(text.length > PARSE_CHUNK * 2, "the table spans several parse chunks");
  let breaks = 0;
  const a = waAssays(text, "assays.csv"), b = await waAssaysSliced(text, "assays.csv", async () => { breaks++; });
  assert.deepEqual(b.rows, a.rows);
  assert.deepEqual(b.elements, a.elements);
  assert.ok(a.rows.length > ROW_SLICE * 3);
  assert.ok(breaks >= 10, "it yielded between chunks and row slices (" + breaks + ")");
});

test("a small table and an empty one", async () => {
  const small = csv(5);
  assert.deepEqual((await waAssaysSliced(small)).rows, waAssays(small).rows);
  const empty = "hole_id,from,to,Zn_pct\n";
  assert.deepEqual((await waAssaysSliced(empty)).rows, waAssays(empty).rows);
});
