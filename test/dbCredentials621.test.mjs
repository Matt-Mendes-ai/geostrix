// TASKS.csv #621 — remembered DB passwords: encrypted, keyed per login, never stored when the OS can't encrypt.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const { createDbCredentialStore } = require("../electron/dbCredentials.js");

// a stand-in for Electron's safeStorage (reversible but NOT plain text, so the file test means something)
const fakeSafe = (ok = true) => ({
  isEncryptionAvailable: () => ok,
  encryptString: (s) => Buffer.from([...Buffer.from(s, "utf8")].map((b) => b ^ 0x5a)),
  decryptString: (b) => Buffer.from([...b].map((x) => x ^ 0x5a)).toString("utf8"),
});
const login = { engine: "postgres", host: "LocalHost ", port: 54373, database: "treaty_creek", user: "geo" };

test("#621 save, read back, keyed per login, forget", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "gx-cred-"));
  try {
    const st = createDbCredentialStore({ safeStorage: fakeSafe(), dir });
    assert.equal(st.has(login), false);
    assert.equal(st.set(login, "s3cret-pass"), true);
    assert.equal(st.get({ ...login, host: "localhost" }), "s3cret-pass"); // host case / spaces ignored
    assert.equal(st.get({ ...login, user: "other" }), null);              // another login: nothing
    assert.equal(st.get({ ...login, database: "harry" }), null);
    assert.ok(!readFileSync(path.join(dir, "db-credentials.json"), "utf8").includes("s3cret-pass")); // not plain text
    assert.equal(st.forget(login), true);
    assert.equal(st.has(login), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("#621 no OS encryption: nothing is saved (no plain-text fallback)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "gx-cred-"));
  try {
    const st = createDbCredentialStore({ safeStorage: fakeSafe(false), dir });
    assert.equal(st.available(), false);
    assert.equal(st.set(login, "pw"), false);
    assert.equal(st.has(login), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
