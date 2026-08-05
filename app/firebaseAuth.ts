"use client";

import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";

type AuthConfigResponse = {
  configured: boolean;
  developmentBypass: boolean;
  config: FirebaseOptions | null;
};

export type WeAscendIdentity = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  developmentBypass: boolean;
};

let authPromise: Promise<{ auth: Auth | null; developmentBypass: boolean }> | null = null;

async function configuredAuth() {
  if (!authPromise) {
    authPromise = fetch("/api/auth/config", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("auth_config_unavailable");
        const result = await response.json() as AuthConfigResponse;
        if (!result.configured || !result.config) return { auth: null, developmentBypass: result.developmentBypass };
        const app = getApps().length ? getApp() : initializeApp(result.config);
        const auth = getAuth(app);
        await setPersistence(auth, browserLocalPersistence);
        return { auth, developmentBypass: false };
      });
  }
  return authPromise;
}

function identityFromUser(user: User): WeAscendIdentity {
  return {
    id: user.uid,
    email: user.email ?? "",
    name: user.displayName || user.email || "WeAscend User",
    emailVerified: user.emailVerified,
    developmentBypass: false,
  };
}

export async function waitForIdentity(): Promise<WeAscendIdentity | null> {
  const { auth, developmentBypass } = await configuredAuth();
  if (developmentBypass) {
    return {
      id: "local-development-user",
      email: "local@weascend.dev",
      name: "Local Tester",
      emailVerified: true,
      developmentBypass: true,
    };
  }
  if (!auth) return null;

  return new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      unsubscribe();
      resolve(user ? identityFromUser(user) : null);
    }, () => {
      unsubscribe();
      resolve(null);
    });
  });
}

export async function getFirebaseIdToken(forceRefresh = false) {
  const { auth } = await configuredAuth();
  return auth?.currentUser ? auth.currentUser.getIdToken(forceRefresh) : null;
}

export async function signInWithGoogle() {
  const { auth } = await configuredAuth();
  if (!auth) throw new Error("auth_not_configured");
  auth.useDeviceLanguage();
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return identityFromUser(result.user);
  } catch (reason) {
    const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw reason;
  }
}

export async function signInWithPassword(email: string, password: string) {
  const { auth } = await configuredAuth();
  if (!auth) throw new Error("auth_not_configured");
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  if (!result.user.emailVerified) {
    auth.useDeviceLanguage();
    await sendEmailVerification(result.user).catch(() => undefined);
    await signOut(auth);
    const error = new Error("email_verification_required") as Error & { code: string };
    error.code = "email_verification_required";
    throw error;
  }
  return identityFromUser(result.user);
}

export async function registerWithPassword(email: string, password: string) {
  const { auth } = await configuredAuth();
  if (!auth) throw new Error("auth_not_configured");
  auth.useDeviceLanguage();
  const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await sendEmailVerification(result.user);
  await signOut(auth);
}

export async function requestPasswordReset(email: string) {
  const { auth } = await configuredAuth();
  if (!auth) throw new Error("auth_not_configured");
  auth.useDeviceLanguage();
  await sendPasswordResetEmail(auth, email.trim());
}

export async function resendVerification() {
  const { auth } = await configuredAuth();
  if (!auth?.currentUser) throw new Error("authentication_required");
  auth.useDeviceLanguage();
  await sendEmailVerification(auth.currentUser);
}

export async function signOutOfWeAscend() {
  const { auth } = await configuredAuth();
  if (auth) await signOut(auth);
}

export async function deleteFirebaseAccount() {
  const { auth } = await configuredAuth();
  if (!auth?.currentUser) throw new Error("authentication_required");
  await deleteUser(auth.currentUser);
}
