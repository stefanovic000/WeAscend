import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const expected = {
  packageId: "com.wesystemlabs.weascend",
  host: "weascend.wesystemlabs.com",
};

const twaPath = resolve("android-twa", "twa-manifest.json");
const pwaPath = resolve("public", "manifest.webmanifest");
const twa = JSON.parse(await readFile(twaPath, "utf8"));
const pwa = JSON.parse(await readFile(pwaPath, "utf8"));

const errors = [];
if (twa.packageId !== expected.packageId) errors.push(`Unexpected packageId: ${twa.packageId}`);
if (twa.host !== expected.host) errors.push(`Unexpected host: ${twa.host}`);
if (twa.enableNotifications !== false) errors.push("Notification delegation must remain disabled for this phase.");
if (twa.startUrl !== "/") errors.push(`Unexpected startUrl: ${twa.startUrl}`);
if (!twa.iconUrl?.startsWith(`https://${expected.host}/`)) errors.push("Android icon must use the production origin.");
if (!twa.maskableIconUrl?.startsWith(`https://${expected.host}/`)) errors.push("Android maskable icon must use the production origin.");
if (pwa.short_name !== "WeAscend") errors.push(`Unexpected PWA short_name: ${pwa.short_name}`);
if (pwa.display !== "standalone") errors.push(`PWA display must be standalone, found: ${pwa.display}`);

for (const size of ["192x192", "512x512"]) {
  if (!pwa.icons?.some((icon) => icon.sizes === size)) errors.push(`Missing ${size} PWA icon.`);
}
if (!pwa.icons?.some((icon) => icon.purpose?.includes("maskable"))) errors.push("Missing maskable PWA icon.");

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

const pending = [];
const signingKeyPath = twa.signingKey?.path
  ? resolve("android-twa", twa.signingKey.path)
  : resolve("android-twa", "keystore", "weascend-upload.jks");
for (const [label, path] of [
  ["signing key", signingKeyPath],
  ["Digital Asset Links", resolve("public", ".well-known", "assetlinks.json")],
]) {
  try {
    await access(path, constants.R_OK);
  } catch {
    pending.push(label);
  }
}

console.log("Android TWA configuration is consistent.");
if (pending.length > 0) console.log(`Pending until the signing phase: ${pending.join(", ")}.`);
