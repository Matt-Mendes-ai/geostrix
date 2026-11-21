// TASKS.csv #3957 — native window.confirm / alert / prompt are blocking OS message boxes in Electron (a dropped terrain's "use this CRS?" froze the page): unstyled,
// outside the text-size setting, buttons in the system's language. Every ask goes through lib/confirmDialog.js (askConfirm / askAlert, drawn by ConfirmHost). This is
// the guard: no native dialog call is left in src, the shared dialog's contract holds, and its host is mounted in both windows.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (p) => fs.readFileSync(path.join(SRC, p), "utf8").replace(/\r\n/g, "\n");

function nativeCalls() {
  const found = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== "locales") walk(p); } else if (/\.(jsx?|mjs)$/.test(e.name)) scan(p); } };
  const scan = (p) => {
    const src = fs.readFileSync(p, "utf8");
    if (!/\b(confirm|alert|prompt)\b/.test(src)) return;
    const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
    traverse(ast, { CallExpression(c) {
      const k = c.node.callee;
      const native = (k.type === "MemberExpression" && /^(window|globalThis|self)$/.test(k.object.name || "") && /^(confirm|alert|prompt)$/.test(k.property.name || ""))
        || (k.type === "Identifier" && /^(confirm|alert|prompt)$/.test(k.name) && !c.scope.hasBinding(k.name));
      if (native) found.push(`${path.relative(SRC, p).split(path.sep).join("/")}:${c.node.loc.start.line}`);
    } });
  };
  walk(SRC);
  return found;
}

test("#3957 no window.confirm / alert / prompt call is left in src", () => {
  assert.deepEqual(nativeCalls(), [], "route it through lib/confirmDialog.js (askConfirm / askAlert), awaiting the answer");
});

test("#3957 askConfirm / askAlert: the answer is a promise; with no host a confirm is 'no'; asks queue and are answered in turn", async () => {
  globalThis.window = {}; // the lib only needs a window to exist
  const { askConfirm, askAlert, registerConfirmHost } = await import("../src/lib/confirmDialog.js");
  // no host yet: asks wait for one
  const early = askConfirm("Replace it?");
  const seen = [];
  const off = registerConfirmHost((req) => { seen.push(req); });
  assert.equal(seen.length, 1, "an ask made before the host mounted is delivered when it does");
  seen[0].resolve(true);
  assert.equal(await early, true);
  const a = askConfirm("one", { destructive: true }), b = askConfirm("two"), al = askAlert("note");
  assert.deepEqual(seen.slice(1).map((r) => r.kind), ["confirm", "confirm", "alert"]);
  assert.equal(seen[1].destructive, true);
  seen[1].resolve(false); seen[2].resolve(true); seen[3].resolve();
  assert.deepEqual([await a, await b], [false, true]);
  assert.equal(await al, undefined);
  off();
  delete globalThis.window;
  assert.equal(await askConfirm("no window"), false, "with no window (Node) a confirm answers no");
});

test("#3957 confirmDestructive is the shared destructive confirm: its question and tail, destructive styling, a promise", async () => {
  globalThis.window = {};
  const { registerConfirmHost } = await import("../src/lib/confirmDialog.js");
  const { confirmDestructive } = await import("../src/lib/confirmDestructive.js");
  const got = [];
  const off = registerConfirmHost((req) => { got.push(req); req.resolve(true); });
  const p = confirmDestructive("Delete it?", { undoable: true });
  assert.ok(p instanceof Promise);
  assert.equal(await p, true);
  assert.equal(got[0].destructive, true);
  assert.match(got[0].message, /^Delete it\? .*Ctrl\+Z/);
  off();
  delete globalThis.window;
});

test("#3957 the host: mounted in the app and in the section window, in front of the import (62) and the CRS question (64), Escape = cancel, a focus trap", () => {
  assert.equal((read("App.jsx").match(/<ConfirmHost \/>/g) || []).length, 1);
  assert.match(read("main.jsx"), /<ConfirmHost \/>/);
  const h = read("components/ConfirmHost.jsx");
  assert.match(h, /zIndex: 70/);
  assert.match(h, /e\.key === "Escape"/);
  assert.match(h, /useFocusTrap\(\)/);
  assert.match(h, /role="alertdialog" aria-modal="true"/);
  assert.match(h, /var\(--font-size-base\)/);
  assert.match(h, /req\.destructive \? cancelRef : okRef/);
});

test("#3957 the CRS-adoption question (the Start flow's terrain) is asked in-app and awaited", async () => {
  const a = read("lib/adoptCrs.js");
  assert.match(a, /export async function askAdoptCrs\(/);
  assert.match(a, /confirm = \(m\) => askConfirm\(m\)/);
  assert.match(a, /return async \(sourceEpsg, currentEpsg, bbox = null\) =>/);
  assert.match(read("lib/raster.js"), /Number\(await chooseProjectEpsg\(epsgTag, targetEpsg,/);
  // askAdoptCrs with an injected confirm: the answer decides, the declared CRS is adopted only on OK
  const { askAdoptCrs } = await import("../src/lib/adoptCrs.js");
  const args = { isEmpty: true, currentEpsg: 3156, declaredEpsg: 28351, fileName: "made-up-dem.tif" };
  assert.equal(await askAdoptCrs(args, async () => true), 28351);
  assert.equal(await askAdoptCrs(args, async () => false), null);
  assert.equal(await askAdoptCrs(args, () => true), 28351, "a synchronous confirm (a test double) still works");
});
