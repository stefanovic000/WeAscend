"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { Language } from "./i18n";
import { registerWithPassword, requestPasswordReset, signInWithGoogle, signInWithPassword } from "./firebaseAuth";

type AuthMode = "signin" | "register";

const copy = {
  en: {
    eyebrow: "WEASCEND ACCOUNT",
    signinTitle: "Enter the system",
    registerTitle: "Create your account",
    signinText: "Your progress stays private and follows you across your devices.",
    registerText: "Start with an empty system: Level 1 and 0 XP.",
    signinTab: "Log in",
    registerTab: "Create account",
    googleSignin: "Log in with Google",
    googleRegister: "Create account with Google",
    divider: "or use email",
    email: "Email",
    password: "Password",
    emailPlaceholder: "you@example.com",
    passwordRequirement: "At least 6 characters",
    verificationNotice: "Email registration requires verification before the first login.",
    signin: "Sign in",
    register: "Create account",
    forgot: "Forgot password?",
    resetSent: "If that account exists, password-reset instructions were sent.",
    verifySent: "Account created. Verify your email. If you open the link in this browser, WeAscend will enter automatically.",
    verifyRequired: "Verify your email. A new link was sent; this browser will continue automatically after confirmation.",
    setup: "Authentication is not configured yet.",
    genericError: "Sign-in could not be completed. Check your details and try again.",
    invalidEmail: "Enter a valid email address.",
    shortPassword: "Password must contain at least 6 characters.",
    emailInUse: "An account with this email already exists. Choose Log in instead.",
    invalidCredentials: "Email or password is incorrect.",
    tooManyRequests: "Too many attempts. Wait a moment and try again.",
    popupClosed: "Google sign-in was closed before it finished.",
    networkError: "Connection failed. Check your internet and try again.",
    accountDisabled: "This account has been disabled.",
    privacy: "Privacy",
    terms: "Terms",
  },
  sr: {
    eyebrow: "WEASCEND NALOG",
    signinTitle: "Uđi u sistem",
    registerTitle: "Napravi nalog",
    signinText: "Tvoj napredak ostaje privatan i prati te na svim uređajima.",
    registerText: "Počni sa praznim sistemom: Level 1 i 0 XP.",
    signinTab: "Prijava",
    registerTab: "Napravi nalog",
    googleSignin: "Prijavi se preko Google-a",
    googleRegister: "Napravi nalog preko Google-a",
    divider: "ili koristi email",
    email: "Email",
    password: "Lozinka",
    emailPlaceholder: "ti@primer.com",
    passwordRequirement: "Najmanje 6 karaktera",
    verificationNotice: "Registracija emailom zahteva potvrdu pre prve prijave.",
    signin: "Prijavi se",
    register: "Napravi nalog",
    forgot: "Zaboravljena lozinka?",
    resetSent: "Ako nalog postoji, poslata su uputstva za novu lozinku.",
    verifySent: "Nalog je napravljen. Potvrdi email. Ako link otvoriš u ovom browseru, WeAscend će te automatski uvesti.",
    verifyRequired: "Potvrdi email. Poslat je novi link; ovaj browser će automatski nastaviti nakon potvrde.",
    setup: "Prijavljivanje još nije podešeno.",
    genericError: "Prijava nije uspela. Proveri podatke i pokušaj ponovo.",
    invalidEmail: "Unesi ispravnu email adresu.",
    shortPassword: "Lozinka mora imati najmanje 6 karaktera.",
    emailInUse: "Nalog sa ovim emailom već postoji. Izaberi Prijava.",
    invalidCredentials: "Email ili lozinka nisu ispravni.",
    tooManyRequests: "Previše pokušaja. Sačekaj malo i pokušaj ponovo.",
    popupClosed: "Google prijava je zatvorena pre završetka.",
    networkError: "Veza nije uspela. Proveri internet i pokušaj ponovo.",
    accountDisabled: "Ovaj nalog je onemogućen.",
    privacy: "Privatnost",
    terms: "Uslovi",
  },
} as const;

