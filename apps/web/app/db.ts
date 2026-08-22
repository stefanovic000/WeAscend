import type { AppState } from "./domain";

const DB_NAME = "weascend-v2";
const STORE = "state";
const LEGACY_DB_NAME = "ascend-solo";

function stateKey(userId: string) {
  return `user:${userId}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadState(userId: string): Promise<AppState | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(stateKey(userId));
    request.onsuccess = () => resolve((request.result as AppState) ?? null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function saveState(userId: string, state: AppState): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(state, stateKey(userId));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearState(userId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(stateKey(userId));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearLegacyState(): Promise<void> {
  if (localStorage.getItem("weascend-legacy-cache-cleared") === "1") return;
  await new Promise<void>(resolve => {
    const request = indexedDB.deleteDatabase(LEGACY_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
  localStorage.removeItem("wesolo-cloud-enabled");
  localStorage.removeItem("ascend-cloud-enabled");
  localStorage.setItem("weascend-legacy-cache-cleared", "1");
}
