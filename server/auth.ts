import { createHash } from "node:crypto";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

export type AuthenticationResult =
  | { status: "authenticated"; user: AuthenticatedUser }
  | { status: "unauthenticated"; user: null }
  | { status: "forbidden"; user: null };

function safeDecode(value: string | null) {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function getAllowedEmails() {
  return new Set(
    [process.env.OWNER_EMAIL ?? "", process.env.OWNER_EMAILS ?? ""]
      .flatMap(value => value.split(/[,;\n]/))
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function authenticateRequest(request: Request): AuthenticationResult {
  let email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() ?? "";
  let name = "";

  if (!email && process.env.NODE_ENV !== "production") {
    email = "local-owner@ascend.local";
    name = "Local Hunter";
  }
  if (!email) return { status: "unauthenticated", user: null };

  if (request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    name = safeDecode(request.headers.get("oai-authenticated-user-full-name")) ?? "";
  }

  const allowedEmails = getAllowedEmails();
  if (allowedEmails.size > 0 && !allowedEmails.has(email)) return { status: "forbidden", user: null };

  return {
    status: "authenticated",
    user: {
      id: createHash("sha256").update(email).digest("hex"),
      email,
      name: name || email,
    },
  };
}

export function getAuthenticatedUser(request: Request): AuthenticatedUser | null {
  const result = authenticateRequest(request);
  return result.status === "authenticated" ? result.user : null;
}
