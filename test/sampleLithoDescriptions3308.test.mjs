// TASKS.csv #3308 (Matt: "re import the lithologies for the sample projects and add the description field, usually as labelled as note or
// description") — every bundled sample whose source logs a lithology description carries it as the layer's `description` column, which the
// Lithology import maps (TARGET_SCHEMAS.litho), Identify lists (attributeFields) and the strip log's interval tooltip now shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import Papa from "papaparse";
import { TARGET_SCHEMAS } from "../src/lib/layers.js";

const csv = (p) => Papa.parse(readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n"), { header: true, skipEmptyLines: true });

test("#3308 the samples with a logged description carry it in litho.csv", () => {
  const g = csv("../sample_data/wa_gold/litho.csv");
  assert.deepEqual(g.meta.fields, ["hole_id", "from", "to", "lithology", "description"]);
  assert.equal(g.data.length, 4207);
  assert.equal(g.data.filter((r) => r.description).length, 4076, "the source's Comments");
  assert.ok(g.data.every((r) => !/\s{2,}|^\s|\s$/.test(r.description)), "whitespace collapsed");
  // the samples that already had one keep it
  for (const s of ["wa_uranium", "wa_zinc_copper", "qld_century"]) {
    const f = `../sample_data/${s}/litho.csv`;
    if (existsSync(new URL(f, import.meta.url))) assert.ok(csv(f).meta.fields.includes("description"), s);
  }
  assert.match(readFileSync(new URL("../scripts/samples/build-wa-gold.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n"), /description: txt\(r\.Comments\)\.replace\(\/\\s\+\/g, " "\)/);
});

test("#3308 the Lithology import maps a description column; the strip log's tooltip shows it", () => {
  const f = TARGET_SCHEMAS.litho.fields.find((x) => x.key === "description");
  assert.ok(f && f.aliases.includes("description") && f.aliases.includes("comments"));
  const s = readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /const d = typeof r\.description === "string" && r\.description\.trim\(\) \? `\\n\$\{r\.description\.trim\(\)\}` : "";/);
  assert.match(s, /return \(lanes > 1 \|\| m \|\| d\) \? <title>/);
});
