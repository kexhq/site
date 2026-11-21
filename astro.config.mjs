// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

// Hosted at www.kex.run via GitHub Pages (public/CNAME); the apex kex.run
// redirects there. `site` must be the host that answers without a redirect:
// it is the base of every canonical URL, Open Graph URL and sitemap entry.
// If you ever move to a project-page URL (e.g. user.github.io/kex), set `site`
// accordingly and add `base: "/kex"` to both the site config and the CNAME removal.
export default defineConfig({
  site: "https://www.kex.run",
  trailingSlash: "ignore",
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
    server: {
      // Allow LAN/mDNS access to the dev server (e.g. http://mercury.local:4321).
      // `true` permits any host so arbitrary local names work without an allowlist.
      allowedHosts: true,
    },
  },
  build: {
    inlineStylesheets: "auto",
  },
});
