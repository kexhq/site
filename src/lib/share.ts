// URL share encoding for the playground — mirrors the TypeScript playground
// scheme, plus a filename so shared links carry their name (e.g. `fact.kex`).
// The program text is lz-string-compressed into a URL-safe payload, the
// filename is URI-component-encoded, and the two are joined as
// `#code/<filename>/<payload>`. A bare `#code/<payload>` (no slash) is also
// accepted on read for backwards compatibility.
//
// We use the hash rather than a query string so the value never leaves the
// client (no server logs, no CDN caching quirks) and a shared link works from
// the very first request without any routing on the server.
//
// `lz-string` ships as a UMD/CJS module (no ESM `exports` field), so we use a
// namespace import. In the browser, Vite flattens its CJS exports into the
// namespace and the helpers hang off the top level; in pure Node ESM (Astro's
// static build, used at type-check / SSG time) the actual value sits on
// `.default` instead. Resolve both so the same module works in either runtime.
import * as LZModule from "lz-string";

const LZString: {
  compressToEncodedURIComponent(input: string): string;
  decompressFromEncodedURIComponent(compressed: string): string | null;
} =
  (LZModule as unknown as { default?: typeof LZString }).default ??
  (LZModule as unknown as typeof LZString);

const HASH_PREFIX = "#code/";

/** A program decoded from a share URL. `name` is null when the link was
    generated without a filename (e.g. legacy `#code/<payload>` links). */
export interface SharedProgram {
  code: string;
  name: string | null;
}

/**
 * Compresses `code` into a URL-safe hash fragment suitable for sharing.
 * Pass a `name` to embed a filename — it shows up as the tab name on the
 * receiving side. Returns the full hash (including the `#code/` prefix).
 */
export function encodeCodeHash(code: string, name?: string | null): string {
  const payload = LZString.compressToEncodedURIComponent(code);
  if (name && name.length > 0) {
    return HASH_PREFIX + encodeURIComponent(name) + "/" + payload;
  }
  return HASH_PREFIX + payload;
}

/**
 * Reads a shared program from a hash fragment. Returns `null` if the hash
 * isn't a `#code/...` link or the payload doesn't decode.
 *
 * Accepts both `#code/<name>/<payload>` (current) and `#code/<payload>`
 * (legacy) shapes — lz-string's URI-safe alphabet doesn't include `/`, so
 * the presence of a slash unambiguously separates the name from the payload.
 */
export function readCodeFromHash(hash: string): SharedProgram | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const rest = hash.slice(HASH_PREFIX.length);
  const slashIdx = rest.indexOf("/");
  let name: string | null = null;
  let compressed = rest;
  if (slashIdx !== -1) {
    try {
      name = decodeURIComponent(rest.slice(0, slashIdx));
    } catch {
      // Malformed percent-encoding — treat as unnamed.
      name = null;
    }
    compressed = rest.slice(slashIdx + 1);
  }
  try {
    const decoded = LZString.decompressFromEncodedURIComponent(compressed);
    if (!decoded) return null;
    return { code: decoded, name };
  } catch {
    return null;
  }
}

/**
 * Replaces the current hash without adding a history entry, so debounced
 * "edit -> update URL" loops don't pollute the back button.
 */
export function replaceHash(hash: string): void {
  if (location.hash === hash) return;
  history.replaceState(null, "", hash);
}

/**
 * Builds a `/playground#code/<name>/<compressed>` href for the given program.
 * Safe to call at build time in Astro frontmatter — used by gallery pages and
 * the `Code` component to wire "Open in Playground" links without a runtime
 * round-trip.
 */
export function playgroundHref(code: string, name?: string | null): string {
  return `/playground${encodeCodeHash(code, name)}`;
}
