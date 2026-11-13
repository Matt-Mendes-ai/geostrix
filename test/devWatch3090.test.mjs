// TASKS.csv #3090 — the dev server must not watch the side sessions' worktrees or build output: their dist/index.html reloaded the dev window.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("vite's dev watcher ignores .claude, dist and release", () => {
  const s = fs.readFileSync("vite.config.js", "utf8");
  for (const g of ["**/.claude/**", "**/dist/**", "**/release/**"]) assert.ok(s.includes(`"${g}"`), g);
  assert.match(s, /server: \{ port: 5173, strictPort: true, watch: \{ ignored: \[/);
});
