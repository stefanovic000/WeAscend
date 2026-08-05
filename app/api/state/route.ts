import { normalizeCloudState } from "../../domain";
import { authenticateRequest, type AuthenticatedUser } from "../../../server/auth";
import { withCollections } from "../../../server/mongo";

export const dynamic = "force-dynamic";

const MAX_STATE_BYTES = 2_000_000;

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function publicUser(user: AuthenticatedUser) {
  return { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified };
}

async function requireUser(request: Request) {
  const auth = await authenticateRequest(request);
  if (auth.status === "unauthenticated") {
    return { user: null, response: json({ code: auth.code }, 401) };
  }
  if (auth.status === "forbidden") {
    return { user: null, response: json({ code: auth.code }, 403) };
  }
  return { user: auth.user, response: null };
}

export async function GET(request: Request) {
  const { user, response } = await requireUser(request);
  if (response) return response;

  try {
    return await withCollections(async ({ states, users }) => {
      const now = new Date();
      await users.updateOne(
        { userId: user.id },
        {
          $set: { email: user.email, displayName: user.name, updatedAt: now, status: "active" },
          $setOnInsert: { userId: user.id, language: "en", role: "user", createdAt: now },
        },
        { upsert: true },
      );
      const document = await states.findOne({ userId: user.id });
      return json({
        state: normalizeCloudState(document?.state),
        revision: document?.revision ?? 0,
        updatedAt: document?.updatedAt?.toISOString() ?? null,
        user: publicUser(user),
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "MONGODB_URI_NOT_CONFIGURED") {
      return json({ code: "cloud_not_configured", user: publicUser(user) }, 503);
    }
    console.error("State read failed", error instanceof Error ? `${error.name}: ${error.message}` : error);
    return json({ code: "database_unavailable" }, 503);
  }
}

export async function PUT(request: Request) {
  const { user, response } = await requireUser(request);
  if (response) return response;

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_STATE_BYTES) return json({ code: "state_too_large" }, 413);

  let payload: { state?: unknown; revision?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > MAX_STATE_BYTES) return json({ code: "state_too_large" }, 413);
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    return json({ code: "invalid_json" }, 400);
  }

  const normalizedState = normalizeCloudState(payload.state);
  if (!normalizedState || !Number.isInteger(payload.revision) || Number(payload.revision) < 0) {
    return json({ code: "invalid_state" }, 400);
  }

  const revision = Number(payload.revision);
  const now = new Date();

  try {
    return await withCollections(async ({ states }) => {
      const updated = await states.findOneAndUpdate(
        { userId: user.id, revision },
        {
          $set: { state: normalizedState, updatedAt: now },
          $setOnInsert: { userId: user.id, createdAt: now },
          $inc: { revision: 1 },
        },
        { upsert: revision === 0, returnDocument: "after" },
      );

      if (!updated) {
        const current = await states.findOne({ userId: user.id });
        return json({ code: "revision_conflict", state: normalizeCloudState(current?.state), revision: current?.revision ?? 0 }, 409);
      }

      return json({ state: updated.state, revision: updated.revision, updatedAt: updated.updatedAt.toISOString(), user: publicUser(user) });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "MONGODB_URI_NOT_CONFIGURED") {
      return json({ code: "cloud_not_configured" }, 503);
    }
    if (typeof error === "object" && error && "code" in error && error.code === 11000) {
      return await withCollections(async ({ states }) => {
        const current = await states.findOne({ userId: user.id });
        return json({ code: "revision_conflict", state: normalizeCloudState(current?.state), revision: current?.revision ?? 0 }, 409);
      });
    }
    console.error("State write failed", error instanceof Error ? `${error.name}: ${error.message}` : error);
    return json({ code: "database_unavailable" }, 503);
  }
}
