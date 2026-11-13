// TASKS.csv #2840 — with the channel boxes shown, the Value select's choice (observed gravity, ADJG) is imported, ticked
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { withValueChannel, tickedChannels } from "../src/lib/radiometricChannels.js";

test("a column chosen under Value joins the channels, ticked; the ticked ones are imported in the list's order", () => {
  const r = withValueChannel(["BOUGUER", "FREEAIR"], ["BOUGUER", "FREEAIR"], "ADJG");
  assert.deepEqual(r, { channels: ["BOUGUER", "FREEAIR", "ADJG"], channelPick: ["BOUGUER", "FREEAIR", "ADJG"] });
  // both unticked, then ADJG chosen: ADJG alone is imported
  const u = withValueChannel(["BOUGUER", "FREEAIR"], [], "ADJG");
  assert.deepEqual(tickedChannels(u.channels, u.channelPick).map((c) => c.col), ["ADJG"]);
  // already listed: ticked again, not duplicated
  assert.deepEqual(withValueChannel(["BOUGUER", "FREEAIR"], ["FREEAIR"], "BOUGUER"), { channels: ["BOUGUER", "FREEAIR"], channelPick: ["FREEAIR", "BOUGUER"] });
  // no channel list (a one-measurement file) or an emptied select: unchanged
  assert.deepEqual(withValueChannel(undefined, undefined, "ADJG"), { channels: undefined, channelPick: undefined });
  assert.deepEqual(withValueChannel(["A"], ["A"], ""), { channels: ["A"], channelPick: ["A"] });
  // a radiometric file keeps an added non-radiometric column (radiometricChannels() would drop it)
  const rad = tickedChannels(["TC", "K", "eU", "eTh", "MAG"], ["K", "MAG"]);
  assert.deepEqual(rad, [{ col: "K", method: "rad_k" }, { col: "MAG", method: "mag" }]);
});

test("the picker wires the Value select to the channels, and the import reads the ticked ones", () => {
  const src = fs.readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(src, /key === "valueCol" && p\.channels \? withValueChannel\(p\.channels, p\.channelPick, e\.target\.value\)/);
  assert.match(src, /\.\.\.tickedChannels\(xyzPending\.channels, xyzPending\.channelPick\)\.map/);
});
