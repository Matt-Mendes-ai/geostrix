// TASKS.csv #3939 — scripts/word-count.mjs reads tx() (lib/i18nRich.js) as well as tr(), and counts a string in the body of a closed fold (a MoreFold or a
// details, not its summary or an attribute) as behind More, as Help's `more` is. SYNTHETIC source in a temp file.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { trStringsOf } from "../scripts/word-count.mjs";

test("#3939 tx() is counted, and a fold's body is behind More while its summary and attributes are seen first", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "wc3939-")), "Card.jsx");
  fs.writeFileSync(f, [
    'import { t as tr } from "../lib/i18n.js";',
    'import { tx } from "../lib/i18nRich.js";',
    'export function Card({ list }) {',
    '  return (<div>',
    '    <p>{tx("Seen rich {b} words", { b: <b>{tr("bold")}</b> })}</p>',
    '    <MoreFold summary={tr("Fold heading")}>{tr("Folded words")}{list.map((x) => <span key={x} title={tr("Folded tooltip")}>{tx("Folded rich {x}", { x })}</span>)}</MoreFold>',
    '    <details><summary>{tr("Details heading")}</summary><div>{tr("Details body")}</div></details>',
    '  </div>);',
    '}',
  ].join("\n"));
  const got = Object.fromEntries(trStringsOf(f).map((s) => [s.text, s.more]));
  assert.deepEqual(got, { "Seen rich {b} words": false, bold: false, "Fold heading": false, "Folded words": true, "Folded tooltip": true, "Folded rich {x}": true, "Details heading": false, "Details body": true });
});
