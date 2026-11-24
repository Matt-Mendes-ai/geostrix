// TASKS.csv #3975 — pinned against latest for the tools GeoStrix relies on. READ-ONLY: it reads metadata (PyPI's JSON API, the
// npm registry, GitHub's API) and changes nothing: no install, no download of any package, no edit of a pin or lock file.
//
//   node scripts/check-updates.mjs            a short table per group
//   node scripts/check-updates.mjs --json     the same as JSON
//   node scripts/check-updates.mjs --all      also every package of python-sidecar/constraints.txt (the full frozen tree)
//
// Groups: the science tools (python-sidecar/requirements.txt, each checked against its constraints.txt pin too), the geoML
// add-on (addons/geoml/requirements.txt: the geoML commit against its latest release, and TensorFlow's pins), the desktop
// packages (package.json's direct dependencies at the version package-lock.json installs).
// When to run it and how to act on it: docs/dependencies.md ("The review rule"). Not part of npm test (it needs the network);
// its parsing and comparison helpers are tested in test/checkUpdates3975.test.mjs.
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---- parsing (pure) --------------------------------------------------------------------------------------------------------

// Lines of a pip requirements / constraints file: `name==1.2.3`, `name[extra]==1.2.3`, `name @ git+<repository url>@<commit>`.
// Comments, blank lines and options (-r, -c, --index-url) are skipped; a requirement without an exact pin is kept with version null.
export function parseRequirements(text) {
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#") || line.startsWith("-")) continue;
    const git = line.match(/^([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?\s*@\s*git\+(https:\/\/[^@\s]+?)(?:\.git)?@([0-9a-fA-F]{7,40})\s*$/);
    if (git) {
      const repo = git[2].match(/github\.com\/([^/]+\/[^/]+?)\/?$/);
      out.push({ name: normName(git[1]), version: null, git: { url: git[2], repo: repo ? repo[1] : null, commit: git[3].toLowerCase() } });
      continue;
    }
    const m = line.match(/^([A-Za-z0-9_.-]+)(\[[^\]]*\])?\s*(==|>=|~=|<=|>|<|!=)?\s*([^;,\s]+)?/);
    if (!m) continue;
    out.push({ name: normName(m[1]), version: m[3] === "==" ? m[4] : null, spec: m[3] ? `${m[3]}${m[4] || ""}` : "" });
  }
  return out;
}

// PEP 503: names compare case-insensitively with runs of - _ . as one
export const normName = (n) => String(n).toLowerCase().replace(/[-_.]+/g, "-");

// The direct dependencies of package.json at the version package-lock.json (v2 / v3) installs.
export function lockedDirect(pkg, lock) {
  const out = [];
  for (const [group, deps] of [["dependencies", pkg.dependencies], ["devDependencies", pkg.devDependencies]]) {
    for (const [name, range] of Object.entries(deps || {})) {
      const entry = lock?.packages?.[`node_modules/${name}`] || lock?.dependencies?.[name];
      out.push({ name, range, version: entry?.version || null, dev: group === "devDependencies" });
    }
  }
  return out;
}

// ---- versions (pure) -------------------------------------------------------------------------------------------------------

// A version as numbers plus a pre / post release tag: '2026.0.3.post1', '0.25.2', '1.0.0rc1', '19.0.0-beta.2', 'v0.10.14'.
export function parseVersion(v) {
  const s = String(v || "").trim().replace(/^v/i, "").toLowerCase();
  const m = s.match(/^(\d+(?:\.\d+)*)(.*)$/);
  if (!m) return null;
  const nums = m[1].split(".").map(Number);
  const rest = m[2].replace(/^[-_.+]/, "");
  let pre = null, post = 0;
  const prm = rest.match(/^(alpha|beta|preview|pre|rc|dev|a|b|c)[-_.]?(\d*)/); // before the post test: 'rc0' is not 'r' + '0'
  const pm = !prm && rest.match(/^(?:post|rev|r)[-_.]?(\d*)/);
  if (pm) post = Number(pm[1] || 0) || 0.5; // '.post' with no number still counts as after the release
  else if (prm) pre = { tag: { alpha: "a", beta: "b", c: "rc", pre: "rc", preview: "rc" }[prm[1]] || prm[1], n: Number(prm[2] || 0) };
  return { nums, pre, post };
}

