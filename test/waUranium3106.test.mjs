// TASKS.csv #3106 — the WA uranium sample's CC BY 4.0 attribution is shown in Help > Third-party licences and the installer notice.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { bundledData } from "../scripts/third-party-licenses.mjs";

test("Help > Third-party licences lists the WA sample under CC BY 4.0, with its README's attribution", () => {
  const wa = bundledData().find((d) => /WA palaeochannel uranium sample/.test(d.name));
  assert.ok(wa);
  assert.equal(wa.license, "CC-BY-4.0");
  assert.match(wa.text, /Creative Commons Attribution 4\.0/);
  assert.match(wa.text, /State of Western Australia/);
});

test("the installer notice names it with the licence and the changes", () => {
  const s = fs.readFileSync("build/installer-notice.txt", "utf8");
  assert.match(s, /WA palaeochannel uranium sample[^\n]*CC BY 4\.0[^\n]*Changed:/);
});
