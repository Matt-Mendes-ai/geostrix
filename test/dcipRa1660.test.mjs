// TASKS.csv #1660 (review #1646, Kodiak) — Ra is apparent resistivity, mA currents are read as mA, a 3D survey is said, not chained in 2D
import test from "node:test";
import assert from "node:assert/strict";
import { parseDcipWhitespaceText, guessDcipColumns, apparentResistivity } from "../src/lib/dcip.js";

test("an Ra column is the apparent resistivity (nothing recomputed)", () => {
  assert.equal(guessDcipColumns(["C1_X", "C2_X", "P1_X", "P2_X", "Vp", "I", "Ra", "Mx"]).rho, "Ra");
});

test("a 2D line with Vp and I in mA (said in the header block) gets the right resistivity", () => {
  const head = "I (in mA): transmitted current\nVp (in mV): primary voltage\n";
  const t = head + "C1_X C2_X P1_X P2_X Vp I\n0 25 50 75 100 2000\n";
  const r = parseDcipWhitespaceText(t);
  const rho = Number(r.rows[0].RHO);
  assert.ok(Math.abs(rho - apparentResistivity(0, 25, 50, 75, 100, 2)) < 1e-9, String(rho));
  // no word on units, but 2000 is milliamps by size
  const r2 = parseDcipWhitespaceText("C1_X C2_X P1_X P2_X Vp I\n0 25 50 75 100 2000\n");
  assert.ok(Math.abs(Number(r2.rows[0].RHO) - rho) < 1e-9);
});

test("electrodes on several lines: a 3D survey, refused with the reason", () => {
  const t = "C1_line C1_X C2_line C2_X P1_line P1_X P2_line P2_X Ra\n100 0 100 25 200 50 200 75 900\n100 0 100 25 100 50 100 75 800\n";
  const r = parseDcipWhitespaceText(t);
  assert.ok(r.error && /3D IP survey: electrodes on 2 lines, 1 reading/.test(r.error), r.error);
  assert.equal(r.rows.length, 0);
});
