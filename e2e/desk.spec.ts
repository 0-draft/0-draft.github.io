import { expect, type Page, test } from "@playwright/test";
import repos from "../src/data/repos.json" with { type: "json" };

// Collects anything the page logs as an error, CSP violations included.
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

async function openDesk(page: Page) {
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/\bready\b/);
  await expect(page.locator("html")).toHaveClass(/\bdesk\b/);
}

test.beforeEach(async ({ page }) => {
  // Keep the intro short and deterministic.
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("lays every synced repo out on the desk without errors", async ({ page }) => {
  const errors = watchErrors(page);
  await openDesk(page);
  for (const r of repos) {
    await expect(page.locator(`article[id="${r.name}"]`), r.name).toHaveCount(1);
  }
  const placed = await page
    .locator("article.sheet")
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).style.translate));
  expect(placed.every((t) => /px/.test(t))).toBe(true);
  expect(errors).toEqual([]);
});

test("ships a CSP that only allows what the page needs", async ({ page }) => {
  await page.goto("/");
  const csp = await page.locator('meta[http-equiv="content-security-policy"]').getAttribute("content");
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-src https://0-draft.github.io");
  expect(csp).toContain("object-src 'none'");
  // The project sites share this origin; the frame must not get it back.
  const sandbox = await page.locator(".live-frame").getAttribute("sandbox");
  expect(sandbox).toContain("allow-scripts");
  expect(sandbox).not.toContain("allow-same-origin");
  expect(csp).not.toContain("unsafe-inline");
  expect(csp).not.toContain("unsafe-eval");
});

test("tray buttons move the camera and the zoom readout follows", async ({ page }) => {
  await openDesk(page);
  const world = page.locator("#world");
  const before = await world.getAttribute("style");
  await page.getByRole("button", { name: "Played in the README" }).click();
  await expect.poll(() => world.getAttribute("style")).not.toBe(before);
  await expect(page.locator(".zoom-read")).toHaveText(/^\d+%$/);
});

test("keyboard focus pulls an off-screen sheet into view", async ({ page, isMobile }) => {
  test.skip(isMobile, "no hardware keyboard");
  await openDesk(page);
  await page.getByRole("button", { name: "Home" }).click();
  const link = page.locator("#guestbook h3 a");
  await link.focus();
  await expect
    .poll(async () => {
      const box = await link.boundingBox();
      const vp = page.viewportSize();
      return (
        !!box && !!vp && box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height
      );
    })
    .toBe(true);
});

