import { withCollections } from "./mongo";

export type AiFeature = "xp_estimate" | "boss_steps";

export type AiProtectionResult =
  | { allowed: true; enabled: boolean }
  | { allowed: false; enabled: true; code: "ai_daily_limit" | "ai_cooldown" };

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function aiProtectionEnabled() {
  return process.env.AI_LIMITS_ENABLED?.trim().toLowerCase() === "true";
}

export async function registerAiRequest(userId: string, feature: AiFeature): Promise<AiProtectionResult> {
  if (!aiProtectionEnabled()) return { allowed: true, enabled: false };

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const cooldownSeconds = positiveInteger(process.env.AI_COOLDOWN_SECONDS, 10);
  const cutoff = new Date(now.getTime() - cooldownSeconds * 1_000);
  const limit = feature === "xp_estimate"
    ? positiveInteger(process.env.AI_XP_DAILY_LIMIT, 20)
    : positiveInteger(process.env.AI_BOSS_STEPS_DAILY_LIMIT, 5);
  const counter = feature === "xp_estimate" ? "xpEstimateRequests" : "bossStepRequests";

  return withCollections(async ({ aiUsage }) => {
    try {
      const result = await aiUsage.updateOne(
        {
          userId,
          day,
          [counter]: { $lt: limit },
          $or: [{ lastRequestAt: { $lte: cutoff } }, { lastRequestAt: { $exists: false } }],
        },
        {
          $inc: counter === "xpEstimateRequests" ? { xpEstimateRequests: 1 } : { bossStepRequests: 1 },
          $set: { lastRequestAt: now, updatedAt: now },
          $setOnInsert: {
            userId,
            day,
            ...(counter === "xpEstimateRequests" ? { bossStepRequests: 0 } : { xpEstimateRequests: 0 }),
          },
        },
        { upsert: true },
      );
      if (result.acknowledged) return { allowed: true, enabled: true };
    } catch (error) {
      if (!(typeof error === "object" && error && "code" in error && error.code === 11000)) throw error;
    }

    const current = await aiUsage.findOne({ userId, day });
    const count = current?.[counter] ?? 0;
    return count >= limit
      ? { allowed: false, enabled: true, code: "ai_daily_limit" }
      : { allowed: false, enabled: true, code: "ai_cooldown" };
  });
}
