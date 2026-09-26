// TASKS.csv #471 / #460 — package.json's version must never be behind the newest release tag. #460: a tool
// run in the repo folder overwrote package.json with an old copy; a build from that would have shipped as
// an OLDER version, which the auto-updater never offers. Needs the tags (checkout fetch-depth: 0).
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const parse = (v) => String(v).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
const cmp = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
const pkg = JSON.parse(readFileSync("package.json", "utf8")).version;
const tags = execSync('git tag --list "v*"', { encoding: "utf8" }).split(/\r?\n/).filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
if (!tags.length) { console.log(`package.json ${pkg}; no release tags found (shallow clone?) — nothing to compare`); process.exit(0); }
const latest = tags.sort((a, b) => cmp(parse(a), parse(b))).at(-1);
console.log(`package.json ${pkg}; newest release tag ${latest}`);
if (cmp(parse(pkg), parse(latest)) < 0) {
  console.error(`package.json's version ${pkg} is BEHIND the released ${latest} — was package.json overwritten by an old copy? (TASKS.csv #460)`);
  process.exit(1);
}
