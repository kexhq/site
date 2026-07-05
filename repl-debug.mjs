import puppeteer from "puppeteer-core";
const browser = await puppeteer.connect({ browserURL: "http://localhost:9222" });
const page = await browser.newPage();
page.on("console", (m) => {
  const t = m.text();
  // Skip vite noise
  if (t.includes("[vite]")) return;
  console.log(`[${m.type()}]`, t.slice(0, 200));
});
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("requestfailed", (r) => {
  console.log("[reqfail]", r.url(), r.failure()?.errorText);
});
await page.goto("http://localhost:4321/repl", { waitUntil: "networkidle2", timeout: 60_000 });
console.log("---page loaded---");
await new Promise((r) => setTimeout(r, 8000));
const status = await page.$eval("#repl-status", (el) => el.textContent).catch(() => "(no element)");
console.log("[status after 8s]:", JSON.stringify(status));
await browser.disconnect();
