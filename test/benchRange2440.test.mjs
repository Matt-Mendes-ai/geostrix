// TASKS.csv #2440 — the bench range ends at the highest ground the design meets
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { shellFloors, benchedPit } from "../src/lib/pitDesign.js";

test("ground at 1,003 with 10 m benches from 940: the top bench's crest is 1,010 in the air, the ground the pit meets 1,003", () => {
  const pos = [];
  for (let y = -70; y <= 70; y += 10) for (let x = -70; x <= 70; x += 10) pos.push(500000 + x, 5000000 + y, Math.abs(x) <= 45 && Math.abs(y) <= 45 ? 940 : 1003);
  const shell = shellFloors(Float64Array.from(pos), () => 1003);
  const d = benchedPit(shell, { groundAt: () => 1003, benchH: 10, berm: 5, batterDeg: 60 });
  assert.equal(d.crestRL, 1010);
  assert.ok(Math.abs(d.groundTopRL - 1003) < 1e-9, String(d.groundTopRL));
  assert.match(fs.readFileSync("src/components/PitDesignPane.jsx", "utf8"), /Math\.min\(res\.crestRL, res\.groundTopRL\)/);
});
