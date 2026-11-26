// TASKS.csv #4086 — Best intercepts stays one live screen (the cutoff beside the table that answers as you type), and its gold Export is in the dialog's
// footer bar beside Close, not 1.2 screens down under the table: in view at 1366x768 without scrolling (found in the live count; Main's condition).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the Export, To Layout and the CSV options are in the footer bar after Close, the footer outside the scrolled body", () => {
  const close = s.indexOf('onClick={onClose}>{tr("Close")}</button>');
  assert.ok(close > 0, "Close");
  const exp = s.indexOf("onClick={exportCSV}");
  assert.ok(exp > close, "Export comes after Close in the source: it is in the same bar");
  assert.equal(s.split("onClick={exportCSV}").length - 1, 1, "one Export button");
  const footerStart = s.lastIndexOf('<div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop', close);
  assert.ok(footerStart > 0 && footerStart < close && exp - footerStart < 2500, "Export is in the footer bar's div");
  for (const k of ["onClick={toLayout}", "<CsvStampToggle />", "setContinuePages(e.target.checked)"]) assert.ok(s.indexOf(k) > close, k);
  assert.match(s, /className="gs-btn gs-btn--primary" style=\{\{ flex: 2, justifyContent: "center" \}\} onClick=\{exportCSV\}/);
});

test("the cutoff stays beside the table on the one screen (no steps): Element, Cutoff and the suggestion chips are above the table", () => {
  assert.doesNotMatch(s, /<StepDialog/);
  const el = s.indexOf('{tr("Element")}<select'), cut = s.indexOf('{tr("Cutoff ({unit})"'), table = s.indexOf("<table");
  assert.ok(el > 0 && cut > el && table > cut);
});
