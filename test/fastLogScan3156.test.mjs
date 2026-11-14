// TASKS.csv #3156 (from #3038) — a plain downhole log (one delimiter, no quotes, unique headers, every line as wide as the header) is scanned without
// Papa's row objects: 2.5-3x faster on a 37 MB / 1.44 M-reading SYNTHETIC log (Node, 10.5-13.8 s -> 4.1-4.8 s), the same table. Anything else is
// read by Papa as before. The same log read both ways gives the same rows, the same no-data codes and the same binned layers.
import test from "node:test";
import assert from "node:assert/strict";
import { parseTableText, fastLogScan } from "../src/lib/tabular.js";
import { logReadSpec } from "../src/lib/logOnRead.js";
import { channelNoData, logChannelRows, logReadings } from "../src/lib/downholeLogChannels.js";

function csv({ delim = ",", lines = 3000 } = {}) {
  const out = [["Hole_id", "Depth", "Gamma_cps", "Density_gcc", "Flag"].join(delim)];
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < lines; i++) {
    const h = `PD${i % 7}`, d = (Math.floor(i / 7) * 0.05).toFixed(2);
    let g = (40 + 60 * rnd()).toFixed(1), den = (2.2 + 0.8 * rnd()).toFixed(3);
    if (i % 89 === 4) g = "-999"; if (i % 61 === 9) den = "n/a"; if (i % 47 === 2) g = ""; if (i % 101 === 5) den = "1e0";
    out.push([i % 500 === 3 ? "" : h, d, g, den, i % 2 ? "true" : "x"].join(delim));
  }
  return out.join("\n");
}
const mapping = { hole_id: "Hole_id", depth: "Depth" };

test("the fast scan and Papa give the same rows, codes and binned channels", () => {
  for (const delim of [",", "\t", ";"]) {
    const text = csv({ delim, lines: 7000 });
    const head = parseTableText(text, {});
    const spec = { ...logReadSpec(head.headers, head.rows.slice(0, 400), mapping), sampleN: 200 };
    assert.ok(spec, delim);
    const fast = parseTableText(text, { logRead: spec });
    const papa = parseTableText(text.replace(/^Hole_id/, '"Hole_id"'), { logRead: spec }); // a quote: Papa reads it (it strips the quotes)
    assert.deepEqual(fast.headers, papa.headers);
    assert.deepEqual(fast.rows, papa.rows, `${JSON.stringify(delim)} sample rows`);
    assert.equal(logReadings(fast.logTable), logReadings(papa.logTable));
    for (const c of spec.channels) {
      const a = channelNoData(papa.logTable, c, ""), b = channelNoData(fast.logTable, c, "");
      assert.deepEqual(b && { n: b.n, codes: b.codes }, a && { n: a.n, codes: a.codes });
      for (const bin of [null, 0.5]) assert.deepEqual(logChannelRows(fast.logTable, mapping, c, bin, b?.values || null), logChannelRows(papa.logTable, mapping, c, bin, a?.values || null), `${c} ${bin}`);
    }
  }
});

test("anything not plain is left to Papa", () => {
  const spec = { hole: "Hole_id", depth: "Depth", channels: ["Gamma_cps"], sampleN: 10 };
  const dt = () => true;
  assert.equal(fastLogScan('Hole_id,Depth,Gamma_cps\nA,1,"2,5"\n', spec, dt), null, "a quote");
  assert.equal(fastLogScan("Hole_id,Depth,Gamma_cps\nA,1,2\nA,2\n", spec, dt), null, "a short line");
  assert.equal(fastLogScan("Hole_id,Depth,Gamma_cps,Gamma_cps\nA,1,2,3\n", spec, dt), null, "a header twice");
  assert.equal(fastLogScan("Hole_id;Depth,Gamma_cps\nA;1,2\n", spec, dt), null, "two delimiters in the header");
  assert.equal(fastLogScan("Hole_id,Depth,Other\nA,1,2\n", spec, dt), null, "a channel not in the header");
  const ok = fastLogScan("Hole_id,Depth,Gamma_cps\r\nA,1,2\r\n\r\nA,2,3\r\n", spec, dt);
  assert.equal(ok.logTable.n, 2, "CRLF and an empty line, as Papa's skipEmptyLines");
});
