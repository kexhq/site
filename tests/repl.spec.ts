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
    // listener cleanly. It's the 2nd paste button in the hello-kex panel.
    await page
      .locator("[data-lesson-panel=hello-kex] [data-paste-to-repl]")
      .nth(1)
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

    // Starts on lesson 1 of 7, Prev disabled.
    await expect(progress).toHaveText("1 / 7");
    await expect(page.locator("[data-lesson-panel=hello-kex]")).toBeVisible();
    await expect(prev).toBeDisabled();

    // Next advances to lesson 2 (Variables & types).
    await next.click();
    await expect(progress).toHaveText("2 / 7");
    await expect(page.locator("[data-lesson-panel=variables]")).toBeVisible();
    await expect(page.locator("[data-lesson-panel=hello-kex]")).toBeHidden();
    await expect(prev).toBeEnabled();

    // Prev returns to lesson 1.
    await prev.click();
    await expect(progress).toHaveText("1 / 7");
    await expect(page.locator("[data-lesson-panel=hello-kex]")).toBeVisible();

    // Jump to the last lesson: Next should end up disabled.
    for (let i = 0; i < 6; i++) await next.click();
    await expect(progress).toHaveText("7 / 7");
    await expect(next).toBeDisabled();
  });

  // Each lesson's "Paste to REPL" snippets must run in the live terminal and
  // produce their expected output. Values were verified against the @kexhq/kex
  // interpreter; a lesson may have several snippets, listed in DOM order.
  const LESSON_OUTPUT: Record<string, string[]> = {
    "hello-kex": ["Hello, world!", '"olleh" : String', '"olleh" : String'],
    variables: ['"kex" : String', "42 : Int", "6 : Int", "5 : Int", "0 : Int"],
    functions: ["[2, 4, 6]", "[2, 3]", '["1", "2", "3"]'],
    "pattern-matching": ['"two" : String', "7 : Int", "5 : Int", "0 : Int"],
    pipelines: ["20 : Int", "2 : Int"],
    effects: ["hello, effects"],
    "small-project": ["5050 : Int", "165 : Int"],
  };
  const LESSON_ORDER = [
    "hello-kex",
    "variables",
    "functions",
    "pattern-matching",
    "pipelines",
    "effects",
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
    "hello-kex": "Hello, kex",
    variables: "Variables & types",
    functions: "Functions",
    "pattern-matching": "Pattern matching",
    pipelines: "Pipelines & UFCS",
    effects: "Effects & purity",
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
