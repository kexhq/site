import { test, expect, type Page } from "@playwright/test";

// Loading the ~2.5MB wasm interpreter + the Monaco editor chunks isn't instant
// on a cold run; flip the timeout up so a slow CI runner doesn't false-fire.
const READY_TIMEOUT = 60_000;

// Wait for the wasm interpreter to finish loading (status pill flips to
// "ready"). Both Monaco and the wasm module load in parallel inside
// mountPlayground, so once this passes the editor is interactive too.
async function waitForReady(page: Page) {
  await expect(page.locator("#pg-status")).toHaveText("ready", {
    timeout: READY_TIMEOUT,
  });
}

// Wait for the Monaco editor to mount. Distinct from `waitForReady` — the
// editor typically renders a beat or two before the wasm finishes initializing,
// but tests that interact with the editor model (keyboard input, content
// reads) need it explicitly.
async function waitForEditor(page: Page) {
  await page.waitForSelector("#pg-editor .monaco-editor", {
    timeout: READY_TIMEOUT,
  });
}

// Replace the entire editor buffer via Monaco's textarea (focused when the
// editor is clicked). Cmd/Ctrl+A selects all, then type replaces.
async function replaceEditorText(page: Page, code: string) {
  await page.locator("#pg-editor").click();
  await page.keyboard.press("Meta+a");
  await page.keyboard.type(code, { delay: 0 });
}

