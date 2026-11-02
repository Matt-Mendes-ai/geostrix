import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";

const { guardedFetch } = createRequire(import.meta.url)("../electron/netGuard.js");

// A name that is in no DNS, resolved by the guard's lookup to this machine: the request can only arrive if the socket uses the checked address.
const serve = (handler) => new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, "127.0.0.1", () => resolve(s)); });
const allow = () => false;
test("#1264 the connection goes to the address that was checked, not a second lookup", async () => {
  const s = await serve((req, res) => res.end(`host ${req.headers.host}`));
  const port = s.address().port;
  let lookups = 0;
  const lookup = async () => { lookups++; return [{ address: "127.0.0.1", family: 4 }]; };
  const r = await guardedFetch(`http://geostrix-rebind.invalid:${port}/x`, { lookup, blocked: allow, timeoutMs: 5000 });
  s.close();
  assert.equal(r.message, undefined);
  assert.equal(r.status, 200);
  assert.equal(r.buffer.toString(), `host geostrix-rebind.invalid:${port}`, "the Host header keeps the name");
  assert.equal(lookups, 1, "resolved once");
});
test("#1264 a private answer is refused before any connection", async () => {
  let hit = false;
  const s = await serve((req, res) => { hit = true; res.end("no"); });
  const r = await guardedFetch(`http://geostrix-rebind.invalid:${s.address().port}/`, { lookup: async () => [{ address: "127.0.0.1", family: 4 }], timeoutMs: 5000 });
  s.close();
  assert.equal(r.ok, false);
  assert.match(r.message, /local\/private/);
  assert.equal(hit, false);
});
test("#1264 each redirect hop is resolved, checked and pinned on its own", async () => {
  const b = await serve((req, res) => res.end("second"));
  const a = await serve((req, res) => { res.statusCode = 302; res.setHeader("location", `http://hop-two.invalid:${b.address().port}/`); res.end(); });
  const seen = [];
  const r = await guardedFetch(`http://hop-one.invalid:${a.address().port}/`, { lookup: async (h) => { seen.push(h); return [{ address: "127.0.0.1", family: 4 }]; }, blocked: allow, timeoutMs: 5000 });
  a.close(); b.close();
  assert.deepEqual(seen, ["hop-one.invalid", "hop-two.invalid"]);
  assert.equal(r.buffer.toString(), "second");
  const refused = await guardedFetch("http://hop-one.invalid:1/", { lookup: async () => [{ address: "169.254.169.254", family: 4 }], timeoutMs: 5000 });
  assert.match(refused.message, /local\/private/);
});
