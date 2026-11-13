// TASKS.csv #350 — outbound-fetch guard for the main process (fetch-web-layer, fetch-srtm-tile).
//
// The #249 guard compared the URL's hostname text against a few patterns, which missed: "[::1]" (URL
// keeps the brackets, so `h === "::1"` never matched), IPv4-mapped IPv6 ("[::ffff:7f00:1]"), 0.0.0.0,
// "localhost." and *.localhost, any hostname that merely RESOLVES to a private address, and every
// redirect (Node's fetch follows them, so a public URL 302-ing to 169.254.169.254 went straight through).
// It also had no timeout and no size cap. Here: every hop's host is resolved and each resulting address
// range-checked, redirects are followed manually (max 5) with the same check per hop, and the body is
// read under a byte cap with an overall timeout.
//
// Policy is unchanged from #249: loopback, link-local (incl. cloud metadata), private (RFC 1918 / ULA),
// CGNAT, multicast and unspecified addresses are refused.
// TASKS.csv #1264 — the socket connects to the address that was checked: fetch() used to resolve the name a second time, so a
// DNS-rebinding server could answer a public address to the check and a private one to the connection. undici, loaded on first use.
const dns = require("node:dns").promises;
const net = require("node:net");

function v4Blocked(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

function v6Blocked(ip) {
  const s = ip.toLowerCase().split("%")[0];
  const mapped = s.match(/^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/) || s.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return v4Blocked(mapped[1]);
  const hexMapped = s.match(/^(?:0*:)*:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16), lo = parseInt(hexMapped[2], 16);
    return v4Blocked(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  // Expand enough to read the first hextet and detect :: / ::1.
  if (s === "::" || s === "::1" || /^0*(:0*)*:0*1$/.test(s) || /^0*(:0*)*$/.test(s)) return true;
  const first = parseInt(s.split(":")[0] || "0", 16);
  return (first & 0xffc0) === 0xfe80 || (first & 0xfe00) === 0xfc00 || (first & 0xff00) === 0xff00;
}

function addressBlocked(ip) {
  const kind = net.isIP(ip);
  if (kind === 4) return v4Blocked(ip);
  if (kind === 6) return v6Blocked(ip);
  return true;
}

// { reason } when the URL may not be fetched (user-facing), { addrs } the checked addresses when it may.
async function checkUrl(urlString, lookup = dns.lookup, blocked = addressBlocked) {
  let u;
  try { u = new URL(urlString); } catch { return { reason: "Not a valid URL." }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { reason: `Unsupported URL scheme "${u.protocol}" — only http/https are allowed.` };
  const host = u.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost")) return { reason: "This URL points at a local/private address, which isn't allowed here." };
  let addrs;
  if (net.isIP(host)) addrs = [host];
  else {
    try { addrs = (await lookup(host, { all: true })).map((a) => a.address); } catch (e) { return { reason: `Could not resolve ${host} (${e.code || e.message}).` }; }
  }
  if (!addrs.length || addrs.some(blocked)) return { reason: "This URL points at a local/private address, which isn't allowed here." };
  return { addrs };
}
// Returns null when the URL may be fetched, or a user-facing reason when it may not.
async function urlBlockReason(urlString, lookup = dns.lookup) { return (await checkUrl(urlString, lookup)).reason || null; }

// TASKS.csv #1264 — a socket lookup that answers only the addresses already checked (Node asks for all of them, or one)
function pinnedLookup(addrs) {
  const list = addrs.map((address) => ({ address, family: net.isIP(address) }));
  return (_host, opts, cb) => { if (opts?.all) cb(null, list); else cb(null, list[0].address, list[0].family); };
}

// fetch with per-hop checks, manual redirects, timeout and a byte cap. Resolves to
// { ok, status, contentType, buffer } or { ok: false, status, message }.
// init (TASKS.csv #784): optional { method, headers, body } for the first request; a redirect is followed with GET and
// the same headers (a Range keeps applying), never re-sending the body.
// allowHost (TASKS.csv #960): optional (URL) => boolean, checked on EVERY hop — a feature limited to a list of servers
// (public geochemistry, imagery) used to check only the first URL, and a redirect from a listed server went anywhere.
// onProgress(received, total|null), signal (TASKS.csv #3100): a long download's progress, and the user's Cancel
async function guardedFetch(urlString, { timeoutMs = 60000, maxBytes = 64 * 1024 * 1024, maxRedirects = 5, fetchImpl = null, lookup, init = null, allowHost = null, blocked = addressBlocked, onProgress = null, signal: userSignal = null } = {}) {
  const signal = userSignal ? AbortSignal.any([AbortSignal.timeout(timeoutMs), userSignal]) : AbortSignal.timeout(timeoutMs);
  let url = urlString;
  const agents = []; // #1264 — one per hop: each is pinned to that hop's checked addresses
  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const { reason, addrs } = await checkUrl(url, lookup, blocked);
      if (reason) return { ok: false, status: 0, message: hop ? `Redirected to a blocked address: ${reason}` : reason };
      if (hop && allowHost) {
        const h = new URL(url);
        if (!allowHost(h)) return { ok: false, status: 0, message: `The server redirected to ${h.protocol}//${h.hostname}, which is not one of the servers this feature may contact.` };
      }
      const options = { redirect: "manual", signal, ...(init ? (hop ? { headers: init.headers } : init) : {}) };
      let res;
      if (fetchImpl) res = await fetchImpl(url, options);
      else {
        const { Agent, fetch: pinnedFetch } = require("undici");
        const dispatcher = new Agent({ connect: { lookup: pinnedLookup(addrs) } });
        agents.push(dispatcher);
        res = await pinnedFetch(url, { ...options, dispatcher });
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = new URL(res.headers.get("location"), url).toString();
        continue;
      }
      const contentType = res.headers.get("content-type") || "";
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, status: res.status, message: `Response is ${(declared / 1048576).toFixed(0)} MB, over the ${(maxBytes / 1048576).toFixed(0)} MB limit.` };
      const chunks = []; let total = 0;
      if (res.body) {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (onProgress) onProgress(total, Number.isFinite(declared) ? declared : null); // #3100
          if (total > maxBytes) { try { await reader.cancel(); } catch { /* ignore */ } return { ok: false, status: res.status, message: `Response exceeded the ${(maxBytes / 1048576).toFixed(0)} MB limit.` }; }
          chunks.push(Buffer.from(value));
        }
      }
      return { ok: res.ok, status: res.status, contentType, contentRange: res.headers.get("content-range") || "", buffer: Buffer.concat(chunks) }; // contentRange: #784
    }
    return { ok: false, status: 0, message: `Too many redirects (more than ${maxRedirects}).` };
  } catch (err) {
    if (userSignal?.aborted) return { ok: false, status: 0, cancelled: true, message: "Cancelled." }; // #3100
    if (err.name === "TimeoutError" || err.name === "AbortError") return { ok: false, status: 0, message: `Timed out after ${Math.round(timeoutMs / 1000)} s.` };
    return { ok: false, status: 0, message: `Network error: ${err.message}` };
  } finally {
    agents.forEach((a) => a.destroy().catch(() => {}));
  }
}

// Slippy-map tile indices: integers, 0 <= z <= maxZoom, 0 <= x, y < 2^z.
function validTileIndex(z, x, y, maxZoom = 15) {
  return [z, x, y].every(Number.isInteger) && z >= 0 && z <= maxZoom && x >= 0 && y >= 0 && x < 2 ** z && y < 2 ** z;
}

module.exports = { addressBlocked, urlBlockReason, guardedFetch, validTileIndex };
