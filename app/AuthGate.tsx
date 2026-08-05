"use client";

import { useState } from "react";
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
    google: "Continue with Google",
    divider: "or use email",
    email: "Email",
    password: "Password",
    signin: "Sign in",
    register: "Create account",
    needAccount: "New to WeAscend?",
    haveAccount: "Already have an account?",
    switchRegister: "Create one",
    switchSignin: "Sign in",
    forgot: "Forgot password?",
    resetSent: "If that account exists, password-reset instructions were sent.",
    verifySent: "Account created. Verify your email. If you open the link in this browser, WeAscend will enter automatically.",
    verifyRequired: "Verify your email. A new link was sent; this browser will continue automatically after confirmation.",
    setup: "Authentication is not configured yet.",
    genericError: "Sign-in could not be completed. Check your details and try again.",
    privacy: "Privacy",
    terms: "Terms",
  },
  sr: {
    eyebrow: "WEASCEND NALOG",
    signinTitle: "Uđi u sistem",
    registerTitle: "Napravi nalog",
    signinText: "Tvoj napredak ostaje privatan i prati te na svim uređajima.",
    registerText: "Počni sa praznim sistemom: Level 1 i 0 XP.",
    google: "Nastavi preko Google-a",
    divider: "ili koristi email",
    email: "Email",
    password: "Lozinka",
    signin: "Prijavi se",
    register: "Napravi nalog",
    needAccount: "Nemaš WeAscend nalog?",
    haveAccount: "Već imaš nalog?",
    switchRegister: "Napravi ga",
    switchSignin: "Prijavi se",
    forgot: "Zaboravljena lozinka?",
    resetSent: "Ako nalog postoji, poslata su uputstva za novu lozinku.",
    verifySent: "Nalog je napravljen. Potvrdi email. Ako link otvoriš u ovom browseru, WeAscend će te automatski uvesti.",
    verifyRequired: "Potvrdi email. Poslat je novi link; ovaj browser će automatski nastaviti nakon potvrde.",
    setup: "Prijavljivanje još nije podešeno.",
    genericError: "Prijava nije uspela. Proveri podatke i pokušaj ponovo.",
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
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (reason) {
      const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
      setError(code === "auth_not_configured" ? t.setup : code === "email_verification_required" ? t.verifyRequired : t.genericError);
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
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

      <button className="auth-google" disabled={busy} onClick={() => void run(async () => {
        const identity = await signInWithGoogle();
        if (identity) onAuthenticated();
      })}><span>G</span>{t.google}</button>

      <div className="auth-divider"><span>{t.divider}</span></div>
      <form onSubmit={submit}>
        <label><span>{t.email}</span><input required autoComplete="email" type="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
        <label><span>{t.password}</span><input required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"} type="password" value={password} onChange={event => setPassword(event.target.value)} /></label>
        {mode === "signin" && <button className="auth-link" type="button" disabled={busy || !email.trim()} onClick={() => void run(async () => {
          await requestPasswordReset(email, language);
          setMessage(t.resetSent);
        })}>{t.forgot}</button>}
        <button className="primary auth-submit" disabled={busy} type="submit">{mode === "signin" ? t.signin : t.register}</button>
      </form>
      {message && <p className="auth-message success">{message}</p>}
      {error && <p className="auth-message error">{error}</p>}
      <p className="auth-switch">{mode === "signin" ? t.needAccount : t.haveAccount} <button onClick={() => { setMode(mode === "signin" ? "register" : "signin"); setError(""); setMessage(""); }}>{mode === "signin" ? t.switchRegister : t.switchSignin}</button></p>
      <nav className="auth-legal" aria-label="Legal"><Link href="/privacy">{t.privacy}</Link><Link href="/terms">{t.terms}</Link></nav>
    </section>
  </main>;
}
