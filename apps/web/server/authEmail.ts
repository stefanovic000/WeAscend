import { importPKCS8, SignJWT } from "jose";

export type AuthEmailKind = "verification" | "password_reset";
export type AuthEmailLanguage = "en" | "sr";

type FirebaseOobResponse = { oobCode?: string; oobLink?: string };

let googleAccessToken: { value: string; expiresAt: number } | null = null;

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim() || "";
  if (!value) throw new Error(`${name}_NOT_CONFIGURED`);
  return value;
}

export function customAuthEmailConfigured() {
  return process.env.AUTH_EMAIL_PROVIDER?.trim().toLowerCase() === "resend"
    && Boolean(
      process.env.RESEND_API_KEY?.trim()
      && process.env.AUTH_EMAIL_FROM?.trim()
      && process.env.APP_BASE_URL?.trim()
      && process.env.FIREBASE_PROJECT_ID?.trim()
      && process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim()
      && process.env.FIREBASE_ADMIN_PRIVATE_KEY?.trim()
      && process.env.AUTH_EMAIL_RATE_LIMIT_SECRET?.trim(),
    );
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("APP_BASE_URL_MUST_USE_HTTPS");
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function buildCustomActionUrl(
  baseUrl: string,
  kind: AuthEmailKind,
  oobCode: string,
  language: AuthEmailLanguage,
) {
  const url = new URL("/email-action", normalizeBaseUrl(baseUrl));
  url.searchParams.set("mode", kind === "verification" ? "verifyEmail" : "resetPassword");
  url.searchParams.set("oobCode", oobCode);
  url.searchParams.set("lang", language);
  return url.toString();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

export function buildAuthEmail(kind: AuthEmailKind, language: AuthEmailLanguage, actionUrl: string) {
  const verification = kind === "verification";
  const content = language === "sr"
    ? verification
      ? {
          subject: "Potvrdi email i uđi u WeAscend",
          eyebrow: "WEASCEND NALOG",
          title: "Tvoj sistem je spreman",
          text: "Potvrdi email adresu da završiš registraciju i bezbedno sačuvaš svoj napredak.",
          button: "Potvrdi email",
          note: "Ako nisi napravio WeAscend nalog, možeš ignorisati ovu poruku.",
        }
      : {
          subject: "Postavi novu WeAscend lozinku",
          eyebrow: "BEZBEDNOST NALOGA",
          title: "Zatražena je nova lozinka",
          text: "Otvori bezbedan link ispod i izaberi novu lozinku za svoj WeAscend nalog.",
          button: "Postavi novu lozinku",
          note: "Ako nisi tražio promenu lozinke, ignoriši ovu poruku i lozinka će ostati ista.",
        }
    : verification
      ? {
          subject: "Verify your email and enter WeAscend",
          eyebrow: "WEASCEND ACCOUNT",
          title: "Your system is ready",
          text: "Verify your email address to finish registration and securely save your progress.",
          button: "Verify email",
          note: "If you did not create a WeAscend account, you can ignore this message.",
        }
      : {
          subject: "Set a new WeAscend password",
          eyebrow: "ACCOUNT SECURITY",
          title: "A new password was requested",
          text: "Open the secure link below and choose a new password for your WeAscend account.",
          button: "Set new password",
          note: "If you did not request a password change, ignore this message and your password will stay unchanged.",
        };

  const safeUrl = escapeHtml(actionUrl);
  const text = `${content.title}\n\n${content.text}\n\n${content.button}: ${actionUrl}\n\n${content.note}`;
  const html = `<!doctype html>
<html><body style="margin:0;background:#070814;color:#f5f2ff;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#070814;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#0d1020;border:1px solid #35305d">
<tr><td style="height:4px;background:linear-gradient(90deg,#6b5cff,#b04cff,#42d8d0)"></td></tr>
<tr><td style="padding:42px 38px">
<div style="display:inline-block;border:1px solid #7668d9;color:#b7aaff;padding:10px 13px;font-weight:700">W</div>
<p style="margin:24px 0 10px;color:#9f91ff;font-size:11px;letter-spacing:2px;font-weight:700">${content.eyebrow}</p>
<h1 style="margin:0 0 18px;font-size:30px;line-height:1.2;color:#ffffff;font-weight:600">${content.title}</h1>
<p style="margin:0 0 30px;color:#c3c4d8;font-size:16px;line-height:1.7">${content.text}</p>
<a href="${safeUrl}" style="display:inline-block;background:#6d56d9;border:1px solid #9b87ff;color:#ffffff;text-decoration:none;padding:15px 24px;font-size:14px;font-weight:700">${content.button}</a>
<p style="margin:32px 0 0;border-top:1px solid #292b45;padding-top:22px;color:#777b99;font-size:12px;line-height:1.6">${content.note}</p>
</td></tr></table>
</td></tr></table></body></html>`;

  return { subject: content.subject, html, text };
}

async function firebaseAdminAccessToken() {
  if (googleAccessToken && googleAccessToken.expiresAt > Date.now() + 60_000) return googleAccessToken.value;

  const clientEmail = requiredEnvironment("FIREBASE_ADMIN_CLIENT_EMAIL");
  const privateKey = requiredEnvironment("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(privateKey, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/identitytoolkit" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = await response.json() as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !payload.access_token) throw new Error(`FIREBASE_ADMIN_TOKEN_FAILED:${payload.error || response.status}`);
  googleAccessToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(300, payload.expires_in ?? 3600) * 1000,
  };
  return googleAccessToken.value;
}

export async function generateFirebaseEmailAction(
  kind: AuthEmailKind,
  email: string,
  language: AuthEmailLanguage,
  userIp: string,
) {
  const projectId = requiredEnvironment("FIREBASE_PROJECT_ID");
  const accessToken = await firebaseAdminAccessToken();
  const body: Record<string, unknown> = {
    requestType: kind === "verification" ? "VERIFY_EMAIL" : "PASSWORD_RESET",
    email,
    returnOobLink: true,
    continueUrl: `${normalizeBaseUrl(requiredEnvironment("APP_BASE_URL"))}/?lang=${language}`,
  };
  if (kind === "password_reset") body.userIp = userIp;

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:sendOobCode`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const payload = await response.json() as FirebaseOobResponse & { error?: { message?: string } };
  if (!response.ok || !payload.oobCode) {
    const code = payload.error?.message || `HTTP_${response.status}`;
    const error = new Error(`FIREBASE_OOB_FAILED:${code}`) as Error & { code?: string };
    error.code = code;
    throw error;
  }
  return buildCustomActionUrl(requiredEnvironment("APP_BASE_URL"), kind, payload.oobCode, language);
}

export async function sendResendAuthEmail(
  kind: AuthEmailKind,
  language: AuthEmailLanguage,
  recipient: string,
  actionUrl: string,
  idempotencyKey: string,
) {
  const email = buildAuthEmail(kind, language, actionUrl);
  const replyTo = process.env.AUTH_EMAIL_REPLY_TO?.trim();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnvironment("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: requiredEnvironment("AUTH_EMAIL_FROM"),
      to: [recipient],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!response.ok) throw new Error(`RESEND_EMAIL_FAILED:HTTP_${response.status}`);
}

