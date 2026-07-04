# kex.run

The website for [kex](https://github.com/kexhq/kex) — a small, functional-first
programming language. Built with [Astro](https://astro.build) and
[Tailwind CSS](https://tailwindcss.com), and hosted at
[kex.run](https://kex.run) via GitHub Pages.

The highlight is `/repl` — a full kex interpreter compiled to WebAssembly,
running entirely in the browser via [`@kexhq/kex`](https://github.com/kexhq/kex),
paired with an interactive, in-browser tutorial.

## Getting started

```sh
npm install
npm run dev
```

The site is served at `http://localhost:4321`.

### Private package access

`@kexhq/kex` (the wasm interpreter) is published to GitHub Packages, not the
public npm registry. `npm install` needs a `NODE_AUTH_TOKEN` in the
environment with at least `read:packages` scope on a token that can see the
`kexhq` org:

```sh
export NODE_AUTH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
npm install
```

CI needs read access too. `@kexhq/kex` is published from the `kexhq/kex`
repo, not this one, so the workflow's auto-issued `GITHUB_TOKEN` (scoped to
`kexhq/site` by default) can't read it out of the box — but since both repos
are in the same `kexhq` org, no PAT is required. Instead, grant this repo
access on the package itself:

1. Open the [`kex` package settings](https://github.com/orgs/kexhq/packages/npm/package/kex)
2. Under **Manage Actions access**, add `kexhq/site` with the **Read** role

`test.yml` and `deploy.yml` both request `permissions: packages: read` and
pass `secrets.GITHUB_TOKEN` as `NODE_AUTH_TOKEN` — once the package grants
access, that's all they need.

`scripts/sync-kex-wasm.mjs` then copies the built wasm bundle from
`node_modules/@kexhq/kex/dist` into `public/kex-repl/` as a static asset —
this runs automatically before both `dev` and `build`. It's served from
`public/` rather than bundled by Vite because `Kex.create()`'s `locateFile`
resolves sibling asset paths at runtime, which Vite can't statically rewrite.

## Scripts

| Command              | Description                                      |
| --------------------- | ------------------------------------------------ |
| `npm run dev`         | Start the local dev server                        |
| `npm run build`       | Build the static site to `dist/`                  |
| `npm run preview`     | Preview the production build locally              |
| `npm run check`       | Type-check with `astro check`                     |
| `npm test`            | Run the Playwright test suite                     |
| `npm run test:install`| Install the Chromium build Playwright needs       |

## Testing

End-to-end tests (`tests/repl.spec.ts`) drive the live `/repl` page with
Playwright — loading the wasm interpreter, pasting each tutorial lesson's
code samples into the terminal, and asserting on real interpreter output.
They run against a production build + preview server (see
`playwright.config.ts`), the same artifact that ships to production.

```sh
npm run test:install   # once, to fetch the Chromium binary
npm test
```

CI runs the same suite on every pull request and push to `main`
(`.github/workflows/test.yml`).

## Project structure

```
src/
  components/
    lessons/        Interactive tutorial chapters shown on /repl
    Code.astro       Shared "code window" component (syntax highlighting,
                      copy button, optional stdout pane, Paste-to-REPL)
  data/              Content data: docs nav, tutorial nav, examples, features
  lib/
    repl.ts          The in-browser REPL: xterm.js wiring, history,
                      tab-completion, and the wasm session lifecycle
  pages/
    docs/            Reference documentation
    repl.astro       The live REPL + tutorial page
    examples.astro   Runnable example gallery
scripts/
  sync-kex-wasm.mjs  Copies the wasm build into public/ (see above)
tests/
  repl.spec.ts       Playwright end-to-end tests
```

## Deployment

Pushes to `main` build and deploy the site to GitHub Pages automatically
(`.github/workflows/deploy.yml`). There's no separate staging environment —
open a PR to get CI feedback before merging.
