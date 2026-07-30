import { applyQuestMutation, isValidCloudState, isValidQuest, type QuestMutation } from "../../domain";
import { authenticateRequest, type AuthenticatedUser } from "../../../server/auth";
import { withStateCollection } from "../../../server/mongo";

export const dynamic = "force-dynamic";

const MAX_COMMAND_BYTES = 40_000;

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
  return { email: user.email, name: user.name };
}

function normalizeCommand(value: unknown): { revision: number; mutation: QuestMutation } | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as {
    action?: unknown;
    revision?: unknown;
    quest?: unknown;
    questId?: unknown;
    bossQuestId?: unknown;
    outcome?: unknown;
    result?: unknown;
  };
  if (!Number.isInteger(payload.revision) || Number(payload.revision) < 0) return null;
  const revision = Number(payload.revision);

  if (payload.action === "delete" && typeof payload.questId === "string") {
    return { revision, mutation: { action: "delete", questId: payload.questId } };
  }
  if ((payload.action === "create" || payload.action === "update") && isValidQuest(payload.quest)) {
    return { revision, mutation: { action: payload.action, quest: payload.quest } };
  }
  if (
    payload.action === "boss_attempt" &&
    typeof payload.bossQuestId === "string" &&
    (payload.outcome === "failed" || payload.outcome === "cleared") &&
    typeof payload.result === "string"
  ) {
    return {
      revision,
      mutation: {
        action: "boss_attempt",
        bossQuestId: payload.bossQuestId,
        outcome: payload.outcome,
        result: payload.result,
      },
    };
  }
  if (payload.action === "undo_boss_clear" && typeof payload.bossQuestId === "string") {
    return { revision, mutation: { action: "undo_boss_clear", bossQuestId: payload.bossQuestId } };
  }
  return null;
}

export async function POST(request: Request) {
  const auth = authenticateRequest(request);
  if (auth.status === "unauthenticated") return json({ code: "authentication_required" }, 401);
  if (auth.status === "forbidden") return json({ code: "owner_access_denied" }, 403);

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
    return await withStateCollection(async collection => {
      const current = await collection.findOne({ userId: auth.user.id });
      if (!current?.state || !isValidCloudState(current.state)) return json({ code: "state_not_initialized" }, 409);
      if (current.revision !== command.revision) {
        return json({ code: "revision_conflict", state: current.state, revision: current.revision, user: publicUser(auth.user) }, 409);
      }

      const result = applyQuestMutation(current.state, command.mutation);
      if (!result.ok) return json({ code: result.code }, result.code === "quest_not_found" ? 404 : 400);
      if (!isValidCloudState(result.state)) return json({ code: "invalid_state" }, 400);

      const updated = await collection.findOneAndUpdate(
        { userId: auth.user.id, revision: current.revision },
        {
          $set: { state: result.state, updatedAt: new Date() },
          $inc: { revision: 1 },
        },
        { returnDocument: "after" },
      );
      if (!updated) {
        const latest = await collection.findOne({ userId: auth.user.id });
        return json({ code: "revision_conflict", state: latest?.state ?? null, revision: latest?.revision ?? 0, user: publicUser(auth.user) }, 409);
      }

      return json({
        state: updated.state,
        revision: updated.revision,
        updatedAt: updated.updatedAt.toISOString(),
        user: publicUser(auth.user),
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "MONGODB_URI_NOT_CONFIGURED") {
      return json({ code: "cloud_not_configured" }, 503);
    }
    console.error("Quest command failed", error instanceof Error ? `${error.name}: ${error.message}` : error);
    return json({ code: "database_unavailable" }, 503);
  }
}
