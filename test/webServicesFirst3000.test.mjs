// TASKS.csv #3000 (WA iron review) — the web-layer list opened with two British Columbia services on a Pilbara project
import test from "node:test";
import assert from "node:assert/strict";
import { COMMON_WEB_SERVICES, servicesFirst } from "../src/lib/webServices.js";
test("the services whose area holds the project come first; no centre leaves the order", () => {
  assert.deepEqual(servicesFirst(COMMON_WEB_SERVICES, { lon: 119.97, lat: -22.48 }).map((p) => p.id)[0], "ga-surface");
  assert.deepEqual(servicesFirst(COMMON_WEB_SERVICES, { lon: -131.4, lat: 57.1 }).map((p) => p.id).slice(0, 2), ["bc-bedrock", "bc-tenure"]);
  assert.deepEqual(servicesFirst(COMMON_WEB_SERVICES, { lon: 10, lat: 50 }).map((p) => p.id), COMMON_WEB_SERVICES.map((p) => p.id)); // nothing for Germany: unchanged
  assert.equal(servicesFirst(COMMON_WEB_SERVICES, null), COMMON_WEB_SERVICES);
  assert.equal(servicesFirst(COMMON_WEB_SERVICES, { lon: 119.97, lat: -22.48 }).length, COMMON_WEB_SERVICES.length);
});