export default function AuthGate({ language, onAuthenticated }: { language: Language; onAuthenticated: () => void }) {
  const t = copy[language];
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const googleAttemptRef = useRef(0);

  const selectMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPassword("");
    setError("");
    setMessage("");
  };

  const errorMessage = (code: string) => {
    if (code === "auth_not_configured") return t.setup;
    if (code === "email_verification_required") return t.verifyRequired;
    if (code === "auth/invalid-email") return t.invalidEmail;
    if (code === "auth/weak-password") return t.shortPassword;
    if (code === "auth/email-already-in-use") return t.emailInUse;
    if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") return t.invalidCredentials;
    if (code === "auth/too-many-requests") return t.tooManyRequests;
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return t.popupClosed;
    if (code === "auth/network-request-failed") return t.networkError;
    if (code === "auth/user-disabled") return t.accountDisabled;
    return t.genericError;
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (reason) {
      const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
      setError(errorMessage(code));
    } finally {
      setBusy(false);
    }
  };

  const runGoogle = () => {
    const attempt = ++googleAttemptRef.current;
    let lostFocus = false;
    let leftPage = document.visibilityState === "hidden";
    let releaseTimer: number | undefined;
    let fallbackTimer: number | undefined;

    const release = () => {
      if (googleAttemptRef.current === attempt) setGoogleBusy(false);
    };
    const scheduleRelease = () => {
      if (releaseTimer) window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(release, 300);
    };
    const onBlur = () => { lostFocus = true; };
    const onFocus = () => { if (lostFocus) scheduleRelease(); };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") leftPage = true;
      else if (leftPage) scheduleRelease();
    };
    const cleanup = () => {
      if (releaseTimer) window.clearTimeout(releaseTimer);
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };

    setGoogleBusy(true);
    setError("");
    setMessage("");
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    fallbackTimer = window.setTimeout(() => {
      release();
      cleanup();
    }, 5_000);

    void (async () => {
      try {
        const identity = await signInWithGoogle();
        if (googleAttemptRef.current === attempt && identity) onAuthenticated();
      } catch (reason) {
        if (googleAttemptRef.current !== attempt) return;
        const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
        setError(errorMessage(code));
      } finally {
        cleanup();
        release();
      }
    })();
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError(t.invalidEmail);
      return;
    }
    if (password.length < 6) {
      setError(t.shortPassword);
      return;
    }
    void run(async () => {
      if (mode === "register") {
        await registerWithPassword(email, password, language);
        setMessage(t.verifySent);
        setMode("signin");
        setPassword("");
      } else {
        await signInWithPassword(email, password, language);
        onAuthenticated();
      }
    });
  };

  return <main className="auth-page">
    <section className="auth-panel">
      <div className="auth-emblem"><span>W</span></div>
      <p className="auth-eyebrow">{t.eyebrow}</p>
      <h1>{mode === "signin" ? t.signinTitle : t.registerTitle}</h1>
      <p className="auth-intro">{mode === "signin" ? t.signinText : t.registerText}</p>

      <div className="auth-mode-switch" role="tablist" aria-label={t.eyebrow}>
        <button aria-selected={mode === "signin"} className={mode === "signin" ? "active" : ""} onClick={() => selectMode("signin")} role="tab" type="button">{t.signinTab}</button>
        <button aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => selectMode("register")} role="tab" type="button">{t.registerTab}</button>
      </div>

      <button className="auth-google" disabled={busy || googleBusy} onClick={runGoogle}><span>G</span>{mode === "signin" ? t.googleSignin : t.googleRegister}</button>

      <div className="auth-divider"><span>{t.divider}</span></div>
      <form onSubmit={submit} noValidate>
        <label><span>{t.email}</span><input aria-invalid={Boolean(error) && !/^\S+@\S+\.\S+$/.test(email.trim())} required autoComplete="email" inputMode="email" placeholder={t.emailPlaceholder} type="email" value={email} onChange={event => { setEmail(event.target.value); setError(""); }} /></label>
        <label><span>{t.password}</span><input aria-describedby={mode === "register" ? "password-requirement" : undefined} aria-invalid={Boolean(error) && password.length < 6} required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"} type="password" value={password} onChange={event => { setPassword(event.target.value); setError(""); }} /></label>
        {mode === "register" && <div className="auth-requirements" id="password-requirement"><span className={password.length >= 6 ? "valid" : ""}>✓</span>{t.passwordRequirement}</div>}
        {mode === "signin" && <button className="auth-link" type="button" disabled={busy || googleBusy || !email.trim()} onClick={() => void run(async () => {
          await requestPasswordReset(email, language);
          setMessage(t.resetSent);
        })}>{t.forgot}</button>}
        <button className="primary auth-submit" disabled={busy || googleBusy} type="submit">{mode === "signin" ? t.signin : t.register}</button>
      </form>
      {mode === "register" && <p className="auth-verification-note">{t.verificationNotice}</p>}
      {message && <p className="auth-message success">{message}</p>}
      {error && <p aria-live="polite" className="auth-message error" role="alert">{error}</p>}
      <nav className="auth-legal" aria-label="Legal"><Link href="/privacy">{t.privacy}</Link><Link href="/terms">{t.terms}</Link></nav>
    </section>
  </main>;
}
