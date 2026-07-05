import puppeteer from "puppeteer-core";
const browser = await puppeteer.connect({ browserURL: "http://localhost:9222" });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => {
  const t = m.text();
  if (t.includes("[vite]")) return;
  console.log(`[${m.type()}]`, t.slice(0, 200));
});

await page.goto("http://localhost:4321/playground", { waitUntil: "networkidle2" });
await page.waitForSelector("#pg-editor .monaco-editor", { timeout: 30_000 });
await page.waitForFunction(() => document.querySelector("#pg-status")?.textContent === "ready", { timeout: 30_000 });
console.log("[ok] mounted + ready");

// Should start with one transient tab (Untitled)
const tabs1 = await page.$$eval(".pg-tab", (els) => els.map((e) => ({
  name: e.querySelector(".pg-tab-name")?.textContent ?? "",
  transient: e.dataset.transient,
  selected: e.getAttribute("aria-selected"),
})));
console.log("[initial tabs]:", JSON.stringify(tabs1));

// Pick the "fact" example
await page.select("#pg-examples", "fact");
await new Promise((r) => setTimeout(r, 500));
const tabs2 = await page.$$eval(".pg-tab", (els) => els.map((e) => ({
  name: e.querySelector(".pg-tab-name")?.textContent ?? "",
  transient: e.dataset.transient,
})));
console.log("[after example]:", JSON.stringify(tabs2));

// Click "Save as new"
await page.click("#pg-save");
await new Promise((r) => setTimeout(r, 300));
const tabs3 = await page.$$eval(".pg-tab", (els) => els.map((e) => ({
  name: e.querySelector(".pg-tab-name")?.textContent ?? "",
  transient: e.dataset.transient,
  selected: e.getAttribute("aria-selected"),
})));
console.log("[after save]:", JSON.stringify(tabs3));

// Reload — saved program should still be there
await new Promise((r) => setTimeout(r, 500)); // let any debounced save settle
await page.reload({ waitUntil: "networkidle2" });
await page.waitForSelector("#pg-editor .monaco-editor", { timeout: 30_000 });
await page.waitForFunction(() => document.querySelector("#pg-status")?.textContent === "ready", { timeout: 30_000 });
const tabs4 = await page.$$eval(".pg-tab", (els) => els.map((e) => ({
  name: e.querySelector(".pg-tab-name")?.textContent ?? "",
  transient: e.dataset.transient,
})));
console.log("[after reload]:", JSON.stringify(tabs4));

await browser.disconnect();