test("breaking a seal opens the live site on the desk and Escape puts it back", async ({ page }) => {
  await openDesk(page);
  const target = repos.find((r) => r.homepage?.startsWith("https://0-draft.github.io/"));
  test.skip(!target, "no framable site in the data");
  const sheet = page.locator(`article[id="${target?.name}"]`);
  const button = sheet.getByRole("button", { name: /^Break the seal/ });
  // Focusing brings the sheet on screen first, the way a visitor would reach it.
  await button.focus();
  await expect(button).toBeInViewport({ ratio: 1 });
  await button.click();
  const live = page.locator(".live");
  await expect(live).toBeVisible();
  await expect(live.locator("iframe")).toHaveAttribute("src", target?.homepage ?? "");
  await expect(page.getByRole("button", { name: "Back to the desk" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(live).toBeHidden();
  await expect(live.locator("iframe")).not.toHaveAttribute("src", /./);
  await expect(sheet.getByRole("button", { name: /^Break the seal/ })).toBeFocused();
});

test("pressing the darkened desk around an open site closes it", async ({ page, isMobile }) => {
  test.skip(isMobile, "on a phone the site fills the screen, leaving no desk to press");
  await openDesk(page);
  const target = repos.find((r) => r.homepage?.startsWith("https://0-draft.github.io/"));
  test.skip(!target, "no framable site in the data");
  const button = page.locator(`article[id="${target?.name}"]`).getByRole("button", { name: /^Break the seal/ });
  await button.focus();
  await button.click();
  await expect(page.locator(".live")).toBeVisible();
  const vp = page.viewportSize();
  await page.mouse.click(4, (vp?.height ?? 800) - 4);
  await expect(page.locator(".live")).toBeHidden();
});

test("Escape while a seal is still cracking cancels the open", async ({ page }) => {
  // Arrive with motion reduced so the camera settles at once, then turn motion back
  // on so pressing the seal starts the real crack-then-dive sequence.
  await openDesk(page);
  const target = repos.find((r) => r.homepage?.startsWith("https://0-draft.github.io/"));
  test.skip(!target, "no framable site in the data");
  const button = page.locator(`article[id="${target?.name}"]`).getByRole("button", { name: /^Break the seal/ });
  await button.focus();
  await expect(button).toBeInViewport({ ratio: 1 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await button.click();
  // A second press lands while the seal is cracking and must not start a second open.
  await button.dispatchEvent("click");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1200);
  await expect(page.locator(".live")).toBeHidden();
  await expect(page.locator(".live iframe")).not.toHaveAttribute("src", /./);
  await expect(page.locator("html")).not.toHaveClass(/is-live/);
});

test("the redacted password lifts when pressed", async ({ page }) => {
  await openDesk(page);
  const redacted = page.locator(".redacted");
  await expect(redacted).toHaveCSS("color", "rgba(0, 0, 0, 0)");
  await redacted.click();
  await expect(redacted).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(0, 0);
  await expect(redacted).not.toHaveCSS("color", "rgba(0, 0, 0, 0)");
});

test("a plain click on a sheet brings it to the middle of the screen", async ({ page }) => {
  await openDesk(page);
  // From the whole-desk view every sheet is on screen but none is centred.
  await page.keyboard.press("0");
  const sheet = page.locator("#s3-atlas");
  const before = await sheet.boundingBox();
  if (!before) throw new Error("sheet not laid out");
  // A real pointer press in the middle of the print (the screenshot, not a link or the seal).
  await page.mouse.click(before.x + before.width / 2, before.y + before.height * 0.3);
  await expect
    .poll(async () => {
      const box = await sheet.boundingBox();
      const vp = page.viewportSize();
      if (!box || !vp) return Number.POSITIVE_INFINITY;
      return Math.abs(box.x + box.width / 2 - vp.width / 2);
    })
    .toBeLessThan(24);
});

test("switching to list view mid-flight leaves the list untouched by the camera", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openDesk(page);
  await page.getByRole("button", { name: "Played in the README" }).click();
  await page.getByRole("button", { name: "List view" }).click();
  await page.waitForTimeout(1500);
  await expect(page.locator("#world")).not.toHaveAttribute("style", /transform/);
});

test("while a site is open, focus cannot wander onto the desk behind it", async ({ page }) => {
  await openDesk(page);
  const target = repos.find((r) => r.homepage?.startsWith("https://0-draft.github.io/"));
  test.skip(!target, "no framable site in the data");
  const button = page.locator(`article[id="${target?.name}"]`).getByRole("button", { name: /^Break the seal/ });
  await button.focus();
  await button.click();
  await expect(page.locator(".live")).toBeVisible();
  // Keep the frame from taking focus with a page we don't control.
  await page.locator(".live iframe").evaluate((f) => f.setAttribute("tabindex", "-1"));
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    // Neither the desk nor the HUD over it (hidden while live) can take focus.
    expect(await page.evaluate(() => !!document.activeElement?.closest("#world, .tray, .minimap, .hud-top"))).toBe(
      false,
    );
  }
});

test("board images carry their size, so the boards don't grow after the desk is measured", async ({ page }) => {
  await openDesk(page);
  const unsized = await page
    .locator('[data-game="shogi"] img, [data-game="blackjack"] img')
    .evaluateAll((imgs) => imgs.filter((i) => !i.getAttribute("width") || !i.getAttribute("height")).length);
  expect(unsized).toBe(0);
});

test("the README games render as playable boards", async ({ page }) => {
  await openDesk(page);
  const shogi = page.locator('[data-game="shogi"] .b-grid .b-row');
  await expect(shogi).toHaveCount(9);
  await expect(page.locator('[data-game="shogi"] a[href*="/issues/new"]').first()).toBeAttached();
  await expect(page.locator('[data-game="blackjack"] img').first()).toBeAttached();
  await expect(page.locator('[data-game="guestbook"] li').first()).toBeAttached();
});

test("list view turns the desk into a plain page and remembers the choice", async ({ page }) => {
  await openDesk(page);
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.locator("html")).toHaveClass(/\blist\b/);
  await expect(page.locator(".tray")).toBeHidden();
  await expect(page.locator("#world")).not.toHaveAttribute("style", /transform: translate/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/\blist\b/);
  await page.getByRole("button", { name: "Desk view" }).click();
  await expect(page.locator("html")).toHaveClass(/\bdesk\b/);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("everything is still there as a list", async ({ page }) => {
    // Only the markup matters here; don't wait on board images from raw.githubusercontent.com.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveClass(/\blist\b/);
    await expect(page.getByRole("heading", { level: 1, name: "0-draft" })).toBeVisible();
    for (const r of repos) {
      await expect(page.getByRole("heading", { level: 3, name: r.name })).toBeVisible();
    }
    // Nothing can lift the redaction bar without a script, so it must not be drawn.
    await expect(page.locator(".redacted")).not.toHaveCSS("color", "rgba(0, 0, 0, 0)");
  });
});