test.describe("/playground", () => {
  test("status pill goes loading -> ready", async ({ page }) => {
    await page.goto("/playground");
    await waitForReady(page);
  });

  test("Monaco editor mounts", async ({ page }) => {
    await page.goto("/playground");
    await waitForEditor(page);
  });

  test("runs the starter code on first Run", async ({ page }) => {
    await page.goto("/playground");
    await waitForReady(page);

    await page.locator("#pg-run").click();
    // Starter prints "Hello, world!" and the 1..10 sum (55) — see
    // STARTER_CODE in src/lib/playground.ts.
    await expect(page.locator("#pg-output")).toContainText("Hello, world!", {
      timeout: 20_000,
    });
    await expect(page.locator("#pg-output")).toContainText("55");
    // Output pane is colored green-on-dark for success, not red-on-dark.
    await expect(page.locator("#pg-output")).toHaveAttribute(
      "data-state",
      "ok",
    );
  });

  test("Cmd/Ctrl+Enter runs the program from the editor", async ({ page }) => {
    await page.goto("/playground");
    await waitForReady(page);

    await page.locator("#pg-editor").click();
    await page.keyboard.press("Control+Enter");
    await expect(page.locator("#pg-output")).toContainText("Hello, world!", {
      timeout: 20_000,
    });
  });

  test("Examples dropdown loads a program and auto-runs it", async ({
    page,
  }) => {
    await page.goto("/playground");
    await waitForReady(page);

    await page.locator("#pg-examples").selectOption("fact");
    // The dropdown auto-runs the example — fact(4) prints 24.
    await expect(page.locator("#pg-output")).toContainText("24", {
      timeout: 20_000,
    });
    // Select resets to the placeholder so the same example can be re-picked.
    await expect(page.locator("#pg-examples")).toHaveValue("");
  });

  test("Clear button empties the output pane", async ({ page }) => {
    await page.goto("/playground");
    await waitForReady(page);
    await page.locator("#pg-run").click();
    await expect(page.locator("#pg-output")).toContainText("Hello, world!");

    await page.locator("#pg-clear").click();
    await expect(page.locator("#pg-output")).toBeEmpty();
    await expect(page.locator("#pg-output")).toHaveAttribute(
      "data-state",
      "idle",
    );
  });

  test("Share encodes the buffer into the URL hash and copies the link", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/playground");
    await waitForReady(page);

    await page.locator("#pg-share").click();
    // Hash format mirrors the TS playground: `#code/<lz-string payload>`.
    await expect(page).toHaveURL(/#code\/[A-Za-z0-9+%-]+$/);
    // Label flips to confirm clipboard write succeeded.
    await expect(page.locator("[data-share-label]")).toHaveText("Link copied!");
    // Clipboard contents match the address bar (give the async write a beat).
    await expect.poll(async () => await page.evaluate(() => navigator.clipboard.readText()))
      .toEqual(page.url());
  });

  test("a shared #code/<payload> link restores the program", async ({
    page,
    context,
  }) => {
    // Producer: edit in tab A, click Share to bake the marker into the URL.
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/playground");
    await waitForReady(page);
    await replaceEditorText(
      page,
      'main do\n  IO.printLine("shared-marker-XYZ")\nend',
    );
    await page.locator("#pg-share").click();
    const sharedUrl = page.url();
    expect(sharedUrl).toMatch(/#code\//);

    // Consumer: open the same URL in a fresh page (no localStorage carryover
    // — the storage state is per-context and we're not wiping it, but the
    // hash explicitly takes precedence over the draft anyway).
    await page.goto(sharedUrl);
    await waitForReady(page);
    await page.locator("#pg-run").click();
    await expect(page.locator("#pg-output")).toContainText(
      "shared-marker-XYZ",
      { timeout: 20_000 },
    );
  });

  test("draft is persisted across navigations (localStorage)", async ({
    page,
  }) => {
    // First visit: edit the buffer, leave a unique marker, let the debounced
    // save settle.
    await page.goto("/playground");
    await waitForReady(page);
    await replaceEditorText(
      page,
      'main do\n  IO.printLine("draft-marker-ABC")\nend',
    );
    // onEdit is debounced 400ms; wait generously for the localStorage write.
    await page.waitForTimeout(1200);

    // Navigate to a totally different page, then come back to /playground
    // with NO hash — the saved draft should load (not the starter).
    await page.goto("/");
    await page.goto("/playground");
    await waitForReady(page);
    await page.locator("#pg-run").click();
    await expect(page.locator("#pg-output")).toContainText(
      "draft-marker-ABC",
      { timeout: 20_000 },
    );
  });

  test("previewing an example does NOT overwrite the saved draft", async ({
    page,
  }) => {
    // Seed a draft we should be able to return to.
    await page.goto("/playground");
    await waitForReady(page);
    await replaceEditorText(
      page,
      'main do\n  IO.printLine("my-real-draft")\nend',
    );
    await page.waitForTimeout(1200);

    // Preview an example — this loads its code into the editor and
    // updates the URL hash, but must not write to localStorage.
    await page.locator("#pg-examples").selectOption("fact");
    await expect(page.locator("#pg-output")).toContainText("24");

    // Reload the page WITHOUT the hash (simulating the user clicking
    // "Playground" in the nav). The draft should come back, not the example.
    await page.goto("/playground");
    await waitForReady(page);
    await page.locator("#pg-run").click();
    await expect(page.locator("#pg-output")).toContainText("my-real-draft");
  });

  test("layout toggle switches between stacked and side-by-side", async ({
    page,
  }) => {
    await page.goto("/playground");
    await waitForEditor(page);

    const split = page.locator("#pg-split");
    const stackedBtn = page.locator('[data-layout-btn="stacked"]');
    const sideBtn = page.locator('[data-layout-btn="side"]');

    // Default is stacked (matches the user's stated preference).
    await expect(split).toHaveAttribute("data-layout", "stacked");
    await expect(stackedBtn).toHaveAttribute("aria-pressed", "true");
    await expect(sideBtn).toHaveAttribute("aria-pressed", "false");

    // Click side-by-side: attribute flips, preference persisted.
    await sideBtn.click();
    await expect(split).toHaveAttribute("data-layout", "side");
    await expect(sideBtn).toHaveAttribute("aria-pressed", "true");
    await expect(stackedBtn).toHaveAttribute("aria-pressed", "false");

    // Preference persists across reload.
    await page.reload();
    await waitForEditor(page);
    await expect(split).toHaveAttribute("data-layout", "side");

    // Switching back also works.
    await stackedBtn.click();
    await expect(split).toHaveAttribute("data-layout", "stacked");
    await expect(stackedBtn).toHaveAttribute("aria-pressed", "true");
    await expect(sideBtn).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("Open in Playground links", () => {
  test("/examples renders one link per example", async ({ page }) => {
    await page.goto("/examples");
    // 11 hand-curated examples in src/data/examples.ts.
    await expect(page.locator('a[aria-label="Open in Playground"]')).toHaveCount(
      11,
    );
  });

  test("clicking an example's Playground link loads its code", async ({
    page,
  }) => {
    await page.goto("/examples");
    await page
      .locator('#hello a[aria-label="Open in Playground"]')
      .first()
      .click();
    await waitForEditor(page);
    await waitForReady(page);

    // The hello example's #code/ link should decode to a program that prints
    // "Hello, world!" — proves the link carries real program text.
    await page.locator("#pg-run").click();
    await expect(page.locator("#pg-output")).toContainText("Hello, world!", {
      timeout: 20_000,
    });
  });

  test("/ (home) wires Playground links on the hero and section blocks", async ({
    page,
  }) => {
    await page.goto("/");
    // Hero, fizzbuzz, purity, traits — at least 4 Code blocks on home get a
    // Playground link.
    const links = page.locator('a[aria-label="Open in Playground"]');
    await expect(links).toHaveCount(4);
  });
});
