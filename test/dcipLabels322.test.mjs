// TASKS.csv #322 — the DC/IP section image's colour-scale labels: three significant figures, never exponent notation
import test from "node:test";
import assert from "node:assert/strict";
import { sig3 } from "../src/lib/dcipSectionImage.js";

test("#322 colour-scale labels without exponent notation", () => {
  assert.equal(sig3(1234), "1,230");
  assert.equal(sig3(98765), "98,800");
  assert.equal(sig3(12.345), "12.3");
  assert.equal(sig3(0.012345), "0.0123");
  assert.equal(sig3(5), "5");
  assert.equal(sig3(NaN), "");
});
