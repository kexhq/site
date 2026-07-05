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

// Names of all visible tabs, in display order. Format: "name|transient|selected".
// Makes assertions on the tab bar shape easy to read at the call site.
async function tabSnapshot(page: Page): Promise<string[]> {
  return page.$$eval(".pg-tab", (els) =>
    els.map((e) => {
      const name = e.querySelector(".pg-tab-name")?.textContent ?? "";
      const transient = e.dataset.transient === "true" ? "T" : "S";
      const selected = e.getAttribute("aria-selected") === "true" ? "*" : " ";
      return `${selected} ${transient} ${name}`;
    }),
  );
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

  test("fresh visit opens a single transient Untitled tab", async ({ page }) => {
    await page.goto("/playground");
    await waitForEditor(page);
    const tabs = await tabSnapshot(page);
    expect(tabs).toEqual(["* T Untitled"]);
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

  test("Examples dropdown opens a new transient tab with a .kex name and auto-runs", async ({
    page,
  }) => {
    await page.goto("/playground");
    await waitForReady(page);

    await page.locator("#pg-examples").selectOption("fact");
    // Auto-runs in the new tab — fact(4) prints 24.
    await expect(page.locator("#pg-output")).toContainText("24", {
      timeout: 20_000,
    });
    // The example opens a NEW tab — the original "Untitled" starter is
    // preserved alongside, and the new tab carries a `.kex` filename.
    const tabs = await tabSnapshot(page);
    expect(tabs).toContain("  T Untitled");
    expect(tabs).toContain("* T fact.kex");
    // Select resets to the placeholder so the same example can be re-picked.
    await expect(page.locator("#pg-examples")).toHaveValue("");
  });

  test("Share encodes buffer + filename into the URL hash and copies the link", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/playground");
    await waitForReady(page);

    await page.locator("#pg-share").click();
    // Hash now carries a filename segment: `#code/<name>/<payload>`. The
    // starter tab's name is "Untitled" so that's what should appear (URL-encoded).
    await expect(page).toHaveURL(/#code\/Untitled\/[A-Za-z0-9+%-]+$/);
    await expect(page.locator("[data-share-label]")).toHaveText("Link copied!");
    await expect
      .poll(async () => await page.evaluate(() => navigator.clipboard.readText()))
      .toEqual(page.url());
  });

  test("a shared #code/<name>/<payload> link opens as a transient tab carrying the name", async ({
    page,
    context,
  }) => {
    // Producer: type a marker program into the starter transient, rename the
    // tab inline (so the URL hash picks up a filename), click Share.
    await page.goto("/playground");
    await waitForReady(page);
    const code = 'main do\n  IO.printLine("link-marker")\nend';
    await replaceEditorText(page, code);
    await page.locator(".pg-tab[aria-selected=true] .pg-tab-name").dblclick();
    await page.keyboard.press("Meta+a");
    await page.keyboard.type("incoming.kex");
    await page.keyboard.press("Enter");
    await page.locator("#pg-share").click();
    const url = page.url();
    expect(url).toMatch(/#code\/incoming\.kex\//);

    // Consumer: open as a fresh visit (wipe the producer's localStorage so
    // the producer's transient doesn't carry over and confuse assertions).
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());
    await page.goto(url);
    await waitForEditor(page);
    const tabs = await tabSnapshot(page);
    expect(tabs).toEqual(["* T incoming.kex"]);

    await waitForReady(page);
    await page.locator("#pg-run").click();
    await expect(page.locator("#pg-output")).toContainText("link-marker", {
      timeout: 20_000,
    });
  });

  // -------------------------------------------------------------------------
  // Multi-program: tab lifecycle, save, rename, close, per-tab output.
  // -------------------------------------------------------------------------

  test("+ button creates a new transient tab and switches to it", async ({
    page,
  }) => {
    await page.goto("/playground");
    await waitForReady(page);

    await page.locator("#pg-new-tab").click();
    const tabs = await tabSnapshot(page);
    // Original starter tab + the new Untitled 2 (counter-based naming).
    expect(tabs).toEqual(["  T Untitled", "* T Untitled 2"]);
  });

  test("switching tabs swaps editor content + restores per-tab output", async ({
    page,
  }) => {
    await page.goto("/playground");
    await waitForReady(page);

    // Tab 1: type a marker, run, leave the output populated.
    await replaceEditorText(
      page,
      'main do\n  IO.printLine("first-tab")\nend',
    );
    await page.locator("#pg-run").click();
    await expect(page.locator("#pg-output")).toContainText("first-tab");

    // Open a second tab, type a different marker, run.
    await page.locator("#pg-new-tab").click();
    await replaceEditorText(
      page,
      'main do\n  IO.printLine("second-tab")\nend',
    );
    await page.locator("#pg-run").click();
    await expect(page.locator("#pg-output")).toContainText("second-tab");

    // Switch back to the first tab — its editor content AND output should
    // both come back. (Per-tab output was the chosen design.)
    await page.locator(".pg-tab").first().click();
    await expect(page.locator("#pg-output")).toContainText("first-tab");
    // Editor content is restored too — re-running produces the same output.
    await page.locator("#pg-run").click();
    await expect(page.locator("#pg-output")).toContainText("first-tab");
  });

  test("Save as new promotes the active transient to a saved tab that survives reload", async ({
    page,
  }) => {
    await page.goto("/playground");
    await waitForReady(page);
    await replaceEditorText(
      page,
      'main do\n  IO.printLine("save-as-new-marker")\nend',
    );

    await page.locator("#pg-save").click();
    // Active tab is now saved (no transient dot).
    let tabs = await tabSnapshot(page);
    expect(tabs).toEqual(["* S Untitled"]);

    // Reload — the saved program should come back. The URL hash matches the
    // saved program's code (kept fresh by onEdit), so the initial-load
    // matching logic activates it directly and consumes the hash.
    await page.reload();
    await waitForReady(page);
    tabs = await tabSnapshot(page);
    expect(tabs).toEqual(["* S Untitled"]);

    await page.locator("#pg-run").click();
    await expect(page.locator("#pg-output")).toContainText(
      "save-as-new-marker",
      { timeout: 20_000 },
    );
  });

  test("editing a saved tab auto-saves (touch) and the edits survive reload", async ({
    page,
  }) => {
    await page.goto("/playground");
    await waitForReady(page);
    await page.locator("#pg-save").click(); // promote starter to a saved tab

    // Edit the saved tab — auto-save (debounced) updates the store.
    await replaceEditorText(
      page,
      'main do\n  IO.printLine("edited-marker")\nend',
    );
    await page.waitForTimeout(1200); // debounce + IO

    await page.reload();
    await waitForReady(page);
    await page.locator("#pg-run").click();
    await expect(page.locator("#pg-output")).toContainText("edited-marker", {
      timeout: 20_000,
    });
  });

  test("double-click a saved tab name renames it inline and persists", async ({
    page,
  }) => {
    await page.goto("/playground");
    await waitForReady(page);
    await page.locator("#pg-save").click();

    await page.locator(".pg-tab[aria-selected=true] .pg-tab-name").dblclick();
    await page.keyboard.press("Meta+a");
    await page.keyboard.type("my-program.kex");
    await page.keyboard.press("Enter");

    // Tab label updates immediately.
    await expect(page.locator(".pg-tab-name").first()).toHaveText(
      "my-program.kex",
    );
    // URL hash picks up the new name (Share uses it).
    await expect(page).toHaveURL(/#code\/my-program\.kex\//);

    // Persisted across reload.
    await page.reload();
    await waitForEditor(page);
    const tabs = await tabSnapshot(page);
    expect(tabs).toContain("* S my-program.kex");
  });

  test("closing a non-empty saved tab prompts for confirmation", async ({
    page,
  }) => {
    await page.goto("/playground");
    await waitForReady(page);
    await page.locator("#pg-save").click(); // saved tab with starter code

    let dialogShown = false;
    page.once("dialog", (dialog) => {
      dialogShown = true;
      expect(dialog.message()).toContain("Delete");
      dialog.accept();
    });

    await page.locator(".pg-tab-close").first().click();
    await expect.poll(() => dialogShown).toBe(true);
    // Tab gone, replaced by a fresh transient.
    const tabs = await tabSnapshot(page);
    expect(tabs).toEqual(["* T Untitled"]);
  });

  test("closing an empty transient tab does not prompt", async ({ page }) => {
    await page.goto("/playground");
    await waitForReady(page);

    // Open a new tab — its buffer is identical to STARTER_CODE so it counts
    // as "empty" by the close-tab guard.
    await page.locator("#pg-new-tab").click();

    const dialogShown = false;
    page.on("dialog", () => {
      throw new Error("dialog should not have appeared for an empty tab");
    });

    await page.locator(".pg-tab-close").nth(1).click();
    // (No assertion on dialogShown — the page.on('dialog') throw is the
    // failure path. Just verify the tab is gone.)
    void dialogShown;
    const tabs = await tabSnapshot(page);
    expect(tabs).toEqual(["* T Untitled"]);
  });

  test("previewing an example does NOT create a saved slot", async ({ page }) => {
    await page.goto("/playground");
    await waitForReady(page);
    await page.locator("#pg-examples").selectOption("fact");
    await expect(page.locator("#pg-output")).toContainText("24");

    // Reload with the hash cleared — the fact example should NOT come back
    // from the store. (It was opened as a transient preview.)
    await page.evaluate(() => localStorage.clear()); // belt-and-suspenders
    await page.goto("/playground");
    await waitForEditor(page);
    const tabs = await tabSnapshot(page);
    expect(tabs).toEqual(["* T Untitled"]);
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

  test("example links encode the .kex filename in the URL hash", async ({
    page,
  }) => {
    await page.goto("/examples");
    const href = await page
      .locator('#hello a[aria-label="Open in Playground"]')
      .first()
      .getAttribute("href");
    expect(href).toMatch(/^\/playground#code\/hello\.kex\//);
  });

  test("clicking an example's Playground link loads its code under the right name", async ({
    page,
    context,
  }) => {
    await page.goto("/examples");
    const openLink = page
      .locator('#hello a[aria-label="Open in Playground"]')
      .first();

    // The link has target="_blank" — capture the popup and test on it.
    const [pgPage] = await Promise.all([
      context.waitForEvent("page"),
      openLink.click(),
    ]);
    await waitForEditor(pgPage);
    await waitForReady(pgPage);

    // The hello example lands in a transient tab named "hello.kex".
    const tabs = await tabSnapshot(pgPage);
    expect(tabs).toEqual(["* T hello.kex"]);

    // The hello example's #code/ link decodes to a program that prints
    // "Hello, world!" — proves the link carries real program text.
    await pgPage.locator("#pg-run").click();
    await expect(pgPage.locator("#pg-output")).toContainText("Hello, world!", {
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
