// TASKS.csv #351 — decompression with a ceiling. The shapefile ZIP reader and the OMF array reader
// inflated whatever they were given with no limit, so a small crafted file (a "zip bomb": a few KB that
// expands to many GB) could run the renderer out of memory and lose unsaved work. This streams the native
// DecompressionStream and aborts as soon as the output passes `maxBytes`.

export const MB = 1024 * 1024;

export async function inflateCapped(bytes, format, maxBytes, what = "This entry") {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format)).getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* already closed */ }
      throw new Error(`${what} expands to more than ${Math.round(maxBytes / MB)} MB — not decompressed (the file is corrupt, or built to exhaust memory).`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}
