// TASKS.csv #1081 (review #1016, security / privacy) — connection profiles live on this computer, not in the project file.
import test from "node:test";
import assert from "node:assert/strict";
import { readDbProfiles, writeDbProfiles, mergeDbProfiles, cleanProfile } from "../src/lib/dbProfiles.js";
import { FIELD_KEYS, payloadFromFields, emptyFields } from "../src/lib/projectFields.js";

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test("#1081 a saved project no longer carries connection profiles", () => {
  assert.ok(!FIELD_KEYS.includes("dbConnections"));
  const p = payloadFromFields({ ...emptyFields(), dbConnections: [{ name: "corp", host: "db.internal", user: "geo" }] });
  assert.ok(!("dbConnections" in p));
  assert.ok(!JSON.stringify(p).includes("db.internal"));
});

test("#1081 profiles round-trip through this computer's storage, never with a password", () => {
  const s = mem();
  writeDbProfiles([{ name: "corp", engine: "postgres", host: "db.internal", port: 5432, database: "drill", user: "geo", password: "hunter2", ssl: true }], s);
  const back = readDbProfiles(s);
  assert.deepEqual(back, [{ name: "corp", engine: "postgres", host: "db.internal", port: 5432, database: "drill", user: "geo", ssl: true }]);
  assert.ok(!s.getItem("geostrix-db-connection-profiles").includes("hunter2"));
  assert.deepEqual(readDbProfiles({ getItem: () => "not json" }), []);
  assert.deepEqual(cleanProfile({ name: "x", password: "p", token: "t" }), { name: "x" });
});

test("#1081 profiles from an older project file are added where this computer has none of that name", () => {
  const mine = [{ name: "corp", host: "mine" }];
  const merged = mergeDbProfiles(mine, [{ name: "corp", host: "theirs" }, { name: "lab", host: "lab.local", password: "x" }, { host: "no-name" }]);
  assert.deepEqual(merged, [{ name: "corp", host: "mine" }, { name: "lab", host: "lab.local" }]);
  assert.equal(mergeDbProfiles(mine, []), mine);
});
