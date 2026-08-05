"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  applyEmailRecoveryCode,
  applyEmailVerificationCode,
  applyPasswordResetCode,
  inspectPasswordResetCode,
} from "../firebaseAuth";

type ActionMode = "verifyEmail" | "resetPassword" | "recoverEmail";
type ViewState = "working" | "reset" | "success" | "error";
type ActionLanguage = "en" | "sr";

const copy = {
  en: {
    eyebrow: "SECURE ACCOUNT LINK",
    workingTitle: "Confirming your request",
    workingText: "WeAscend is securely validating this link with Firebase.",
    verifyTitle: "Email verified",
    verifyText: "Registration is complete. Your WeAscend system is ready—sign in to begin ascending.",
    resetTitle: "Set a new password",
    resetText: "Choose a new password for {email}.",
    password: "New password",
    confirmPassword: "Confirm password",
    savePassword: "Save new password",
    saving: "Saving…",
    resetDoneTitle: "Password updated",
    resetDoneText: "Your new password is active. You can now return to WeAscend and sign in.",
    recoverTitle: "Email restored",
    recoverText: "The previous email address was restored to this account. If you did not request the change, reset your password after signing in.",
    errorTitle: "Link unavailable",
    errorText: "This link is invalid, expired, or has already been used. Request a new message from the WeAscend sign-in screen.",
    mismatch: "Passwords do not match.",
    shortPassword: "Use at least 6 characters.",
    enterSystem: "Continue to WeAscend",
    back: "Return to sign in",
  },
  sr: {
    eyebrow: "BEZBEDAN LINK NALOGA",
    workingTitle: "Potvrđujem zahtev",
    workingText: "WeAscend bezbedno proverava ovaj link preko Firebase-a.",
    verifyTitle: "Email je potvrđen",
    verifyText: "Registracija je završena. Tvoj WeAscend sistem je spreman — prijavi se i započni uspon.",
    resetTitle: "Postavi novu lozinku",
    resetText: "Izaberi novu lozinku za {email}.",
    password: "Nova lozinka",
    confirmPassword: "Potvrdi lozinku",
    savePassword: "Sačuvaj novu lozinku",
    saving: "Čuvam…",
    resetDoneTitle: "Lozinka je promenjena",
    resetDoneText: "Nova lozinka je aktivna. Vrati se na WeAscend i prijavi se.",
    recoverTitle: "Email je vraćen",
    recoverText: "Prethodna email adresa je vraćena na nalog. Ako nisi tražio promenu, promeni lozinku nakon prijave.",
    errorTitle: "Link nije dostupan",
    errorText: "Link je neispravan, istekao je ili je već iskorišćen. Zatraži novu poruku na WeAscend ekranu za prijavu.",
    mismatch: "Lozinke se ne podudaraju.",
    shortPassword: "Koristi najmanje 6 karaktera.",
    enterSystem: "Nastavi na WeAscend",
    back: "Nazad na prijavu",
  },
} as const;

function languageFromUrl(params: URLSearchParams): ActionLanguage {
  const requested = params.get("lang")?.toLowerCase();
  if (requested === "sr" || requested?.startsWith("sr-")) return "sr";
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("sr") ? "sr" : "en";
}

export default function AuthActionPage() {
  const started = useRef(false);
  const [language, setLanguage] = useState<ActionLanguage>("en");
  const [mode, setMode] = useState<ActionMode | null>(null);
  const [code, setCode] = useState("");
  const [state, setState] = useState<ViewState>("working");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const actionMode = params.get("mode") as ActionMode | null;
      const actionCode = params.get("oobCode") ?? "";
      const completed = params.get("completed");
      const nextLanguage = languageFromUrl(params);
      await Promise.resolve();
      setLanguage(nextLanguage);
      setMode(actionMode);
      setCode(actionCode);

      if (completed === "verify" || completed === "reset") {
        setMode(completed === "verify" ? "verifyEmail" : "resetPassword");
        setState("success");
        return;
      }

      if (!actionCode || !["verifyEmail", "resetPassword", "recoverEmail"].includes(actionMode ?? "")) {
        setState("error");
        return;
      }

      try {
        if (actionMode === "verifyEmail") {
          await applyEmailVerificationCode(actionCode);
          setState("success");
        } else if (actionMode === "resetPassword") {
          setEmail(await inspectPasswordResetCode(actionCode));
          setState("reset");
        } else {
          setEmail(await applyEmailRecoveryCode(actionCode));
          setState("success");
        }
      } catch {
        setState("error");
      }
    };
    void run();
  }, []);

  const t = copy[language];
  const isVerification = mode === "verifyEmail";
  const isRecovery = mode === "recoverEmail";
  const successTitle = isVerification ? t.verifyTitle : isRecovery ? t.recoverTitle : t.resetDoneTitle;
  const successText = isVerification ? t.verifyText : isRecovery ? t.recoverText : t.resetDoneText;

  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (password.length < 6) {
      setFormError(t.shortPassword);
      return;
    }
    if (password !== confirmation) {
      setFormError(t.mismatch);
      return;
    }
    setBusy(true);
    try {
      await applyPasswordResetCode(code, password);
      setState("success");
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  };

  return <main className={`email-action-page email-action-${state}`}>
    <div className="email-action-grid" aria-hidden="true" />
    <section className="email-action-card" aria-live="polite">
      <div className="auth-emblem"><span>W</span></div>
      <p className="email-action-eyebrow">{t.eyebrow}</p>

      {state === "working" && <>
        <div className="email-action-pulse" aria-hidden="true" />
        <h1>{t.workingTitle}</h1>
        <p className="email-action-copy">{t.workingText}</p>
      </>}

      {state === "success" && <>
        <div className="email-action-status success" aria-hidden="true">✓</div>
        <h1>{successTitle}</h1>
        <p className="email-action-copy">{successText}</p>
        {email && isRecovery && <small className="email-action-email">{email}</small>}
        <Link className="email-action-primary" href="/">{t.enterSystem}</Link>
      </>}

      {state === "reset" && <>
        <div className="email-action-status" aria-hidden="true">◇</div>
        <h1>{t.resetTitle}</h1>
        <p className="email-action-copy">{t.resetText.replace("{email}", email)}</p>
        <form className="email-action-form" onSubmit={resetPassword}>
          <label><span>{t.password}</span><input autoComplete="new-password" minLength={6} required type="password" value={password} onChange={event => setPassword(event.target.value)} /></label>
          <label><span>{t.confirmPassword}</span><input autoComplete="new-password" minLength={6} required type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
          {formError && <div className="policy-error">{formError}</div>}
          <button className="email-action-primary" disabled={busy} type="submit">{busy ? t.saving : t.savePassword}</button>
        </form>
      </>}

      {state === "error" && <>
        <div className="email-action-status error" aria-hidden="true">!</div>
        <h1>{t.errorTitle}</h1>
        <p className="email-action-copy">{t.errorText}</p>
        <Link className="email-action-secondary" href="/">{t.back}</Link>
      </>}

      <footer><span>WEASCEND</span><small>BY WESYSTEMLABS</small></footer>
    </section>
  </main>;
}
