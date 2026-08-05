import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const PACKAGE_ID = "com.wesystemlabs.weascend";
const fingerprints = process.argv.slice(2).map((value) => value.trim()).filter(Boolean);

function normalizeFingerprint(value) {
  const compact = value.replaceAll(":", "").toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(compact)) {
    throw new Error(`Invalid SHA-256 fingerprint: ${value}`);
  }
  return compact.match(/.{2}/g).join(":");
}

if (fingerprints.length === 0) {
  console.error("Usage: npm run android:assetlinks -- <SHA-256 fingerprint> [additional fingerprint]");
  process.exit(1);
}

let normalized;
try {
  normalized = [...new Set(fingerprints.map(normalizeFingerprint))];
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const document = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: PACKAGE_ID,
      sha256_cert_fingerprints: normalized,
    },
  },
];

const outputDirectory = resolve("public", ".well-known");
const outputFile = resolve(outputDirectory, "assetlinks.json");
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, `${JSON.stringify(document, null, 2)}\n`, "utf8");
console.log(`Created ${outputFile} with ${normalized.length} fingerprint(s).`);
