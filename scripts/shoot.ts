// Takes the screenshot each live site is printed with on the desk, into src/assets/shots/<repo>.png.
// By default only repos without one are shot, so existing prints don't churn week to week;
// pass --all to retake every one after the sites themselves have changed.
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import repos from "../src/data/repos.json" with { type: "json" };

const all = process.argv.includes("--all");
const shot = (name: string) => fileURLToPath(new URL(`../src/assets/shots/${name}.png`, import.meta.url));
const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

// Only sites on the org's Pages origin are printed; the README games and dev.to render live instead.
const targets = repos.filter((r) => r.homepage?.startsWith("https://0-draft.github.io/"));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
let taken = 0;
let failed = 0;
for (const r of targets) {
  const path = shot(r.name);
  if (!all && (await exists(path))) continue;
  try {
    // An error page must never be printed: without --all it would never be retaken.
    const res = await page.goto(r.homepage as string, { waitUntil: "networkidle", timeout: 45_000 });
    if (!res?.ok()) throw new Error(`HTTP ${res?.status() ?? "no response"}`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path });
    taken++;
    console.log(`shot  ${r.name}`);
  } catch (err) {
    failed++;
    const why = (err as Error).message.split("\n")[0];
    console.warn(`fail  ${r.name}: ${why}`);
    // Surfaces in the Actions run summary, not only in the log.
    if (process.env.GITHUB_ACTIONS) console.log(`::warning title=No screenshot for ${r.name}::${why}`);
  }
}
await browser.close();
console.log(`${taken} taken, ${failed} failed, ${targets.length - taken - failed} kept`);
if (failed && !taken) process.exit(1);
