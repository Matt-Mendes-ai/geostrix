// TASKS.csv #1519 — draws a Geochem plot's points on an OffscreenCanvas and encodes the PNG, off the main thread.
import { drawPoints } from "./geochemPointsImage.js";

self.onmessage = async (e) => {
  try {
    const { xs, ys, ci, palette, W, H, k, id } = e.data;
    const cv = new OffscreenCanvas(W * k, H * k);
    drawPoints(cv.getContext("2d"), { xs, ys, ci, palette }, k);
    const blob = await cv.convertToBlob({ type: "image/png" });
    self.postMessage({ id, blob });
  } catch (err) {
    self.postMessage({ id: e.data?.id, failed: String(err?.message || err) });
  }
};
