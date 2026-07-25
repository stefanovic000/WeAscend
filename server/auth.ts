import { createHash } from "node:crypto";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

function safeDecode(value: string | null) {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function getAuthenticatedUser(request: Request): AuthenticatedUser | null {
  let email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() ?? "";
  let name = "";

  if (!email && process.env.NODE_ENV !== "production") {
    email = "local-owner@ascend.local";
    name = "Local Hunter";
  }
  if (!email) return null;

  if (request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    name = safeDecode(request.headers.get("oai-authenticated-user-full-name")) ?? "";
  }

  const allowedEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (allowedEmail && email !== allowedEmail) return null;

  return {
    id: createHash("sha256").update(email).digest("hex"),
    email,
    name: name || email,
  };
}
