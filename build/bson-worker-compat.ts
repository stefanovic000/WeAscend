import type { Plugin } from "vite";

const objectIdStaticInitializer = `static {
        this.resetState();`;

const workerSafeObjectIdInitializer = `static {
        // Cloudflare forbids Web Crypto calls while a bundled module is being
        // initialized. This five-byte value is only ObjectId's process-unique
        // seed; document security does not depend on it.
        this.index = Math.floor(Math.random() * 0x1000000);
        this.PROCESS_UNIQUE = Uint8Array.from(
            { length: 5 },
            () => Math.floor(Math.random() * 256)
        );`;

export function bsonWorkerCompat(): Plugin {
  return {
    name: "bson-worker-objectid-seed",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.replaceAll("\\", "/");
      const isBsonRuntime =
        normalizedId.includes("/node_modules/bson/lib/bson.node.mjs") ||
        normalizedId.includes("/node_modules/bson/lib/bson.mjs");

      if (!isBsonRuntime) return null;
      if (!code.includes(objectIdStaticInitializer)) {
        this.error("MongoDB BSON ObjectId initializer changed; update the Worker compatibility patch.");
      }

      return {
        code: code.replace(objectIdStaticInitializer, workerSafeObjectIdInitializer),
        map: null,
      };
    },
  };
}
