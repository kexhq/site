// URL share encoding for the playground — mirrors the TypeScript playground
// scheme: the program text is lz-string-compressed into a URL-safe payload and
// stashed after a `#code/` path marker in the hash. A bare `#code/` (empty
// payload) decodes to "" and is treated as "no shared code" by callers.
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

/**
 * Compresses `code` into a URL-safe hash fragment suitable for sharing.
 * Returns the full hash (including the `#code/` prefix).
 */
export function encodeCodeHash(code: string): string {
  return HASH_PREFIX + LZString.compressToEncodedURIComponent(code);
}

/**
 * Reads a shared program from a hash fragment. Returns `null` if the hash
 * isn't a `#code/...` link or the payload doesn't decode.
 */
export function readCodeFromHash(hash: string): string | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const compressed = hash.slice(HASH_PREFIX.length);
  try {
    const decoded = LZString.decompressFromEncodedURIComponent(compressed);
    return decoded || null;
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
 * Builds a `/playground#code/<compressed>` href for the given program text.
 * Safe to call at build time in Astro frontmatter — used by gallery pages and
 * the `Code` component to wire "Open in Playground" links without a runtime
 * round-trip.
 */
export function playgroundHref(code: string): string {
  return `/playground${encodeCodeHash(code)}`;
}
