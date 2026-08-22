import { applyQuestMutation, normalizeCloudState, isQuestContentWithinLimits, isValidQuest, type QuestMutation } from "../../domain";
import { authenticateRequest, type AuthenticatedUser } from "../../../server/auth";
import { withCollections } from "../../../server/mongo";
import { publicPlanForUser } from "../../../server/planAccess";
import { exceedsQuestStorage } from "../../plan";

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
    quests?: unknown;
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
  if ((payload.action === "create" || payload.action === "update") && isValidQuest(payload.quest) && isQuestContentWithinLimits(payload.quest)) {
    return { revision, mutation: { action: payload.action, quest: payload.quest } };
  }
  if (
    payload.action === "create_many" &&
    Array.isArray(payload.quests) &&
    payload.quests.length > 0 &&
    payload.quests.length <= 12 &&
    payload.quests.every(item => isValidQuest(item) && isQuestContentWithinLimits(item))
  ) {
    return { revision, mutation: { action: "create_many", quests: payload.quests } };
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
    return await withCollections(async ({ states, users }) => {
      const current = await states.findOne({ userId: auth.user.id });
      const currentState = normalizeCloudState(current?.state);
      if (!current || !currentState) return json({ code: "state_not_initialized" }, 409);
      if (current.revision !== command.revision) {
        return json({ code: "revision_conflict", state: currentState, revision: current.revision, user: publicUser(auth.user) }, 409);
      }

      const result = applyQuestMutation(currentState, command.mutation);
      if (!result.ok) return json({ code: result.code }, result.code === "quest_not_found" ? 404 : 400);
      const nextState = normalizeCloudState(result.state);
      if (!nextState) return json({ code: "invalid_state" }, 400);
      const profile = await users.findOne({ userId: auth.user.id });
      const questLimit = publicPlanForUser(profile).limits.questStorage;
      if (exceedsQuestStorage(currentState.quests.length, nextState.quests.length, questLimit)) {
        return json({ code: "quest_limit_reached", limit: questLimit }, 422);
      }

      const updated = await states.findOneAndUpdate(
        { userId: auth.user.id, revision: current.revision },
        {
          $set: { state: nextState, updatedAt: new Date() },
          $inc: { revision: 1 },
        },
        { returnDocument: "after" },
      );
      if (!updated) {
        const latest = await states.findOne({ userId: auth.user.id });
        return json({
          code: "revision_conflict",
          state: normalizeCloudState(latest?.state),
          revision: latest?.revision ?? 0,
          user: publicUser(auth.user),
        }, 409);
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
