// TASKS.csv #3975 — scripts/check-updates.mjs: its parsing and version-comparison helpers, on fixtures (no network; the script
// itself is not run here). The script is read-only: no install or package download, no write.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseRequirements, normName, lockedDirect, parseVersion, compareVersions, isPreRelease, bumpKind, latestFromPypi, newestVersion, table } from "../scripts/check-updates.mjs";

test("#3975 requirements: exact pins, extras, a git commit, comments and options", () => {
  const r = parseRequirements([
    "# a comment",
    "fastapi==0.141.1",
    "uvicorn[standard]==0.52.3   # trailing comment",
    "gempy_engine==2026.0.3.post1",
    "",
    "-c constraints.txt",
    "geoml @ git+https://github.com/example-owner/geoML@4eb7121c178b0cca3d12cf52472a6ab75907a380",
    "loose>=1.0",
  ].join("\r\n"));
  assert.deepEqual(r.map((x) => [x.name, x.version]), [["fastapi", "0.141.1"], ["uvicorn", "0.52.3"], ["gempy-engine", "2026.0.3.post1"], ["geoml", null], ["loose", null]]);
  assert.deepEqual(r[3].git, { url: "https://github.com/example-owner/geoML", repo: "example-owner/geoML", commit: "4eb7121c178b0cca3d12cf52472a6ab75907a380" });
  assert.equal(r[4].spec, ">=1.0");
  assert.equal(normName("Tf_Keras"), "tf-keras");
});

test("#3975 the repository's own pin files parse: every science tool has an exact pin that constraints.txt agrees with", () => {
  const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
  const req = parseRequirements(read("python-sidecar/requirements.txt"));
  const cons = new Map(parseRequirements(read("python-sidecar/constraints.txt")).map((c) => [c.name, c.version]));
  assert.ok(req.length >= 10 && req.every((x) => x.version), "every requirement pinned exactly");
  for (const x of req) assert.equal(cons.get(x.name), x.version, `${x.name}: constraints.txt pins the same version`);
  const geoml = parseRequirements(read("addons/geoml/requirements.txt")).find((x) => x.name === "geoml");
  assert.match(geoml.git.commit, /^[0-9a-f]{40}$/);
});

test("#3975 the desktop packages at the lock file's version", () => {
  const pkg = { dependencies: { pg: "^8.11.3" }, devDependencies: { three: "^0.160.0", "@scope/x": "1.0.0" } };
  const lock = { lockfileVersion: 3, packages: { "node_modules/pg": { version: "8.23.0" }, "node_modules/three": { version: "0.160.1" } } };
  assert.deepEqual(lockedDirect(pkg, lock), [
    { name: "pg", range: "^8.11.3", version: "8.23.0", dev: false },
    { name: "three", range: "^0.160.0", version: "0.160.1", dev: true },
    { name: "@scope/x", range: "1.0.0", version: null, dev: true },
  ]);
});

test("#3975 versions: release order with pre- and post-releases, calendar versions, a v prefix", () => {
  assert.deepEqual(parseVersion("2026.0.3.post1"), { nums: [2026, 0, 3], pre: null, post: 1 });
  assert.deepEqual(parseVersion("2.22.0rc0").pre, { tag: "rc", n: 0 }, "rc is a pre-release, not r + 0");
  assert.equal(parseVersion("not a version"), null);
  const sorted = ["1.0.0", "1.0.0rc1", "0.9.9", "1.0.0.post2", "1.0.0b3", "1.0.1", "1.0.0a1", "1.0.0.post1", "1.0.0-beta.1"].sort(compareVersions);
  assert.deepEqual(sorted, ["0.9.9", "1.0.0a1", "1.0.0-beta.1", "1.0.0b3", "1.0.0rc1", "1.0.0", "1.0.0.post1", "1.0.0.post2", "1.0.1"]);
  assert.equal(compareVersions("v0.10.14", "0.9.3"), 1, "numeric, not text: 10 > 9");
  assert.equal(compareVersions("1.2", "1.2.0"), 0);
  assert.equal(isPreRelease("19.0.0-beta.2"), true);
  assert.equal(isPreRelease("2.6.1"), false);
});

test("#3975 how far a pin is behind", () => {
  assert.equal(bumpKind("2026.0.3", "2026.0.3"), "current");
  assert.equal(bumpKind("2026.0.3", "2026.0.3.post1"), "post");
  assert.equal(bumpKind("2.4.6", "2.5.5"), "minor");
  assert.equal(bumpKind("44.9.3", "45.4.1"), "major");
  assert.equal(bumpKind("8.23.0", "8.23.1"), "patch");
  assert.equal(bumpKind("0.25.2", "0.26.0"), "major", "0.x: a minor step may break");
  assert.equal(bumpKind("0.10.3", "0.10.4"), "patch");
  assert.equal(bumpKind("1.0.0rc1", "1.0.0"), "patch");
  assert.equal(bumpKind("2.0.0", "1.9.0"), "ahead");
  assert.equal(bumpKind(null, "1.0.0"), "unknown");
});

test("#3975 the latest release from PyPI JSON and from tag names: pre-releases and yanked versions skipped", () => {
  const json = { info: { version: "2.3.0" }, releases: { "2.1.0": [{ yanked: false }], "2.3.0": [{ yanked: true }], "2.2.1": [{ yanked: false }], "2.4.0rc1": [{ yanked: false }], "2.5.0": [] } };
  assert.equal(latestFromPypi(json), "2.2.1");
  assert.equal(latestFromPypi({ info: { version: "1.0" }, releases: {} }), "1.0");
  assert.equal(newestVersion([null, "v0.6.6", "v0.10.15", "v0.10.14", "v0.11.0rc1", "nightly"]), "v0.10.15");
  assert.equal(newestVersion([]), null);
});

test("#3975 the table pads each column to its widest cell", () => {
  const t = table([{ name: "numpy", v: "2.4.6" }, { name: "gempy-engine", v: "2026.0.3.post1" }], [["name", "Tool"], ["v", "Pinned"]]).split("\n");
  assert.deepEqual(t, ["Tool          Pinned", "------------  --------------", "numpy         2.4.6", "gempy-engine  2026.0.3.post1"]);
});

test("#3975 the script stays read-only: metadata reads only, no install, no write, and it is not part of npm test", () => {
  const s = readFileSync(new URL("../scripts/check-updates.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(s, /child_process|writeFileSync|writeFile\(|appendFile|\bspawn\(|\bexecSync\(|pip install|npm install/);
  assert.deepEqual([...s.matchAll(/https:\/\/([a-z.]+)\//g)].map((m) => m[1]).filter((h, i, a) => a.indexOf(h) === i).sort(), ["api.github.com", "pypi.org", "registry.npmjs.org"]);
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.doesNotMatch(pkg.scripts.test, /check-updates/);
});
