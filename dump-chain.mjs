import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 900, deviceScaleFactor: 2 });
await page.goto("http://localhost:4321/", { waitUntil: "networkidle0" });
const data = await page.evaluate(() => {
  const code = document.querySelector("figure pre code");
  const out = [];
  let el = code;
  while (el && el !== document.documentElement) {
    const cs = getComputedStyle(el);
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute("class") || "").slice(0, 60),
      w: el.getBoundingClientRect().width.toFixed(0),
      overflowX: cs.overflowX,
      minWidth: cs.minWidth,
      display: cs.display,
      boxSizing: cs.boxSizing,
    });
    el = el.parentElement;
  }
  return { vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth, chain: out };
});
console.log("vw=", data.vw, "sw=", data.sw);
for (const c of data.chain) console.log(c);
await browser.close();
