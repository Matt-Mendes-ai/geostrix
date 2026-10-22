// TASKS.csv #694 — the geoML add-on client's connection handling, which had no test: a stale token (401) or a refused
// connection drops the cached port + token and retries ONCE on a fresh connection (#645); and the identity check before
// any data is sent (#667): an add-on from 0.1.2 must prove the token with HMAC-SHA256(token, nonce), a missing or wrong
// proof is refused as a stranger, and 0.1.0 / 0.1.1 are told apart from a stranger by the token-checked probe.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

// a fake desktop bridge: each addonEnsure hands out the next connection; window.desktop is read when the module loads,
// so every test imports a fresh copy
let connections, ensures, installedVersion;
globalThis.window = { desktop: {
  addonStatus: async () => ({ id: "geoml", installed: true, version: installedVersion }),
  addonEnsure: async () => { ensures++; return { ok: true }; },
  addonConnection: async () => connections[Math.min(ensures, connections.length) - 1],
} };
let n = 0;
const fresh = () => import(`../src/lib/geomlAddon.js?case=${++n}`);
const reply = (status, body = {}) => ({ ok: status < 400, status, json: async () => body });
beforeEach(() => { ensures = 0; installedVersion = "0.1.2"; });

test("#694 a 401 (stale token) reconnects once and the call goes through on the new token", async () => {
  connections = [{ port: 9001, token: "old" }, { port: 9002, token: "new" }];
  const seen = [];
  globalThis.fetch = async (url, opts) => { seen.push(`${new URL(url).port} ${opts.headers["X-GeoStrix-Token"]}`); return opts.headers["X-GeoStrix-Token"] === "new" ? reply(200, { id: "j1" }) : reply(401, { detail: "bad token" }); };
  const m = await fresh();
  assert.deepEqual(await m.startJob("grade", {}), { id: "j1" });
  assert.deepEqual(seen, ["9001 old", "9002 new"]);
  assert.equal(ensures, 2);
});

test("#694 a second 401 is not retried again: the error is thrown with its status", async () => {
  connections = [{ port: 9001, token: "a" }, { port: 9001, token: "b" }];
  let calls = 0;
  globalThis.fetch = async () => { calls++; return reply(401, { detail: "bad token" }); };
  const m = await fresh();
  await assert.rejects(m.startJob("grade", {}), (e) => e.status === 401 && /bad token/.test(e.message));
  assert.equal(calls, 2);
});

test("#694 a refused connection (add-on restarted on a new port) retries once on a fresh connection; a timeout does not", async () => {
  connections = [{ port: 9001, token: "t1" }, { port: 9005, token: "t2" }];
  globalThis.fetch = async (url) => { if (new URL(url).port === "9001") throw new TypeError("fetch failed"); return reply(200, { state: "running" }); };
  let m = await fresh();
  assert.deepEqual(await m.jobStatus("j1"), { state: "running" });
  ensures = 0; connections = [{ port: 9001, token: "t1" }];
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); };
  m = await fresh();
  await assert.rejects(m.jobStatus("j1"), /timed out/);
  assert.equal(calls, 1, "a busy add-on is not reconnected to");
});

const proofOf = (token, nonce) => createHmac("sha256", token).update(nonce).digest("hex");
function healthServer({ proof, probeStatus = 404 }) {
  return async (url) => {
    const u = new URL(url);
    if (u.pathname === "/health") {
      const nonce = u.searchParams.get("nonce");
      return reply(200, { version: "x", ...(proof === "right" ? { proof: proofOf("tok", nonce) } : proof === "wrong" ? { proof: "00" } : {}) });
    }
    if (u.pathname === "/v1/jobs/identity-probe") return reply(probeStatus, {});
    return reply(500);
  };
}

test("#694 identity (0.1.2+): the right HMAC proof is accepted; a wrong or missing one is refused before any data is sent", async () => {
  connections = [{ port: 8766, token: "tok" }];
  globalThis.fetch = healthServer({ proof: "right" });
  assert.equal((await (await fresh()).addonReady()).version, "x");
  for (const proof of ["wrong", "none"]) {
    ensures = 0;
    const seen = [];
    const f = healthServer({ proof });
    globalThis.fetch = async (url, o) => { seen.push(new URL(url).pathname); return f(url, o); };
    await assert.rejects((await fresh()).addonReady(), /Another program answered on port 8766/, proof);
    assert.deepEqual(seen, ["/health"], "nothing but the health check was sent");
  }
});

test("#694 identity (0.1.0 / 0.1.1, no proof yet): the token-checked probe tells ours (404) from a stranger (401)", async () => {
  installedVersion = "0.1.1";
  connections = [{ port: 8766, token: "tok" }];
  globalThis.fetch = healthServer({ proof: "none", probeStatus: 404 });
  assert.equal((await (await fresh()).addonReady()).version, "x");
  ensures = 0;
  globalThis.fetch = healthServer({ proof: "none", probeStatus: 401 });
  await assert.rejects((await fresh()).addonReady(), /Another program answered/);
});
