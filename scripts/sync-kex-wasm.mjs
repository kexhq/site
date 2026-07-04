#!/usr/bin/env node
// Copies the built @kexhq/kex wasm bundle into public/kex-repl/ so it's
// served as a plain static asset (not bundled by Vite — see src/lib/repl.ts
// for why: Kex.create()'s locateFile resolves siblings via import.meta.url,
// which Vite can't statically rewrite since the path is a runtime callback
// argument, not a literal string).
import { existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const srcDir = path.join(root, "node_modules/@kexhq/kex/dist");
const destDir = path.join(root, "public/kex-repl");

if (!existsSync(srcDir)) {
  console.error(
    `error: ${srcDir} not found.\n` +
      "Run `npm install` first (requires NODE_AUTH_TOKEN with read:packages for npm.pkg.github.com — see README).",
  );
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
for (const file of readdirSync(srcDir)) {
  copyFileSync(path.join(srcDir, file), path.join(destDir, file));
}

console.log(`synced @kexhq/kex/dist -> ${path.relative(root, destDir)}`);
