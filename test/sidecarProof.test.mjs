// TASKS.csv #353 — the app's sidecar identity check computes the same HMAC-SHA256 the sidecar does (Python's
// hmac.new(token, nonce, sha256).hexdigest(); reference value computed with Python).
import test from "node:test";
import assert from "node:assert/strict";
import { sidecarProof } from "../src/lib/desktop.js";

test("#353 sidecar identity proof matches Python's HMAC-SHA256", async () => {
  assert.equal(await sidecarProof("tok_353_test", "a1b2c3"), "fca6b701072bfdbb5509ce394a1d49679f88d648f0ed6d768d40bcf1c7a904c8");
  assert.notEqual(await sidecarProof("another_token", "a1b2c3"), await sidecarProof("tok_353_test", "a1b2c3"));
});
