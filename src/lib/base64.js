// TASKS.csv #1114 — one base64 encoder / decoder for bytes. Five copies had grown up (compactSurfaces, demFill,
// inversion's Float32 pair, projectFields' Float64 pair, desktop.js's blob / File helpers), some with the Node fallback
// the tests need and some without. The encoder goes through String.fromCharCode in 32 KB chunks: one call per byte
// is slow, and one call for the whole array overflows the argument limit (~120k elements, #371).
export function bytesToB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return typeof btoa === "function" ? btoa(s) : globalThis.Buffer.from(s, "binary").toString("base64"); // Node fallback (tests)
}
export function b64ToBytes(b64) {
  const s = typeof atob === "function" ? atob(b64) : globalThis.Buffer.from(b64, "base64").toString("binary"); // Node fallback (tests)
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}
