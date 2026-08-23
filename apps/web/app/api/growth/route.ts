import { applyGrowthMutation, normalizeCloudState, type GrowthMutation } from "../../domain";
import { authenticateRequest, type AuthenticatedUser } from "../../../server/auth";
import { withCollections } from "../../../server/mongo";

export const dynamic = "force-dynamic";

const MAX_COMMAND_BYTES = 4_000;

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" },
  });
}

function publicUser(user: AuthenticatedUser) {
  return { email: user.email, name: user.name };
}

function normalizeCommand(value: unknown): { revision: number; mutation: GrowthMutation } | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  if (!Number.isInteger(payload.revision) || Number(payload.revision) < 0 || typeof payload.action !== "string") return null;
  const revision = Number(payload.revision);
  if (payload.action === "attribute_create" && typeof payload.id === "string" && typeof payload.name === "string" && typeof payload.color === "string") {
    return { revision, mutation: { action: payload.action, id: payload.id, name: payload.name, color: payload.color } };
  }
  if (payload.action === "attribute_rename" && typeof payload.attributeId === "string" && typeof payload.name === "string") {
    return { revision, mutation: { action: payload.action, attributeId: payload.attributeId, name: payload.name } };
  }
  if (payload.action === "attribute_delete" && typeof payload.attributeId === "string") {
    return { revision, mutation: { action: payload.action, attributeId: payload.attributeId } };
  }
  if (payload.action === "skill_create" && typeof payload.id === "string" && typeof payload.attributeId === "string" && typeof payload.name === "string") {
    return { revision, mutation: { action: payload.action, id: payload.id, attributeId: payload.attributeId, name: payload.name } };
  }
  if (payload.action === "skill_rename" && typeof payload.skillId === "string" && typeof payload.name === "string") {
    return { revision, mutation: { action: payload.action, skillId: payload.skillId, name: payload.name } };
  }
  if (payload.action === "skill_delete" && typeof payload.skillId === "string") {
    return { revision, mutation: { action: payload.action, skillId: payload.skillId } };
  }
  return null;
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (auth.status === "unauthenticated") return json({ code: auth.code }, 401);
  if (auth.status === "forbidden") return json({ code: auth.code }, 403);

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_COMMAND_BYTES) return json({ code: "command_too_large" }, 413);

  let command: ReturnType<typeof normalizeCommand>;
  try {
    const raw = await request.text();
    if (raw.length > MAX_COMMAND_BYTES) return json({ code: "command_too_large" }, 413);
    command = normalizeCommand(JSON.parse(raw));
  } catch {
    return json({ code: "invalid_json" }, 400);
  }
  if (!command) return json({ code: "invalid_command" }, 400);

  try {
    return await withCollections(async ({ states }) => {
      const current = await states.findOne({ userId: auth.user.id });
      const currentState = normalizeCloudState(current?.state);
      if (!current || !currentState) return json({ code: "state_not_initialized" }, 409);
      if (current.revision !== command.revision) {
        return json({ code: "revision_conflict", state: currentState, revision: current.revision, user: publicUser(auth.user) }, 409);
      }

      const result = applyGrowthMutation(currentState, command.mutation);
      if (!result.ok) return json({ code: result.code }, result.code === "growth_not_found" ? 404 : 400);
      const nextState = normalizeCloudState(result.state);
      if (!nextState) return json({ code: "invalid_state" }, 400);

      const updated = await states.findOneAndUpdate(
        { userId: auth.user.id, revision: current.revision },
        { $set: { state: nextState, updatedAt: new Date() }, $inc: { revision: 1 } },
        { returnDocument: "after" },
      );
      if (!updated) {
        const latest = await states.findOne({ userId: auth.user.id });
        return json({ code: "revision_conflict", state: normalizeCloudState(latest?.state), revision: latest?.revision ?? 0, user: publicUser(auth.user) }, 409);
      }

      return json({ state: updated.state, revision: updated.revision, updatedAt: updated.updatedAt.toISOString(), user: publicUser(auth.user) });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "MONGODB_URI_NOT_CONFIGURED") return json({ code: "cloud_not_configured" }, 503);
    console.error("Growth command failed", error instanceof Error ? `${error.name}: ${error.message}` : error);
    return json({ code: "database_unavailable" }, 503);
  }
}
