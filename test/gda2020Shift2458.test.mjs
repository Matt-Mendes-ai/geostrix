// TASKS.csv #2458 (review #2325, WA uranium) — GDA94 <-> GDA2020 takes the national 7-parameter transformation (EPSG:8048)
import test from "node:test";
import assert from "node:assert/strict";
import { reprojectXY, gda94To2020LonLat, getProj4DefSync } from "../src/lib/reproject.js";

test("MGA 51: GDA94 to GDA2020 moves the review's 1.774 m, and back exactly", () => {
  const a = reprojectXY(576324, 6682105, 28351, 7851);
  assert.ok(Math.abs(a.x - 576324 - 0.927) < 0.002, String(a.x - 576324));
  assert.ok(Math.abs(a.y - 6682105 - 1.513) < 0.002, String(a.y - 6682105));
  const b = reprojectXY(a.x, a.y, 7851, 28351);
  assert.ok(Math.abs(b.x - 576324) < 1e-3 && Math.abs(b.y - 6682105) < 1e-3);
  // geographic too (EPSG:4283 -> 7844), about 1.8 m north-east
  const [lon, lat] = gda94To2020LonLat(123.791256, -29.989587);
  assert.ok(lon > 123.791256 && lat > -29.989587);
});

test("each frame keeps its null shift to WGS 84 (as PROJ), and a zone change on one frame moves nothing extra", () => {
  const w94 = reprojectXY(123.79, -29.99, 4326, 28351), w20 = reprojectXY(123.79, -29.99, 4326, 7851);
  assert.ok(Math.abs(w94.x - w20.x) < 1e-6 && Math.abs(w94.y - w20.y) < 1e-6);
  const z = reprojectXY(576324, 6682105, 28351, 28350), z2 = reprojectXY(z.x, z.y, 28350, 28351);
  assert.ok(Math.abs(z2.x - 576324) < 1e-3 && Math.abs(z2.y - 6682105) < 1e-3);
  assert.match(getProj4DefSync(28351), /\+title=GDA94/);
  assert.match(getProj4DefSync(7851), /\+title=GDA2020/);
  assert.match(getProj4DefSync(4283), /\+title=GDA94/);
});
