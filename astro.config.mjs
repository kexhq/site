// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

// Hosted at the apex domain kex.so via GitHub Pages (custom domain → no base path).
// If you ever move to a project-page URL (e.g. user.github.io/kex), set `site`
// accordingly and add `base: "/kex"` to both the site config and the CNAME removal.
export default defineConfig({
  site: "https://kex.so",
  trailingSlash: "ignore",
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
    server: {
      // Allow LAN/mDNS access to the dev server (e.g. http://mercury.local:4321)
      allowedHosts: ["mercury.local", "kex.local", true],
    },
  },
  build: {
    inlineStylesheets: "auto",
  },
});
