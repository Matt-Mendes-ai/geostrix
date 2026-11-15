// TASKS.csv #3625 (Fireweed rehearsal) — 'n 32,426' printed with the English thousands comma in every language ('32.4' to a Brazilian or French reader). A toLocaleString() with no locale takes the interface language's;
// one with its own locale ("en-US", for files) is left alone; English keeps the system's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { initLanguage, NUMBER_LOCALES } from "../src/lib/i18n.js";

test("the interface language's number format, for calls that name no locale", async () => {
  const before = (32426).toLocaleString("en-US");
  assert.equal(before, "32,426");
  await initLanguage("es"); assert.equal((32426).toLocaleString(), "32.426"); assert.equal((12345.5).toLocaleString(undefined, { maximumFractionDigits: 1 }), "12.345,5");
  await initLanguage("pt"); assert.equal((32426).toLocaleString(), "32.426");
  await initLanguage("fr"); assert.match((32426).toLocaleString(), /^32[\s\u202f\u00a0]426$/);
  await initLanguage("ar"); assert.equal((32426).toLocaleString(), "32,426", "Western digits, as the rehearsal read them");
  assert.equal((32426).toLocaleString("en-US"), "32,426", "a call that names its locale (a file) is untouched");
  await initLanguage("en"); assert.equal((32426).toLocaleString("en-US"), "32,426");
  assert.deepEqual(Object.keys(NUMBER_LOCALES), ["es", "pt", "fr", "ar"]);
});
