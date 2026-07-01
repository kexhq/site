import puppeteer from "puppeteer-core";

const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:4321";
const ROUTES = [
  "/",
  "/examples",
  "/docs",
  "/docs/overview",
  "/docs/syntax",
  "/docs/types",
  "/docs/functions",
  "/docs/pattern-matching",
  "/docs/effects",
  "/docs/traits",
  "/docs/prelude",
  "/docs/operators",
  "/tutorial",
  "/install",
];

// iPhone 17 Pro-ish width, plus a narrow 360px pass.
const WIDTHS = [440, 390, 360];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox"],
});

for (const route of ROUTES) {
  for (const width of WIDTHS) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900, deviceScaleFactor: 2 });
    await page.goto(BASE + route, { waitUntil: "networkidle0" });
    const res = await page.evaluate((w) => {
      const vw = document.documentElement.clientWidth;
      const sw = document.documentElement.scrollWidth;
      let worst = null;
      const all = document.querySelectorAll("*");
      for (const el of all) {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 0.5) {
          const over = r.right - vw;
          if (!worst || over > worst.over) {
            worst = {
              over,
              right: r.right,
              tag: el.tagName.toLowerCase(),
              cls: (el.getAttribute("class") || "").slice(0, 80),
              id: el.getAttribute("id") || "",
              text: (el.textContent || "").trim().slice(0, 50),
            };
          }
        }
      }
      return { vw, sw, overflow: sw - vw, worst };
    }, width);
    if (res.overflow > 1) {
      console.log(
        `${route} @${width}: overflow=${res.overflow}px (sw=${res.sw})`
      );
      if (res.worst) {
        console.log(
          `    worst: <${res.worst.tag}${res.worst.id ? "#" + res.worst.id : ""}> over=${res.worst.over}px cls="${res.worst.cls}" text="${res.worst.text}"`
        );
      }
    }
    await page.close();
  }
}

await browser.close();
