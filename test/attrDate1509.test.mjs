// TASKS.csv #1509 — a surface sample's (or collar's) date column arrived from Papa's dynamic typing as a Date and was stored with
// String(Date), the computer's local time: '2021-06-05T00:00:00.000Z' became 'Fri Jun 04 2021 16:00:00 GMT-0800' in BC.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { attrText, surfaceAttrs } from "../src/lib/geochem.js";

test("a date-only timestamp stays its calendar day; another moment stays ISO; text is trimmed", () => {
  assert.equal(attrText(new Date("2021-06-05T00:00:00.000Z")), "2021-06-05");
  assert.equal(attrText(new Date("2021-06-05T17:30:00.000Z")), "2021-06-05T17:30:00.000Z");
  assert.equal(attrText(new Date("nope")), "");
  assert.equal(attrText("  DD  "), "DD");
  assert.equal(attrText(0), "0");
  assert.equal(attrText(null), "");
});

test("the import path: Papa's Date cell -> the stored attribute, in a UTC-8 time zone", () => {
  const rows = Papa.parse("sample,date,type\nF0120001,2021-06-05T00:00:00.000Z,rock\n", { header: true, dynamicTyping: true }).data;
  assert.ok(rows[0].date instanceof Date); // the input this fix is about
  assert.deepEqual(surfaceAttrs(rows[0], ["date", "type"]), { attrs: { date: "2021-06-05", type: "rock" } });
  // the same in a process whose clock is BC's (where the reviewer saw Jun 04)
  const mod = new URL("../src/lib/geochem.js", import.meta.url).href;
  const code = `import Papa from "papaparse"; import { surfaceAttrs } from ${JSON.stringify(mod)};
    const r = Papa.parse("date\\n2021-06-05T00:00:00.000Z\\n", { header: true, dynamicTyping: true }).data[0];
    process.stdout.write(JSON.stringify({ local: String(r.date), stored: surfaceAttrs(r, ["date"]).attrs.date }));`;
  const out = spawnSync(process.execPath, ["--input-type=module", "-e", code], { env: { ...process.env, TZ: "America/Vancouver" }, cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" });
  const res = JSON.parse(out.stdout);
  assert.match(res.local, /Jun 04 2021/); // what String(Date) gave there
  assert.equal(res.stored, "2021-06-05");
});
