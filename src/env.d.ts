/// <reference types="astro/client" />

// Vite's `?raw` suffix imports a file's contents as a string. Used for the
// playground's full-program sources under src/examples/*.kex so we don't have
// to maintain them as escaped TS template literals (and risk drift between
// the displayed snippet and the runnable version).
declare module "*?raw" {
  const content: string;
  export default content;
}
