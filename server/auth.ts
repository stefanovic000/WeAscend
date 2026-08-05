import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

export type AuthenticationResult =
  | { status: "authenticated"; user: AuthenticatedUser }
  | { status: "unauthenticated"; user: null; code: "authentication_required" | "invalid_token" }
  | { status: "forbidden"; user: null; code: "email_verification_required" };

type VerifiedFirebaseToken = JWTPayload & {
  sub: string;
  email?: string;
  name?: string;
  email_verified?: boolean;
  auth_time?: number;
};

export type FirebaseTokenVerifier = (token: string) => Promise<VerifiedFirebaseToken>;

const firebaseKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

function firebaseProjectId() {
  return process.env.FIREBASE_PROJECT_ID?.trim() || "";
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1]?.trim() || "";
}

export async function verifyFirebaseIdToken(token: string): Promise<VerifiedFirebaseToken> {
  const projectId = firebaseProjectId();
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID_NOT_CONFIGURED");

  const { payload, protectedHeader } = await jwtVerify(token, firebaseKeys, {
    algorithms: ["RS256"],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  });

  if (!protectedHeader.kid || typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) {
    throw new Error("INVALID_FIREBASE_TOKEN");
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.auth_time !== "number" || payload.auth_time > now) throw new Error("INVALID_FIREBASE_TOKEN");

  return payload as VerifiedFirebaseToken;
}

function localDevelopmentUser(): AuthenticatedUser {
  return {
    id: "local-development-user",
    email: "local@weascend.dev",
    name: "Local Tester",
    emailVerified: true,
  };
}

export async function authenticateRequest(
  request: Request,
  verifyToken: FirebaseTokenVerifier = verifyFirebaseIdToken,
): Promise<AuthenticationResult> {
  const token = bearerToken(request);

  if (!token && process.env.NODE_ENV !== "production" && !firebaseProjectId()) {
    return { status: "authenticated", user: localDevelopmentUser() };
  }
  if (!token) return { status: "unauthenticated", user: null, code: "authentication_required" };

  try {
    const decoded = await verifyToken(token);
    const email = typeof decoded.email === "string" ? decoded.email.trim().toLowerCase() : "";
    const emailVerified = decoded.email_verified === true;
    if (!email) return { status: "unauthenticated", user: null, code: "invalid_token" };
    if (!emailVerified) return { status: "forbidden", user: null, code: "email_verification_required" };

    return {
      status: "authenticated",
      user: {
        id: decoded.sub,
        email,
        name: typeof decoded.name === "string" && decoded.name.trim() ? decoded.name.trim() : email || "WeAscend User",
        emailVerified,
      },
    };
  } catch {
    return { status: "unauthenticated", user: null, code: "invalid_token" };
  }
}

export async function getAuthenticatedUser(request: Request): Promise<AuthenticatedUser | null> {
  const result = await authenticateRequest(request);
  return result.status === "authenticated" ? result.user : null;
}
