import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import { getAuth, initializeAuth, type Auth, type Persistence } from "firebase/auth";

import { apiJson } from "@/services/api";

const FIREBASE_APP_NAME = "weascend-mobile";
const CONFIG_CACHE_KEY = "@weascend/firebase-config-v1";

type AuthConfigResponse = {
  configured: boolean;
  config: FirebaseOptions | null;
};

let authPromise: Promise<Auth> | null = null;

// Firebase's React Native bundle exports this documented API, but the wrapper's
// generic TypeScript declaration does not expose the platform-only symbol.
const getReactNativePersistence = (FirebaseAuth as typeof FirebaseAuth & {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
}).getReactNativePersistence;

function validConfig(value: unknown): value is FirebaseOptions {
  if (!value || typeof value !== "object") return false;
  const config = value as FirebaseOptions;
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

async function cachedConfig() {
  const raw = await AsyncStorage.getItem(CONFIG_CACHE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    return validConfig(value) ? value : null;
  } catch {
    return null;
  }
}

async function loadFirebaseConfig() {
  try {
    const response = await apiJson<AuthConfigResponse>("/api/auth/config", { cache: "no-store" });
    if (!response.configured || !validConfig(response.config)) throw new Error("auth_not_configured");
    await AsyncStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(response.config));
    return response.config;
  } catch (reason) {
    const cached = await cachedConfig();
    if (cached) return cached;
    throw reason;
  }
}

export function getMobileAuth() {
  if (!authPromise) {
    authPromise = loadFirebaseConfig().then(config => {
      const existing = getApps().find(app => app.name === FIREBASE_APP_NAME);
      const app = existing ?? initializeApp(config, FIREBASE_APP_NAME);
      try {
        return initializeAuth(app, {
          persistence: getReactNativePersistence(AsyncStorage),
        });
      } catch (reason) {
        const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
        if (code === "auth/already-initialized") return getAuth(app);
        throw reason;
      }
    });
  }
  return authPromise;
}

export function resetMobileAuthInitialization() {
  authPromise = null;
}
