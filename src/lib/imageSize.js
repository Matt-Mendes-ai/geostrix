// TASKS.csv #3088 — the pixel size of a PNG or JPEG from its bytes (the header, no decoding), so the KMZ can stack a picture raster's attached
// legend image among the other legends. -> { width, height } | null
export function imageSize(bytes) {
  const b = bytes;
  if (!b || b.length < 24) return null;
  // PNG: the signature, then the IHDR chunk's width and height (big-endian, at 16 and 20)
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const u32 = (i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    const width = u32(16), height = u32(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  // JPEG: the first start-of-frame marker (SOF0-SOF15 but DHT / JPG / DAC) holds height then width (big-endian)
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; } // markers without a length
      const len = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        const height = (b[i + 5] << 8) | b[i + 6], width = (b[i + 7] << 8) | b[i + 8];
        return width > 0 && height > 0 ? { width, height } : null;
      }
      if (len < 2) return null;
      i += 2 + len;
    }
  }
  return null;
}
