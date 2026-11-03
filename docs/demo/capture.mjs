/**
 * Captures the documentation screenshots with a real Chrome, using a fully
 * mocked API. No database, no Firebase project and no production traffic:
 * every /api/* request is intercepted and answered from demo-state.mjs.
 *
 * Usage (from the repository root):
 *   cd docs/demo
 *   npm install
 *   npm run capture            # after `npm run dev` is up in apps/web
 *
 * Optional environment variables:
 *   BASE_URL    default http://localhost:3000
 *   CHROME_PATH default C:\Program Files\Google\Chrome\Application\chrome.exe
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

import { buildDemoState, DEMO_NOW, demoPlan, demoTotalXp, demoUser } from "./demo-state.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(HERE, "..", "screenshots");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const CHROME_PATH = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const state = buildDemoState();
const totalXp = demoTotalXp(state);
let revision = 7;

// Guard the documentation against schema drift: the demo snapshot must pass the
// exact validator the server and client use for real cloud state.
const { isValidCloudState, progressFromXp, rankForLevel } = await import("../../apps/web/app/domain.ts");
if (!isValidCloudState(state)) {
  throw new Error("Demo state is rejected by isValidCloudState — fix docs/demo/demo-state.mjs");
}
const progress = progressFromXp(totalXp, state.settings);
console.log(`Demo ledger: ${totalXp} XP · level ${progress.level} · rank ${rankForLevel(progress.level, state.settings.ranks)}`);

const JSON_HEADERS = { "content-type": "application/json", "cache-control": "no-store" };

function fulfil(route, body, status = 200) {
  return route.fulfill({ status, headers: JSON_HEADERS, body: JSON.stringify(body) });
}

async function mockApi(context) {
  await context.route("**/api/**", async route => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();

    if (pathname === "/api/auth/config") {
      return fulfil(route, { configured: false, developmentBypass: true, config: null });
    }

    if (pathname === "/api/state" && method === "GET") {
      return fulfil(route, {
        state,
        revision,
        updatedAt: DEMO_NOW.toISOString(),
        user: demoUser(),
        plan: demoPlan(),
      });
    }

    if ((pathname === "/api/state" && method === "PUT") || (pathname === "/api/quests" && method === "POST")) {
      // Echo the submitted state back so the UI keeps its optimistic view and
      // stays in "online" mode for the whole capture session.
      let submitted = state;
      try {
        const body = JSON.parse(request.postData() ?? "{}");
        submitted = body.state ?? state;
      } catch {
        submitted = state;
      }
      revision += 1;
      return fulfil(route, {
        state: submitted,
        revision,
        updatedAt: new Date().toISOString(),
        user: demoUser(),
        plan: demoPlan(),
      });
    }

    if (pathname === "/api/xp-estimate") {
      return fulfil(route, {
        model: "deepseek-v4-flash",
        suggestion: {
          xp: 20,
          category: "growth",
          confidence: "high",
          decision: "estimate",
          rationale: "A 25-minute recurring review with a written outcome is focused growth work in the 45-minute band; 20 XP.",
        },
      });
    }

    if (pathname === "/api/boss-steps") {
      return fulfil(route, { code: "ai_not_configured" }, 503);
    }

    return fulfil(route, {});
  });
}

async function settle(page) {
  await page.waitForSelector(".app-shell", { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
}

async function shoot(page, name) {
  const path = resolve(OUTPUT, `${name}.png`);
  await page.screenshot({ path, animations: "disabled" });
  console.log(`  ✓ ${name}.png`);
}

async function nav(page, label) {
  await page.getByRole("button", { name: label, exact: true }).first().click();
  await page.waitForTimeout(650);
}

async function main() {
  await mkdir(OUTPUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    serviceWorkers: "block",
    locale: "en-US",
    timezoneId: "Europe/Budapest",
    colorScheme: "dark",
  });
  await desktop.addInitScript(() => {
    localStorage.setItem("wesolo-language", "en");
  });
  await mockApi(desktop);

  const page = await desktop.newPage();
  console.log(`Capturing ${BASE_URL} · ${totalXp} XP in the demo ledger`);
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await settle(page);

  await shoot(page, "01-dashboard");

  await nav(page, "Quests");
  await page.waitForSelector(".calendar-grid");
  await shoot(page, "02-quests");

  await nav(page, "Growth");
  await page.waitForSelector(".attribute-grid");
  await shoot(page, "03-growth");

  await nav(page, "Boss Quests");
  await page.waitForSelector(".boss-grid");
  await shoot(page, "04-bosses");

  await nav(page, "History");
  await page.waitForTimeout(400);
  await shoot(page, "05-history");

  await nav(page, "Settings");
  await page.waitForTimeout(400);
  await shoot(page, "06-settings");

  // Quest editor with a filled-in draft.
  await nav(page, "Command");
  await page.locator(".hero-primary").click();
  await page.waitForSelector(".quest-modal");
  await page.locator(".quest-modal input[type='text'], .quest-modal input:not([type])").first().fill("Ship the weekly review ritual");
  await page.locator(".quest-modal textarea").first().fill("Turn the Sunday review into a repeatable 25-minute ritual with a written outcome.");
  await page.locator(".quest-modal input[maxlength='500']").first().fill("One page written and next week's single focus chosen.");
  await page.getByRole("button", { name: "Estimate XP", exact: true }).click();
  await page.waitForSelector(".xp-suggestion", { timeout: 15_000 });
  await page.locator(".xp-suggestion-actions button").first().click();
  await page.waitForTimeout(400);
  // The modal scrolls to keep the focused field visible; bring it back to the top.
  await page.locator(".quest-modal").evaluate(element => {
    element.scrollTop = 0;
    element.querySelectorAll("*").forEach(node => {
      if (node.scrollTop > 0) node.scrollTop = 0;
    });
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await shoot(page, "07-quest-editor");

  await desktop.close();

  // Phone viewport: the same PWA in its mobile layout.
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
    locale: "en-US",
    timezoneId: "Europe/Budapest",
    colorScheme: "dark",
  });
  await mobile.addInitScript(() => {
    localStorage.setItem("wesolo-language", "en");
  });
  await mockApi(mobile);

  const phone = await mobile.newPage();
  await phone.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await settle(phone);
  await shoot(phone, "08-mobile-dashboard");

  await phone.getByRole("button", { name: "Quests", exact: true }).first().click();
  await phone.waitForTimeout(800);
  await shoot(phone, "09-mobile-quests");

  await browser.close();

  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    viewport: { desktop: "1440x1000", mobile: "390x844 @2x" },
    demoNow: DEMO_NOW.toISOString(),
    totalXp,
    screenshots: 8,
  };
  await writeFile(resolve(OUTPUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Done. ${totalXp} XP demo ledger, files in ${OUTPUT}`);
}

await main();
