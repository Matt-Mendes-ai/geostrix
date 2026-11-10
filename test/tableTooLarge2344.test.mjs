// TASKS.csv #2344 — a CSV over the one-string limit (about 512 MB) stops at once with the real reason, not "no rows found"
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTableFile, decodeTableBytes, TEXT_MAX_BYTES } from "../src/lib/tabular.js";

test("the limit is V8's longest string", () => {
  assert.equal(TEXT_MAX_BYTES, 0x1fffffe8);
});

test("a file over it is refused before the column chooser, with its size and what to do", async () => {
  // a stand-in File: only size and name are read before the refusal (nothing is sliced or decoded)
  const big = { name: "big.csv", size: TEXT_MAX_BYTES + 1, slice() { throw new Error("must not be read"); }, arrayBuffer() { throw new Error("must not be read"); } };
  await assert.rejects(parseTableFile(big), /it is 512 MB, more than the 512 MB a single text read can hold, so it can't be opened in one piece: split it \(by hole, or by columns\) and open the parts/);
});

test("a normal file still decodes; the guard sits in the decoder too", () => {
  assert.equal(decodeTableBytes(new TextEncoder().encode("a,b\n1,2\n")).text, "a,b\n1,2\n");
  assert.equal(decodeTableBytes(new Uint8Array(0)).text, "");
  const t = readFileSync(new URL("../src/lib/tabular.js", import.meta.url), "utf8");
  assert.match(t, /if \(u8\.length > TEXT_MAX_BYTES\) throw tooLargeForOneRead\(u8\.length\);/);
  assert.match(t, /if \(u8\.length > 0 && !text\.length\) throw tooLargeForOneRead\(null\);/);
  assert.match(t, /if \(file\?\.size > TEXT_MAX_BYTES\) throw tooLargeForOneRead\(file\.size\);/);
});
