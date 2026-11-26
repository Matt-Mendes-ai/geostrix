// TASKS.csv #4098 (Matt: faster releases, if it creates no issues) — the release runs the sidecar tests only when the engine changed since the previous
// release (else sidecar.yml's green run stands, or they run here), reuses Build's JS tests on the same commit (Build required green, Windows included),
// and the signing script times each step. Read as text (no YAML parser is a dependency); the inline PowerShell is parsed by the release itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const rel = read(".github/workflows/release.yml");
const buildJob = rel.slice(rel.indexOf("\n  build:\n"), rel.indexOf("\n  publish:\n"));
// the build job's steps, each as its text block
const steps = buildJob.split(/\n      - /).slice(1);
const step = (name) => steps.find((s) => s.includes(`name: ${name}`) || s.includes(`name: "${name}"`)) || "";
const at = (name) => steps.findIndex((s) => s.includes(`name: ${name}`));

test("#4098 the build job stays read-only: contents and actions read, no token for install scripts", () => {
  assert.match(buildJob, /\n    permissions:\n      contents: read\n      actions: read #/);
  assert.doesNotMatch(buildJob, /: write/);
  assert.match(steps[0], /persist-credentials: false/);
  assert.match(steps[0], /fetch-depth: 0/, "the previous release tag and the history since it");
  const withToken = steps.filter((s) => s.includes("GH_TOKEN:"));
  assert.equal(withToken.length, 2, "only the two checks hold a token");
});

test("#4098 the sidecar tests run only when the engine changed, or when sidecar.yml has no green run of its last change", () => {
  const d = step("Decide what this release must test");
  assert.match(d, /id: decide/);
  assert.ok(at("Decide what this release must test") < steps.findIndex((s) => s.startsWith("run: npm ci")), "decided before anything is installed");
  assert.match(d, /git describe --tags --abbrev=0 --match 'v\[0-9\]\*' HEAD~1/);
  assert.match(d, /\$paths = @\('python-sidecar', '\.github\/workflows\/sidecar\.yml'\)/);
  assert.match(d, /git diff --quiet \$prev HEAD -- @paths/);
  assert.match(d, /actions\/workflows\/sidecar\.yml\/runs\?branch=master/);
  assert.match(d, /git merge-base --is-ancestor \$last \$r\.head_sha/);
  assert.match(d, /if \(\$hit -and \$hit\.conclusion -eq 'success'\) \{[\s\S]*"sidecar=skip"[\s\S]*\} else \{[\s\S]*"sidecar=run"/, "no green run: they run here");
  for (const n of ["Sidecar physics tests", "Sidecar fault, onlap and DC/IP tests"]) assert.match(step(n), /\n {8}if: steps\.decide\.outputs\.sidecar == 'run'\n/, n);
  for (const n of ["Freeze the Python sidecar", "Smoke-test the frozen Python engine"]) assert.doesNotMatch(step(n), /\n {8}if:/, `${n}: always`);
});

test("#4098 the JS tests are Build's: a green Build of the same commit is required, never skipped", () => {
  assert.ok(!steps.some((s) => /^run: npm test\b/.test(s) || /\n {8}run: npm test\b/.test(s)), "not re-run here");
  const g = step("Require a green Build of this commit");
  assert.ok(at("Require a green Build of this commit") < at("Collect the release files and their SHA-256 checksums"), "before anything is collected");
  assert.match(g, /actions\/workflows\/build\.yml\/runs\?head_sha=\$sha/);
  assert.match(g, /if \(\$green\) \{[^}]*exit 0 \}/);
  assert.match(g, /if \(\$runs\.Count -and -not \$open\) \{ Write-Error "Build is red[^"]*"; exit 1 \}/);
  assert.match(g, /TotalMinutes -gt 5\) \{ Write-Error "No Build run for \$\{sha\}:[^"]*"; exit 1 \}/, "missing: fails");
  assert.match(g, /TotalMinutes -gt 60\) \{ Write-Error[^}]*exit 1 \}/, "never waits forever");
  const build = read(".github/workflows/build.yml");
  assert.match(build, /\n {2}workflow_dispatch:\n/, "Build can be run on a commit master never saw (a test tag)");
  const win = build.slice(build.indexOf("\n  windows-smoke:"));
  assert.match(win, /\n {6}- run: npm ci\n[\s\S]*?\n {6}- run: npm test\n/, "the JS tests on Windows too");
  assert.match(build.slice(0, build.indexOf("\n  windows-smoke:")), /\n {6}- run: npm test\n/, "and on Linux");
});

test("#4098 no '$name:' inside a PowerShell string of the release (it parses as a scope: the Build gate failed to parse once)", () => {
  const bad = [...buildJob.matchAll(/"[^"\n]*\$(?!env:|script:|global:|\(|\{)[A-Za-z_]\w*:[^"\n]*"/g)].map((m) => m[0]);
  assert.deepEqual(bad, []);
});

test("#4098 sign-release.ps1 says when each step started, how long it took, and the total", () => {
  const p = read("scripts/sign-release.ps1");
  assert.match(p, /function Step\(\$msg\) \{ Step-Took; \$script:stepName = \$msg; \$script:stepAt = Get-Date;/);
  assert.match(p, /function Fail\(\$msg\) \{ Total-Took;/);
  assert.match(p, /Total-Took # #4098\nWrite-Host ""\nWrite-Host "Published/);
});