const PRE_RANK = { dev: 0, a: 1, b: 2, rc: 3 };

// -1, 0 or 1 as a is older, equal or newer than b; a pre-release sorts before its release, a post-release after it
export function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) return x ? 1 : y ? -1 : 0;
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] || 0) - (y.nums[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  if (!!x.pre !== !!y.pre) return x.pre ? -1 : 1;
  if (x.pre && y.pre) {
    const d = (PRE_RANK[x.pre.tag] ?? 0) - (PRE_RANK[y.pre.tag] ?? 0) || x.pre.n - y.pre.n;
    if (d) return d < 0 ? -1 : 1;
  }
  return x.post === y.post ? 0 : x.post < y.post ? -1 : 1;
}

export const isPreRelease = (v) => !!parseVersion(v)?.pre;

// How far the pin is behind: 'current', 'post' (a post-release of the same version), 'patch', 'minor', 'major', 'ahead' (the pin is
// newer than the registry's latest, e.g. a pre-release), or 'unknown'. Calendar versions (gempy 2026.0.3) read the same way.
export function bumpKind(pinned, latest) {
  const x = parseVersion(pinned), y = parseVersion(latest);
  if (!x || !y) return "unknown";
  const c = compareVersions(pinned, latest);
  if (c === 0) return "current";
  if (c > 0) return "ahead";
  const [a0 = 0, a1 = 0] = x.nums, [b0 = 0, b1 = 0] = y.nums;
  if (a0 !== b0) return "major";
  if (a1 !== b1) return a0 === 0 ? "major" : "minor"; // 0.x: a minor step may break, as semver says
  const same = x.nums.length === y.nums.length && x.nums.every((n, i) => n === y.nums[i]);
  return !same || x.pre || y.pre ? "patch" : "post";
}

// The newest release in a PyPI JSON 'releases' map, skipping pre-releases and fully yanked versions (info.version is the newest
// non-pre-release already, but a yanked latest would still be named there)
export function latestFromPypi(json) {
  const rel = json?.releases || {};
  const ok = Object.keys(rel).filter((v) => !isPreRelease(v) && (rel[v] || []).length > 0 && !(rel[v] || []).every((f) => f.yanked));
  if (!ok.length) return json?.info?.version || null;
  return ok.reduce((best, v) => (compareVersions(v, best) > 0 ? v : best), ok[0]);
}

// the newest release version among names such as tags ('v0.10.14'); pre-releases and non-versions skipped
export function newestVersion(names) {
  return (names || []).filter((t) => t && parseVersion(t) && !isPreRelease(t)).reduce((b, t) => (!b || compareVersions(t, b) > 0 ? t : b), null);
}

// ---- output (pure) ---------------------------------------------------------------------------------------------------------

export function table(rows, cols) {
  const w = cols.map(([k, h]) => rows.reduce((m, r) => Math.max(m, String(r[k] ?? "").length), h.length));
  const line = (vals) => vals.map((v, i) => String(v ?? "").padEnd(w[i])).join("  ").trimEnd();
  return [line(cols.map(([, h]) => h)), line(w.map((n) => "-".repeat(n))), ...rows.map((r) => line(cols.map(([k]) => r[k])))].join("\n");
}

// ---- network (metadata only) -----------------------------------------------------------------------------------------------

const UA = { "User-Agent": "geostrix-check-updates", Accept: "application/json" };

async function getJson(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20000);
  try {
    const r = await fetch(url, { headers: UA, signal: ac.signal, redirect: "follow" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// a few at a time: polite to the registries, and fast enough for ~100 names
async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

async function pypiLatest(name) {
  try { return { latest: latestFromPypi(await getJson(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`)) }; } catch (e) { return { error: e.message }; }
}

async function npmLatest(name) {
  try { return { latest: (await getJson(`https://registry.npmjs.org/${name.replace("/", "%2F")}/latest`)).version }; } catch (e) { return { error: e.message }; }
}

// the pinned commit against the latest release: GitHub's compare says how many commits the release is ahead of the pin
async function gitLatest(repo, commit) {
  try {
    // the newest of the latest GitHub release and the version tags: geoML tags versions without always making a release of them
    const rel = await getJson(`https://api.github.com/repos/${repo}/releases/latest`).catch(() => null);
    const tags = await getJson(`https://api.github.com/repos/${repo}/tags?per_page=100`).catch(() => []);
    const tag = newestVersion([rel?.tag_name, ...(tags || []).map((t) => t.name)]);
    if (!tag) return { error: "no release" };
    const cmp = await getJson(`https://api.github.com/repos/${repo}/compare/${commit}...${encodeURIComponent(tag)}`);
    return { latest: tag, aheadBy: cmp.ahead_by, behindBy: cmp.behind_by };
  } catch (e) {
    return { error: e.message };
  }
}

// ---- the check -------------------------------------------------------------------------------------------------------------

const read = (p) => readFileSync(path.join(ROOT, p), "utf8");

export async function checkAll({ all = false } = {}) {
  const req = parseRequirements(read("python-sidecar/requirements.txt"));
  const cons = parseRequirements(read("python-sidecar/constraints.txt"));
  const consPin = new Map(cons.map((c) => [c.name, c.version]));
  const science = req.map((r) => ({ name: r.name, pinned: r.version, constraint: consPin.get(r.name) ?? null }));
  if (all) for (const c of cons) if (!science.some((s) => s.name === c.name)) science.push({ name: c.name, pinned: c.version, constraint: c.version, tree: true });

  const addon = parseRequirements(read("addons/geoml/requirements.txt"));
  const desktop = lockedDirect(JSON.parse(read("package.json")), JSON.parse(read("package-lock.json")));

  const sci = await mapLimit(science, 6, async (s) => ({ ...s, ...(await pypiLatest(s.name)) }));
  const add = await mapLimit(addon, 4, async (a) => (a.git?.repo ? { name: a.name, pinned: a.git.commit.slice(0, 8), ...(await gitLatest(a.git.repo, a.git.commit)) } : { name: a.name, pinned: a.version, ...(await pypiLatest(a.name)) }));
  const desk = await mapLimit(desktop, 6, async (d) => ({ name: d.name, range: d.range, pinned: d.version, dev: d.dev, ...(await npmLatest(d.name)) }));

  const kind = (r) => (r.error ? "error: " + r.error : r.aheadBy != null ? (r.aheadBy === 0 ? "current" : `${r.aheadBy} commits behind`) : bumpKind(r.pinned, r.latest));
  for (const r of [...sci, ...add, ...desk]) r.status = kind(r);
  for (const r of sci) if (r.constraint && r.pinned && r.constraint !== r.pinned) r.status += " (constraints.txt pins " + r.constraint + ")";
  return { checked: new Date().toLocaleDateString("en-CA") /* local date, YYYY-MM-DD */, science: sci, addon: add, desktop: desk };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const res = await checkAll({ all: args.has("--all") });
  if (args.has("--json")) { console.log(JSON.stringify(res, null, 2)); return; }
  const cols = [["name", "Tool"], ["pinned", "Pinned"], ["latest", "Latest"], ["status", "Status"]];
  console.log(`Checked ${res.checked} (read-only: nothing installed or changed)\n`);
  console.log("Science tools (python-sidecar/requirements.txt" + (args.has("--all") ? " + constraints.txt" : "") + ")\n" + table(res.science, cols) + "\n");
  console.log("geoML add-on (addons/geoml/requirements.txt)\n" + table(res.addon, cols) + "\n");
  console.log("Desktop packages (package.json at the package-lock.json version)\n" + table(res.desktop, cols));
  const behind = [...res.science, ...res.addon, ...res.desktop].filter((r) => !/^current/.test(r.status)).length;
  console.log(`\n${behind} not current. Electron is reviewed at every release; the science tools every three months and before a significant release (docs/dependencies.md).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
