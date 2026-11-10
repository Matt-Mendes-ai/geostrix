// TASKS.csv #2408 (review #2325, WA uranium) — Model from map: logged contacts that contradict the order are said; a hand order is kept
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contactsAgainstOrder } from "../src/lib/holeMapContacts.js";

test("404 holes pass from Channel down into Basement, against an order with Basement on top", () => {
  const contacts = Array.from({ length: 404 }, (_, i) => ({ hole_id: `H${i}`, depth: 40, upper: "Channel", lower: "Basement" }));
  assert.deepEqual(contactsAgainstOrder(contacts, ["Basement", "Channel"]), { agree: 0, against: 404, worst: { upper: "Channel", lower: "Basement", n: 404 } });
  assert.deepEqual(contactsAgainstOrder(contacts, ["Channel", "Basement"]), { agree: 404, against: 0, worst: null });
});

test("the panel keeps a hand order and shows the warning", () => {
  const p = readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /if \(!orderByHand\) \{ setOrder\(suggestion\.order\); setRoles\(suggestion\.roles\); return; \}/);
  assert.match(p, /const move = \(i, d\) => \{ setOrderByHand\(true\);/);
  assert.match(p, /logged contacts run the other way/);
  assert.match(p, /orderCheck && orderCheck\.against > orderCheck\.agree && <div/); // most of them, not interfingering units
});
