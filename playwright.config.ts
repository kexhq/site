import { defineConfig, devices } from "@playwright/test";

const PORT = 4321;
const BASE_URL = `http://localhost:${PORT}`;

// Tests run against the built static output (`npm run preview`) — the same
// artifact CI deploys — so they exercise the real Vite build, not just the
// dev server. Locally, `reuseExistingServer` lets a running `npm run dev`
// stand in so you don't rebuild on every run.
export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --host`,
    url: `${BASE_URL}/repl`,
    reuseExistingServer: !process.env.CI,
    // Build + wasm-bundle sync can take a while on a cold CI runner.
    timeout: 240_000,
  },
});
