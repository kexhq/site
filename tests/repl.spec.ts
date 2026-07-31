import { test, expect, type Page } from "@playwright/test";

// Wait for the wasm interpreter to finish loading (status pill flips to
// "ready"). Cold-loading the ~2.5MB wasm can take a few seconds.
async function waitForReady(page: Page) {
  await expect(page.locator("#repl-status")).toHaveText("ready", { timeout: 30_000 });
}

// Type a line into the xterm terminal and submit it.
async function evalLine(page: Page, line: string) {
  await page.locator("#repl-terminal").click();
  await page.keyboard.type(line);
  await page.keyboard.press("Enter");
}

test.describe("/repl", () => {
  test("terminal is on the left, tutorial aside on the right", async ({ page }) => {
    await page.goto("/repl");

    const terminal = page.locator("#repl-terminal");
    const aside = page.locator("aside");
    await expect(terminal).toBeVisible();
    await expect(aside).toBeVisible();

    const termBox = await terminal.boundingBox();
    const asideBox = await aside.boundingBox();
    expect(termBox).not.toBeNull();
    expect(asideBox).not.toBeNull();
    // Terminal sits to the left of the tutorial panel.
    expect(termBox!.x).toBeLessThan(asideBox!.x);
    // And it's the wider of the two.
    expect(termBox!.width).toBeGreaterThan(asideBox!.width);
  });

  test("status pill goes loading -> ready", async ({ page }) => {
    await page.goto("/repl");
    await waitForReady(page);
  });

  test("evaluates a simple expression", async ({ page }) => {
    await page.goto("/repl");
    await waitForReady(page);
    await evalLine(page, "1 + 2");
    await expect(page.locator("#repl-terminal")).toContainText("=> 3 : Int");
  });

  test("waits for a multi-line do...end block, then evaluates it", async ({ page }) => {
    await page.goto("/repl");
    await waitForReady(page);

    await evalLine(page, "let f() -> Int do");
    await evalLine(page, "  return 42");
    await evalLine(page, "end");
    // The block only evaluates once `end` closes it; the function call then works.
    await evalLine(page, "f()");
    await expect(page.locator("#repl-terminal")).toContainText("=> 42 : Int");
  });

  test("Paste to REPL runs the snippet exactly once", async ({ page }) => {
    await page.goto("/repl");
    await waitForReady(page);

    // Use the reverse snippet: its output "olleh" appears only in the result,
    // never in the echoed source line, so counting it catches a double-firing
    // listener cleanly. It's the 3rd paste button in the hello-kex panel.
    await page
      .locator("[data-lesson-panel=hello-kex] [data-paste-to-repl]")
      .nth(2)
      .click();

    const expected = "olleh";
    await expect(page.locator("#repl-terminal")).toContainText(expected);

    // Guard the double-listener bug: the result must appear exactly once.
    const text = await page.locator("#repl-terminal").innerText();
    const occurrences = text.split(expected).length - 1;
    expect(occurrences).toBe(1);
  });

  test("Prev/Next cycles lessons and updates progress", async ({ page }) => {
    await page.goto("/repl");

    const progress = page.locator("[data-progress]");
    const prev = page.locator("[data-prev]");
    const next = page.locator("[data-next]");

    // Starts on lesson 1 of 9, Prev disabled.
    await expect(progress).toHaveText("1 / 9");
    await expect(page.locator("[data-lesson-panel=hello-kex]")).toBeVisible();
    await expect(prev).toBeDisabled();

    // Next advances to lesson 2 (Variables & types).
    await next.click();
    await expect(progress).toHaveText("2 / 9");
    await expect(page.locator("[data-lesson-panel=variables]")).toBeVisible();
    await expect(page.locator("[data-lesson-panel=hello-kex]")).toBeHidden();
    await expect(prev).toBeEnabled();

    // Prev returns to lesson 1.
    await prev.click();
    await expect(progress).toHaveText("1 / 9");
    await expect(page.locator("[data-lesson-panel=hello-kex]")).toBeVisible();

    // Jump to the last lesson: Next should end up disabled.
    for (let i = 0; i < 8; i++) await next.click();
    await expect(progress).toHaveText("9 / 9");
    await expect(next).toBeDisabled();
  });

  test("a lesson can be deep-linked and bookmarked", async ({ page }) => {
    // Loading /repl#<slug> directly opens on that lesson, not lesson 1.
    await page.goto("/repl#records");
    await expect(page.locator("[data-lesson-panel=records]")).toBeVisible();
    await expect(page.locator("[data-progress]")).toHaveText("5 / 9");

    // The Contents menu lists every lesson as a real link and jumps to it.
    await page.locator(".lesson-toc summary").click();
    await page.locator("[data-lesson-link=make]").click();
    await expect(page.locator("[data-lesson-panel=make]")).toBeVisible();
    await expect(page).toHaveURL(/#make$/);

    // Prev/Next keep the URL in sync too, so the current lesson stays
    // bookmarkable after navigating with the buttons.
    await page.locator("[data-next]").click();
    await expect(page).toHaveURL(/#chaining$/);
  });

  // Each lesson's "Paste to REPL" snippets must run in the live terminal and
  // produce their expected output. Values were verified against the @kexhq/kex
  // interpreter; a lesson may have several snippets, listed in DOM order.
  const LESSON_OUTPUT: Record<string, string[]> = {
    "hello-kex": [
      "Hello, world!",
      '"Hello, world!" : String',
      '"olleh" : String',
      '"olleh" : String',
    ],
    variables: ['"kex" : String', "42 : Int", "6 : Int", "5 : Int", "0 : Int", "[1, 2, 3, 4, 5]"],
    functions: [
      "let double(n) = n * 2",
      "42 : Int",
      "42 : Int",
      "24 : Int",
      "[2, 4, 6]",
      "[2, 3]",
      '["1", "2", "3"]',
    ],
    "pattern-matching": [
      '"two" : String',
      "7 : Int",
      "5 : Int",
      "0 : Int",
      "120 : Int",
      '"positive" : String',
    ],
    records: [
      "Point {",
      "9.0 : Float",
      "Ok(5) : Result",
      'Error("div by zero") : Result',
      "Oops: div by zero",
    ],
    make: [
      "make Integer do",
      "true : Bool",
      "Vector2D {",
      "make [X] do",
      "None : Optional",
      "Just(11) : Option<Int>",
    ],
    chaining: ["20 : Int", "2 : Int"],
    purity: ["hello, effects", '"Kex" : String'],
    "small-project": ["5050 : Int", "165 : Int"],
  };
  const LESSON_ORDER = [
    "hello-kex",
    "variables",
    "functions",
    "pattern-matching",
    "records",
    "make",
    "chaining",
    "purity",
    "small-project",
  ];

  async function gotoLesson(page: Page, slug: string) {
    const target = LESSON_ORDER.indexOf(slug);
    for (let i = 0; i < target; i++) {
      await page.locator("[data-next]").click();
    }
  }

  for (const slug of LESSON_ORDER) {
    test(`lesson "${slug}" pastes and evaluates`, async ({ page }) => {
      // The "purity" lesson's IO.getLine() snippet opens a native prompt();
      // answer it so the paste completes instead of hanging on a dialog.
      page.on("dialog", (dialog) => dialog.accept("Kex"));

      await page.goto("/repl");
      await waitForReady(page);
      await gotoLesson(page, slug);

      const buttons = page.locator(
        `[data-lesson-panel=${slug}] [data-paste-to-repl]`,
      );
      const expected = LESSON_OUTPUT[slug];
      await expect(buttons).toHaveCount(expected.length);

      for (let i = 0; i < expected.length; i++) {
        await buttons.nth(i).click();
        await expect(page.locator("#repl-terminal")).toContainText(
          expected[i],
        );
      }
    });
  }

  // Structural/content checks: each lesson panel renders its heading and a
  // code block, and its "Paste to REPL" button is always visible (computed
  // opacity > 0 — guards against it being faded out until hover, which users
  // would miss). Content is server-rendered, so no need to wait for wasm.
  const LESSON_TITLE: Record<string, string> = {
    "hello-kex": "Hello, Kex!",
    variables: "Variables & types",
    functions: "Functions",
    "pattern-matching": "Pattern matching",
    records: "Records & Result",
    make: "Attaching behavior with make",
    chaining: "Function chaining",
    purity: "Purity",
    "small-project": "A small project",
  };

  for (const slug of LESSON_ORDER) {
    test(`lesson "${slug}" renders heading, code, and a visible paste button`, async ({ page }) => {
      await page.goto("/repl");
      await gotoLesson(page, slug);

      const panel = page.locator(`[data-lesson-panel=${slug}]`);
      await expect(panel).toBeVisible();
      await expect(panel.locator("h1")).toHaveText(LESSON_TITLE[slug]);
      await expect(panel.locator("pre code").first()).toBeVisible();

      const pasteBtns = panel.locator("[data-paste-to-repl]");
      const count = await pasteBtns.count();
      for (let i = 0; i < count; i++) {
        const btn = pasteBtns.nth(i);
        await expect(btn).toBeVisible();
        const opacity = await btn.evaluate(
          (el) => Number(getComputedStyle(el).opacity),
        );
        expect(opacity).toBeGreaterThan(0);
      }
    });
  }
});
