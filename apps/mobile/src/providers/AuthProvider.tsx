import { AppState } from "react-native";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import type { AppLanguage } from "@/providers/PreferencesProvider";
import { apiJson, API_BASE_URL } from "@/services/api";
import { getMobileAuth, resetMobileAuthInitialization } from "@/services/firebase";

export type MobileIdentity = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

type AuthContextValue = {
  identity: MobileIdentity | null;
  loading: boolean;
  configurationError: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, language: AppLanguage) => Promise<void>;
  sendPasswordReset: (email: string, language: AppLanguage) => Promise<void>;
  resendVerification: (language: AppLanguage) => Promise<void>;
  refreshVerification: () => Promise<boolean>;
  signOut: () => Promise<void>;
  retryConfiguration: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function identityFromUser(user: User): MobileIdentity {
  return {
    id: user.uid,
    email: user.email ?? "",
    name: user.displayName || user.email || "WeAscend User",
    emailVerified: user.emailVerified,
  };
}

function errorCode(reason: unknown) {
  return reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
}

async function requestCustomEmail(
  kind: "verification" | "password_reset",
  language: AppLanguage,
  options: { email?: string; token?: string },
) {
  await apiJson<{ sent: true }>("/api/auth/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: JSON.stringify({ kind, language, ...(options.email ? { email: options.email } : {}) }),
  });
}

async function deliverVerification(user: User, language: AppLanguage) {
  try {
    await requestCustomEmail("verification", language, { token: await user.getIdToken() });
  } catch (reason) {
    if (errorCode(reason) !== "custom_email_not_configured") throw reason;
    await sendEmailVerification(user, {
      url: `${API_BASE_URL}/email-action?completed=verify&lang=${language}`,
      handleCodeInApp: false,
    });
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [identity, setIdentity] = useState<MobileIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [configurationError, setConfigurationError] = useState(false);
  const [configurationAttempt, setConfigurationAttempt] = useState(0);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;
    setLoading(true);
    setConfigurationError(false);

    void getMobileAuth()
      .then(auth => {
        if (!active) return;
        unsubscribe = onAuthStateChanged(
          auth,
          user => {
            if (!active) return;
            setIdentity(user ? identityFromUser(user) : null);
            setLoading(false);
          },
          () => {
            if (!active) return;
            setIdentity(null);
            setLoading(false);
          },
        );
      })
      .catch(() => {
        if (!active) return;
        setConfigurationError(true);
        setLoading(false);
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [configurationAttempt]);

  const refreshVerification = useCallback(async () => {
    const auth = await getMobileAuth();
    if (!auth.currentUser) return false;
    await reload(auth.currentUser);
    if (auth.currentUser.emailVerified) await auth.currentUser.getIdToken(true);
    setIdentity(identityFromUser(auth.currentUser));
    return auth.currentUser.emailVerified;
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active" && identity && !identity.emailVerified) void refreshVerification().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [identity, refreshVerification]);

  const value = useMemo<AuthContextValue>(() => ({
    identity,
    loading,
    configurationError,
    signIn: async (email, password) => {
      const auth = await getMobileAuth();
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      setIdentity(identityFromUser(credential.user));
    },
    register: async (email, password, language) => {
      const auth = await getMobileAuth();
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      setIdentity(identityFromUser(credential.user));
      await deliverVerification(credential.user, language);
    },
    sendPasswordReset: async (email, language) => {
      try {
        await requestCustomEmail("password_reset", language, { email: email.trim() });
      } catch (reason) {
        if (errorCode(reason) !== "custom_email_not_configured") throw reason;
        const auth = await getMobileAuth();
        await sendPasswordResetEmail(auth, email.trim());
      }
    },
    resendVerification: async language => {
      const auth = await getMobileAuth();
      if (!auth.currentUser) throw new Error("authentication_required");
      await deliverVerification(auth.currentUser, language);
    },
    refreshVerification,
    signOut: async () => {
      const auth = await getMobileAuth();
      await signOut(auth);
      setIdentity(null);
    },
    retryConfiguration: () => {
      resetMobileAuthInitialization();
      setConfigurationAttempt(attempt => attempt + 1);
    },
  }), [configurationError, identity, loading, refreshVerification]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
