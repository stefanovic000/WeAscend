/**
 * Captures the native client's screens from the Expo web export.
 *
 * The static export is served locally and every network dependency is mocked:
 * Firebase sign-in, token refresh and the WeAscend API. No Firebase project,
 * no database, no production traffic.
 *
 * Usage (from the repository root):
 *   npm run export:web --prefix apps/mobile
 *   cd docs/demo && npm install && npm run capture:mobile
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

import { buildDemoState, DEMO_NOW, demoPlan, demoTotalXp } from "./demo-state.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(HERE, "..", "screenshots");
const DIST = resolve(HERE, "..", "..", "apps", "mobile", "dist-web");
const CHROME_PATH = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.PORT ?? 4188);

if (!existsSync(join(DIST, "index.html"))) {
  throw new Error(`Missing Expo web export at ${DIST}. Run: cd apps/mobile && npx expo export --platform web --output-dir dist-web`);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const candidate = join(DIST, decodeURIComponent(url.pathname));
  let file = join(DIST, "index.html");
  try {
    if ((await stat(candidate)).isFile()) file = candidate;
  } catch {
    // Directory or unknown route: serve the SPA shell and let the router handle it.
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    response.end(body);
  } catch {
    response.writeHead(404).end("not found");
  }
});

const state = buildDemoState();
const totalXp = demoTotalXp(state);
let revision = 4;

const json = (route, body, status = 200) =>
  route.fulfill({ status, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body) });

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "https://securetoken.google.com/demo-project",
    aud: "demo-project",
    auth_time: now - 120,
    user_id: "demo-hunter",
    sub: "demo-hunter",
    iat: now - 60,
    exp: now + 3600,
    email: "hunter@weascend.app",
    email_verified: true,
    name: "Hunter",
    firebase: { identities: { email: ["hunter@weascend.app"] }, sign_in_provider: "password" },
  };
  return `${base64url({ alg: "none", typ: "JWT" })}.${base64url(payload)}.demo`;
}

function authResponse() {
  return {
    kind: "identitytoolkit#VerifyPasswordResponse",
    localId: "demo-hunter",
    email: "hunter@weascend.app",
    displayName: "Hunter",
    idToken: fakeToken(),
    registered: true,
    refreshToken: "demo-refresh-token",
    expiresIn: "3600",
  };
}

async function mockNetwork(context) {
  await context.route("**/api/auth/config", route => json(route, {
    configured: true,
    developmentBypass: false,
    config: {
      apiKey: "demo-api-key",
      authDomain: "demo-project.firebaseapp.com",
      projectId: "demo-project",
      appId: "1:1:web:1",
      messagingSenderId: "1",
    },
  }));

  await context.route("**/identitytoolkit.googleapis.com/**", route => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith(":lookup")) {
      return json(route, {
        kind: "identitytoolkit#GetAccountInfoResponse",
        users: [{
          localId: "demo-hunter",
          email: "hunter@weascend.app",
          displayName: "Hunter",
          emailVerified: true,
          providerUserInfo: [{
            providerId: "password",
            federatedId: "hunter@weascend.app",
            email: "hunter@weascend.app",
            displayName: "Hunter",
            rawId: "hunter@weascend.app",
          }],
        }],
      });
    }
    return json(route, authResponse());
  });

  await context.route("**/securetoken.googleapis.com/**", route => json(route, {
    access_token: fakeToken(),
    id_token: fakeToken(),
    expires_in: "3600",
    token_type: "Bearer",
    refresh_token: "demo-refresh-token",
    user_id: "demo-hunter",
    project_id: "demo-project",
  }));

  await context.route("**/api/state", async route => {
    if (route.request().method() === "PUT") {
      let submitted = state;
      try {
        submitted = JSON.parse(route.request().postData() ?? "{}").state ?? state;
      } catch {
        submitted = state;
      }
      revision += 1;
      return json(route, { state: submitted, revision, updatedAt: new Date().toISOString(), plan: demoPlan() });
    }
    return json(route, { state, revision, updatedAt: DEMO_NOW.toISOString(), plan: demoPlan() });
  });

  await context.route("**/api/quests", route => json(route, { state, revision, updatedAt: DEMO_NOW.toISOString(), plan: demoPlan() }));
  await context.route("**/api/growth", route => json(route, { state, revision, updatedAt: DEMO_NOW.toISOString(), plan: demoPlan() }));
}

const shot = async (page, name) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUTPUT, `${name}.png`), animations: "disabled" });
  console.log(`  ✓ ${name}.png`);
};

async function main() {
  await new Promise(done => server.listen(PORT, "127.0.0.1", done));
  const base = `http://127.0.0.1:${PORT}`;

  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "en-US",
    timezoneId: "Europe/Budapest",
    colorScheme: "dark",
  });
  await context.addInitScript(() => {
    localStorage.setItem("wesolo-language", "en");
    // Skip the first-run tour so the screens show the product, not the overlay.
    localStorage.setItem("@weascend/mobile-onboarding-v7:demo-hunter", "completed");
  });
  await mockNetwork(context);

  const page = await context.newPage();
  page.on("pageerror", error => console.error("page error:", error.message));

  console.log(`Capturing ${base} · ${totalXp} XP demo ledger`);
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.getByText("Enter WeAscend", { exact: true }).waitFor({ timeout: 60_000 });

  await page.getByPlaceholder("you@example.com").fill("hunter@weascend.app");
  await page.getByPlaceholder("At least 6 characters").fill("demo-password");
  await page.getByText("Enter WeAscend", { exact: true }).click();

  await page.getByText("WEASCEND · COMMAND").waitFor({ timeout: 60_000 });
  await shot(page, "10-app-today");

  await page.getByRole("tab", { name: /Plan/ }).click();
  await shot(page, "11-app-plan");

  await page.getByRole("tab", { name: /Progress/ }).click();
  await shot(page, "12-app-progress");

  await page.goto(`${base}/bosses`, { waitUntil: "domcontentloaded" });
  await page.getByText(/Boss/i).first().waitFor({ timeout: 30_000 });
  await shot(page, "13-app-bosses");

  await page.goto(`${base}/history`, { waitUntil: "domcontentloaded" });
  await shot(page, "14-app-history");

  await browser.close();
  server.close();
  console.log("Done.");
}

await main();
