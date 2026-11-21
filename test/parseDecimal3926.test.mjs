// TASKS.csv #3926 — a number typed by a person: '.' or ',' as the decimal mark; ambiguous thousands forms refused, not guessed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseDecimal, decimalText } from "../src/lib/parseDecimal.js";

test("both decimal marks, signs, exponents, a bare mark side", () => {
  for (const [t, v] of [["0.05", 0.05], ["0,05", 0.05], [" 12 ", 12], ["-3,5", -3.5], ["+7.25", 7.25], [".5", 0.5], [",5", 0.5], ["5.", 5], ["5,", 5], ["1e-3", 0.001], ["2,5e2", 250], ["0", 0], ["-0,001", -0.001]]) assert.deepEqual(parseDecimal(t), { ok: true, value: v }, t);
  assert.deepEqual(parseDecimal(""), { ok: true, empty: true });
  assert.deepEqual(parseDecimal("   "), { ok: true, empty: true });
  assert.deepEqual(parseDecimal(null), { ok: true, empty: true });
});

test("not guessed: both marks, or one mark repeated, are refused as ambiguous; text is invalid", () => {
  for (const t of ["1.234,5", "1,234.5", "1,234,567", "1.234.567", "12,5,5"]) assert.deepEqual(parseDecimal(t), { ok: false, error: "ambiguous" }, t);
  for (const t of ["abc", "1 234", "1,2x", ".", ",", "-", "--1", "0,05 g/t", "1e", "NaN", "Infinity"]) assert.deepEqual(parseDecimal(t), { ok: false, error: "invalid" }, t);
});

test("decimalText: the number's own digits; nothing for blank or non-numbers", () => {
  assert.equal(decimalText(0.05), "0.05"); assert.equal(decimalText("0.5"), "0.5"); assert.equal(decimalText(null), ""); assert.equal(decimalText(""), ""); assert.equal(decimalText(NaN), "");
});

test("the component: text box with a decimal keypad, parse on blur / Enter, plain lines, the Ignore below box is its first user", () => {
  const c = fs.readFileSync(new URL("../src/components/NumberInput.jsx", import.meta.url), "utf8");
  assert.match(c, /type="text" inputMode="decimal"/);
  assert.match(c, /onBlur=\{\(e\) => commit\(e\.target\.value\)\}/);
  assert.match(c, /e\.key === "Enter"/);
  assert.match(c, /role="alert"/);
  const a = fs.readFileSync(new URL("../src/components/AssayStyleModal.jsx", import.meta.url), "utf8");
  assert.match(a, /<NumberInput allowEmpty placeholder=\{tr\("none"\)\}/);
  assert.doesNotMatch(a, /type="number" step="any" placeholder=\{tr\("none"\)\}/);
});
