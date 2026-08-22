"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "../AuthGate";
import { clearState } from "../db";
import { getFirebaseIdToken, signOutOfWeAscend, waitForIdentity, type WeAscendIdentity } from "../firebaseAuth";
import type { Language } from "../i18n";

const copy = {
  en: {
    eyebrow: "ACCOUNT CONTROL",
    title: "Delete WeAscend account",
    text: "This permanently deletes your account and all synchronized quests, notes, XP history, attributes, skills, bosses, templates, and settings.",
    warning: "This cannot be undone. Export a backup first if you want to keep a copy.",
    action: "Permanently delete account",
    deleting: "Deleting account…",
    done: "Your WeAscend account and synchronized data were deleted.",
    error: "Deletion could not be completed. Sign in again and retry.",
    back: "Return to WeAscend",
  },
  sr: {
    eyebrow: "KONTROLA NALOGA",
    title: "Obriši WeAscend nalog",
    text: "Ovo trajno briše nalog i sve sinhronizovane questove, beleške, XP istoriju, atribute, skillove, bossove, šablone i podešavanja.",
    warning: "Radnja se ne može poništiti. Pre toga izvezi backup ako želiš kopiju.",
    action: "Trajno obriši nalog",
    deleting: "Brišem nalog…",
    done: "Tvoj WeAscend nalog i sinhronizovani podaci su obrisani.",
    error: "Brisanje nije završeno. Prijavi se ponovo i pokušaj opet.",
    back: "Nazad na WeAscend",
  },
} as const;

export default function DeleteAccountPage() {
  const [language] = useState<Language>(() => typeof localStorage !== "undefined" && localStorage.getItem("wesolo-language") === "sr" ? "sr" : "en");
  const [identity, setIdentity] = useState<WeAscendIdentity | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);
  const t = copy[language];

  const refreshIdentity = () => void waitForIdentity().then(setIdentity).catch(() => setIdentity(null));
  useEffect(refreshIdentity, []);

  if (identity === undefined) return <main className="loading"><div className="loader-mark">W</div><p>Connecting system…</p></main>;
  if (!identity && !done) return <AuthGate language={language} onAuthenticated={refreshIdentity} />;

  const remove = async () => {
    if (!identity) return;
    setBusy(true);
    setError(false);
    try {
      const token = await getFirebaseIdToken(true);
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("delete_failed");
      await clearState(identity.id).catch(() => undefined);
      await signOutOfWeAscend().catch(() => undefined);
      setIdentity(null);
      setDone(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return <main className="policy-action-page"><section>
    <div className="auth-emblem"><span>W</span></div>
    <p>{t.eyebrow}</p>
    <h1>{t.title}</h1>
    {done ? <><div className="policy-success">{t.done}</div><Link href="/">{t.back}</Link></> : <>
      <span>{t.text}</span>
      <strong>{t.warning}</strong>
      <small>{identity?.email}</small>
      {error && <div className="policy-error">{t.error}</div>}
      <button disabled={busy} onClick={() => void remove()}>{busy ? t.deleting : t.action}</button>
      <Link href="/">{t.back}</Link>
    </>}
  </section></main>;
}
