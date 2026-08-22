import { authenticateRequestAllowUnverified } from "../../../../server/auth";
import {
  customAuthEmailConfigured,
  generateFirebaseEmailAction,
  sendResendAuthEmail,
  type AuthEmailKind,
  type AuthEmailLanguage,
} from "../../../../server/authEmail";
import { withCollections } from "../../../../server/mongo";

export const dynamic = "force-dynamic";

const MAX_DAILY_EMAILS = 5;
const COOLDOWN_MS = 60_000;

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function requestIp(request: Request) {
  const candidate = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]
    || request.headers.get("x-real-ip")
    || "unknown";
  return candidate.trim().slice(0, 80) || "unknown";
}

async function keyHash(kind: AuthEmailKind, identifier: string) {
  const secret = process.env.AUTH_EMAIL_RATE_LIMIT_SECRET?.trim() || "";
  const input = new TextEncoder().encode(`${secret}:${kind}:${identifier}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function reserveEmail(kind: AuthEmailKind, identifier: string) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const hash = await keyHash(kind, identifier);
  const existing = await withCollections(({ authEmailUsage }) => authEmailUsage.findOne({ keyHash: hash, kind, day }));
  if (existing && (existing.count >= MAX_DAILY_EMAILS || now.getTime() - existing.lastRequestAt.getTime() < COOLDOWN_MS)) {
    return false;
  }
  await withCollections(({ authEmailUsage }) => authEmailUsage.updateOne(
    { keyHash: hash, kind, day },
    {
      $inc: { count: 1 },
      $set: { lastRequestAt: now, expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000) },
      $setOnInsert: { keyHash: hash, kind, day },
    },
    { upsert: true },
  ));
  return true;
}

function isMissingFirebaseAccount(reason: unknown) {
  const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
  const message = reason instanceof Error ? reason.message : "";
  return /EMAIL_NOT_FOUND|USER_NOT_FOUND/i.test(`${code}:${message}`);
}

export async function POST(request: Request) {
  if (!customAuthEmailConfigured()) return response({ code: "custom_email_not_configured" }, 503);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4_096) return response({ code: "invalid_request" }, 413);

  let body: { kind?: unknown; email?: unknown; language?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return response({ code: "invalid_request" }, 400);
  }

  const kind = body.kind === "verification" || body.kind === "password_reset" ? body.kind : null;
  const language: AuthEmailLanguage = body.language === "sr" ? "sr" : "en";
  if (!kind) return response({ code: "invalid_request" }, 400);
  const ip = requestIp(request);

  if (kind === "verification") {
    const auth = await authenticateRequestAllowUnverified(request);
    if (auth.status !== "authenticated") return response({ code: auth.code }, auth.status === "forbidden" ? 403 : 401);
    if (auth.user.emailVerified) return response({ sent: true });
    if (!await reserveEmail(kind, `${auth.user.id}:${ip}`)) return response({ code: "email_rate_limited" }, 429);

    try {
      const actionUrl = await generateFirebaseEmailAction(kind, auth.user.email, language, ip);
      await sendResendAuthEmail(kind, language, auth.user.email, actionUrl, `verify-${auth.user.id}-${Date.now()}`);
      return response({ sent: true });
    } catch {
      return response({ code: "email_delivery_failed" }, 502);
    }
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return response({ code: "invalid_request" }, 400);
  if (!await reserveEmail(kind, `${email}:${ip}`)) return response({ sent: true });

  try {
    const actionUrl = await generateFirebaseEmailAction(kind, email, language, ip);
    await sendResendAuthEmail(kind, language, email, actionUrl, `reset-${await keyHash(kind, email)}-${Date.now()}`);
  } catch (reason) {
    if (!isMissingFirebaseAccount(reason)) return response({ code: "email_delivery_failed" }, 502);
  }
  return response({ sent: true });
}

