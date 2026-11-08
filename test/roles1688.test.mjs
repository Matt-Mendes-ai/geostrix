// TASKS.csv #1688 — breccia, fine-grained dyke and intrusive-rock codes are suggested as cross-cutting, host units stay stratigraphic.
import test from "node:test";
import assert from "node:assert/strict";
import { roleForLithology, mcodeRoleOf } from "../src/lib/layers.js";

test("Copley's HYBX / IFGD / DIOR and the common intrusive codes", () => {
  for (const c of ["HYBX", "HBRX", "IGBX", "IBX"]) assert.equal(roleForLithology(c), "breccia", c);
  for (const c of ["IFGD", "MFGD", "MDK", "FDK", "DIOR", "GRDR", "QFP", "FP", "MZ", "GD", "Porphyry", "Syenite"]) assert.equal(roleForLithology(c), "dyke", c);
  for (const c of ["HYBX", "IFGD", "DIOR"]) assert.equal(mcodeRoleOf(roleForLithology(c)), "cross-cutting", c);
});

test("host rocks and look-alikes stay stratigraphic", () => {
  for (const c of ["VOLC", "ANDS", "RHYL", "TFF", "VBX", "Volcanic Breccia", "LMST", "SNDST", "MSULF", "SKRN", "GW", "ARG", "DOLO"]) assert.equal(roleForLithology(c), "stratigraphic", c);
});
