// TASKS.csv #786 — the Spanish and Portuguese dictionaries: same keys, same {placeholders}, nothing empty, every ribbon
// label / group in the code translated; t() falls back to the English and fills placeholders.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { t, useDictionary, systemLanguage } from "../src/lib/i18n.js";

const load = (code) => JSON.parse(fs.readFileSync(new URL(`../src/locales/${code}.json`, import.meta.url), "utf8"));
const es = load("es"), pt = load("pt");
const holes = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("both dictionaries have the same keys, non-empty values and matching placeholders", () => {
  assert.deepEqual(Object.keys(es).sort(), Object.keys(pt).sort());
  for (const [code, d] of [["es", es], ["pt", pt]]) {
    for (const [k, v] of Object.entries(d)) {
      assert.ok(typeof v === "string" && v.trim(), `${code}: "${k}" is empty`);
      assert.deepEqual(holes(v), holes(k), `${code}: "${k}" placeholders`);
    }
  }
});

test("every ribbon button label and group caption in the code is translated in both", () => {
  const files = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : e.name.endsWith(".jsx") ? [path.join(d, e.name)] : []));
  const missing = [];
  for (const f of files("src")) {
    const s = fs.readFileSync(f, "utf8");
    // up to the next <Ribbon...: an onClick's "=>" is not the end of the tag
    for (const m of s.matchAll(/<Ribbon(?:Button|Group)\b(?:(?!<Ribbon)[\s\S])*?\blabel="([^"]+)"/g)) {
      for (const [code, d] of [["es", es], ["pt", pt]]) if (!d[m[1]]) missing.push(`${code}: ${m[1]} (${path.basename(f)})`);
    }
  }
  assert.deepEqual(missing, []);
});

test("every literal t(\"...\") / tr(\"...\") in the code is in both dictionaries", () => {
  const files = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : /\.jsx?$/.test(e.name) ? [path.join(d, e.name)] : []));
  const missing = [];
  for (const f of files("src")) {
    if (f.endsWith("i18n.js")) continue;
    const s = fs.readFileSync(f, "utf8");
    if (!s.includes("lib/i18n.js")) continue;
    const keys = [...s.matchAll(/(?<![\w.])(?:tr?|tx)\("((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]); // t / tr / tx (rich text)
    // tr(cond ? "A" : "B") — both branches
    for (const m of s.matchAll(/(?<![\w.])tr?\((?:[^()"]|"(?:[^"\\]|\\.)*"|\([^()]*\))*?\?\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) keys.push(m[1], m[2]);
    for (const raw of keys) {
      const key = JSON.parse(`"${raw}"`);
      for (const [code, d] of [["es", es], ["pt", pt]]) if (!d[key]) missing.push(`${code}: ${key} (${path.basename(f)})`);
    }
  }
  assert.deepEqual(missing, []);
});

test("t(): the dictionary, else the English; placeholders filled; system language", () => {
  useDictionary("es", es);
  assert.equal(t("Assays"), "Ensayes");
  assert.equal(t("Not in the dictionary"), "Not in the dictionary");
  assert.equal(t("Close {name}", { name: "Estereograma" }), "Cerrar Estereograma");
  assert.equal(t(undefined), undefined);
  useDictionary("en", null);
  assert.equal(t("Close {name}", { name: "Stereonet" }), "Close Stereonet");
  assert.deepEqual(["es-CL", "pt-BR", "pt-PT", "en-CA", "fr", ""].map(systemLanguage), ["es", "pt", "pt", "en", "en", "en"]);
});
