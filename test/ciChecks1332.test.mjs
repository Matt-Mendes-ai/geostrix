// TASKS.csv #1332 — the shipped-dependency audit counts a copy that ships, not a name that matches.
import test from "node:test";
import assert from "node:assert/strict";
import { advisoryHitsShipped } from "../scripts/shipped-roots.mjs";
import { refusedSwitches } from "../electron/launchGuard.js";

const names = new Set(["undici", "pg"]);
const keys = new Set(["node_modules/undici", "node_modules/pg"]);

test("an advisory on a build tool's own copy of a shipped package does not count", () => {
  assert.equal(advisoryHitsShipped("undici", { nodes: ["node_modules/node-gyp/node_modules/undici"] }, names, keys), false);
});

test("an advisory on the copy that ships counts, also when another copy is listed with it", () => {
  assert.equal(advisoryHitsShipped("undici", { nodes: ["node_modules/undici"] }, names, keys), true);
  assert.equal(advisoryHitsShipped("undici", { nodes: ["node_modules/node-gyp/node_modules/undici", "node_modules/undici"] }, names, keys), true);
});

test("with no copies listed the name decides, and a package that does not ship never counts", () => {
  assert.equal(advisoryHitsShipped("pg", {}, names, keys), true);
  assert.equal(advisoryHitsShipped("vite", { nodes: ["node_modules/vite"] }, names, keys), false);
});

test("the installed app still refuses the switches the launch check uses", () => {
  assert.deepEqual(refusedSwitches(["GeoStrix.exe", "--remote-debugging-port=9339", "--user-data-dir=x"]), ["--remote-debugging-port=9339", "--user-data-dir=x"]);
});
