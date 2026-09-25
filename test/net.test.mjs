// TASKS.csv #350 — main-process outbound fetch guard (run: npm test).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { addressBlocked, urlBlockReason, guardedFetch, validTileIndex } = createRequire(import.meta.url)("../electron/netGuard.js");

test("#350 address ranges", () => {
  for (const ip of ["127.0.0.1", "0.0.0.0", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "224.0.0.1",
    "::1", "::", "0:0:0:0:0:0:0:1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "fe80::1", "fd00::1", "fc12::5", "ff02::1"]) {
    assert.equal(addressBlocked(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "142.250.1.1", "172.32.0.1", "2607:f8b0:4004:800::200e", "::ffff:8.8.8.8"]) assert.equal(addressBlocked(ip), false, ip);
});

test("#350 URL checks: brackets, trailing dot, *.localhost, names resolving to private addresses", async () => {
  const lookup = async (h) => (h === "evil.example" ? [{ address: "10.0.0.5" }] : [{ address: "93.184.216.34" }]);
  for (const u of ["http://[::1]/", "http://[::ffff:7f00:1]/", "http://0.0.0.0/", "http://localhost./", "http://a.localhost/", "http://evil.example/wms", "file:///etc/passwd", "ftp://x.org/"]) {
    assert.ok(await urlBlockReason(u, lookup), u);
  }
  assert.equal(await urlBlockReason("https://maps.gov.bc.ca/wms?x=1", lookup), null);
});

test("#350 redirects are re-checked per hop; body is capped", async () => {
  const lookup = async () => [{ address: "93.184.216.34" }];
  const redirecting = async (url) => (url.startsWith("https://pub.example/")
    ? new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } })
    : new Response("secret", { status: 200 }));
  const r = await guardedFetch("https://pub.example/wms", { fetchImpl: redirecting, lookup });
  assert.equal(r.ok, false); assert.match(r.message, /Redirected to a blocked address/);
  const big = async () => new Response(new Uint8Array(2048), { status: 200 });
  const c = await guardedFetch("https://pub.example/x", { fetchImpl: big, lookup, maxBytes: 1024 });
  assert.equal(c.ok, false); assert.match(c.message, /limit/);
  const fine = async () => new Response("abc", { status: 200, headers: { "content-type": "text/xml" } });
  const f = await guardedFetch("https://pub.example/x", { fetchImpl: fine, lookup });
  assert.equal(f.ok, true); assert.equal(f.buffer.toString(), "abc"); assert.equal(f.contentType, "text/xml");
});

test("#350 SRTM tile indices", () => {
  assert.equal(validTileIndex(10, 150, 300), true);
  for (const t of [[10, 1024, 0], [-1, 0, 0], [16, 0, 0], [10, 1.5, 2], ["10/../..", 0, 0], [10, 0, "1?x"]]) assert.equal(validTileIndex(...t), false, JSON.stringify(t));
});

const { pgConfig, mysqlConfig } = createRequire(import.meta.url)("../electron/dbConfig.js");
test("#348 database sessions verify certificates by default and are read-only with a timeout", () => {
  assert.equal(pgConfig({ host: "db", ssl: true }).ssl.rejectUnauthorized, true);
  assert.equal(pgConfig({ host: "db", ssl: true, sslInsecure: true }).ssl.rejectUnauthorized, false);
  assert.equal(pgConfig({ host: "db", ssl: false }).ssl, false);
  assert.match(pgConfig({ host: "db" }).options, /default_transaction_read_only=on/);
  assert.match(pgConfig({ host: "db" }).options, /statement_timeout=120000/);
  assert.equal(mysqlConfig({ host: "db", ssl: true }).ssl.rejectUnauthorized, true);
  assert.equal(mysqlConfig({ host: "db" }).ssl, undefined);
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const { writeFileAtomic, backupBeforeOverwrite, quarantineUnreadable } = createRequire(import.meta.url)("../electron/fileSafety.js");
test("#341 atomic write, .bak of the previous project, unreadable autosave kept aside", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gs341-"));
  const proj = path.join(dir, "Harry.geostrix.json");
  await writeFileAtomic(proj, '{"v":1}', "utf8");
  assert.equal(await backupBeforeOverwrite(proj), `${proj}.bak`);
  await writeFileAtomic(proj, '{"v":2}', "utf8");
  assert.equal(fs.readFileSync(proj, "utf8"), '{"v":2}');
  assert.equal(fs.readFileSync(`${proj}.bak`, "utf8"), '{"v":1}');
  assert.equal(await backupBeforeOverwrite(path.join(dir, "export.csv")), null); // only project files
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")), []); // no temp files left
  const auto = path.join(dir, "autosave.geostrix.json");
  fs.writeFileSync(auto, '{"project": {"name": "x"'); // truncated
  const kept = await quarantineUnreadable(auto, fs.readFileSync(auto, "utf8"));
  assert.ok(kept && fs.existsSync(kept) && !fs.existsSync(auto));
  fs.writeFileSync(auto, '{"ok":true}');
  assert.equal(await quarantineUnreadable(auto, '{"ok":true}'), null);
  fs.rmSync(dir, { recursive: true, force: true });
});
