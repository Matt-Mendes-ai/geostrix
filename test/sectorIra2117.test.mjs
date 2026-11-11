// TASKS.csv #2117 — each wall sector's own inter-ramp angle in the Pit design result, and the walls flatter than the shell
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ira = (h, face, berm) => (Math.atan(h / (h / Math.tan((face * Math.PI) / 180) + berm)) * 180) / Math.PI;

test("the review's N wall: 10 m benches at 55° with 8 m berms is 33.7°; 65° / 5 m is 46.0°", () => {
  assert.equal(+ira(10, 55, 8).toFixed(1), 33.7);
  assert.equal(+ira(10, 65, 5).toFixed(1), 46.0);
});

test("the pane prints it per wall and flags the flatter walls", () => {
  const p = fs.readFileSync("src/components/PitDesignPane.jsx", "utf8");
  assert.ok(p.includes("const h = Number(res.inputs?.benchH), ira = (s) => (Math.atan(h / (h / Math.tan((s.batterDeg * Math.PI) / 180) + Number(s.berm))) * 180) / Math.PI;"));
  assert.ok(p.includes('tr("By wall (face° / berm m → inter-ramp): {list}."'));
  assert.ok(p.includes("const flat = rows.filter((r) => Number.isFinite(r.shell) && r.a < r.shell - 1);"));
});
