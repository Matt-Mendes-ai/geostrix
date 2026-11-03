// TASKS.csv #1677 (review #1645, Copley) — pXRF zeros are 'not detected' by default, asked in the dialog
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readAssayCell } from "../src/lib/geochem.js";

const gm = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
const modal = readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");

test("the import reads a zero as '<' at half the column's smallest reading when below detection is chosen (pXRF default)", () => {
  assert.ok(gm.includes('const zeroMode = modal.zeroMode || (modal.isPxrf ? "bdl" : "real");'));
  assert.ok(gm.includes("return read(`<${L}`, sym, header);"));
  assert.ok(gm.includes("let { v, q } = zeroAsBdl(cell, e.symbol, e.header) || read(cell, e.symbol, e.header);"));
  // what read("<L") stores: half the limit, flagged '<'
  assert.deepEqual(readAssayCell("<4"), { value: 2, qualifier: "<", kind: null });
});

test("the dialog counts the zeros and asks, below detection pre-selected for pXRF", () => {
  assert.ok(modal.includes("if (parseAssayValue(r[h]) === 0) n++;"));
  assert.ok(modal.includes('onChange({ ...modal, zeroMode: "bdl" })') && modal.includes('onChange({ ...modal, zeroMode: "real" })'));
});
