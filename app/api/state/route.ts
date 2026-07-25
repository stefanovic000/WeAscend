import { isValidCloudState } from "../../domain";
import { getAuthenticatedUser } from "../../../server/auth";
import { getStateCollection } from "../../../server/mongo";

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

function publicUser(user: NonNullable<ReturnType<typeof getAuthenticatedUser>>) {
  return { email: user.email, name: user.name };
}

export async function GET(request: Request) {
  const user = getAuthenticatedUser(request);
  if (!user) return json({ code: "authentication_required" }, 401);

  try {
    const collection = await getStateCollection();
    const document = await collection.findOne({ userId: user.id });
    return json({
      state: document?.state ?? null,
      revision: document?.revision ?? 0,
      updatedAt: document?.updatedAt?.toISOString() ?? null,
      user: publicUser(user),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "MONGODB_URI_NOT_CONFIGURED") {
      return json({ code: "cloud_not_configured", user: publicUser(user) }, 503);
    }
    console.error("State read failed", error);
    return json({ code: "database_unavailable" }, 503);
  }
}

export async function PUT(request: Request) {
  const user = getAuthenticatedUser(request);
  if (!user) return json({ code: "authentication_required" }, 401);

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

  if (!isValidCloudState(payload.state) || !Number.isInteger(payload.revision) || Number(payload.revision) < 0) {
    return json({ code: "invalid_state" }, 400);
  }

  const revision = Number(payload.revision);
  const now = new Date();

  try {
    const collection = await getStateCollection();
    const updated = await collection.findOneAndUpdate(
      { userId: user.id, revision },
      {
        $set: { state: payload.state, updatedAt: now },
        $setOnInsert: { userId: user.id, createdAt: now },
        $inc: { revision: 1 },
      },
      { upsert: revision === 0, returnDocument: "after" },
    );

    if (!updated) {
      const current = await collection.findOne({ userId: user.id });
      return json({ code: "revision_conflict", state: current?.state ?? null, revision: current?.revision ?? 0 }, 409);
    }

    return json({ state: updated.state, revision: updated.revision, updatedAt: updated.updatedAt.toISOString(), user: publicUser(user) });
  } catch (error) {
    if (error instanceof Error && error.message === "MONGODB_URI_NOT_CONFIGURED") {
      return json({ code: "cloud_not_configured" }, 503);
    }
    if (typeof error === "object" && error && "code" in error && error.code === 11000) {
      const collection = await getStateCollection();
      const current = await collection.findOne({ userId: user.id });
      return json({ code: "revision_conflict", state: current?.state ?? null, revision: current?.revision ?? 0 }, 409);
    }
    console.error("State write failed", error);
    return json({ code: "database_unavailable" }, 503);
  }
}
