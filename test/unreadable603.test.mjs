// TASKS.csv #603 — closed formats get the way out instead of "unrecognized".
import test from "node:test";
import assert from "node:assert/strict";
import { unreadableFormatAdvice } from "../src/lib/unreadableFormats.js";

test("#603 Geosoft / CAD / Access files get advice; readable or unknown files get none", () => {
  assert.match(unreadableFormatAdvice("43141Z_IP_line3.GDB"), /Geosoft database.*CSV or XYZ/);
  assert.equal(unreadableFormatAdvice("mag.grd"), null); // TASKS.csv #1347 — Geosoft and Surfer .grd are read now
  assert.match(unreadableFormatAdvice("claims.dwg"), /\.dxf/);
  assert.match(unreadableFormatAdvice("Bill_Master_Rocks.xls"), /Excel 97-2003.*\.xlsx/); // #1345
  assert.equal(unreadableFormatAdvice("logs.xlsx"), null);
  assert.match(unreadableFormatAdvice("drilling.accdb"), /CSV/);
  for (const f of ["collars.csv", "grid.gxf", "notes.txt", "", null]) assert.equal(unreadableFormatAdvice(f), null);
});
