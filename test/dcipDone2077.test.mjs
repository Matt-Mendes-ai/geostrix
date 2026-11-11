// TASKS.csv #2077 — the DC/IP status line kept 'Inverting 335 readings (…)…' after the run had finished, and the run time was not shown
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the job's onDone replaces the running line with a done line and the run time", () => {
  const src = readFileSync(new URL("../src/components/DcipPanel.jsx", import.meta.url), "utf8");
  const i = src.indexOf("onDone: (result) => {"), j = src.indexOf("if (!res.ok) setMsg", i);
  const body = src.slice(i, j);
  assert.match(body, /tr\("Inverted \{readings\} readings in \{s\} s \(\{groundNote\}\)\."/);
  assert.match(body, /Math\.round\(result\.seconds\)/);
  assert.match(body, /tr\("Inverted \{readings\} readings \(\{groundNote\}\)\."/); // no time reported: no number invented
});
